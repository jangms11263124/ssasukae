use std::{
    collections::{BTreeMap, BTreeSet},
    time::{Duration, Instant},
};

pub const START_GUARD: Duration = Duration::from_millis(300);
pub const READY_REPEAT: Duration = Duration::from_millis(500);
/// 리더가 재생 위치를 알리는 주기. 이 값이 곧 드리프트 보정 주기다.
///
/// 500 ms 였을 때 보정 속도가 초당 0.5 ms 에 그쳐, 시작이 50 ms 어긋나면 복구에 100 초가
/// 걸렸다. 100 ms 로 줄이면 5 배 빨라지는데, 추가 트래픽은 피어당 초당 10 패킷이라
/// 오디오(400 pps) 대비 무시할 수준이고 보정 한 걸음의 크기는 그대로라 음질 영향도 없다.
pub const POSITION_REPEAT: Duration = Duration::from_millis(100);
pub const MEMBERSHIP_STABLE: Duration = Duration::from_millis(500);
pub const READY_TIMEOUT: Duration = Duration::from_secs(15);
/// 이 이하의 오차는 보정하지 않는 불감대. 96 samples = 2 ms.
///
/// 480(10 ms)이었을 때는 10 ms 어긋난 채로 수렴이 끝나 버렸다. 합창에서 10 ms 는
/// 3.4 m 떨어져 부르는 것과 같아 무시할 수 없다.
pub const DRIFT_THRESHOLD_SAMPLES: usize = 96;
/// 한 번에 건너뛸 수 있는 최대 샘플. 48 samples = 1 ms.
///
/// [`crate::MrTrack::nudge_position`] 은 위치를 그냥 점프시키므로 한 걸음이 크면 클릭음이
/// 난다. 1 ms 는 그 경계 안쪽이다. 보정 속도는 걸음 크기보다 [`POSITION_REPEAT`] 를
/// 줄여서 올리는 편이 음질에 안전하다.
pub const MAX_POSITION_NUDGE_SAMPLES: usize = 48;

#[derive(Debug, PartialEq, Eq)]
pub struct MembershipChange {
    pub canceled_performance_id: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadyFailure {
    pub performance_id: u64,
    pub waiting_clients: Vec<u64>,
    pub mismatched_clients: Vec<u64>,
}

pub struct MrSyncState {
    local_ready: Option<(u64, u64, u64)>,
    remote_ready: BTreeMap<u64, (u64, u64, u64)>,
    connected_peers: BTreeSet<u64>,
    playback_peers: BTreeSet<u64>,
    membership_changed_at: Option<Instant>,
    start_requested: Option<(u64, Instant)>,
    scheduled: Option<(u64, Instant)>,
    timeout_reported: bool,
    last_ready_broadcast: Option<Instant>,
    last_position_broadcast: Option<Instant>,
}

impl MrSyncState {
    pub fn new() -> Self {
        Self {
            local_ready: None,
            remote_ready: BTreeMap::new(),
            connected_peers: BTreeSet::new(),
            playback_peers: BTreeSet::new(),
            membership_changed_at: None,
            start_requested: None,
            scheduled: None,
            timeout_reported: false,
            last_ready_broadcast: None,
            last_position_broadcast: None,
        }
    }

    pub fn load(&mut self, performance_id: u64, total_samples: usize, fingerprint: u64) {
        self.local_ready = Some((performance_id, total_samples as u64, fingerprint));
        self.remote_ready
            .retain(|_, (remote_performance, _, _)| *remote_performance == performance_id);
        self.start_requested = None;
        self.scheduled = None;
        self.playback_peers.clear();
        self.timeout_reported = false;
        self.last_ready_broadcast = None;
        self.last_position_broadcast = None;
    }

    pub fn stop(&mut self, performance_id: Option<u64>) {
        if performance_id.is_none_or(|id| {
            self.local_ready
                .is_some_and(|(performance, _, _)| performance == id)
        }) {
            self.local_ready = None;
            self.remote_ready.clear();
            self.start_requested = None;
            self.scheduled = None;
            self.playback_peers.clear();
            self.timeout_reported = false;
            self.last_ready_broadcast = None;
            self.last_position_broadcast = None;
        }
    }

