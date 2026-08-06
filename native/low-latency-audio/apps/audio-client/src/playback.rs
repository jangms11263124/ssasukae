use audio_core::{Consumer, SAMPLE_RATE};
use std::{
    sync::{
        atomic::{AtomicI64, AtomicU32, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

pub(crate) const RELAY_PREBUFFER_SAMPLES: usize = SAMPLE_RATE as usize / 100;
pub(crate) const RELAY_TARGET_QUEUE_SAMPLES: usize = SAMPLE_RATE as usize / 100;
pub(crate) const RELAY_MAX_QUEUE_SAMPLES: usize = SAMPLE_RATE as usize * 10 / 1_000;
pub(crate) const RELAY_TRIM_TO_SAMPLES: usize = SAMPLE_RATE as usize * 5 / 1_000;
pub(crate) const RELAY_MAX_SPEED_ADJUSTMENT_PPM: i64 = 3_000;

#[derive(Clone, Copy)]
pub(crate) struct PlaybackBufferPolicy {
    pub(crate) prebuffer_samples: usize,
    pub(crate) target_queue_samples: usize,
    pub(crate) max_queue_samples: usize,
    pub(crate) trim_to_samples: usize,
    pub(crate) max_speed_adjustment_ppm: i64,
}

pub(crate) const RELAY_PLAYBACK_POLICY: PlaybackBufferPolicy = PlaybackBufferPolicy {
    prebuffer_samples: RELAY_PREBUFFER_SAMPLES,
    target_queue_samples: RELAY_TARGET_QUEUE_SAMPLES,
    max_queue_samples: RELAY_MAX_QUEUE_SAMPLES,
    trim_to_samples: RELAY_TRIM_TO_SAMPLES,
    max_speed_adjustment_ppm: RELAY_MAX_SPEED_ADJUSTMENT_PPM,
};

pub(crate) fn playback_policy_for_output_period(period_frames: u32) -> PlaybackBufferPolicy {
    let latency_samples = (period_frames as usize).clamp(1, RELAY_PREBUFFER_SAMPLES);
    PlaybackBufferPolicy {
        // A complete 2.5 ms mixed frame is published to the SPSC ring atomically.
        // The peer jitter buffer owns startup latency, so the device ring no longer
        // needs to accumulate an additional independent prebuffer.
        prebuffer_samples: 0,
        target_queue_samples: latency_samples,
        ..RELAY_PLAYBACK_POLICY
    }
}

#[derive(Clone, Default)]
pub(crate) struct PlaybackStats {
    pub(crate) underrun_events: Arc<AtomicU64>,
    pub(crate) trimmed_samples: Arc<AtomicU64>,
    pub(crate) speed_sum_ppm: Arc<AtomicI64>,
    pub(crate) speed_measurements: Arc<AtomicU64>,
    pub(crate) max_abs_speed_ppm: Arc<AtomicU64>,
}

#[derive(Clone, Default)]
pub(crate) struct InputCallbackStats {
    pub(crate) processing_ns: Arc<AtomicU64>,
    pub(crate) callback_count: Arc<AtomicU64>,
    pub(crate) max_processing_ns: Arc<AtomicU64>,
    peak_bits: Arc<AtomicU32>,
    clipped_samples: Arc<AtomicU64>,
}

impl InputCallbackStats {
    pub(crate) fn record(&self, elapsed: Duration) {
        let nanoseconds = elapsed.as_nanos().min(u64::MAX as u128) as u64;
        self.processing_ns.fetch_add(nanoseconds, Ordering::Relaxed);
        self.callback_count.fetch_add(1, Ordering::Relaxed);
        self.max_processing_ns
            .fetch_max(nanoseconds, Ordering::Relaxed);
    }

    pub(crate) fn record_sample(&self, sample: f32) {
        let peak = if sample.is_finite() {
            sample.abs().min(1.0)
        } else {
            1.0
        };
        self.peak_bits.fetch_max(peak.to_bits(), Ordering::Relaxed);
        if peak >= 0.98 {
            self.clipped_samples.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub(crate) fn take_level(&self) -> (f32, u64) {
        (
            f32::from_bits(self.peak_bits.swap(0, Ordering::Relaxed)),
            self.clipped_samples.swap(0, Ordering::Relaxed),
        )
    }
}

impl PlaybackStats {
    pub(crate) fn record_speed(&self, adjustment_ppm: i64) {
        self.speed_sum_ppm
            .fetch_add(adjustment_ppm, Ordering::Relaxed);
        self.speed_measurements.fetch_add(1, Ordering::Relaxed);
        self.max_abs_speed_ppm
            .fetch_max(adjustment_ppm.unsigned_abs(), Ordering::Relaxed);
    }
}

#[derive(Default)]
pub(crate) struct AdaptiveResampler {
    current: Option<f32>,
    next: Option<f32>,
    phase: f64,
}

impl AdaptiveResampler {
    pub(crate) fn reset(&mut self) {
        *self = Self::default();
    }

    pub(crate) fn render(&mut self, consumer: &mut Consumer, ratio: f64) -> Option<f32> {
        if self.current.is_none() {
            self.current = consumer.pop();
        }
        let current = self.current?;
        let needs_next = self.phase > 0.0 || self.phase + ratio >= 1.0;
        if needs_next && self.next.is_none() {
            self.next = consumer.pop();
        }
        let output = if self.phase > 0.0 {
            let next = self.next?;
            current + (next - current) * self.phase as f32
        } else {
            current
        };
        self.phase += ratio;
        while self.phase >= 1.0 {
            self.phase -= 1.0;
            self.current = self.next.take().or_else(|| consumer.pop());
            if self.current.is_none() {
                self.phase = 0.0;
                break;
            }
        }
        Some(output)
    }
}

pub(crate) struct PlaybackOutputState {
    pub(crate) started: bool,
    pub(crate) resampler: AdaptiveResampler,
    pub(crate) mr_resampler: AdaptiveResampler,
    pub(crate) last_remote_sample: f32,
    pub(crate) trim_crossfade_from: f32,
    pub(crate) trim_crossfade_remaining: usize,
    pub(crate) limiter_gain: f32,
    pub(crate) mr_duck_gain: f32,
}

impl PlaybackOutputState {
    pub(crate) fn new(started: bool) -> Self {
        Self {
            started,
            resampler: AdaptiveResampler::default(),
            mr_resampler: AdaptiveResampler::default(),
            last_remote_sample: 0.0,
            trim_crossfade_from: 0.0,
            trim_crossfade_remaining: 0,
            limiter_gain: 1.0,
            mr_duck_gain: 1.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_level_reports_peak_and_resets_the_window() {
        let stats = InputCallbackStats::default();
        stats.record_sample(0.2);
        stats.record_sample(-0.75);
        let (peak, clipped) = stats.take_level();
        assert!((peak - 0.75).abs() < f32::EPSILON);
        assert_eq!(clipped, 0);
        assert_eq!(stats.take_level(), (0.0, 0));
    }

    #[test]
    fn input_level_counts_clipping_and_non_finite_samples() {
        let stats = InputCallbackStats::default();
        stats.record_sample(0.98);
        stats.record_sample(f32::NAN);
        let (peak, clipped) = stats.take_level();
        assert_eq!(peak, 1.0);
        assert_eq!(clipped, 2);
    }
}
