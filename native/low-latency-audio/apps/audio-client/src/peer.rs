use audio_core::{FRAME_DURATION_MICROS, SAMPLES_PER_FRAME};
use metrics::SequenceTracker;
use ropus::Decoder;
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

/// 지터 목표의 하한. 2 프레임 = 5 ms. 회선이 깨끗하면 여기까지 내려간다.
pub(crate) const JITTER_MIN_TARGET_FRAMES: usize = 2;
/// 지터 목표의 상한. 4 프레임 = 10 ms. 이보다 흔들리는 회선은 지연 대신 끊김을 감수한다.
pub(crate) const JITTER_MAX_TARGET_FRAMES: usize = 4;
/// 버퍼 자체의 하드 상한. 목표를 넘어 이만큼 쌓이면 리싱크로 따라잡는다.
pub(crate) const JITTER_MAX_FRAMES: usize = 6;
/// 사고 없이 이 시간이 지나면 목표를 한 프레임 줄인다.
///
/// 늘릴 때는 즉시, 줄일 때는 느리게 하는 비대칭이 목표치의 왕복 진동을 막는다.
const JITTER_SHRINK_AFTER: Duration = Duration::from_secs(5);
// The target jitter plus this margin gives buffered audio its age limit.
pub(crate) const STALE_FRAME_MARGIN: Duration = Duration::from_millis(10);

pub(crate) struct BufferedOpusFrame {
    pub(crate) packet: Vec<u8>,
    pub(crate) arrived: Instant,
}

pub(crate) struct PeerAudioState {
    pub(crate) tracker: SequenceTracker,
    pub(crate) ack_tracker: SequenceTracker,
    pub(crate) frame_buffer: BTreeMap<u64, BufferedOpusFrame>,
    pub(crate) playout_sequence: Option<u64>,
    pub(crate) last_playback_frame: Option<[f32; SAMPLES_PER_FRAME]>,
    pub(crate) recovery_crossfade_needed: bool,
    pub(crate) consecutive_missing_frames: u64,
    pub(crate) received: u64,
    pub(crate) corrupt_frames: u64,
    pub(crate) concealed_frames: u64,
    pub(crate) opus_plc_frames: u64,
    pub(crate) fallback_concealed_frames: u64,
    pub(crate) departure_concealed_frames: u64,
    pub(crate) current_gap_concealed_frames: u64,
    pub(crate) late_playback_frames: u64,
    pub(crate) playback_resyncs: u64,
    pub(crate) delivery_round_trips_us: Vec<f64>,
    pub(crate) peer_receive_dispatch_us: Vec<f64>,
    pub(crate) receive_to_main_us: Vec<f64>,
    pub(crate) playback_queue_estimate_us: Vec<f64>,
    pub(crate) playout_decoder: Option<Decoder>,
    pub(crate) departed: bool,
    /// 최근 재생 프레임의 피크(0.0 ~ 1.0). 보이스 스테이지 레벨 미터가 쓴다.
    /// 프레임마다 갱신하고 조금씩 감쇠시켜, 미터를 읽는 주기와 무관하게 자연스럽게 떨어진다.
    pub(crate) output_peak: f32,
    pub(crate) jitter_target_frames: usize,
    /// 마지막으로 관측한 사고 누적치. 증가분이 있으면 이번 주기에 사고가 났다는 뜻이다.
    pub(crate) jitter_incident_baseline: u64,
    pub(crate) jitter_last_incident: Option<Instant>,
    pub(crate) jitter_last_change: Instant,
}

impl Default for PeerAudioState {
    fn default() -> Self {
        Self {
            tracker: SequenceTracker::default(),
            ack_tracker: SequenceTracker::default(),
            frame_buffer: BTreeMap::new(),
            playout_sequence: None,
            last_playback_frame: None,
            recovery_crossfade_needed: false,
            consecutive_missing_frames: 0,
            received: 0,
            corrupt_frames: 0,
            concealed_frames: 0,
            opus_plc_frames: 0,
            fallback_concealed_frames: 0,
            departure_concealed_frames: 0,
            current_gap_concealed_frames: 0,
            late_playback_frames: 0,
            playback_resyncs: 0,
            delivery_round_trips_us: Vec::new(),
            peer_receive_dispatch_us: Vec::new(),
            receive_to_main_us: Vec::new(),
            playback_queue_estimate_us: Vec::new(),
            playout_decoder: None,
            departed: false,
            output_peak: 0.0,
            // 가능하면 5 ms 로 시작하고, 사고가 나면 즉시 늘린다.
            jitter_target_frames: JITTER_MIN_TARGET_FRAMES,
            jitter_incident_baseline: 0,
            jitter_last_incident: None,
            jitter_last_change: Instant::now(),
        }
    }
}