    pub fn update_connected_peers(
        &mut self,
        connected_peer_ids: &[u64],
        now: Instant,
    ) -> Option<MembershipChange> {
        let next: BTreeSet<u64> = connected_peer_ids.iter().copied().collect();
        if next == self.connected_peers {
            return None;
        }
        self.connected_peers = next;
        if self.playback_peers.is_empty() {
            self.remote_ready
                .retain(|peer_id, _| self.connected_peers.contains(peer_id));
        }
        self.membership_changed_at = Some(now);
        if let Some((performance_id, _)) = self.start_requested {
            self.start_requested = Some((performance_id, now));
            self.timeout_reported = false;
        }
        let canceled_performance_id = self
            .scheduled
            .take()
            .map(|(performance_id, _)| performance_id);
        Some(MembershipChange {
            canceled_performance_id,
        })
    }

    pub fn request_start(&mut self, performance_id: u64, now: Instant) {
        if self
            .local_ready
            .is_some_and(|(performance, _, _)| performance == performance_id)
        {
            self.start_requested = Some((performance_id, now));
            self.timeout_reported = false;
        }
    }

    pub fn observe_ready(
        &mut self,
        peer_id: u64,
        performance_id: u64,
        total_samples: u64,
        fingerprint: u64,
    ) {
        self.remote_ready
            .insert(peer_id, (performance_id, total_samples, fingerprint));
    }

    pub fn ready_status(&self, connected_peer_ids: &[u64]) -> (usize, usize, Vec<u64>, Vec<u64>) {
        let Some(local) = self.local_ready else {
            return (
                0,
                connected_peer_ids.len() + 1,
                connected_peer_ids.to_vec(),
                Vec::new(),
            );
        };
        let mut ready = 1;
        let mut waiting = Vec::new();
        let mut mismatched = Vec::new();
        for peer_id in connected_peer_ids {
            match self.remote_ready.get(peer_id) {
                Some(remote) if *remote == local => ready += 1,
                Some(_) => mismatched.push(*peer_id),
                None => waiting.push(*peer_id),
            }
        }
        (ready, connected_peer_ids.len() + 1, waiting, mismatched)
    }

    pub fn ready_counts(&self, connected_peer_ids: &[u64]) -> (usize, usize) {
        let (ready, total, _, _) = self.ready_status(connected_peer_ids);
        (ready, total)
    }

    pub fn all_connected_ready(&self, connected_peer_ids: &[u64]) -> bool {
        let (ready, total) = self.ready_counts(connected_peer_ids);
        ready == total && total > 0
    }

    pub fn local_ready_packet(&self) -> Option<(u64, u64, u64)> {
        self.local_ready
    }

    pub fn should_broadcast_ready(&mut self, now: Instant) -> bool {
        if self.local_ready.is_none() {
            return false;
        }
        if self
            .last_ready_broadcast
            .is_none_or(|last| now.duration_since(last) >= READY_REPEAT)
        {
            self.last_ready_broadcast = Some(now);
            true
        } else {
            false
        }
    }

    pub fn leader_id(local_client_id: u64, connected_peer_ids: &[u64]) -> u64 {
        connected_peer_ids
            .iter()
            .copied()
            .chain(std::iter::once(local_client_id))
            .min()
            .unwrap_or(local_client_id)
    }

    pub fn current_leader_id(&self, local_client_id: u64, connected_peer_ids: &[u64]) -> u64 {
        if self.playback_peers.is_empty() {
            return Self::leader_id(local_client_id, connected_peer_ids);
        }
        connected_peer_ids
            .iter()
            .copied()
            .filter(|peer_id| self.playback_peers.contains(peer_id))
            .chain(std::iter::once(local_client_id))
            .min()
            .unwrap_or(local_client_id)
    }

