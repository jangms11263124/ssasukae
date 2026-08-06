//! Audio-frame primitives that do not depend on an operating-system audio API.

use std::{
    cell::UnsafeCell,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

pub const SAMPLE_RATE: u32 = 48_000;
pub const FRAME_DURATION_MICROS: u64 = 2_500;
pub const SAMPLES_PER_FRAME: usize = 120;
pub const PCM_FRAME_BYTES: usize = SAMPLES_PER_FRAME * size_of::<f32>();

struct Inner {
    buffer: Box<[UnsafeCell<f32>]>,
    capacity: usize,
    read: AtomicUsize,
    write: AtomicUsize,
}

// Only Producer writes and only Consumer reads a slot. Release/acquire index
// publication prevents either side from accessing a slot concurrently.
unsafe impl Sync for Inner {}

pub struct Producer {
    inner: Arc<Inner>,
}

pub struct Consumer {
    inner: Arc<Inner>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PushSliceError;

pub fn ring_buffer(capacity: usize) -> (Producer, Consumer) {
    assert!(capacity >= 2, "ring buffer capacity must be at least two");
    let buffer = (0..capacity)
        .map(|_| UnsafeCell::new(0.0))
        .collect::<Vec<_>>()
        .into_boxed_slice();
    let inner = Arc::new(Inner {
        buffer,
        capacity,
        read: AtomicUsize::new(0),
        write: AtomicUsize::new(0),
    });
    (
        Producer {
            inner: Arc::clone(&inner),
        },
        Consumer { inner },
    )
}

impl Producer {
    pub fn available(&self) -> usize {
        let read = self.inner.read.load(Ordering::Acquire);
        let write = self.inner.write.load(Ordering::Acquire);
        if write >= read {
            write - read
        } else {
            self.inner.capacity - read + write
        }
    }

    pub fn push(&mut self, value: f32) -> Result<(), f32> {
        let write = self.inner.write.load(Ordering::Relaxed);
        let next = increment(write, self.inner.capacity);
        if next == self.inner.read.load(Ordering::Acquire) {
            return Err(value);
        }
        // SAFETY: the producer exclusively owns the current write slot until
        // the write index is published below.
        unsafe { *self.inner.buffer[write].get() = value };
        self.inner.write.store(next, Ordering::Release);
        Ok(())
    }

    pub fn push_slice(&mut self, values: &[f32]) -> Result<(), PushSliceError> {
        if values.is_empty() {
            return Ok(());
        }
        let read = self.inner.read.load(Ordering::Acquire);
        let write = self.inner.write.load(Ordering::Relaxed);
        let available = if write >= read {
            write - read
        } else {
            self.inner.capacity - read + write
        };
        let free = self.inner.capacity - 1 - available;
        if values.len() > free {
            return Err(PushSliceError);
        }

        let mut index = write;
        for &value in values {
            // SAFETY: the producer exclusively owns every slot from the unpublished write
            // index up to the final index. The consumer cannot observe them until the single
            // release store below publishes the complete slice.
            unsafe { *self.inner.buffer[index].get() = value };
            index = increment(index, self.inner.capacity);
        }
        self.inner.write.store(index, Ordering::Release);
        Ok(())
    }
}

impl Consumer {
    pub fn available(&self) -> usize {
        let read = self.inner.read.load(Ordering::Acquire);
        let write = self.inner.write.load(Ordering::Acquire);
        if write >= read {
            write - read
        } else {
            self.inner.capacity - read + write
        }
    }

    pub fn pop(&mut self) -> Option<f32> {
        let read = self.inner.read.load(Ordering::Relaxed);
        if read == self.inner.write.load(Ordering::Acquire) {
            return None;
        }
        // SAFETY: the consumer exclusively owns the current read slot until
        // the read index is published below.
        let value = unsafe { *self.inner.buffer[read].get() };
        self.inner
            .read
            .store(increment(read, self.inner.capacity), Ordering::Release);
        Some(value)
    }
}

fn increment(index: usize, capacity: usize) -> usize {
    if index + 1 == capacity {
        0
    } else {
        index + 1
    }
}

pub fn encode_pcm_frame(samples: &[f32; SAMPLES_PER_FRAME]) -> [u8; PCM_FRAME_BYTES] {
    let mut bytes = [0_u8; PCM_FRAME_BYTES];
    for (sample, chunk) in samples.iter().zip(bytes.chunks_exact_mut(4)) {
        chunk.copy_from_slice(&sample.to_bits().to_be_bytes());
    }
    bytes
}

pub fn decode_pcm_frame(bytes: &[u8]) -> Option<[f32; SAMPLES_PER_FRAME]> {
    if bytes.len() != PCM_FRAME_BYTES {
        return None;
    }
    let mut samples = [0.0_f32; SAMPLES_PER_FRAME];
    for (sample, chunk) in samples.iter_mut().zip(bytes.chunks_exact(4)) {
        let bits = u32::from_be_bytes(chunk.try_into().expect("four-byte chunk"));
        *sample = f32::from_bits(bits);
    }
    Some(samples)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_preserves_order_and_reports_full() {
        let (mut producer, mut consumer) = ring_buffer(3);
        assert!(producer.push(1.0).is_ok());
        assert!(producer.push(2.0).is_ok());
        assert_eq!(producer.push(3.0), Err(3.0));
        assert_eq!(consumer.pop(), Some(1.0));
        assert_eq!(consumer.pop(), Some(2.0));
        assert_eq!(consumer.pop(), None);
        assert_eq!(consumer.available(), 0);
    }

    #[test]
    fn ring_wraps_and_reuses_slots() {
        let (mut producer, mut consumer) = ring_buffer(3);
        for value in [1.0, 2.0, 3.0, 4.0] {
            assert!(producer.push(value).is_ok());
            assert_eq!(consumer.pop(), Some(value));
        }
    }

    #[test]
    fn available_tracks_buffered_samples_across_wrap() {
        let (mut producer, mut consumer) = ring_buffer(4);
        producer.push(1.0).unwrap();
        producer.push(2.0).unwrap();
        assert_eq!(consumer.available(), 2);
        assert_eq!(consumer.pop(), Some(1.0));
        producer.push(3.0).unwrap();
        producer.push(4.0).unwrap();
        assert_eq!(consumer.available(), 3);
    }

    #[test]
    fn slice_is_published_as_one_complete_batch() {
        let (mut producer, mut consumer) = ring_buffer(6);
        producer.push_slice(&[1.0, 2.0, 3.0]).unwrap();
        assert_eq!(consumer.available(), 3);
        assert_eq!(consumer.pop(), Some(1.0));
        assert_eq!(consumer.pop(), Some(2.0));
        producer.push_slice(&[4.0, 5.0, 6.0]).unwrap();
        assert_eq!(consumer.available(), 4);
        assert_eq!(consumer.pop(), Some(3.0));
        assert_eq!(consumer.pop(), Some(4.0));
        assert_eq!(consumer.pop(), Some(5.0));
        assert_eq!(consumer.pop(), Some(6.0));
    }

    #[test]
    fn failed_slice_push_does_not_publish_partial_data() {
        let (mut producer, consumer) = ring_buffer(4);
        assert_eq!(
            producer.push_slice(&[1.0, 2.0, 3.0, 4.0]),
            Err(PushSliceError)
        );
        assert_eq!(consumer.available(), 0);
    }

    #[test]
    fn pcm_frame_round_trip_is_bit_exact() {
        let mut samples = [0.0; SAMPLES_PER_FRAME];
        samples[0] = -1.0;
        samples[1] = 0.25;
        samples[SAMPLES_PER_FRAME - 1] = 1.0;
        let decoded = decode_pcm_frame(&encode_pcm_frame(&samples)).unwrap();
        assert_eq!(decoded, samples);
    }

    #[test]
    fn pcm_decoder_rejects_wrong_size() {
        assert!(decode_pcm_frame(&[0; 3]).is_none());
    }
}
