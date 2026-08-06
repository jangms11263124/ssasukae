use protocol::{
    decode, encode, encode_with_payload, registration, DecodeError, PacketHeader, PacketKind,
    RendezvousErrorCode, HEADER_LEN, MAGIC, MAX_ICE_DESCRIPTION_BYTES, MAX_PACKET_BYTES,
    MAX_REGISTRATION_BYTES, VERSION,
};
use std::{
    collections::{HashMap, HashSet},
    env, io,
    net::{IpAddr, SocketAddr, UdpSocket},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

const PEER_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_CLIENTS: u64 = 4;
const STATUS_INTERVAL: Duration = Duration::from_secs(30);
const RATE_ENTRY_TIMEOUT: Duration = Duration::from_secs(120);
const PACKET_RATE_CAPACITY: f64 = 800.0;
const PACKET_RATE_PER_SECOND: f64 = 400.0;
const REGISTER_RATE_CAPACITY: f64 = 48.0;
const REGISTER_RATE_PER_SECOND: f64 = 16.0;

#[derive(Clone)]
struct Peer {
    address: SocketAddr,
    last_seen: Instant,
    identity_public_key: [u8; 32],
    signed_registration: Vec<u8>,
}

#[derive(Default)]
struct Registry {
    peers: HashMap<(u64, u64), Peer>,
}

impl Registry {
    fn assign_client_id(
        &mut self,
        session_id: u64,
        address: SocketAddr,
        identity_public_key: [u8; 32],
        now: Instant,
    ) -> Result<(u64, bool), RendezvousErrorCode> {
        if let Some((&(_, client_id), peer)) =
            self.peers.iter_mut().find(|(&(session, _), peer)| {
                session == session_id
                    && peer.address == address
                    && peer.identity_public_key == identity_public_key
            })
        {
            peer.last_seen = now;
            return Ok((client_id, false));
        }
        let client_id = (1..=MAX_CLIENTS)
            .find(|candidate| !self.peers.contains_key(&(session_id, *candidate)))
            .ok_or(RendezvousErrorCode::RoomFull)?;
        self.peers.insert(
            (session_id, client_id),
            Peer {
                address,
                last_seen: now,
                identity_public_key,
                signed_registration: Vec::new(),
            },
        );
        Ok((client_id, true))
    }

    fn register(
        &mut self,
        session_id: u64,
        client_id: u64,
        address: SocketAddr,
        identity_public_key: [u8; 32],
        signed_registration: &[u8],
        now: Instant,
    ) -> Result<bool, RendezvousErrorCode> {
        if let Some(peer) = self.peers.get_mut(&(session_id, client_id)) {
            if peer.address != address || peer.identity_public_key != identity_public_key {
                return Err(RendezvousErrorCode::ClientIdConflict);
            }
            peer.last_seen = now;
            peer.signed_registration.clear();
            peer.signed_registration
                .extend_from_slice(signed_registration);
            return Ok(false);
        }
        self.peers.insert(
            (session_id, client_id),
            Peer {
                address,
                last_seen: now,
                identity_public_key,
                signed_registration: signed_registration.to_vec(),
            },
        );
        Ok(true)
    }

    fn remove(&mut self, session_id: u64, client_id: u64, address: SocketAddr) -> bool {
        let key = (session_id, client_id);
        if self
            .peers
            .get(&key)
            .is_some_and(|peer| peer.address == address)
        {
            self.peers.remove(&key);
            true
        } else {
            false
        }
    }

    fn expire(&mut self, now: Instant) -> usize {
        let before = self.peers.len();
        self.peers
            .retain(|_, peer| now.duration_since(peer.last_seen) <= PEER_TIMEOUT);
        before.saturating_sub(self.peers.len())
    }

    fn session_peers(&self, session_id: u64) -> Vec<(u64, SocketAddr, Vec<u8>)> {
        self.peers
            .iter()
            .filter_map(|(&(session, client_id), peer)| {
                (session == session_id).then_some((
                    client_id,
                    peer.address,
                    peer.signed_registration.clone(),
                ))
            })
            .collect()
    }

    fn session_count(&self) -> usize {
        self.peers
            .keys()
            .map(|(session_id, _)| *session_id)
            .collect::<HashSet<_>>()
            .len()
    }
}

#[derive(Default)]
struct RegistrationReplayCache {
    seen: HashMap<([u8; 32], [u8; 16]), Instant>,
}

impl RegistrationReplayCache {
    fn accept(&mut self, identity: [u8; 32], nonce: [u8; 16], now: Instant) -> bool {
        self.seen
            .retain(|_, seen_at| now.duration_since(*seen_at) <= RATE_ENTRY_TIMEOUT);
        self.seen.insert((identity, nonce), now).is_none()
    }
}

struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
    last_seen: Instant,
}

