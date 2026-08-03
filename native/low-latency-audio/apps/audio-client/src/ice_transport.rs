use crate::security::PeerCipher;
use std::{
    collections::BTreeSet,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
        mpsc as std_mpsc, Arc, Mutex, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

use protocol::{decode, encode, PacketHeader, PacketKind, HEADER_LEN};
use tokio::sync::mpsc;
use webrtc_ice as ice;
use webrtc_util::Conn;

use ice::{
    agent::{agent_config::AgentConfig, Agent},
    candidate::{candidate_base::unmarshal_candidate, Candidate, CandidateType},
    network_type::NetworkType,
    state::ConnectionState,
    url::Url,
};

const STATE_GATHERING: u8 = 0;
const STATE_CHECKING: u8 = 1;
const STATE_CONNECTED: u8 = 2;
const STATE_DISCONNECTED: u8 = 3;
const STATE_FAILED: u8 = 4;
const DELIVERY_ACK_INTERVAL: Duration = Duration::from_millis(20);
// Keep the same 80 ms burst capacity after moving from 5 ms to 2.5 ms packets.
// The consumer still rejects audio older than 25 ms, so this capacity absorbs
// scheduler bursts without allowing stale audio to reach playout.
const REALTIME_PACKET_QUEUE_CAPACITY: usize = 32;
const MAX_OUTGOING_AUDIO_AGE: Duration = Duration::from_millis(20);

pub struct IceTransport {
    local_description: Arc<Mutex<String>>,
    remote_tx: std_mpsc::Sender<(u64, String)>,
    outgoing_tx: mpsc::Sender<Arc<[u8]>>,
    incoming_rx: std_mpsc::Receiver<Vec<u8>>,
    state: Arc<AtomicU8>,
    disconnected_event: Arc<AtomicBool>,
    incoming_queue_drops: Arc<AtomicU64>,
    stale_outgoing_audio_drops: Arc<AtomicU64>,
    security: Arc<RwLock<Option<Arc<PeerCipher>>>>,
}

impl IceTransport {
    pub fn start(client_id: u64, epoch: Instant) -> Result<Self, Box<dyn std::error::Error>> {
        let (remote_tx, remote_rx) = std_mpsc::channel();
        let (outgoing_tx, outgoing_rx) = mpsc::channel(REALTIME_PACKET_QUEUE_CAPACITY);
        let outgoing_rx = Arc::new(tokio::sync::Mutex::new(outgoing_rx));
        let remote_rx = Arc::new(Mutex::new(remote_rx));
        let (incoming_tx, incoming_rx) = std_mpsc::sync_channel(REALTIME_PACKET_QUEUE_CAPACITY);
        let local_description = Arc::new(Mutex::new(String::new()));
        let state = Arc::new(AtomicU8::new(STATE_GATHERING));
        let disconnected_event = Arc::new(AtomicBool::new(false));
        let incoming_queue_drops = Arc::new(AtomicU64::new(0));
        let stale_outgoing_audio_drops = Arc::new(AtomicU64::new(0));
        let security = Arc::new(RwLock::new(None));
        let description_for_thread = Arc::clone(&local_description);
        let state_for_thread = Arc::clone(&state);
        let disconnected_event_for_thread = Arc::clone(&disconnected_event);
        let incoming_queue_drops_for_thread = Arc::clone(&incoming_queue_drops);
        let stale_outgoing_audio_drops_for_thread = Arc::clone(&stale_outgoing_audio_drops);
        let security_for_thread = Arc::clone(&security);
        let (ready_tx, ready_rx) = std_mpsc::sync_channel(1);

        thread::Builder::new()
            .name("ice-transport".into())
            .spawn(move || {
                raise_network_thread_priority();
                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build();
                let Ok(runtime) = runtime else {
                    let _ = ready_tx.try_send(Err("failed to create ICE runtime".into()));
                    return;
                };
                let mut attempt = 0_u64;
                loop {
                    attempt += 1;
                    state_for_thread.store(STATE_GATHERING, Ordering::Relaxed);
                    println!("ICE attempt {attempt}: gathering fresh candidates");
                    let result = runtime.block_on(run_ice(
                        client_id,
                        Arc::clone(&description_for_thread),
                        Arc::clone(&state_for_thread),
                        Arc::clone(&disconnected_event_for_thread),
                        Arc::clone(&remote_rx),
                        Arc::clone(&outgoing_rx),
                        incoming_tx.clone(),
                        ready_tx.clone(),
                        Arc::clone(&incoming_queue_drops_for_thread),
                        Arc::clone(&stale_outgoing_audio_drops_for_thread),
                        Arc::clone(&security_for_thread),
                        epoch,
                    ));
                    if let Err(error) = result {
                        state_for_thread.store(STATE_FAILED, Ordering::Relaxed);
                        println!("ICE attempt {attempt} failed: {error}; retrying with a new UDP mapping");
                    }
                    thread::sleep(Duration::from_millis(500));
                }
            })?;

        ready_rx.recv_timeout(Duration::from_secs(5))??;
        Ok(Self {
            local_description,
            remote_tx,
            outgoing_tx,
            incoming_rx,
            state,
            disconnected_event,
            incoming_queue_drops,
            stale_outgoing_audio_drops,
            security,
        })
    }

    pub fn local_description(&self) -> String {
        self.local_description.lock().unwrap().clone()
    }

    pub fn set_remote_description(&self, peer_id: u64, description: String) {
        let _ = self.remote_tx.send((peer_id, description));
    }

    pub(crate) fn set_security(&self, security: PeerCipher) -> bool {
        if let Ok(mut slot) = self.security.write() {
            *slot = Some(Arc::new(security));
            return true;
        }
        false
    }

    pub fn try_send(&self, packet: Arc<[u8]>) -> bool {
        self.outgoing_tx.try_send(packet).is_ok()
    }

    pub fn try_recv(&self) -> Option<Vec<u8>> {
        self.incoming_rx.try_recv().ok()
    }

    pub fn connected(&self) -> bool {
        self.state.load(Ordering::Relaxed) == STATE_CONNECTED
    }

    pub fn take_disconnected_event(&self) -> bool {
        self.disconnected_event.swap(false, Ordering::Relaxed)
    }

    pub fn incoming_queue_drops(&self) -> u64 {
        self.incoming_queue_drops.load(Ordering::Relaxed)
    }

    pub fn stale_outgoing_audio_drops(&self) -> u64 {
        self.stale_outgoing_audio_drops.load(Ordering::Relaxed)
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_ice(
    client_id: u64,
    local_description: Arc<Mutex<String>>,
    state: Arc<AtomicU8>,
    disconnected_event: Arc<AtomicBool>,
    remote_rx: Arc<Mutex<std_mpsc::Receiver<(u64, String)>>>,
    outgoing_rx: Arc<tokio::sync::Mutex<mpsc::Receiver<Arc<[u8]>>>>,
    incoming_tx: std_mpsc::SyncSender<Vec<u8>>,
    ready_tx: std_mpsc::SyncSender<Result<(), String>>,
    incoming_queue_drops: Arc<AtomicU64>,
    stale_outgoing_audio_drops: Arc<AtomicU64>,
    security: Arc<RwLock<Option<Arc<PeerCipher>>>>,
    epoch: Instant,
) -> Result<(), String> {
    let urls = [
        "stun:stun.cloudflare.com:3478",
        "stun:stun.l.google.com:19302",
    ]
    .into_iter()
    .map(Url::parse_url)
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("STUN URL: {error}"))?;
    let agent = Arc::new(
        Agent::new(AgentConfig {
            urls,
            network_types: vec![NetworkType::Udp4, NetworkType::Udp6],
            candidate_types: vec![CandidateType::Host, CandidateType::ServerReflexive],
            check_interval: Duration::from_millis(50),
            disconnected_timeout: Some(Duration::from_secs(3)),
            failed_timeout: Some(Duration::from_secs(8)),
            keepalive_interval: Some(Duration::from_secs(1)),
            ..Default::default()
        })
        .await
        .map_err(|error| format!("agent: {error}"))?,
    );
    let (ufrag, password) = agent.get_local_user_credentials().await;
    let candidates = Arc::new(Mutex::new(BTreeSet::<String>::new()));
    let gathering_complete = Arc::new(AtomicBool::new(false));
    update_description(&local_description, &ufrag, &password, false, &candidates);
    let description_for_candidate = Arc::clone(&local_description);
    let candidates_for_callback = Arc::clone(&candidates);
    let ufrag_for_callback = ufrag.clone();
    let password_for_callback = password.clone();
    let complete_for_callback = Arc::clone(&gathering_complete);
    agent.on_candidate(Box::new(
        move |candidate: Option<Arc<dyn Candidate + Send + Sync>>| {
            if let Some(candidate) = candidate {
                let candidate = candidate.marshal();
                println!("ICE local candidate: {candidate}");
                candidates_for_callback.lock().unwrap().insert(candidate);
            } else {
                complete_for_callback.store(true, Ordering::Relaxed);
                println!(
                    "ICE candidate gathering complete: {} candidates",
                    candidates_for_callback.lock().unwrap().len()
                );
            }
            update_description(
                &description_for_candidate,
                &ufrag_for_callback,
                &password_for_callback,
                complete_for_callback.load(Ordering::Relaxed),
                &candidates_for_callback,
            );
            Box::pin(async {})
        },
    ));
    let state_for_callback = Arc::clone(&state);
    let disconnected_event_for_callback = Arc::clone(&disconnected_event);
    agent.on_connection_state_change(Box::new(move |connection_state| {
        match connection_state {
            ConnectionState::Checking => {
                state_for_callback.store(STATE_CHECKING, Ordering::Relaxed)
            }
            ConnectionState::Connected | ConnectionState::Completed => {
                state_for_callback.store(STATE_CONNECTED, Ordering::Relaxed)
            }
            ConnectionState::Disconnected => {
                state_for_callback.store(STATE_DISCONNECTED, Ordering::Relaxed);
                disconnected_event_for_callback.store(true, Ordering::Relaxed);
            }
            ConnectionState::Failed | ConnectionState::Closed => {
                state_for_callback.store(STATE_FAILED, Ordering::Relaxed)
            }
            _ => {}
        }
        println!("ICE state: {connection_state}");
        Box::pin(async {})
    }));
    agent
        .gather_candidates()
        .map_err(|error| format!("gather: {error}"))?;
    let _ = ready_tx.try_send(Ok(()));

    loop {
        loop {
            let remote = { remote_rx.lock().unwrap().try_recv() };
            let Ok((peer_id, description)) = remote else {
                break;
            };
            let Some((remote_ufrag, remote_password, remote_complete, remote_candidates)) =
                parse_description(&description)
            else {
                continue;
            };
            if !remote_complete
                || !gathering_complete.load(Ordering::Relaxed)
                || remote_candidates.is_empty()
            {
                continue;
            }
            println!(
                "ICE remote description: peer={peer_id}, candidates={}",
                remote_candidates.len()
            );
            for candidate_text in remote_candidates {
                if let Ok(candidate) = unmarshal_candidate(&candidate_text) {
                    let candidate: Arc<dyn Candidate + Send + Sync> = Arc::new(candidate);
                    let _ = agent.add_remote_candidate(&candidate);
                }
            }
            {
                state.store(STATE_CHECKING, Ordering::Relaxed);
                let (_cancel_tx, cancel_rx) = mpsc::channel(1);
                let connection: Arc<dyn Conn + Send + Sync> = if client_id < peer_id {
                    let connection: Arc<dyn Conn + Send + Sync> = tokio::time::timeout(
                        Duration::from_secs(10),
                        agent.dial(cancel_rx, remote_ufrag, remote_password),
                    )
                    .await
                    .map_err(|_| "connectivity checks timed out after 10s".to_string())?
                    .map_err(|error| format!("connectivity checks: {error}"))?;
                    connection
                } else {
                    let connection: Arc<dyn Conn + Send + Sync> = tokio::time::timeout(
                        Duration::from_secs(10),
                        agent.accept(cancel_rx, remote_ufrag, remote_password),
                    )
                    .await
                    .map_err(|_| "connectivity checks timed out after 10s".to_string())?
                    .map_err(|error| format!("connectivity checks: {error}"))?;
                    connection
                };
                state.store(STATE_CONNECTED, Ordering::Relaxed);
                println!("Audio path: direct P2P selected by ICE");

                let send_connection = Arc::clone(&connection);
                let outgoing_rx = Arc::clone(&outgoing_rx);
                let stale_outgoing_audio_drops = Arc::clone(&stale_outgoing_audio_drops);
                let send_security = Arc::clone(&security);
                tokio::spawn(async move {
                    let mut outgoing_rx = outgoing_rx.lock().await;
                    while let Some(packet) = outgoing_rx.recv().await {
                        if decode(&packet).is_ok_and(|header| {
                            header.kind == PacketKind::Audio
                                && elapsed_ns(epoch).saturating_sub(header.client_sent_ns)
                                    > MAX_OUTGOING_AUDIO_AGE.as_nanos() as u64
                        }) {
                            stale_outgoing_audio_drops.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                        let cipher = send_security
                            .read()
                            .ok()
                            .and_then(|security| security.clone());
                        let Some(cipher) = cipher else {
                            continue;
                        };
                        let Ok(sealed) = cipher.seal(&packet) else {
                            continue;
                        };
                        if send_connection.send(&sealed).await.is_err() {
                            break;
                        }
                    }
                });
                let mut buffer = vec![0_u8; 65_507];
                let mut last_delivery_ack = None::<Instant>;
                loop {
                    match connection.recv(&mut buffer).await {
                        Ok(size) => {
                            let cipher = security.read().ok().and_then(|security| security.clone());
                            let Some(cipher) = cipher else {
                                continue;
                            };
                            let Ok(mut plaintext) = cipher.open(&buffer[..size]) else {
                                continue;
                            };
                            let received_ns = elapsed_ns(epoch);
                            if let Ok(received) = decode(&plaintext) {
                                if received.kind == PacketKind::Audio {
                                    let dispatch_ns = elapsed_ns(epoch);
                                    plaintext[24..32].copy_from_slice(&received_ns.to_be_bytes());
                                    plaintext[32..40].copy_from_slice(&dispatch_ns.to_be_bytes());
                                    if incoming_tx.try_send(plaintext).is_err() {
                                        incoming_queue_drops.fetch_add(1, Ordering::Relaxed);
                                    }
                                    let should_ack = last_delivery_ack
                                        .is_none_or(|last| last.elapsed() >= DELIVERY_ACK_INTERVAL);
                                    if should_ack {
                                        let ack_sent_ns = elapsed_ns(epoch);
                                        if let Ok(ack) = encode(
                                            PacketHeader {
                                                kind: PacketKind::DeliveryAck,
                                                sequence: received.sequence,
                                                client_sent_ns: received.client_sent_ns,
                                                server_received_ns: received_ns,
                                                server_sent_ns: ack_sent_ns,
                                                session_id: received.session_id,
                                                client_id,
                                            },
                                            HEADER_LEN,
                                        ) {
                                            if let Ok(sealed_ack) = cipher.seal(&ack) {
                                                if connection.send(&sealed_ack).await.is_ok() {
                                                    last_delivery_ack = Some(Instant::now());
                                                }
                                            }
                                        }
                                    }
                                } else if incoming_tx.try_send(plaintext).is_err() {
                                    incoming_queue_drops.fetch_add(1, Ordering::Relaxed);
                                }
                            }
                        }
                        Err(error) => return Err(format!("receive: {error}")),
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[cfg(windows)]
fn raise_network_thread_priority() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_HIGHEST,
    };
    // SAFETY: GetCurrentThread returns a valid pseudo-handle for the calling thread.
    let raised = unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST) } != 0;
    println!(
        "ICE network thread priority: {}",
        if raised {
            "high"
        } else {
            "default (request failed)"
        }
    );
}

#[cfg(not(windows))]
fn raise_network_thread_priority() {}

fn elapsed_ns(epoch: Instant) -> u64 {
    epoch.elapsed().as_nanos().min(u64::MAX as u128) as u64
}

fn update_description(
    target: &Mutex<String>,
    ufrag: &str,
    password: &str,
    complete: bool,
    candidates: &Mutex<BTreeSet<String>>,
) {
    let candidates = candidates.lock().unwrap();
    *target.lock().unwrap() = std::iter::once(ufrag)
        .chain(std::iter::once(password))
        .chain(std::iter::once(if complete {
            "complete"
        } else {
            "gathering"
        }))
        .chain(candidates.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join("\n");
}

fn parse_description(value: &str) -> Option<(String, String, bool, Vec<String>)> {
    let mut lines = value.lines();
    let ufrag = lines.next()?.to_owned();
    let password = lines.next()?.to_owned();
    let complete = lines.next()? == "complete";
    if ufrag.is_empty() || password.is_empty() {
        return None;
    }
    Some((
        ufrag,
        password,
        complete,
        lines.map(str::to_owned).collect(),
    ))
}