impl PeerAudioState {
    /// 재생된 프레임의 피크를 레벨 미터에 반영한다. 오를 때는 즉시, 내릴 때는 완만하게.
    pub(crate) fn observe_output_frame(&mut self, samples: &[f32; SAMPLES_PER_FRAME]) {
        const DECAY_PER_FRAME: f32 = 0.90;
        let peak = samples
            .iter()
            .fold(0.0_f32, |peak, sample| peak.max(sample.abs()))
            .min(1.0);
        self.output_peak = peak.max(self.output_peak * DECAY_PER_FRAME);
    }

    pub(crate) fn reset_playout(&mut self) {
        self.frame_buffer.clear();
        self.playout_sequence = None;
        self.last_playback_frame = None;
        self.recovery_crossfade_needed = false;
        self.consecutive_missing_frames = 0;
        self.current_gap_concealed_frames = 0;
        self.playout_decoder = None;
    }

    /// 회선 상태에 맞춰 지터 목표를 5 ms ~ 10 ms 사이에서 조정한다.
    ///
    /// 은닉·늦은 프레임·리싱크가 하나라도 늘면 즉시 한 프레임 키우고, 조용한 구간이
    /// [`JITTER_SHRINK_AFTER`] 만큼 이어지면 한 프레임 줄인다. 목표가 바뀌면 새 값을 돌려준다.
    ///
    /// 사고 지점마다 훅을 거는 대신 누적 카운터의 증가분을 보기 때문에, 새로운 사고
    /// 유형이 추가돼도 여기서 자동으로 반영된다.
    pub(crate) fn adapt_jitter_target(&mut self, now: Instant) -> Option<usize> {
        let incidents = self
            .concealed_frames
            .saturating_add(self.late_playback_frames)
            .saturating_add(self.playback_resyncs);
        let had_incident = incidents > self.jitter_incident_baseline;
        self.jitter_incident_baseline = incidents;

        if had_incident {
            self.jitter_last_incident = Some(now);
            if self.jitter_target_frames >= JITTER_MAX_TARGET_FRAMES {
                return None;
            }
            self.jitter_target_frames += 1;
            self.jitter_last_change = now;
            return Some(self.jitter_target_frames);
        }

        if self.jitter_target_frames <= JITTER_MIN_TARGET_FRAMES {
            return None;
        }
        let quiet_since = self.jitter_last_incident.unwrap_or(self.jitter_last_change);
        if now.saturating_duration_since(quiet_since) < JITTER_SHRINK_AFTER
            || now.saturating_duration_since(self.jitter_last_change) < JITTER_SHRINK_AFTER
        {
            return None;
        }
        self.jitter_target_frames -= 1;
        self.jitter_last_change = now;
        Some(self.jitter_target_frames)
    }

    pub(crate) fn start_playout_if_ready(&mut self) -> bool {
        if self.playout_sequence.is_some() || self.frame_buffer.len() < self.jitter_target_frames {
            return false;
        }
        self.playout_sequence = self
            .frame_buffer
            .first_key_value()
            .map(|(&sequence, _)| sequence);
        self.playout_sequence.is_some()
    }

    pub(crate) fn mark_departed(&mut self) {
        self.concealed_frames = self
            .concealed_frames
            .saturating_sub(self.current_gap_concealed_frames);
        self.departure_concealed_frames = self
            .departure_concealed_frames
            .saturating_add(self.current_gap_concealed_frames);
        self.reset_playout();
        self.departed = true;
    }

    pub(crate) fn discard_stale_buffered_frames(&mut self, now: Instant) -> usize {
        let previous_playout = self.playout_sequence;
        let mut discarded = 0_usize;
        let maximum_age =
            Duration::from_micros(FRAME_DURATION_MICROS * self.jitter_target_frames as u64)
                + STALE_FRAME_MARGIN;
        self.frame_buffer.retain(|_, frame| {
            let keep = now.saturating_duration_since(frame.arrived) <= maximum_age;
            if !keep {
                discarded += 1;
            }
            keep
        });
        if discarded == 0 {
            return 0;
        }
        self.late_playback_frames = self.late_playback_frames.saturating_add(discarded as u64);
        if previous_playout.is_some_and(|sequence| !self.frame_buffer.contains_key(&sequence)) {
            self.playout_sequence = None;
            self.last_playback_frame = None;
            self.recovery_crossfade_needed = true;
            self.consecutive_missing_frames = 0;
            self.playback_resyncs = self.playback_resyncs.saturating_add(1);
        }
        discarded
    }
}