struct IpRateLimiter {
    capacity: f64,
    refill_per_second: f64,
    buckets: HashMap<IpAddr, TokenBucket>,
}

impl IpRateLimiter {
    fn new(capacity: f64, refill_per_second: f64) -> Self {
        Self {
            capacity,
            refill_per_second,
            buckets: HashMap::new(),
        }
    }

    fn allow(&mut self, address: IpAddr, now: Instant) -> bool {
        let bucket = self.buckets.entry(address).or_insert(TokenBucket {
            tokens: self.capacity,
            last_refill: now,
            last_seen: now,
        });
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.refill_per_second).min(self.capacity);
        bucket.last_refill = now;
        bucket.last_seen = now;
        if bucket.tokens < 1.0 {
            return false;
        }
        bucket.tokens -= 1.0;
        true
    }

    fn expire(&mut self, now: Instant) {
        self.buckets
            .retain(|_, bucket| now.duration_since(bucket.last_seen) <= RATE_ENTRY_TIMEOUT);
    }
}

#[derive(Default)]
struct ServerStats {
    echoed: u64,
    registered: u64,
    assigned: u64,
    peer_infos: u64,
    left: u64,
    expired: u64,
    rejected: u64,
    rate_limited: u64,
    media_rejected: u64,
    malformed: u64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind = value_after("--bind").unwrap_or_else(|| "0.0.0.0:50000".into());
    if env::args().any(|arg| arg == "--help" || arg == "-h") {
        println!(
            "audio-relay-server\n\nUsage: audio-relay-server [--bind ADDRESS]\nDefault: 0.0.0.0:50000"
        );
        return Ok(());
    }
    let socket = UdpSocket::bind(&bind)?;
    socket.set_read_timeout(Some(Duration::from_millis(100)))?;
    let running = Arc::new(AtomicBool::new(true));
    let signal = Arc::clone(&running);
    ctrlc::set_handler(move || signal.store(false, Ordering::SeqCst))?;
    let epoch = Instant::now();
    let mut next_status = epoch + STATUS_INTERVAL;
    let mut buffer = vec![0_u8; MAX_PACKET_BYTES];
    let mut registry = Registry::default();
    let mut packet_limiter = IpRateLimiter::new(PACKET_RATE_CAPACITY, PACKET_RATE_PER_SECOND);
    let mut register_limiter = IpRateLimiter::new(REGISTER_RATE_CAPACITY, REGISTER_RATE_PER_SECOND);
    let mut registration_replays = RegistrationReplayCache::default();
    let mut stats = ServerStats::default();
    println!(
        "{{\"event\":\"rendezvous_started\",\"bind\":\"{bind}\",\"protocolVersion\":{VERSION},\"maxClientsPerSession\":{MAX_CLIENTS},\"peerTimeoutSeconds\":{}}}",
        PEER_TIMEOUT.as_secs()
    );