    pub fn status_peer_ids(&self, connected_peer_ids: &[u64]) -> Vec<u64> {
        if self.playback_peers.is_empty() {
            connected_peer_ids.to_vec()
        } else {
            self.playback_peers.iter().copied().collect()
        }
    }

    fn membership_is_stable(&self, now: Instant) -> bool {
        self.membership_changed_at
            .is_none_or(|changed| now.duration_since(changed) >= MEMBERSHIP_STABLE)
    }

    pub fn leader_schedule_if_ready(
        &mut self,
        local_client_id: u64,
        connected_peer_ids: &[u64],
        now: Instant,
    ) -> Option<(u64, Instant)> {
        let (performance_id, _) = self.start_requested?;
        if Self::leader_id(local_client_id, connected_peer_ids) != local_client_id
            || !self.membership_is_stable(now)
            || !self.all_connected_ready(connected_peer_ids)
            || self.scheduled.is_some()
        {
            return None;
        }
        let target = now + START_GUARD;
        self.scheduled = Some((performance_id, target));
        Some((performance_id, target))
    }

    pub fn observe_start(
        &mut self,
        performance_id: u64,
        now: Instant,
        remaining_delay: Duration,
    ) -> bool {
        if !self
            .local_ready
            .is_some_and(|(local_performance, _, _)| local_performance == performance_id)
        {
            return false;
        }
        self.start_requested.get_or_insert((performance_id, now));
        self.scheduled = Some((performance_id, now + remaining_delay));
        self.timeout_reported = false;
        true
    }

    pub fn observe_reset(&mut self, performance_id: u64, now: Instant) -> bool {
        if !self
            .local_ready
            .is_some_and(|(local_performance, _, _)| local_performance == performance_id)
        {
            return false;
        }
        self.scheduled = None;
        self.start_requested = Some((performance_id, now));
        self.timeout_reported = false;
        self.membership_changed_at = Some(now);
        true
    }

    pub fn ready_timeout_remaining_seconds(&self, now: Instant) -> Option<u64> {
        if self.scheduled.is_some() {
            return None;
        }
        let (_, requested_at) = self.start_requested?;
        let remaining = READY_TIMEOUT.saturating_sub(now.duration_since(requested_at));
        Some(
            remaining
                .as_secs()
                .saturating_add(u64::from(remaining.subsec_nanos() > 0)),
        )
    }

    pub fn take_ready_failure(
        &mut self,
        local_client_id: u64,
        connected_peer_ids: &[u64],
        now: Instant,
    ) -> Option<ReadyFailure> {
        let (performance_id, requested_at) = self.start_requested?;
        if self.timeout_reported
            || self.scheduled.is_some()
            || Self::leader_id(local_client_id, connected_peer_ids) != local_client_id
        {
            return None;
        }
        let (_, _, waiting_clients, mismatched_clients) = self.ready_status(connected_peer_ids);
        let timed_out = now.duration_since(requested_at) >= READY_TIMEOUT;
        if mismatched_clients.is_empty() && !timed_out {
            return None;
        }
        if waiting_clients.is_empty() && mismatched_clients.is_empty() {
            return None;
        }
        self.timeout_reported = true;
        self.start_requested = None;
        Some(ReadyFailure {
            performance_id,
            waiting_clients,
            mismatched_clients,
        })
    }

    pub fn take_due_start(&mut self, now: Instant) -> Option<u64> {
        let (performance_id, target) = self.scheduled?;
        if now < target {
            return None;
        }
        self.scheduled = None;
        self.start_requested = None;
        self.playback_peers = self.connected_peers.clone();
        Some(performance_id)
    }

    pub fn scheduled_delay_ms(&self, now: Instant) -> Option<u64> {
        self.scheduled.map(|(_, target)| {
            target
                .saturating_duration_since(now)
                .as_millis()
                .min(u64::MAX as u128) as u64
        })
    }

