use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Distribution {
    pub min: f64,
    pub mean: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub max: f64,
}

pub fn summarize(samples: &[f64]) -> Option<Distribution> {
    if samples.is_empty() {
        return None;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    Some(Distribution {
        min: sorted[0],
        mean: sorted.iter().sum::<f64>() / sorted.len() as f64,
        p50: percentile_sorted(&sorted, 50.0),
        p95: percentile_sorted(&sorted, 95.0),
        p99: percentile_sorted(&sorted, 99.0),
        max: sorted[sorted.len() - 1],
    })
}

/// Nearest-rank percentile. Input must be sorted and non-empty.
fn percentile_sorted(sorted: &[f64], percentile: f64) -> f64 {
    let rank = ((percentile / 100.0) * sorted.len() as f64).ceil() as usize;
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

#[derive(Debug, Default)]
pub struct SequenceTracker {
    seen: HashSet<u64>,
    highest: Option<u64>,
    pub duplicates: u64,
    pub out_of_order: u64,
}

impl SequenceTracker {
    /// Returns true only for the first observation of a sequence number.
    pub fn observe(&mut self, sequence: u64) -> bool {
        if !self.seen.insert(sequence) {
            self.duplicates += 1;
            return false;
        }
        if let Some(highest) = self.highest {
            let forward = sequence.wrapping_sub(highest);
            if forward != 0 && forward <= u64::MAX / 2 {
                self.highest = Some(sequence);
            } else {
                self.out_of_order += 1;
            }
        } else {
            self.highest = Some(sequence);
        }
        true
    }

    pub fn unique_received(&self) -> u64 {
        self.seen.len() as u64
    }
}

pub fn packet_loss(sent: u64, unique_received: u64) -> (u64, f64) {
    let lost = sent.saturating_sub(unique_received);
    let rate = if sent == 0 {
        0.0
    } else {
        lost as f64 * 100.0 / sent as f64
    };
    (lost, rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculates_nearest_rank_percentiles() {
        let values: Vec<f64> = (1..=100).map(f64::from).collect();
        let result = summarize(&values).unwrap();
        assert_eq!((result.p50, result.p95, result.p99), (50.0, 95.0, 99.0));
    }

    #[test]
    fn tracks_duplicate_and_reordering() {
        let mut tracker = SequenceTracker::default();
        for sequence in [0, 2, 1, 2] {
            tracker.observe(sequence);
        }
        assert_eq!(tracker.unique_received(), 3);
        assert_eq!(tracker.duplicates, 1);
        assert_eq!(tracker.out_of_order, 1);
    }

    #[test]
    fn sequence_order_crosses_wraparound() {
        let mut tracker = SequenceTracker::default();
        for sequence in [u64::MAX - 1, u64::MAX, 0, 1] {
            assert!(tracker.observe(sequence));
        }
        assert_eq!(tracker.out_of_order, 0);
    }

    #[test]
    fn loss_saturates_for_unexpected_extra_packets() {
        assert_eq!(packet_loss(10, 8), (2, 20.0));
        assert_eq!(packet_loss(1, 2), (0, 0.0));
    }
}