    while running.load(Ordering::Relaxed) {
        match socket.recv_from(&mut buffer) {
            Ok((size, source)) => {
                let now = Instant::now();
                stats.expired += registry.expire(now) as u64;
                if !packet_limiter.allow(source.ip(), now) {
                    stats.rate_limited += 1;
                    continue;
                }
                let request = match decode(&buffer[..size]) {
                    Ok(request) => request,
                    Err(DecodeError::UnsupportedVersion(received)) => {
                        stats.rejected += 1;
                        if let Some((session_id, client_id)) = raw_scope(&buffer[..size]) {
                            send_error(
                                &socket,
                                source,
                                session_id,
                                client_id,
                                RendezvousErrorCode::ProtocolVersionMismatch,
                                epoch,
                            );
                        }
                        println!(
                            "{{\"event\":\"protocol_mismatch\",\"source\":\"{source}\",\"receivedVersion\":{received},\"supportedVersion\":{VERSION}}}"
                        );
                        continue;
                    }
                    Err(_) => {
                        stats.malformed += 1;
                        continue;
                    }
                };
                match request.kind {
                    PacketKind::Ping => {
                        let response = PacketHeader {
                            kind: PacketKind::Pong,
                            sequence: request.sequence,
                            client_sent_ns: request.client_sent_ns,
                            server_received_ns: elapsed_ns(epoch),
                            server_sent_ns: elapsed_ns(epoch),
                            session_id: 0,
                            client_id: 0,
                        };
                        if encode(response, size)
                            .is_ok_and(|packet| socket.send_to(&packet, source).is_ok())
                        {
                            stats.echoed += 1;
                        }
                    }
                    PacketKind::Register => {
                        if !register_limiter.allow(source.ip(), now) {
                            stats.rate_limited += 1;
                            send_error(
                                &socket,
                                source,
                                request.session_id,
                                request.client_id,
                                RendezvousErrorCode::RateLimited,
                                epoch,
                            );
                            continue;
                        }
                        handle_registration(
                            &socket,
                            source,
                            request,
                            &buffer[..size],
                            now,
                            epoch,
                            &mut registry,
                            &mut registration_replays,
                            &mut stats,
                        );
                    }
                    PacketKind::Leave => {
                        if size != HEADER_LEN
                            || request.session_id == 0
                            || !(1..=MAX_CLIENTS).contains(&request.client_id)
                        {
                            stats.rejected += 1;
                            send_error(
                                &socket,
                                source,
                                request.session_id,
                                request.client_id,
                                RendezvousErrorCode::InvalidRegistration,
                                epoch,
                            );
                        } else if registry.remove(request.session_id, request.client_id, source) {
                            stats.left += 1;
                            println!(
                                "{{\"event\":\"peer_left\",\"sessionId\":{},\"clientId\":{},\"source\":\"{source}\"}}",
                                request.session_id, request.client_id
                            );
                        }
                    }
                    PacketKind::Audio | PacketKind::DeliveryAck => stats.media_rejected += 1,
                    _ => stats.malformed += 1,
                }
                packet_limiter.expire(now);
                register_limiter.expire(now);
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock
                        | io::ErrorKind::TimedOut
                        | io::ErrorKind::ConnectionReset
                ) =>
            {
                let now = Instant::now();
                stats.expired += registry.expire(now) as u64;
                packet_limiter.expire(now);
                register_limiter.expire(now);
            }
            Err(error) => return Err(error.into()),
        }
        let now = Instant::now();
        if now >= next_status {
            print_status(&registry, &stats);
            next_status = now + STATUS_INTERVAL;
        }
    }
    print_status(&registry, &stats);
    println!("{{\"event\":\"rendezvous_stopped\"}}");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn handle_registration(
    socket: &UdpSocket,
    source: SocketAddr,
    request: PacketHeader,
    packet: &[u8],
    now: Instant,
    epoch: Instant,
    registry: &mut Registry,
    registration_replays: &mut RegistrationReplayCache,
    stats: &mut ServerStats,
) {
    if request.session_id == 0 {
        stats.rejected += 1;
        send_error(
            socket,
            source,
            request.session_id,
            request.client_id,
            RendezvousErrorCode::InvalidSession,
            epoch,
        );
        return;
    }
    let signed_payload = &packet[HEADER_LEN..];
    if signed_payload.len() > MAX_REGISTRATION_BYTES {
        stats.rejected += 1;
        send_error(
            socket,
            source,
            request.session_id,
            request.client_id,
            RendezvousErrorCode::PayloadTooLarge,
            epoch,
        );
        return;
    }
    let verified =
        match registration::verify(signed_payload, request.session_id, request.client_id, true) {
            Ok(verified) => verified,
            Err(_) => {
                stats.rejected += 1;
                send_error(
                    socket,
                    source,
                    request.session_id,
                    0,
                    RendezvousErrorCode::InvalidRegistration,
                    epoch,
                );
                return;
            }
        };
    if !registration_replays.accept(verified.identity_public_key, verified.nonce, now) {
        stats.rejected += 1;
        send_error(
            socket,
            source,
            request.session_id,
            request.client_id,
            RendezvousErrorCode::InvalidRegistration,
            epoch,
        );
        return;
    }
    if request.client_id == 0 {
        if !verified.ice_description.is_empty() {
            stats.rejected += 1;
            send_error(
                socket,
                source,
                request.session_id,
                0,
                RendezvousErrorCode::InvalidRegistration,
                epoch,
            );
            return;
        }
        match registry.assign_client_id(
            request.session_id,
            source,
            verified.identity_public_key,
            now,
        ) {
            Ok((client_id, newly_assigned)) => {
                if newly_assigned {
                    stats.assigned += 1;
                    println!(
                        "{{\"event\":\"client_assigned\",\"sessionId\":{},\"clientId\":{client_id},\"source\":\"{source}\"}}",
                        request.session_id
                    );
                }
                send_registration_ack(socket, source, request.session_id, client_id, epoch);
                stats.registered += 1;
            }
            Err(code) => {
                stats.rejected += 1;
                send_error(socket, source, request.session_id, 0, code, epoch);
            }
        }
        return;
    }
    let registration_error =
        if !(1..=MAX_CLIENTS).contains(&request.client_id) || verified.ice_description.is_empty() {
            Some(RendezvousErrorCode::InvalidRegistration)
        } else if verified.ice_description.len() > MAX_ICE_DESCRIPTION_BYTES {
            Some(RendezvousErrorCode::PayloadTooLarge)
        } else {
            None
        };
    if let Some(code) = registration_error {
        stats.rejected += 1;
        send_error(
            socket,
            source,
            request.session_id,
            request.client_id,
            code,
            epoch,
        );
        return;
    }
    match registry.register(
        request.session_id,
        request.client_id,
        source,
        verified.identity_public_key,
        signed_payload,
        now,
    ) {
        Ok(newly_registered) => {
            if newly_registered {
                println!(
                    "{{\"event\":\"client_registered\",\"sessionId\":{},\"clientId\":{},\"source\":\"{source}\"}}",
                    request.session_id, request.client_id
                );
            }
            send_registration_ack(socket, source, request.session_id, request.client_id, epoch);
            stats.registered += 1;
            stats.peer_infos += announce_session_peers(
                socket,
                request.session_id,
                &registry.session_peers(request.session_id),
            );
        }
        Err(code) => {
            stats.rejected += 1;
            send_error(
                socket,
                source,
                request.session_id,
                request.client_id,
                code,
                epoch,
            );
        }
    }
}

fn send_registration_ack(
    socket: &UdpSocket,
    target: SocketAddr,
    session_id: u64,
    client_id: u64,
    epoch: Instant,
) {
    let response = PacketHeader {
        kind: PacketKind::RegisterAck,
        sequence: VERSION as u64,
        client_sent_ns: 0,
        server_received_ns: elapsed_ns(epoch),
        server_sent_ns: elapsed_ns(epoch),
        session_id,
        client_id,
    };
    if let Ok(packet) = encode(response, HEADER_LEN) {
        let _ = socket.send_to(&packet, target);
    }
}

fn send_error(
    socket: &UdpSocket,
    target: SocketAddr,
    session_id: u64,
    client_id: u64,
    code: RendezvousErrorCode,
    epoch: Instant,
) {
    let response = PacketHeader {
        kind: PacketKind::RendezvousError,
        sequence: code as u64,
        client_sent_ns: 0,
        server_received_ns: elapsed_ns(epoch),
        server_sent_ns: elapsed_ns(epoch),
        session_id,
        client_id,
    };
    if let Ok(packet) = encode(response, HEADER_LEN) {
        let _ = socket.send_to(&packet, target);
    }
}

fn raw_scope(packet: &[u8]) -> Option<(u64, u64)> {
    if packet.len() < HEADER_LEN || packet[0..4] != MAGIC {
        return None;
    }
    Some((
        u64::from_be_bytes(packet[40..48].try_into().ok()?),
        u64::from_be_bytes(packet[48..56].try_into().ok()?),
    ))
}

fn print_status(registry: &Registry, stats: &ServerStats) {
    println!(
        "{{\"event\":\"rendezvous_status\",\"activeSessions\":{},\"activePeers\":{},\"echoed\":{},\"registrations\":{},\"assigned\":{},\"peerInfos\":{},\"left\":{},\"expired\":{},\"rejected\":{},\"rateLimited\":{},\"mediaRejected\":{},\"malformed\":{}}}",
        registry.session_count(),
        registry.peers.len(),
        stats.echoed,
        stats.registered,
        stats.assigned,
        stats.peer_infos,
        stats.left,
        stats.expired,
        stats.rejected,
        stats.rate_limited,
        stats.media_rejected,
        stats.malformed,
    );
}

fn announce_session_peers(
    socket: &UdpSocket,
    session_id: u64,
    peers: &[(u64, SocketAddr, Vec<u8>)],
) -> u64 {
    let mut sent = 0;
    for (recipient_id, recipient_address, _) in peers {
        for (peer_id, _, ice_description) in peers {
            if peer_id == recipient_id {
                continue;
            }
            let header = PacketHeader {
                kind: PacketKind::PeerInfo,
                sequence: VERSION as u64,
                client_sent_ns: 0,
                server_received_ns: 0,
                server_sent_ns: 0,
                session_id,
                client_id: *peer_id,
            };
            if !ice_description.is_empty()
                && encode_with_payload(header, ice_description)
                    .is_ok_and(|packet| socket.send_to(&packet, recipient_address).is_ok())
            {
                sent += 1;
            }
        }
    }
    sent
}

fn elapsed_ns(epoch: Instant) -> u64 {
    epoch.elapsed().as_nanos().min(u64::MAX as u128) as u64
}

fn value_after(name: &str) -> Option<String> {
    let args: Vec<String> = env::args().collect();
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(value: u8) -> [u8; 32] {
        [value; 32]
    }

    #[test]
    fn inactive_peers_expire() {
        let now = Instant::now();
        let address = "127.0.0.1:10001".parse().unwrap();
        let mut registry = Registry::default();
        registry
            .register(1, 1, address, identity(1), b"ice", now)
            .unwrap();
        assert_eq!(
            registry.expire(now + PEER_TIMEOUT + Duration::from_millis(1)),
            1
        );
        assert!(registry.peers.is_empty());
    }

    #[test]
    fn session_peers_excludes_other_sessions() {
        let now = Instant::now();
        let first = "127.0.0.1:10001".parse().unwrap();
        let second = "127.0.0.1:10002".parse().unwrap();
        let other = "127.0.0.1:10003".parse().unwrap();
        let mut registry = Registry::default();
        registry
            .register(1, 1, first, identity(1), b"a", now)
            .unwrap();
        registry
            .register(1, 2, second, identity(2), b"b", now)
            .unwrap();
        registry
            .register(2, 3, other, identity(3), b"other", now)
            .unwrap();
        let mut peers = registry.session_peers(1);
        peers.sort_unstable_by_key(|(client_id, _, _)| *client_id);
        assert_eq!(
            peers,
            vec![(1, first, b"a".to_vec()), (2, second, b"b".to_vec())]
        );
    }

    #[test]
    fn assigns_first_free_client_id_and_reuses_endpoint_reservation() {
        let now = Instant::now();
        let first = "127.0.0.1:10001".parse().unwrap();
        let second = "127.0.0.1:10002".parse().unwrap();
        let mut registry = Registry::default();
        assert_eq!(
            registry.assign_client_id(7, first, identity(1), now),
            Ok((1, true))
        );
        assert_eq!(
            registry.assign_client_id(7, first, identity(1), now),
            Ok((1, false))
        );
        assert_eq!(
            registry.assign_client_id(7, second, identity(2), now),
            Ok((2, true))
        );
    }

    #[test]
    fn active_client_id_cannot_be_replaced_by_another_endpoint() {
        let now = Instant::now();
        let first = "127.0.0.1:10001".parse().unwrap();
        let attacker = "127.0.0.1:10002".parse().unwrap();
        let mut registry = Registry::default();
        registry
            .register(7, 1, first, identity(1), b"ice", now)
            .unwrap();
        assert_eq!(
            registry.register(7, 1, attacker, identity(1), b"other", now),
            Err(RendezvousErrorCode::ClientIdConflict)
        );
    }

    #[test]
    fn rate_limiter_refills_and_expires() {
        let now = Instant::now();
        let address = "127.0.0.1".parse().unwrap();
        let mut limiter = IpRateLimiter::new(2.0, 1.0);
        assert!(limiter.allow(address, now));
        assert!(limiter.allow(address, now));
        assert!(!limiter.allow(address, now));
        assert!(limiter.allow(address, now + Duration::from_secs(1)));
        limiter.expire(now + RATE_ENTRY_TIMEOUT + Duration::from_secs(2));
        assert!(limiter.buckets.is_empty());
    }

    #[test]
    fn fifth_client_is_rejected_until_a_slot_leaves() {
        let now = Instant::now();
        let mut registry = Registry::default();
        for client in 1..=MAX_CLIENTS {
            let address = format!("127.0.0.1:{}", 10_000 + client).parse().unwrap();
            assert_eq!(
                registry.assign_client_id(9, address, identity(client as u8), now),
                Ok((client, true))
            );
        }
        let fifth = "127.0.0.1:10005".parse().unwrap();
        assert_eq!(
            registry.assign_client_id(9, fifth, identity(5), now),
            Err(RendezvousErrorCode::RoomFull)
        );
        let first = "127.0.0.1:10001".parse().unwrap();
        assert!(registry.remove(9, 1, first));
        assert_eq!(
            registry.assign_client_id(9, fifth, identity(5), now),
            Ok((1, true))
        );
    }

    #[test]
    fn leave_requires_the_registered_source_endpoint() {
        let now = Instant::now();
        let owner = "127.0.0.1:10001".parse().unwrap();
        let other = "127.0.0.1:10002".parse().unwrap();
        let mut registry = Registry::default();
        registry
            .register(9, 1, owner, identity(1), b"ice", now)
            .unwrap();
        assert!(!registry.remove(9, 1, other));
        assert!(registry.peers.contains_key(&(9, 1)));
        assert!(registry.remove(9, 1, owner));
    }
}
