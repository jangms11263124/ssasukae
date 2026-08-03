use audio_core::SAMPLES_PER_FRAME;
use audio_core::SAMPLE_RATE;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc,
};

#[derive(Clone, Copy, PartialEq)]
pub(crate) struct EffectsConfig {
    pub(crate) output_gain: f32,
    pub(crate) dry: f32,
    pub(crate) echo: f32,
    pub(crate) echo_delay_ms: f32,
    pub(crate) echo_feedback: f32,
    pub(crate) reverb: f32,
    pub(crate) reverb_time_seconds: f32,
}

pub(crate) struct LiveEffects {
    output_gain: AtomicU32,
    dry: AtomicU32,
    echo: AtomicU32,
    echo_delay_ms: AtomicU32,
    echo_feedback: AtomicU32,
    reverb: AtomicU32,
    reverb_time_seconds: AtomicU32,
}

impl LiveEffects {
    pub(crate) fn new(config: EffectsConfig) -> Arc<Self> {
        Arc::new(Self {
            output_gain: AtomicU32::new(config.output_gain.to_bits()),
            dry: AtomicU32::new(config.dry.to_bits()),
            echo: AtomicU32::new(config.echo.to_bits()),
            echo_delay_ms: AtomicU32::new(config.echo_delay_ms.to_bits()),
            echo_feedback: AtomicU32::new(config.echo_feedback.to_bits()),
            reverb: AtomicU32::new(config.reverb.to_bits()),
            reverb_time_seconds: AtomicU32::new(config.reverb_time_seconds.to_bits()),
        })
    }

    fn load(value: &AtomicU32) -> f32 {
        f32::from_bits(value.load(Ordering::Relaxed))
    }

    pub(crate) fn snapshot(&self) -> EffectsConfig {
        EffectsConfig {
            output_gain: Self::load(&self.output_gain),
            dry: Self::load(&self.dry),
            echo: Self::load(&self.echo),
            echo_delay_ms: Self::load(&self.echo_delay_ms),
            echo_feedback: Self::load(&self.echo_feedback),
            reverb: Self::load(&self.reverb),
            reverb_time_seconds: Self::load(&self.reverb_time_seconds),
        }
    }

    pub(crate) fn update(&self, values: &[f32]) {
        if let [output_gain, dry, echo, echo_delay_ms, echo_feedback, reverb, reverb_time_seconds] =
            values
        {
            self.output_gain
                .store((output_gain / 100.0).to_bits(), Ordering::Relaxed);
            self.dry.store((dry / 100.0).to_bits(), Ordering::Relaxed);
            self.echo.store((echo / 100.0).to_bits(), Ordering::Relaxed);
            self.echo_delay_ms
                .store(echo_delay_ms.to_bits(), Ordering::Relaxed);
            self.echo_feedback
                .store((echo_feedback / 100.0).to_bits(), Ordering::Relaxed);
            self.reverb
                .store((reverb / 100.0).to_bits(), Ordering::Relaxed);
            self.reverb_time_seconds
                .store(reverb_time_seconds.to_bits(), Ordering::Relaxed);
        }
    }
}

pub(crate) struct KaraokeEffects {
    pub(crate) config: EffectsConfig,
    echo_buffer: Vec<f32>,
    echo_index: usize,
    comb_buffers: Vec<Vec<f32>>,
    comb_indices: Vec<usize>,
    comb_feedback: Vec<f32>,
    limiter_gain: f32,
}

const EFFECT_OUTPUT_CEILING: f32 = 0.92;
const LIMITER_RELEASE_PER_SAMPLE: f32 = 0.0005;

impl KaraokeEffects {
    pub(crate) fn new(config: EffectsConfig) -> Self {
        let echo_samples =
            ((config.echo_delay_ms * SAMPLE_RATE as f32 / 1_000.0).round() as usize).max(1);
        let comb_lengths = [1429_usize, 1601, 1867, 2053];
        let comb_feedback = comb_lengths
            .iter()
            .map(|&length| {
                let delay_seconds = length as f32 / SAMPLE_RATE as f32;
                10.0_f32.powf(-3.0 * delay_seconds / config.reverb_time_seconds)
            })
            .collect();
        Self {
            config,
            echo_buffer: vec![0.0; echo_samples],
            echo_index: 0,
            comb_buffers: comb_lengths
                .iter()
                .map(|&length| vec![0.0; length])
                .collect(),
            comb_indices: vec![0; comb_lengths.len()],
            comb_feedback,
            limiter_gain: 1.0,
        }
    }

    pub(crate) fn process_frame(&mut self, samples: &mut [f32; SAMPLES_PER_FRAME]) {
        if self.config.echo == 0.0
            && self.config.reverb == 0.0
            && self.config.dry == 1.0
            && self.config.output_gain == 1.0
        {
            return;
        }
        for sample in samples {
            *sample = self.process_sample(*sample);
        }
    }

    pub(crate) fn process_sample(&mut self, input: f32) -> f32 {
        if self.config.echo == 0.0 && self.config.reverb == 0.0 && self.config.dry == 1.0 {
            return self.limit_sample(input * self.config.output_gain);
        }
        let echo = self.echo_buffer[self.echo_index];
        self.echo_buffer[self.echo_index] =
            (input + echo * self.config.echo_feedback).clamp(-1.0, 1.0);
        self.echo_index = (self.echo_index + 1) % self.echo_buffer.len();
        let mut reverb = 0.0;
        for index in 0..self.comb_buffers.len() {
            let position = self.comb_indices[index];
            let delayed = self.comb_buffers[index][position];
            self.comb_buffers[index][position] =
                (input + delayed * self.comb_feedback[index]).clamp(-1.0, 1.0);
            self.comb_indices[index] = (position + 1) % self.comb_buffers[index].len();
            reverb += delayed;
        }
        reverb /= self.comb_buffers.len() as f32;
        let mixed = (input * self.config.dry
            + echo * self.config.echo
            + reverb * self.config.reverb)
            * self.config.output_gain;
        self.limit_sample(mixed)
    }

    fn limit_sample(&mut self, sample: f32) -> f32 {
        if !sample.is_finite() {
            self.limiter_gain = 1.0;
            return 0.0;
        }
        let required_gain = if sample.abs() > EFFECT_OUTPUT_CEILING {
            EFFECT_OUTPUT_CEILING / sample.abs()
        } else {
            1.0
        };
        if required_gain < self.limiter_gain {
            // Zero-lookahead limiter: reduce gain on the current sample so a peak is
            // never hard-clipped. This does not add another audio buffer or latency.
            self.limiter_gain = required_gain;
        } else {
            self.limiter_gain +=
                (1.0 - self.limiter_gain) * LIMITER_RELEASE_PER_SAMPLE;
        }
        sample * self.limiter_gain
    }
}