    pub fn should_broadcast_position(&mut self, now: Instant) -> bool {
        if self
            .last_position_broadcast
            .is_none_or(|last| now.duration_since(last) >= POSITION_REPEAT)
        {
            self.last_position_broadcast = Some(now);
            true
        } else {
            false
        }
    }
}

pub fn client_ids_to_mask(client_ids: &[u64]) -> u64 {
    client_ids.iter().fold(0_u64, |mask, client_id| {
        client_id
            .checked_sub(1)
            .filter(|bit| *bit < 64)
            .map_or(mask, |bit| mask | (1_u64 << bit))
    })
}

pub fn mask_to_client_ids(mask: u64) -> Vec<u64> {
    (0..64)
        .filter(|bit| mask & (1_u64 << bit) != 0)
        .map(|bit| bit + 1)
        .collect()
}

pub fn remaining_start_delay(
    advertised_delay_ns: u64,
    estimated_one_way_us: Option<f64>,
) -> Duration {
    let transit_ns = estimated_one_way_us
        .unwrap_or(0.0)
        .max(0.0)
        .mul_add(1_000.0, 0.0) as u64;
    Duration::from_nanos(advertised_delay_ns.saturating_sub(transit_ns))
}

pub fn bounded_position_nudge(local_position: usize, leader_position: usize) -> isize {
    let error = leader_position as i128 - local_position as i128;
    if error.unsigned_abs() <= DRIFT_THRESHOLD_SAMPLES as u128 {
        return 0;
    }
    error.clamp(
        -(MAX_POSITION_NUDGE_SAMPLES as i128),
        MAX_POSITION_NUDGE_SAMPLES as i128,
    ) as isize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leader_waits_until_every_connected_peer_is_ready_and_membership_is_stable() {
        let now = Instant::now();
        let mut sync = MrSyncState::new();
        sync.update_connected_peers(&[2, 3], now);
        sync.load(7, 48_000, 123);
        sync.request_start(7, now);
        sync.observe_ready(2, 7, 48_000, 123);
        sync.observe_ready(3, 7, 48_000, 123);
        assert!(sync.leader_schedule_if_ready(1, &[2, 3], now).is_none());
        let stable = now + MEMBERSHIP_STABLE;
        let (_, target) = sync
            .leader_schedule_if_ready(1, &[2, 3], stable)
            .expect("leader schedule");
        assert_eq!(target.duration_since(stable), START_GUARD);
    }

    #[test]
    fn non_leader_never_creates_the_start_schedule() {
        let now = Instant::now();
        let mut sync = MrSyncState::new();
        sync.update_connected_peers(&[1], now);
        sync.load(7, 48_000, 123);
        sync.request_start(7, now);
        sync.observe_ready(1, 7, 48_000, 123);
        assert!(sync
            .leader_schedule_if_ready(2, &[1], now + MEMBERSHIP_STABLE)
            .is_none());
    }

    #[test]
    fn membership_change_removes_stale_ready_and_cancels_schedule() {
        let now = Instant::now();
        let mut sync = MrSyncState::new();
        sync.update_connected_peers(&[2], now);
        sync.load(7, 48_000, 123);
        sync.request_start(7, now);
        sync.observe_ready(2, 7, 48_000, 123);
        sync.leader_schedule_if_ready(1, &[2], now + MEMBERSHIP_STABLE);
        let change = sync
            .update_connected_peers(&[3], now + Duration::from_secs(1))
            .expect("membership change");
        assert_eq!(change.canceled_performance_id, Some(7));
        assert_eq!(sync.ready_status(&[3]), (1, 2, vec![3], Vec::new()));
    }

    #[test]
    fn mismatch_fails_immediately_and_includes_other_waiting_clients() {
        let now = Instant::now();
        let mut sync = MrSyncState::new();
        sync.update_connected_peers(&[2, 3], now);
        sync.load(7, 48_000, 123);
        sync.request_start(7, now);
        sync.observe_ready(3, 7, 48_000, 999);
        let failure = sync
            .take_ready_failure(1, &[2, 3], now)
            .expect("timeout failure");
        assert_eq!(failure.waiting_clients, vec![2]);
        assert_eq!(failure.mismatched_clients, vec![3]);
        assert!(sync
            .take_ready_failure(1, &[2, 3], now + READY_TIMEOUT)
            .is_none());
    }

    #[test]
    fn missing_ready_response_fails_only_after_timeout() {
        let now = Instant::now();
        let mut sync = MrSyncState::new();
        sync.update_connected_peers(&[2], now);
        sync.load(7, 48_000, 123);
        sync.request_start(7, now);
        assert!(sync
            .take_ready_failure(1, &[2], now + READY_TIMEOUT - Duration::from_millis(1))
            .is_none());
        let failure = sync
            .take_ready_failure(1, &[2], now + READY_TIMEOUT)
            .expect("timeout failure");
        assert_eq!(failure.waiting_clients, vec![2]);
        assert!(failure.mismatched_clients.is_empty());
    }

    #[test]
    fn start_delay_subtracts_estimated_network_transit() {
        assert_eq!(
            remaining_start_delay(300_000_000, Some(10_000.0)),
            Duration::from_millis(290)
        );
    }

    #[test]
    fn drift_nudge_is_thresholded_and_bounded() {
        // 불감대 안(96 samples = 2 ms 이하)이면 건드리지 않는다.
        assert_eq!(bounded_position_nudge(10_000, 10_050), 0);
        assert_eq!(bounded_position_nudge(10_000, 10_096), 0);
        // 불감대를 넘으면 한 걸음 상한(48 samples = 1 ms)까지만 당긴다.
        assert_eq!(bounded_position_nudge(10_000, 10_200), 48);
        assert_eq!(bounded_position_nudge(10_000, 11_000), 48);
        assert_eq!(bounded_position_nudge(11_000, 10_000), -48);
    }

    /// 보정 속도가 실제로 빨라졌는지 못 박아 둔다.
    ///
    /// 500 ms 주기 × 24 samples 였을 때는 초당 0.5 ms 라, 시작이 50 ms 어긋나면
    /// 복구에 100 초가 걸렸다. 이 값이 다시 느려지면 여기서 걸린다.
    #[test]
    fn drift_correction_recovers_at_least_five_milliseconds_per_second() {
        let corrections_per_second = 1000.0 / POSITION_REPEAT.as_millis() as f64;
        let milliseconds_per_step = MAX_POSITION_NUDGE_SAMPLES as f64 / 48.0;
        let recovery_per_second = corrections_per_second * milliseconds_per_step;
        assert!(
            recovery_per_second >= 5.0,
            "보정 속도가 초당 {recovery_per_second} ms 로 너무 느리다"
        );
    }

    #[test]
    fn readiness_rejects_different_audio_content() {
        let mut sync = MrSyncState::new();
        sync.load(7, 48_000, 123);
        sync.observe_ready(2, 7, 48_000, 999);
        assert_eq!(sync.ready_counts(&[2]), (1, 2));
        assert!(!sync.all_connected_ready(&[2]));
    }

    #[test]
    fn client_mask_round_trips() {
        let mask = client_ids_to_mask(&[1, 3, 4]);
        assert_eq!(mask_to_client_ids(mask), vec![1, 3, 4]);
    }

    #[test]
    fn playback_leader_ignores_new_participants_and_re_elects_original_peers() {
        let now = Instant::now();
        let mut sync = MrSyncState::new();
        sync.update_connected_peers(&[3], now);
        sync.load(7, 48_000, 123);
        sync.request_start(7, now);
        sync.observe_ready(3, 7, 48_000, 123);
        sync.leader_schedule_if_ready(4, &[3], now + MEMBERSHIP_STABLE);
        sync.observe_start(7, now, Duration::ZERO);
        assert_eq!(sync.take_due_start(now), Some(7));
        assert_eq!(sync.current_leader_id(4, &[1, 3]), 3);
        assert_eq!(sync.current_leader_id(4, &[1]), 4);
        assert_eq!(sync.status_peer_ids(&[1, 3]), vec![3]);
    }
}
