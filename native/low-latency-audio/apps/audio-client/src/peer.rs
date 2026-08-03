use audio_core::{FRAME_DURATION_MICROS, SAMPLES_PER_FRAME};
use metrics::SequenceTracker;
use ropus::Decoder;
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

pub(crate) const JITTER_PREBUFFER_FRAMES: usize = 2;
pub(crate) const JITTER_TARGET_FRAMES: usize = 2;
pub(crate) const JITTER_MAX_FRAMES: usize = 2;
pub(crate) const STALE_FRAME_MARGIN: Duration = Duration::from_millis(30);

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
    pub(crate) jitter_target_frames: usize,
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
            jitter_target_frames: JITTER_TARGET_FRAMES,
        }
    }
}

impl PeerAudioState {
    pub(crate) fn reset_playout(&mut self) {
        self.frame_buffer.clear();
        self.playout_sequence = None;
        self.last_playback_frame = None;
        self.recovery_crossfade_needed = false;
        self.consecutive_missing_frames = 0;
        self.current_gap_concealed_frames = 0;
        self.playout_decoder = None;
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
