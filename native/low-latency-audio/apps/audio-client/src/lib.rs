#[cfg(test)]
use audio_core::ring_buffer;
#[cfg(test)]
use audio_core::PCM_FRAME_BYTES;
use audio_core::{Consumer, Producer, FRAME_DURATION_MICROS, SAMPLES_PER_FRAME, SAMPLE_RATE};
mod effects;
mod ice_transport;
mod mr_sync;
mod peer;
mod playback;
mod security;
mod signaling;
#[cfg(windows)]
mod wasapi;
use effects::{EffectsConfig, KaraokeEffects, LiveEffects};
use ice_transport::IceTransport;
use metrics::summarize;
use mr_sync::{
    bounded_position_nudge, client_ids_to_mask, mask_to_client_ids, remaining_start_delay,
    MrSyncState, START_GUARD,
};
use peer::{BufferedOpusFrame, PeerAudioState, JITTER_MAX_FRAMES, JITTER_PREBUFFER_FRAMES};
#[cfg(test)]
use peer::{JITTER_TARGET_FRAMES, STALE_FRAME_MARGIN};
#[cfg(test)]
use playback::AdaptiveResampler;
use playback::{
    playback_policy_for_output_period, InputCallbackStats, PlaybackBufferPolicy,
    PlaybackOutputState, PlaybackStats, RELAY_MAX_QUEUE_SAMPLES, RELAY_MAX_SPEED_ADJUSTMENT_PPM,
    RELAY_TRIM_TO_SAMPLES,
};
use protocol::{
    decode, encode, encode_with_payload, registration::RegistrationSigner, DecodeError,
    PacketHeader, PacketKind, RendezvousErrorCode, HEADER_LEN, MAX_PACKET_BYTES, VERSION,
};
use ropus::{Application, Bitrate, Channels, DecodeMode, Decoder, Encoder, Signal};
use security::SessionSecurity;
use signaling::{
    ice_description_bundle, ice_description_for_target, nickname_from_bundle, register,
    request_client_id, send_registration, send_rendezvous_leave, verify_peer_registration,
    MAX_CLIENTS,
};
use std::{
    collections::BTreeMap,
    io,
    net::{ToSocketAddrs, UdpSocket},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{Receiver, Sender},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
#[cfg(windows)]
pub use wasapi::{
    enumerate_audio_devices, measure_input_peak, play_output_test, AudioDeviceCatalog,
    AudioDeviceInfo, AudioDeviceSelection,
};

const RING_SAMPLES: usize = SAMPLE_RATE as usize * 2;
const MAX_CAPTURE_BURST_FRAMES: usize = 16;
const LOCAL_MONITOR_MAX_QUEUE_SAMPLES: usize = SAMPLE_RATE as usize * 40 / 1_000;
const LOCAL_MONITOR_MAX_SPEED_ADJUSTMENT_PPM: i64 = 500;
const LOCAL_MONITOR_RATIO_SMOOTHING: f64 = 0.0005;
const LOCAL_MONITOR_GAIN: f32 = 1.0;
const LOCAL_MONITOR_FADE_SAMPLES: usize = 48;
const PLAYBACK_OUTPUT_CEILING: f32 = 0.92;
const PLAYBACK_LIMITER_RELEASE_PER_SAMPLE: f32 = 0.0005;
const MAX_CONCEALED_FRAMES_PER_GAP: u64 = 4;
const TRIM_CROSSFADE_SAMPLES: usize = 48;
const RECOVERY_CROSSFADE_SAMPLES: usize = 16;
const FRAME_CLOCK_MAX_ADJUSTMENT_PPM: i64 = 3_000;
const OPUS_MAX_PACKET_BYTES: usize = 512;
const MAX_RECEIVE_TO_MAIN_DELAY: Duration = Duration::from_millis(25);
const CANCEL_GUARD: Duration = Duration::from_millis(150);

#[derive(Clone, Debug)]
pub struct EmbeddedConfig {
    pub server: String,
    pub session_id: u64,
    pub nickname: String,
    pub mic_gain_percent: f32,
    pub dry_percent: f32,
    pub echo_percent: f32,
    pub echo_delay_ms: f32,
    pub echo_feedback_percent: f32,
    pub reverb_percent: f32,
    pub reverb_time_seconds: f32,
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub struct EffectSettings {
    pub mic_gain_percent: f32,
    pub dry_percent: f32,
    pub echo_percent: f32,
    pub echo_delay_ms: f32,
    pub echo_feedback_percent: f32,
    pub reverb_percent: f32,
    pub reverb_time_seconds: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PeerMixSettings {
    pub volume_percent: f32,
    pub echo_percent: f32,
    pub reverb_percent: f32,
    pub muted: bool,
}

impl Default for PeerMixSettings {
    fn default() -> Self {
        Self {
            volume_percent: 100.0,
            echo_percent: 0.0,
            reverb_percent: 0.0,
            muted: false,
        }
    }
}

#[derive(Debug)]
pub enum EmbeddedCommand {
    Stop,
    UpdateEffects(EffectSettings),
    UpdatePeerMix {
        client_id: u64,
        settings: PeerMixSettings,
    },
    UpdateMrVolume {
        volume_percent: f32,
    },
    LoadMr {
        performance_id: u64,
        samples: Vec<f32>,
    },
    StartMr {
        performance_id: u64,
    },
    StopMr {
        performance_id: Option<u64>,
    },
    CancelMr {
        performance_id: u64,
    },
    ChangeAudioDevices {
        input_device_id: Option<String>,
        output_device_id: Option<String>,
    },
}

#[derive(Clone, Debug)]
pub enum EmbeddedEvent {
    Registered {
        client_id: u64,
    },
    PeerName {
        client_id: u64,
        nickname: String,
    },
    PeerConnection {
        client_id: u64,
        connected: bool,
    },
    Metrics {
        connected_peers: usize,
        ping_ms: Option<f64>,
        concealment_percent: f64,
        underruns: u64,
        local_monitor_underruns: u64,
        resyncs: u64,
    },
    MrFinished {
        performance_id: u64,
    },
    MrSyncStatus {
        performance_id: u64,
        ready_clients: usize,
        total_clients: usize,
        waiting_clients: Vec<u64>,
        mismatched_clients: Vec<u64>,
        timeout_remaining_seconds: Option<u64>,
        leader_id: u64,
        scheduled_in_ms: Option<u64>,
        drift_correction_samples: i64,
    },
    MrSyncFailed {
        performance_id: u64,
        waiting_clients: Vec<u64>,
        mismatched_clients: Vec<u64>,
    },
    MrStarted {
        performance_id: u64,
    },
    MrCancelled {
        performance_id: u64,
    },
    AudioDeviceRecovery {
        recovered: bool,
        message: String,
    },
    InputLevel {
        peak_dbfs: f32,
        clipping: bool,
        clipped_samples: u64,
    },
    Stopped,
}

struct EmbeddedRuntime {
    config: EmbeddedConfig,
    commands: Receiver<EmbeddedCommand>,
    events: Sender<EmbeddedEvent>,
}

enum MrCommand {
    Load {
        performance_id: u64,
        samples: Vec<f32>,
    },
    Start(u64),
    Stop(Option<u64>),
    SetVolume(f32),
    UpdatePeerMix(u64, PeerMixSettings),
    Cancel(u64),
    ChangeAudioDevices(AudioDeviceSelection),
}

struct MrTrack {
    performance_id: u64,
    samples: Vec<f32>,
    position: usize,
    playing: bool,
    gain: f32,
}

impl MrTrack {
    fn mix_next_frame(&mut self, output: &mut [f32; SAMPLES_PER_FRAME]) -> bool {
        if !self.playing || self.position >= self.samples.len() {
            self.playing = false;
            return false;
        }
        let count = SAMPLES_PER_FRAME.min(self.samples.len() - self.position);
        for (target, source) in output
            .iter_mut()
            .zip(&self.samples[self.position..self.position + count])
        {
            *target += *source * self.gain;
        }
        self.position += count;
        if self.position >= self.samples.len() {
            self.playing = false;
        }
        true
    }

    fn nudge_position(&mut self, amount: isize) -> isize {
        if !self.playing || amount == 0 {
            return 0;
        }
        let previous = self.position;
        if amount > 0 {
            self.position = self
                .position
                .saturating_add(amount as usize)
                .min(self.samples.len());
        } else {
            self.position = self.position.saturating_sub(amount.unsigned_abs());
        }
        self.position as isize - previous as isize
    }
}

struct PeerReceiveMix {
    settings: PeerMixSettings,
    effects: KaraokeEffects,
}

impl PeerReceiveMix {
    fn new(settings: PeerMixSettings) -> Self {
        let mut mix = Self {
            settings,
            effects: KaraokeEffects::new(EffectsConfig {
                output_gain: 1.0,
                dry: 1.0,
                echo: 0.0,
                echo_delay_ms: 110.0,
                echo_feedback: 0.18,
                reverb: 0.0,
                reverb_time_seconds: 1.2,
            }),
        };
        mix.update(settings);
        mix
    }

    fn update(&mut self, settings: PeerMixSettings) {
        self.settings = settings;
        self.effects.config.output_gain = if settings.muted {
            0.0
        } else {
            (settings.volume_percent / 100.0).clamp(0.0, 1.5)
        };
        self.effects.config.echo = (settings.echo_percent / 100.0).clamp(0.0, 0.6);
        self.effects.config.reverb = (settings.reverb_percent / 100.0).clamp(0.0, 0.6);
    }

    fn process(&mut self, frame: &mut [f32; SAMPLES_PER_FRAME]) -> bool {
        if self.settings.muted || self.settings.volume_percent <= 0.0 {
            return false;
        }
        self.effects.process_frame(frame);
        true
    }
}

fn mr_fingerprint(samples: &[f32]) -> u64 {
    samples
        .iter()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, sample| {
            sample
                .to_bits()
                .to_be_bytes()
                .into_iter()
                .fold(hash, |hash, byte| {
                    (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
                })
        })
}

fn limit_output(samples: &mut [f32; SAMPLES_PER_FRAME]) {
    let peak = samples
        .iter()
        .fold(0.0_f32, |peak, sample| peak.max(sample.abs()));
    if peak > 0.98 {
        let gain = 0.98 / peak;
        for sample in samples {
            *sample *= gain;
        }
    }
}

pub fn run_embedded(
    config: EmbeddedConfig,
    commands: Receiver<EmbeddedCommand>,
    events: Sender<EmbeddedEvent>,
) -> Result<(), Box<dyn std::error::Error>> {
    run_relay(EmbeddedRuntime {
        config,
        commands,
        events,
    })
}

#[allow(clippy::too_many_arguments)]
fn send_frame_to_peers(
    transports: &BTreeMap<u64, IceTransport>,
    connected_peer_ids: &[u64],
    opus_encoder: &mut Encoder,
    session_id: u64,
    client_id: u64,
    sequence: u64,
    sent_ns: u64,
    samples: &[f32; SAMPLES_PER_FRAME],
    sent_peer_packets: &mut u64,
    deadline_misses: &mut u64,
) -> Result<(), Box<dyn std::error::Error>> {
    if connected_peer_ids.is_empty() {
        return Ok(());
    }
    let mut opus_packet = [0_u8; OPUS_MAX_PACKET_BYTES];
    let opus_bytes = opus_encoder
        .encode_float(samples, &mut opus_packet)
        .map_err(|error| format!("Opus encode failed: {error}"))?;
    let packet = encode_with_payload(
        PacketHeader {
            kind: PacketKind::Audio,
            sequence,
            client_sent_ns: sent_ns,
            server_received_ns: 0,
            server_sent_ns: 0,
            session_id,
            client_id,
        },
        &opus_packet[..opus_bytes],
    )?;
    let packet: Arc<[u8]> = packet.into();
    for peer_id in connected_peer_ids {
        if transports
            .get(peer_id)
            .is_some_and(|transport| transport.try_send(Arc::clone(&packet)))
        {
            *sent_peer_packets += 1;
        } else {
            *deadline_misses += 1;
        }
    }
    Ok(())
}

fn send_leave_to_peers(
    transports: &BTreeMap<u64, IceTransport>,
    connected_peer_ids: &[u64],
    session_id: u64,
    client_id: u64,
) {
    let Ok(packet) = encode(
        PacketHeader {
            kind: PacketKind::Leave,
            sequence: 0,
            client_sent_ns: 0,
            server_received_ns: 0,
            server_sent_ns: 0,
            session_id,
            client_id,
        },
        HEADER_LEN,
    ) else {
        return;
    };
    let packet: Arc<[u8]> = packet.into();
    for peer_id in connected_peer_ids {
        if let Some(transport) = transports.get(peer_id) {
            let _ = transport.try_send(Arc::clone(&packet));
        }
    }
}

fn send_control_to_peers(
    transports: &BTreeMap<u64, IceTransport>,
    connected_peer_ids: &[u64],
    header: PacketHeader,
) {
    let Ok(packet) = encode(header, HEADER_LEN) else {
        return;
    };
    let packet: Arc<[u8]> = packet.into();
    for peer_id in connected_peer_ids {
        if let Some(transport) = transports.get(peer_id) {
            let _ = transport.try_send(Arc::clone(&packet));
        }
    }
}

fn mix_remote_frames(frames: &[[f32; SAMPLES_PER_FRAME]]) -> [f32; SAMPLES_PER_FRAME] {
    let mut mixed = [0.0_f32; SAMPLES_PER_FRAME];
    if frames.is_empty() {
        return mixed;
    }
    let gain = 1.0 / (frames.len() as f32).sqrt();
    for frame in frames {
        for (output, sample) in mixed.iter_mut().zip(frame) {
            *output += *sample * gain;
        }
    }
    let peak = mixed
        .iter()
        .fold(0.0_f32, |peak, sample| peak.max(sample.abs()));
    if peak > 0.98 {
        let limiter_gain = 0.98 / peak;
        for sample in &mut mixed {
            *sample *= limiter_gain;
        }
    }
    mixed
}

fn run_relay(runtime: EmbeddedRuntime) -> Result<(), Box<dyn std::error::Error>> {
    let EmbeddedRuntime {
        config,
        commands,
        events,
    } = runtime;
    let embedded_events = Some(events);
    let server = config.server;
    let server_address = server
        .to_socket_addrs()?
        .next()
        .ok_or("server address did not resolve")?;
    let session_id = config.session_id;
    let requested_client_id = 0;
    let nickname = config.nickname;
    if nickname.len() > 64 {
        return Err("--nickname must be at most 64 UTF-8 bytes".into());
    }
    let duration = Duration::from_secs(365 * 24 * 60 * 60);
    let synthetic = false;
    let effects_config = EffectsConfig {
        output_gain: config.mic_gain_percent / 100.0,
        dry: config.dry_percent / 100.0,
        echo: config.echo_percent / 100.0,
        echo_delay_ms: config.echo_delay_ms,
        echo_feedback: config.echo_feedback_percent / 100.0,
        reverb: config.reverb_percent / 100.0,
        reverb_time_seconds: config.reverb_time_seconds,
    };
    let mut audio_selection = AudioDeviceSelection {
        input_id: config.input_device_id,
        output_id: config.output_device_id,
    };
    let mut opus_encoder =
        Encoder::builder(SAMPLE_RATE, Channels::Mono, Application::RestrictedLowDelay)
            .bitrate(Bitrate::Bits(128_000))
            .signal(Signal::Music)
            .vbr(true)
            .vbr_constraint(true)
            .complexity(10)
            .build()
            .map_err(|error| format!("Opus encoder initialization failed: {error}"))?;
    if requested_client_id > MAX_CLIENTS || session_id == 0 {
        return Err(format!(
            "--session-id must be non-zero and --client-id must be 0..={MAX_CLIENTS} (0 requests automatic assignment)"
        )
        .into());
    }

    let epoch = Instant::now();
    let registration_signer = RegistrationSigner::generate();
    let session_security = SessionSecurity::generate();
    let exchange_public_key = session_security.public_key();
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.set_nonblocking(true)?;
    let client_id = if requested_client_id == 0 {
        request_client_id(
            &socket,
            server_address,
            session_id,
            &registration_signer,
            exchange_public_key,
        )?
    } else {
        requested_client_id
    };
    println!("Client ID assigned: {client_id}");
    if let Some(events) = &embedded_events {
        let _ = events.send(EmbeddedEvent::Registered { client_id });
    }
    let mut transports = BTreeMap::<u64, IceTransport>::new();
    for peer_id in 1..=MAX_CLIENTS {
        if peer_id != client_id {
            transports.insert(peer_id, IceTransport::start(client_id, epoch)?);
        }
    }
    let initial_bundle = ice_description_bundle(&transports, &nickname);

    let mut capture = None;
    let mut playback = None;
    let mut streams = None;
    let playback_stats = PlaybackStats::default();
    let input_callback_stats = InputCallbackStats::default();
    let live_effects = LiveEffects::new(effects_config);
    if !synthetic {
        let (wasapi_streams, capture_consumer, playback_producer) = wasapi::start(
            effects_config,
            Arc::clone(&live_effects),
            input_callback_stats.clone(),
            playback_stats.clone(),
            audio_selection.clone(),
        )
        .map_err(|error| format!("WASAPI input/output initialization failed: {error}"))?;
        capture = Some(capture_consumer);
        playback = Some(playback_producer);
        streams = Some(wasapi_streams);
    }

    register(
        &socket,
        server_address,
        session_id,
        client_id,
        &initial_bundle,
        &registration_signer,
        exchange_public_key,
    )?;

    let running = Arc::new(AtomicBool::new(true));
    let control_running = Arc::clone(&running);
    let control_effects = Arc::clone(&live_effects);
    let (mr_command_tx, mr_command_rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        while control_running.load(Ordering::Relaxed) {
            match commands.recv() {
                Ok(EmbeddedCommand::Stop) | Err(_) => {
                    control_running.store(false, Ordering::SeqCst);
                    break;
                }
                Ok(EmbeddedCommand::UpdateEffects(settings)) => {
                    control_effects.update(&[
                        settings.mic_gain_percent,
                        settings.dry_percent,
                        settings.echo_percent,
                        settings.echo_delay_ms,
                        settings.echo_feedback_percent,
                        settings.reverb_percent,
                        settings.reverb_time_seconds,
                    ]);
                }
                Ok(EmbeddedCommand::LoadMr {
                    performance_id,
                    samples,
                }) => {
                    let _ = mr_command_tx.send(MrCommand::Load {
                        performance_id,
                        samples,
                    });
                }
                Ok(EmbeddedCommand::StartMr { performance_id }) => {
                    let _ = mr_command_tx.send(MrCommand::Start(performance_id));
                }
                Ok(EmbeddedCommand::StopMr { performance_id }) => {
                    let _ = mr_command_tx.send(MrCommand::Stop(performance_id));
                }
                Ok(EmbeddedCommand::UpdatePeerMix {
                    client_id,
                    settings,
                }) => {
                    let _ = mr_command_tx.send(MrCommand::UpdatePeerMix(client_id, settings));
                }
                Ok(EmbeddedCommand::UpdateMrVolume { volume_percent }) => {
                    let _ = mr_command_tx.send(MrCommand::SetVolume(volume_percent));
                }
                Ok(EmbeddedCommand::CancelMr { performance_id }) => {
                    let _ = mr_command_tx.send(MrCommand::Cancel(performance_id));
                }
                Ok(EmbeddedCommand::ChangeAudioDevices {
                    input_device_id,
                    output_device_id,
                }) => {
                    let _ =
                        mr_command_tx.send(MrCommand::ChangeAudioDevices(AudioDeviceSelection {
                            input_id: input_device_id,
                            output_id: output_device_id,
                        }));
                }
            }
        }
    });
    let deadline = epoch + duration;
    let interval = Duration::from_micros(FRAME_DURATION_MICROS);
    let mut next_send = epoch;
    let mut next_register = epoch + Duration::from_secs(1);
    let mut next_live_status = epoch + Duration::from_secs(1);
    let mut next_playout = epoch;
    let mut playout_started = false;
    let mut sequence = 0_u64;
    let mut sent = 0_u64;
    let mut sent_peer_packets = 0_u64;
    let mut deadline_misses = 0_u64;
    let mut playback_overflows = 0_u64;
    let mut frame_clock_adjustment_sum_ppm = 0_i64;
    let mut frame_clock_adjustment_measurements = 0_u64;
    let mut peers = BTreeMap::<u64, PeerAudioState>::new();
    let mut peer_exchange_keys = BTreeMap::<u64, [u8; 32]>::new();
    let mut peer_receive_mix = BTreeMap::<u64, PeerReceiveMix>::new();
    let mut connection_states = BTreeMap::<u64, bool>::new();
    let mut capture_queue_us = Vec::new();
    let mut signaling_buffer = vec![0_u8; MAX_PACKET_BYTES];
    let mut previous_live_received = 0_u64;
    let mut previous_live_concealed = 0_u64;
    let mut previous_live_resyncs = 0_u64;
    let mut previous_live_underruns = 0_u64;
    let mut previous_local_monitor_underruns = 0_u64;
    let mut mr_track: Option<MrTrack> = None;
    let mut mr_volume = 0.72_f32;
    let mut cancel_request = None::<u64>;
    let mut cancel_schedule = None::<(u64, Instant)>;
    let mut mr_sync = MrSyncState::new();
    let mut mr_drift_correction_samples = 0_i64;
    let mut pending_mr_abort = None::<(PacketHeader, u8, Instant)>;
    let mut last_mr_abort_performance = None::<u64>;
    let mut last_reported_sync_status = None::<(
        u64,
        usize,
        usize,
        u64,
        u64,
        u64,
        Option<u64>,
        Option<u64>,
        i64,
    )>;
    let mut audio_restart_needed = false;
    let mut last_audio_restart_attempt = epoch;

    println!(
        "Direct audio client {client_id} registered for session {session_id} via {server} ({}; max {MAX_CLIENTS} clients Full Mesh)",
        if synthetic { "synthetic PCM" } else { "audio devices" }
    );
    println!("Audio path: waiting for direct P2P peers (relay disabled)");
    println!("Graceful shutdown is controlled by the integrated GUI");
    println!(
        "Codec: Opus Restricted Low Delay, 48kHz mono, 2.5ms, 128kbps constrained VBR, music signal"
    );
    println!("Jitter buffer: 10ms target (4 x 2.5ms frames, 15ms maximum)");
    println!(
        "Playback latency policy: peer jitter owns startup delay, device ring has no independent startup prebuffer, max_queue={:.1}ms, trim_to={:.1}ms, adaptive_speed=+/-{:.1}%",
        RELAY_MAX_QUEUE_SAMPLES as f64 * 1_000.0 / SAMPLE_RATE as f64,
        RELAY_TRIM_TO_SAMPLES as f64 * 1_000.0 / SAMPLE_RATE as f64,
        RELAY_MAX_SPEED_ADJUSTMENT_PPM as f64 / 10_000.0,
    );

    while running.load(Ordering::Relaxed) && Instant::now() < deadline {
        while let Ok(command) = mr_command_rx.try_recv() {
            match command {
                MrCommand::Load {
                    performance_id,
                    samples,
                } => {
                    cancel_schedule = None;
                    cancel_request = None;
                    last_mr_abort_performance = None;
                    pending_mr_abort = None;
                    let fingerprint = mr_fingerprint(&samples);
                    mr_sync.load(performance_id, samples.len(), fingerprint);
                    mr_track = Some(MrTrack {
                        performance_id,
                        samples,
                        position: 0,
                        playing: false,
                        gain: mr_volume,
                    });
                }
                MrCommand::Start(performance_id) => {
                    mr_sync.request_start(performance_id, Instant::now());
                }
                MrCommand::Stop(performance_id) => {
                    cancel_schedule = None;
                    cancel_request = None;
                    if let Some(track) = mr_track
                        .as_mut()
                        .filter(|track| performance_id.is_none_or(|id| id == track.performance_id))
                    {
                        track.playing = false;
                        track.position = 0;
                    }
                    mr_sync.stop(performance_id);
                }
                MrCommand::SetVolume(volume_percent) => {
                    mr_volume = (volume_percent / 100.0).clamp(0.0, 1.5);
                    if let Some(track) = &mut mr_track {
                        track.gain = mr_volume;
                    }
                }
                MrCommand::UpdatePeerMix(client_id, settings) => {
                    peer_receive_mix
                        .entry(client_id)
                        .and_modify(|mix| mix.update(settings))
                        .or_insert_with(|| PeerReceiveMix::new(settings));
                }
                MrCommand::Cancel(performance_id) => {
                    if mr_track
                        .as_ref()
                        .is_some_and(|track| track.performance_id == performance_id)
                    {
                        cancel_request = Some(performance_id);
                    }
                }
                MrCommand::ChangeAudioDevices(selection) => {
                    audio_selection = selection;
                    audio_restart_needed = true;
                    last_audio_restart_attempt =
                        epoch.checked_sub(Duration::from_secs(3)).unwrap_or(epoch);
                }
            }
        }
        if streams.as_ref().is_some_and(wasapi::WasapiStreams::failed) {
            audio_restart_needed = true;
        }
        if audio_restart_needed && last_audio_restart_attempt.elapsed() >= Duration::from_secs(2) {
            last_audio_restart_attempt = Instant::now();
            streams = None;
            capture = None;
            playback = None;
            if let Some(events) = &embedded_events {
                let _ = events.send(EmbeddedEvent::AudioDeviceRecovery {
                    recovered: false,
                    message: "오디오 장치 재연결 중".into(),
                });
            }
            match wasapi::start(
                effects_config,
                Arc::clone(&live_effects),
                input_callback_stats.clone(),
                playback_stats.clone(),
                audio_selection.clone(),
            ) {
                Ok((restarted_streams, restarted_capture, restarted_playback)) => {
                    streams = Some(restarted_streams);
                    capture = Some(restarted_capture);
                    playback = Some(restarted_playback);
                    audio_restart_needed = false;
                    playout_started = false;
                    next_playout = Instant::now();
                    for peer in peers.values_mut() {
                        peer.reset_playout();
                    }
                    if let Some(events) = &embedded_events {
                        let _ = events.send(EmbeddedEvent::AudioDeviceRecovery {
                            recovered: true,
                            message: "오디오 장치 재연결 완료".into(),
                        });
                    }
                }
                Err(error) => {
                    if let Some(events) = &embedded_events {
                        let _ = events.send(EmbeddedEvent::AudioDeviceRecovery {
                            recovered: false,
                            message: format!("오디오 장치 재연결 실패: {error}"),
                        });
                    }
                }
            }
        }
        let now = Instant::now();
        if now >= next_register {
            let bundle = ice_description_bundle(&transports, &nickname);
            send_registration(
                &socket,
                server_address,
                session_id,
                client_id,
                &bundle,
                &registration_signer,
                exchange_public_key,
            )?;
            next_register = now + Duration::from_secs(1);
        }

        for (&peer_id, transport) in &transports {
            let connected = transport.connected();
            let disconnected = transport.take_disconnected_event();
            let previous = connection_states
                .insert(peer_id, connected)
                .unwrap_or(false);
            if connected != previous {
                if let Some(events) = &embedded_events {
                    let _ = events.send(EmbeddedEvent::PeerConnection {
                        client_id: peer_id,
                        connected,
                    });
                }
                if connected {
                    println!("Peer {peer_id} audio path: direct P2P via ICE");
                } else {
                    println!("Peer {peer_id} audio path: disconnected");
                    if disconnected {
                        if let Some(peer) = peers.get_mut(&peer_id) {
                            peer.mark_departed();
                        }
                    }
                }
            } else if disconnected {
                if let Some(peer) = peers.get_mut(&peer_id) {
                    peer.mark_departed();
                }
            }
        }

        let connected_peer_ids: Vec<u64> = transports
            .iter()
            .filter_map(|(&peer_id, transport)| transport.connected().then_some(peer_id))
            .collect();

        let sync_now = Instant::now();
        if let Some(performance_id) = cancel_request.take() {
            let header = PacketHeader {
                kind: PacketKind::MrCancel,
                sequence: performance_id,
                client_sent_ns: elapsed_ns(epoch),
                server_received_ns: CANCEL_GUARD.as_nanos() as u64,
                server_sent_ns: 0,
                session_id,
                client_id,
            };
            for _ in 0..3 {
                send_control_to_peers(&transports, &connected_peer_ids, header);
            }
            cancel_schedule = Some((performance_id, sync_now + CANCEL_GUARD));
        }
        if let Some((header, repeats_left, next_repeat)) = pending_mr_abort.as_mut() {
            if sync_now >= *next_repeat {
                send_control_to_peers(&transports, &connected_peer_ids, *header);
                *repeats_left = repeats_left.saturating_sub(1);
                *next_repeat = sync_now + Duration::from_millis(100);
                if *repeats_left == 0 {
                    pending_mr_abort = None;
                }
            }
        }
        if let Some(change) = mr_sync.update_connected_peers(&connected_peer_ids, sync_now) {
            if let Some(performance_id) = change.canceled_performance_id {
                send_control_to_peers(
                    &transports,
                    &connected_peer_ids,
                    PacketHeader {
                        kind: PacketKind::MrSyncReset,
                        sequence: performance_id,
                        client_sent_ns: elapsed_ns(epoch),
                        server_received_ns: 0,
                        server_sent_ns: 0,
                        session_id,
                        client_id,
                    },
                );
            }
        }
        if mr_sync.should_broadcast_ready(sync_now) {
            if let Some((performance_id, total_samples, fingerprint)) = mr_sync.local_ready_packet()
            {
                send_control_to_peers(
                    &transports,
                    &connected_peer_ids,
                    PacketHeader {
                        kind: PacketKind::MrReady,
                        sequence: performance_id,
                        client_sent_ns: elapsed_ns(epoch),
                        server_received_ns: total_samples,
                        server_sent_ns: fingerprint,
                        session_id,
                        client_id,
                    },
                );
            }
        }

        if synthetic && now >= next_send {
            let missed = now.duration_since(next_send) >= interval;
            if missed {
                deadline_misses += 1;
            }
            let mut samples = [0.0_f32; SAMPLES_PER_FRAME];
            fill_synthetic_frame(&mut samples, client_id, sequence);
            send_frame_to_peers(
                &transports,
                &connected_peer_ids,
                &mut opus_encoder,
                session_id,
                client_id,
                sequence,
                elapsed_ns(epoch),
                &samples,
                &mut sent_peer_packets,
                &mut deadline_misses,
            )?;
            if !connected_peer_ids.is_empty() {
                sent += 1;
                sequence = sequence.wrapping_add(1);
            }
            next_send = if missed {
                now + interval
            } else {
                next_send + interval
            };
        } else if !synthetic && now >= next_send {
            let missed = now.duration_since(next_send) >= interval;
            if let Some(source) = capture.as_mut() {
                // WASAPI Shared capture can publish a 10 ms block at once. Sending every
                // resulting 2.5 ms Opus frame in the same loop iteration creates packet
                // bursts that overrun the receiver's low-latency jitter window. Pace one
                // frame per media-clock tick instead.
                if source.available() >= SAMPLES_PER_FRAME {
                    capture_queue_us
                        .push(source.available() as f64 * 1_000_000.0 / SAMPLE_RATE as f64);
                    let mut samples = [0.0_f32; SAMPLES_PER_FRAME];
                    for sample in &mut samples {
                        *sample = source.pop().expect("complete capture frame");
                    }
                    send_frame_to_peers(
                        &transports,
                        &connected_peer_ids,
                        &mut opus_encoder,
                        session_id,
                        client_id,
                        sequence,
                        elapsed_ns(epoch),
                        &samples,
                        &mut sent_peer_packets,
                        &mut deadline_misses,
                    )?;
                    if !connected_peer_ids.is_empty() {
                        sent += 1;
                        sequence = sequence.wrapping_add(1);
                    }
                }
            }
            next_send = if missed {
                now + interval
            } else {
                next_send + interval
            };
        }

        loop {
            match socket.recv_from(&mut signaling_buffer) {
                Ok((size, source)) => {
                    if source != server_address {
                        continue;
                    }
                    let packet = match decode(&signaling_buffer[..size]) {
                        Ok(packet) => packet,
                        Err(DecodeError::UnsupportedVersion(_)) => {
                            return Err("rendezvous protocol version mismatch".into());
                        }
                        Err(_) => continue,
                    };
                    if packet.kind == PacketKind::RendezvousError && packet.session_id == session_id
                    {
                        let message = RendezvousErrorCode::try_from(packet.sequence)
                            .map(|code| code.to_string())
                            .unwrap_or_else(|_| "rendezvous rejected the registration".into());
                        return Err(message.into());
                    }
                    if packet.session_id != session_id
                        || packet.kind != PacketKind::PeerInfo
                        || packet.client_id == client_id
                        || packet.client_id > MAX_CLIENTS
                    {
                        continue;
                    }
                    if packet.sequence != 0 && packet.sequence != VERSION as u64 {
                        return Err("rendezvous protocol version mismatch".into());
                    }
                    let Ok(peer_registration) = verify_peer_registration(
                        &signaling_buffer[HEADER_LEN..size],
                        session_id,
                        packet.client_id,
                    ) else {
                        continue;
                    };
                    let bundle = peer_registration.ice_bundle;
                    let Some(description) = ice_description_for_target(bundle, client_id) else {
                        continue;
                    };
                    let peer_nickname = nickname_from_bundle(bundle)
                        .unwrap_or_else(|| format!("게스트 {}", packet.client_id));
                    if let Some(events) = &embedded_events {
                        let _ = events.send(EmbeddedEvent::PeerName {
                            client_id: packet.client_id,
                            nickname: peer_nickname.clone(),
                        });
                    }
                    peers.entry(packet.client_id).or_insert_with(|| {
                        println!(
                            "Peer {} found; starting dedicated ICE checks",
                            packet.client_id
                        );
                        println!("Peer {} nickname: {peer_nickname}", packet.client_id);
                        PeerAudioState::default()
                    });
                    if let Some(transport) = transports.get(&packet.client_id) {
                        let key_changed = peer_exchange_keys
                            .insert(packet.client_id, peer_registration.exchange_public_key)
                            != Some(peer_registration.exchange_public_key);
                        if key_changed {
                            let cipher = session_security.peer_cipher(
                                session_id,
                                client_id,
                                packet.client_id,
                                peer_registration.exchange_public_key,
                            )?;
                            let _ = transport.set_security(cipher);
                            println!(
                                "Peer {} security: X25519 + ChaCha20-Poly1305 enabled",
                                packet.client_id
                            );
                        }
                        transport.set_remote_description(packet.client_id, description.to_owned());
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                Err(error) if error.kind() == io::ErrorKind::ConnectionReset => break,
                Err(error) => return Err(error.into()),
            }
        }

        for (&transport_peer_id, transport) in &transports {
            while let Some(network_packet) = transport.try_recv() {
                let size = network_packet.len();
                let Ok(packet) = decode(&network_packet) else {
                    continue;
                };
                if packet.session_id != session_id || packet.client_id != transport_peer_id {
                    continue;
                }
                let peer = peers.entry(transport_peer_id).or_default();
                if packet.kind == PacketKind::MrReady && size == HEADER_LEN {
                    mr_sync.observe_ready(
                        transport_peer_id,
                        packet.sequence,
                        packet.server_received_ns,
                        packet.server_sent_ns,
                    );
                    continue;
                }
                if packet.kind == PacketKind::MrStart && size == HEADER_LEN {
                    let estimated_one_way_us = peer
                        .delivery_round_trips_us
                        .last()
                        .copied()
                        .map(|round_trip| round_trip / 2.0);
                    let remaining =
                        remaining_start_delay(packet.server_received_ns, estimated_one_way_us);
                    let _ = mr_sync.observe_start(packet.sequence, Instant::now(), remaining);
                    continue;
                }
                if packet.kind == PacketKind::MrSyncReset && size == HEADER_LEN {
                    let _ = mr_sync.observe_reset(packet.sequence, Instant::now());
                    continue;
                }
                if packet.kind == PacketKind::MrAbort && size == HEADER_LEN {
                    if last_mr_abort_performance == Some(packet.sequence) {
                        continue;
                    }
                    last_mr_abort_performance = Some(packet.sequence);
                    let waiting_clients = mask_to_client_ids(packet.client_sent_ns);
                    let mismatched_clients = mask_to_client_ids(packet.server_received_ns);
                    mr_sync.stop(Some(packet.sequence));
                    if let Some(track) = mr_track
                        .as_mut()
                        .filter(|track| track.performance_id == packet.sequence)
                    {
                        track.playing = false;
                    }
                    if let Some(events) = &embedded_events {
                        let _ = events.send(EmbeddedEvent::MrSyncFailed {
                            performance_id: packet.sequence,
                            waiting_clients,
                            mismatched_clients,
                        });
                    }
                    continue;
                }
                if packet.kind == PacketKind::MrCancel && size == HEADER_LEN {
                    if mr_track
                        .as_ref()
                        .is_some_and(|track| track.performance_id == packet.sequence)
                    {
                        let estimated_one_way_us = peer
                            .delivery_round_trips_us
                            .last()
                            .copied()
                            .map(|round_trip| round_trip / 2.0);
                        let remaining =
                            remaining_start_delay(packet.server_received_ns, estimated_one_way_us);
                        let target = Instant::now() + remaining;
                        cancel_schedule = Some(
                            cancel_schedule
                                .filter(|(performance_id, _)| *performance_id == packet.sequence)
                                .map_or((packet.sequence, target), |scheduled| {
                                    (scheduled.0, scheduled.1.min(target))
                                }),
                        );
                    }
                    continue;
                }
                if packet.kind == PacketKind::MrPosition && size == HEADER_LEN {
                    let leader_id = mr_sync.current_leader_id(client_id, &connected_peer_ids);
                    if transport_peer_id == leader_id {
                        if let Some(track) = mr_track
                            .as_mut()
                            .filter(|track| track.performance_id == packet.sequence)
                        {
                            let estimated_one_way_samples = peer
                                .delivery_round_trips_us
                                .last()
                                .copied()
                                .map(|round_trip| {
                                    (round_trip / 2.0 * SAMPLE_RATE as f64 / 1_000_000.0) as usize
                                })
                                .unwrap_or(0);
                            let leader_position = (packet.client_sent_ns as usize)
                                .saturating_add(estimated_one_way_samples);
                            let nudge = bounded_position_nudge(track.position, leader_position);
                            mr_drift_correction_samples += track.nudge_position(nudge) as i64;
                        }
                    }
                    continue;
                }
                if packet.kind == PacketKind::DeliveryAck && size == HEADER_LEN {
                    if peer.ack_tracker.observe(packet.sequence) {
                        peer.delivery_round_trips_us.push(
                            elapsed_ns(epoch).saturating_sub(packet.client_sent_ns) as f64
                                / 1_000.0,
                        );
                        peer.peer_receive_dispatch_us.push(
                            packet
                                .server_sent_ns
                                .saturating_sub(packet.server_received_ns)
                                as f64
                                / 1_000.0,
                        );
                    }
                    continue;
                }
                if packet.kind == PacketKind::Leave && size == HEADER_LEN {
                    peer.mark_departed();
                    println!("Peer {transport_peer_id} sent Leave; playout stopped");
                    continue;
                }
                if packet.kind != PacketKind::Audio || size <= HEADER_LEN {
                    continue;
                }
                let receive_to_main_ns =
                    elapsed_ns(epoch).saturating_sub(packet.server_received_ns);
                peer.receive_to_main_us
                    .push(receive_to_main_ns as f64 / 1_000.0);
                if receive_to_main_ns > MAX_RECEIVE_TO_MAIN_DELAY.as_nanos() as u64 {
                    peer.late_playback_frames += 1;
                    continue;
                }
                if !peer.tracker.observe(packet.sequence) {
                    continue;
                }
                peer.received += 1;
                peer.departed = false;
                if let Some(expected) = peer.playout_sequence {
                    if packet.sequence.wrapping_sub(expected) > u64::MAX / 2 {
                        peer.late_playback_frames += 1;
                        continue;
                    }
                }
                peer.frame_buffer
                    .entry(packet.sequence)
                    .or_insert(BufferedOpusFrame {
                        packet: network_packet[HEADER_LEN..].to_vec(),
                        arrived: Instant::now(),
                    });
            }
        }

        let mr_sync_now = Instant::now();
        if cancel_schedule.is_some_and(|(_, target)| mr_sync_now >= target) {
            if let Some((performance_id, _)) = cancel_schedule.take() {
                if let Some(track) = mr_track
                    .as_mut()
                    .filter(|track| track.performance_id == performance_id)
                {
                    track.playing = false;
                    track.position = 0;
                }
                mr_sync.stop(Some(performance_id));
                if let Some(events) = &embedded_events {
                    let _ = events.send(EmbeddedEvent::MrCancelled { performance_id });
                }
            }
        }
        if let Some((performance_id, _target)) =
            mr_sync.leader_schedule_if_ready(client_id, &connected_peer_ids, mr_sync_now)
        {
            send_control_to_peers(
                &transports,
                &connected_peer_ids,
                PacketHeader {
                    kind: PacketKind::MrStart,
                    sequence: performance_id,
                    client_sent_ns: elapsed_ns(epoch),
                    server_received_ns: START_GUARD.as_nanos() as u64,
                    server_sent_ns: 0,
                    session_id,
                    client_id,
                },
            );
        }
        if let Some(failure) =
            mr_sync.take_ready_failure(client_id, &connected_peer_ids, mr_sync_now)
        {
            last_mr_abort_performance = Some(failure.performance_id);
            let abort_header = PacketHeader {
                kind: PacketKind::MrAbort,
                sequence: failure.performance_id,
                client_sent_ns: client_ids_to_mask(&failure.waiting_clients),
                server_received_ns: client_ids_to_mask(&failure.mismatched_clients),
                server_sent_ns: 0,
                session_id,
                client_id,
            };
            send_control_to_peers(&transports, &connected_peer_ids, abort_header);
            pending_mr_abort = Some((abort_header, 4, mr_sync_now + Duration::from_millis(100)));
            if let Some(track) = mr_track
                .as_mut()
                .filter(|track| track.performance_id == failure.performance_id)
            {
                track.playing = false;
            }
            if let Some(events) = &embedded_events {
                let _ = events.send(EmbeddedEvent::MrSyncFailed {
                    performance_id: failure.performance_id,
                    waiting_clients: failure.waiting_clients,
                    mismatched_clients: failure.mismatched_clients,
                });
            }
            mr_sync.stop(Some(failure.performance_id));
        }
        if let Some(performance_id) = mr_sync.take_due_start(mr_sync_now) {
            if let Some(track) = mr_track
                .as_mut()
                .filter(|track| track.performance_id == performance_id)
            {
                track.position = 0;
                track.playing = true;
                next_playout = mr_sync_now;
                if let Some(events) = &embedded_events {
                    let _ = events.send(EmbeddedEvent::MrStarted { performance_id });
                }
            }
        }
        if let Some(track) = mr_track.as_ref().filter(|track| track.playing) {
            if mr_sync.should_broadcast_position(mr_sync_now) {
                send_control_to_peers(
                    &transports,
                    &connected_peer_ids,
                    PacketHeader {
                        kind: PacketKind::MrPosition,
                        sequence: track.performance_id,
                        client_sent_ns: track.position as u64,
                        server_received_ns: elapsed_ns(epoch),
                        server_sent_ns: 0,
                        session_id,
                        client_id,
                    },
                );
            }
        }
        if let Some((performance_id, _, _)) = mr_sync.local_ready_packet() {
            let status_peer_ids = mr_sync.status_peer_ids(&connected_peer_ids);
            let (ready_clients, total_clients, waiting_clients, mismatched_clients) =
                mr_sync.ready_status(&status_peer_ids);
            let leader_id = mr_sync.current_leader_id(client_id, &connected_peer_ids);
            let scheduled_in_ms = mr_sync.scheduled_delay_ms(mr_sync_now);
            let timeout_remaining_seconds = mr_sync.ready_timeout_remaining_seconds(mr_sync_now);
            let waiting_mask = client_ids_to_mask(&waiting_clients);
            let mismatched_mask = client_ids_to_mask(&mismatched_clients);
            let status = (
                performance_id,
                ready_clients,
                total_clients,
                waiting_mask,
                mismatched_mask,
                leader_id,
                scheduled_in_ms,
                timeout_remaining_seconds,
                mr_drift_correction_samples,
            );
            if last_reported_sync_status != Some(status) {
                last_reported_sync_status = Some(status);
                if let Some(events) = &embedded_events {
                    let _ = events.send(EmbeddedEvent::MrSyncStatus {
                        performance_id,
                        ready_clients,
                        total_clients,
                        waiting_clients,
                        mismatched_clients,
                        timeout_remaining_seconds,
                        leader_id,
                        scheduled_in_ms,
                        drift_correction_samples: mr_drift_correction_samples,
                    });
                }
            }
        }

        let playout_update_now = Instant::now();
        let audio_playback_enabled = playback.is_some();
        for (&peer_id, peer) in &mut peers {
            if !transports
                .get(&peer_id)
                .is_some_and(IceTransport::connected)
            {
                continue;
            }
            if audio_playback_enabled {
                peer.discard_stale_buffered_frames(playout_update_now);
            }
            if peer.start_playout_if_ready() && !playout_started {
                playout_started = true;
                next_playout = playout_update_now;
            }
        }

        let mut playout_steps = 0;
        while (playout_started || mr_track.as_ref().is_some_and(|track| track.playing))
            && Instant::now() >= next_playout
            && playout_steps < MAX_CAPTURE_BURST_FRAMES
        {
            let Some(destination) = playback.as_mut() else {
                break;
            };
            let mut remote_frames = Vec::<[f32; SAMPLES_PER_FRAME]>::new();
            let mut has_remote_playout = false;
            let mut minimum_buffered = JITTER_MAX_FRAMES;
            for (&peer_id, peer) in &mut peers {
                if !transports
                    .get(&peer_id)
                    .is_some_and(IceTransport::connected)
                {
                    continue;
                }
                if peer.departed {
                    continue;
                }
                if peer.playout_sequence.is_none() {
                    continue;
                }
                has_remote_playout = true;
                if peer.frame_buffer.len() > (peer.jitter_target_frames + 2).min(JITTER_MAX_FRAMES)
                {
                    if let Some((&newest, _)) = peer.frame_buffer.last_key_value() {
                        let new_sequence =
                            newest.saturating_sub((peer.jitter_target_frames - 1) as u64);
                        peer.frame_buffer
                            .retain(|&sequence, _| sequence >= new_sequence);
                        peer.playout_sequence = Some(new_sequence);
                        peer.playback_resyncs += 1;
                        peer.recovery_crossfade_needed = true;
                    }
                }
                let sequence = peer.playout_sequence.expect("peer playout sequence");
                let frame = if let Some(buffered) = peer.frame_buffer.remove(&sequence) {
                    peer.playback_queue_estimate_us.push(
                        buffered.arrived.elapsed().as_secs_f64() * 1_000_000.0
                            + destination.available() as f64 * 1_000_000.0 / SAMPLE_RATE as f64,
                    );
                    if peer.playout_decoder.is_none() {
                        peer.playout_decoder = Decoder::new(SAMPLE_RATE, Channels::Mono).ok();
                    }
                    let mut samples = [0.0_f32; SAMPLES_PER_FRAME];
                    let decoded = peer.playout_decoder.as_mut().and_then(|decoder| {
                        decoder
                            .decode_float(&buffered.packet, &mut samples, DecodeMode::Normal)
                            .ok()
                    });
                    let decoded_ok = decoded == Some(SAMPLES_PER_FRAME);
                    if !decoded_ok {
                        peer.corrupt_frames += 1;
                        peer.concealed_frames += 1;
                        peer.current_gap_concealed_frames += 1;
                        peer.consecutive_missing_frames =
                            peer.consecutive_missing_frames.saturating_add(1);
                        peer.recovery_crossfade_needed = true;
                        samples =
                            peer.last_playback_frame
                                .map_or([0.0; SAMPLES_PER_FRAME], |previous| {
                                    conceal_pcm_frame(
                                        &previous,
                                        peer.consecutive_missing_frames.saturating_sub(1),
                                        MAX_CONCEALED_FRAMES_PER_GAP,
                                    )
                                });
                    }
                    if decoded_ok && peer.recovery_crossfade_needed {
                        if let Some(previous) = peer.last_playback_frame {
                            crossfade_recovered_frame(&previous, &mut samples);
                        }
                        peer.recovery_crossfade_needed = false;
                    }
                    if decoded_ok {
                        peer.consecutive_missing_frames = 0;
                        peer.current_gap_concealed_frames = 0;
                    }
                    samples
                } else {
                    let mut replacement = [0.0; SAMPLES_PER_FRAME];
                    let opus_plc_succeeded = peer.playout_decoder.as_mut().is_some_and(|decoder| {
                        decoder
                            .decode_float(&[], &mut replacement, DecodeMode::Normal)
                            .ok()
                            == Some(SAMPLES_PER_FRAME)
                    });
                    if !opus_plc_succeeded {
                        peer.fallback_concealed_frames += 1;
                        replacement =
                            peer.last_playback_frame
                                .map_or([0.0; SAMPLES_PER_FRAME], |previous| {
                                    let conceal_index = peer
                                        .consecutive_missing_frames
                                        .min(MAX_CONCEALED_FRAMES_PER_GAP.saturating_sub(1));
                                    conceal_pcm_frame(
                                        &previous,
                                        conceal_index,
                                        MAX_CONCEALED_FRAMES_PER_GAP,
                                    )
                                });
                    } else {
                        peer.opus_plc_frames += 1;
                    }
                    peer.concealed_frames += 1;
                    peer.current_gap_concealed_frames += 1;
                    peer.consecutive_missing_frames =
                        peer.consecutive_missing_frames.saturating_add(1);
                    peer.recovery_crossfade_needed = true;
                    replacement
                };
                peer.last_playback_frame = Some(frame);
                peer.playout_sequence = Some(sequence.wrapping_add(1));
                minimum_buffered = minimum_buffered.min(peer.frame_buffer.len());
                let mut rendered = frame;
                if peer_receive_mix
                    .entry(peer_id)
                    .or_insert_with(|| PeerReceiveMix::new(PeerMixSettings::default()))
                    .process(&mut rendered)
                {
                    remote_frames.push(rendered);
                }
            }
            if !has_remote_playout {
                playout_started = false;
            }
            let mut mixed = mix_remote_frames(&remote_frames);
            let has_mr_audio = mr_track
                .as_mut()
                .is_some_and(|track| track.mix_next_frame(&mut mixed));
            if has_mr_audio {
                if let Some(track) = mr_track.as_ref().filter(|track| !track.playing) {
                    if let Some(events) = &embedded_events {
                        let _ = events.send(EmbeddedEvent::MrFinished {
                            performance_id: track.performance_id,
                        });
                    }
                }
            }
            if !has_remote_playout && !has_mr_audio {
                break;
            }
            limit_output(&mut mixed);
            push_playback_frame(destination, &mixed, &mut playback_overflows);
            let (clock_interval, clock_adjustment_ppm) = if has_remote_playout {
                frame_clock_interval(minimum_buffered, JITTER_PREBUFFER_FRAMES - 1)
            } else {
                (interval, 0)
            };
            frame_clock_adjustment_sum_ppm += clock_adjustment_ppm;
            frame_clock_adjustment_measurements += 1;
            next_playout += clock_interval;
            playout_steps += 1;
        }

        let live_now = Instant::now();
        if live_now >= next_live_status {
            let connected_peers = transports
                .values()
                .filter(|transport| transport.connected())
                .count();
            let total_received: u64 = peers.values().map(|peer| peer.received).sum();
            let total_concealed: u64 = peers.values().map(|peer| peer.concealed_frames).sum();
            let total_resyncs: u64 = peers.values().map(|peer| peer.playback_resyncs).sum();
            let total_underruns = playback_stats.underrun_events.load(Ordering::Relaxed);
            let total_local_monitor_underruns = playback_stats
                .local_monitor_underrun_events
                .load(Ordering::Relaxed);
            let incoming_queue_drops: u64 = transports
                .values()
                .map(IceTransport::incoming_queue_drops)
                .sum();
            let stale_outgoing_drops: u64 = transports
                .values()
                .map(IceTransport::stale_outgoing_audio_drops)
                .sum();
            let ping_samples: Vec<f64> = peers
                .values()
                .filter_map(|peer| peer.delivery_round_trips_us.last().copied())
                .collect();
            let ping_ms = if ping_samples.is_empty() {
                -1.0
            } else {
                ping_samples.iter().sum::<f64>() / ping_samples.len() as f64 / 1_000.0
            };
            let received_delta = total_received.saturating_sub(previous_live_received);
            let concealed_delta = total_concealed.saturating_sub(previous_live_concealed);
            let concealment_percent = if received_delta == 0 {
                0.0
            } else {
                concealed_delta as f64 * 100.0 / received_delta as f64
            };
            let (input_peak, clipped_samples) = input_callback_stats.take_level();
            let peak_dbfs = if input_peak > 0.000_001 {
                (20.0 * input_peak.log10()).max(-60.0)
            } else {
                -60.0
            };
            println!(
                "Live status: peers={connected_peers} ping_ms={ping_ms:.1} concealment_percent={concealment_percent:.2} underruns={} local_monitor_underruns={} resyncs={} input_peak_dbfs={peak_dbfs:.1} clipped_samples={clipped_samples} incoming_queue_drops={incoming_queue_drops} stale_outgoing_drops={stale_outgoing_drops}",
                total_underruns.saturating_sub(previous_live_underruns),
                total_local_monitor_underruns
                    .saturating_sub(previous_local_monitor_underruns),
                total_resyncs.saturating_sub(previous_live_resyncs),
            );
            if let Some(events) = &embedded_events {
                let _ = events.send(EmbeddedEvent::Metrics {
                    connected_peers,
                    ping_ms: (ping_ms >= 0.0).then_some(ping_ms),
                    concealment_percent,
                    underruns: total_underruns.saturating_sub(previous_live_underruns),
                    local_monitor_underruns: total_local_monitor_underruns,
                    resyncs: total_resyncs.saturating_sub(previous_live_resyncs),
                });
                let _ = events.send(EmbeddedEvent::InputLevel {
                    peak_dbfs,
                    clipping: clipped_samples > 0,
                    clipped_samples,
                });
            }
            previous_live_received = total_received;
            previous_live_concealed = total_concealed;
            previous_live_resyncs = total_resyncs;
            previous_live_underruns = total_underruns;
            previous_local_monitor_underruns = total_local_monitor_underruns;
            while next_live_status <= live_now {
                next_live_status += Duration::from_secs(1);
            }
        }

        let poll = Instant::now() + Duration::from_micros(100);
        wait_until(next_send.min(deadline).min(poll));
    }
    let connected_peer_ids: Vec<u64> = transports
        .iter()
        .filter_map(|(&peer_id, transport)| transport.connected().then_some(peer_id))
        .collect();
    send_leave_to_peers(&transports, &connected_peer_ids, session_id, client_id);
    send_rendezvous_leave(&socket, server_address, session_id, client_id);
    thread::sleep(Duration::from_millis(50));
    drop(streams);

    let total_received: u64 = peers.values().map(|peer| peer.received).sum();
    let total_corrupt: u64 = peers.values().map(|peer| peer.corrupt_frames).sum();
    let total_concealed: u64 = peers.values().map(|peer| peer.concealed_frames).sum();
    let total_opus_plc: u64 = peers.values().map(|peer| peer.opus_plc_frames).sum();
    let total_fallback_concealed: u64 = peers
        .values()
        .map(|peer| peer.fallback_concealed_frames)
        .sum();
    let total_departure_concealed: u64 = peers
        .values()
        .map(|peer| peer.departure_concealed_frames)
        .sum();
    let total_late: u64 = peers.values().map(|peer| peer.late_playback_frames).sum();
    let total_resyncs: u64 = peers.values().map(|peer| peer.playback_resyncs).sum();
    let total_duplicates: u64 = peers.values().map(|peer| peer.tracker.duplicates).sum();
    let total_out_of_order: u64 = peers.values().map(|peer| peer.tracker.out_of_order).sum();
    let total_acks: usize = peers
        .values()
        .map(|peer| peer.delivery_round_trips_us.len())
        .sum();
    let total_ack_duplicates: u64 = peers.values().map(|peer| peer.ack_tracker.duplicates).sum();
    let speed_measurements = playback_stats.speed_measurements.load(Ordering::Relaxed);
    let average_speed_ppm = if speed_measurements == 0 {
        0
    } else {
        playback_stats.speed_sum_ppm.load(Ordering::Relaxed) / speed_measurements as i64
    };
    let average_frame_clock_ppm = if frame_clock_adjustment_measurements == 0 {
        0
    } else {
        frame_clock_adjustment_sum_ppm / frame_clock_adjustment_measurements as i64
    };
    let incoming_queue_drops: u64 = transports
        .values()
        .map(IceTransport::incoming_queue_drops)
        .sum();
    let stale_outgoing_drops: u64 = transports
        .values()
        .map(IceTransport::stale_outgoing_audio_drops)
        .sum();
    println!(
        "Full Mesh completed: client_id={client_id}, codec=Opus-2.5ms, peers={}, sent_frames={sent}, sent_peer_packets={sent_peer_packets}, unique_received={total_received}, corrupt_frames={total_corrupt}, duplicates={total_duplicates}, out_of_order={total_out_of_order}, delivery_acks={total_acks}, ack_duplicates={total_ack_duplicates}, deadline_misses={deadline_misses}, incoming_queue_drops={incoming_queue_drops}, stale_outgoing_audio_drops={stale_outgoing_drops}, network_concealed_frames={total_concealed}, departure_concealed_frames={total_departure_concealed}, late_playback_frames={total_late}, playback_resyncs={total_resyncs}, average_frame_clock_adjustment_ppm={average_frame_clock_ppm}, playback_underrun_events={}, emergency_trimmed_samples={}, average_speed_adjustment_ppm={average_speed_ppm}, max_speed_adjustment_ppm={}, playback_overflow_samples={playback_overflows}",
        peers.len(),
        playback_stats.underrun_events.load(Ordering::Relaxed),
        playback_stats.trimmed_samples.load(Ordering::Relaxed),
        playback_stats.max_abs_speed_ppm.load(Ordering::Relaxed),
    );
    println!(
        "Concealment methods: opus_plc_frames={total_opus_plc}, fallback_concealed_frames={total_fallback_concealed}"
    );
    for (peer_id, peer) in &peers {
        println!(
            "Peer {peer_id} completed: unique_received={}, corrupt_frames={}, duplicates={}, out_of_order={}, delivery_acks={}, ack_duplicates={}, network_concealed_frames={}, departure_concealed_frames={}, late_playback_frames={}, playback_resyncs={}, final_jitter_target_ms={:.1}",
            peer.received,
            peer.corrupt_frames,
            peer.tracker.duplicates,
            peer.tracker.out_of_order,
            peer.delivery_round_trips_us.len(),
            peer.ack_tracker.duplicates,
            peer.concealed_frames,
            peer.departure_concealed_frames,
            peer.late_playback_frames,
            peer.playback_resyncs,
            peer.jitter_target_frames as f64 * FRAME_DURATION_MICROS as f64 / 1_000.0,
        );
        print_latency_summary(
            &format!("Peer {peer_id} delivery round-trip"),
            &peer.delivery_round_trips_us,
        );
        print_latency_summary(
            &format!("Peer {peer_id} receive-to-ACK dispatch"),
            &peer.peer_receive_dispatch_us,
        );
        print_latency_summary(
            &format!("Peer {peer_id} ICE receive-to-audio main loop"),
            &peer.receive_to_main_us,
        );
        print_latency_summary(
            &format!("Peer {peer_id} playback queue residence estimate"),
            &peer.playback_queue_estimate_us,
        );
    }
    print_latency_summary("Capture queue age estimate", &capture_queue_us);
    let input_callbacks = input_callback_stats.callback_count.load(Ordering::Relaxed);
    if input_callbacks > 0 {
        println!(
            "Input callback effect processing (ms): mean={:.3}, max={:.3}, callbacks={input_callbacks}",
            input_callback_stats.processing_ns.load(Ordering::Relaxed) as f64
                / input_callbacks as f64 / 1_000_000.0,
            input_callback_stats.max_processing_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0,
        );
    }
    if let Some(events) = &embedded_events {
        let _ = events.send(EmbeddedEvent::Stopped);
    }
    Ok(())
}

fn frame_clock_interval(buffered_frames: usize, target_frames: usize) -> (Duration, i64) {
    let queue_error = buffered_frames as i64 - target_frames as i64;
    let adjustment_ppm = (queue_error * 1_000).clamp(
        -FRAME_CLOCK_MAX_ADJUSTMENT_PPM,
        FRAME_CLOCK_MAX_ADJUSTMENT_PPM,
    );
    let base_ns = FRAME_DURATION_MICROS as i64 * 1_000;
    let adjusted_ns = base_ns - base_ns * adjustment_ppm / 1_000_000;
    (Duration::from_nanos(adjusted_ns as u64), adjustment_ppm)
}

#[cfg(test)]
fn rebase_deferred_playout(now: Instant) -> Instant {
    // The caller adds one frame interval after consuming the deferred frame, so returning
    // `now` schedules the following frame exactly one interval from the current instant.
    now
}

fn print_latency_summary(label: &str, values_us: &[f64]) {
    if let Some(value) = summarize(values_us) {
        println!(
            "{label} (ms): min={:.3}, mean={:.3}, p50={:.3}, p95={:.3}, p99={:.3}, max={:.3}",
            value.min / 1_000.0,
            value.mean / 1_000.0,
            value.p50 / 1_000.0,
            value.p95 / 1_000.0,
            value.p99 / 1_000.0,
            value.max / 1_000.0,
        );
    }
}

fn fill_synthetic_frame(samples: &mut [f32; SAMPLES_PER_FRAME], client_id: u64, sequence: u64) {
    for (index, sample) in samples.iter_mut().enumerate() {
        *sample = synthetic_sample(client_id, sequence, index);
    }
}

#[cfg(test)]
fn synthetic_frame_matches(
    samples: &[f32; SAMPLES_PER_FRAME],
    client_id: u64,
    sequence: u64,
) -> bool {
    samples.iter().enumerate().all(|(index, sample)| {
        sample.to_bits() == synthetic_sample(client_id, sequence, index).to_bits()
    })
}

fn synthetic_sample(client_id: u64, sequence: u64, index: usize) -> f32 {
    let mixed = client_id
        .wrapping_mul(0x9E37_79B9)
        .wrapping_add(sequence.rotate_left(17))
        .wrapping_add(index as u64);
    ((mixed & 0xffff) as f32 / 32_767.5) - 1.0
}

fn conceal_pcm_frame(
    previous: &[f32; SAMPLES_PER_FRAME],
    conceal_index: u64,
    conceal_count: u64,
) -> [f32; SAMPLES_PER_FRAME] {
    let frame_gain = 1.0 - (conceal_index + 1) as f32 / (conceal_count + 2) as f32;
    let mut concealed = [0.0; SAMPLES_PER_FRAME];
    let transition_samples = 16.min(SAMPLES_PER_FRAME);
    for (index, output) in concealed.iter_mut().enumerate() {
        let gain = frame_gain * (1.0 - 0.35 * index as f32 / SAMPLES_PER_FRAME as f32);
        let sample = if index < transition_samples {
            let blend = (index + 1) as f32 / transition_samples as f32;
            previous[SAMPLES_PER_FRAME - 1] * (1.0 - blend) + previous[index] * blend
        } else {
            previous[index]
        };
        *output = sample * gain;
    }
    concealed
}

fn crossfade_recovered_frame(
    previous: &[f32; SAMPLES_PER_FRAME],
    recovered: &mut [f32; SAMPLES_PER_FRAME],
) {
    let count = RECOVERY_CROSSFADE_SAMPLES.min(SAMPLES_PER_FRAME);
    for (index, sample) in recovered.iter_mut().take(count).enumerate() {
        let previous_index = SAMPLES_PER_FRAME - count + index;
        let mix = (index + 1) as f32 / count as f32;
        *sample = previous[previous_index] * (1.0 - mix) + *sample * mix;
    }
}

fn push_playback_frame(
    destination: &mut Producer,
    samples: &[f32; SAMPLES_PER_FRAME],
    overflow_samples: &mut u64,
) {
    if destination.push_slice(samples).is_err() {
        *overflow_samples += samples.len() as u64;
    }
}

#[cfg(any())]
fn select_device(
    input: bool,
    requested: Option<String>,
) -> Result<Device, Box<dyn std::error::Error>> {
    let host = cpal::default_host();
    let mut devices = if input {
        host.input_devices()?
    } else {
        host.output_devices()?
    };
    if let Some(name) = requested {
        let needle = name.to_lowercase();
        return devices
            .find(|device| {
                device
                    .name()
                    .is_ok_and(|value| value.to_lowercase().contains(&needle))
            })
            .ok_or_else(|| format!("audio device containing '{name}' was not found").into());
    }
    if input {
        host.default_input_device()
            .ok_or_else(|| "no default input device".into())
    } else {
        host.default_output_device()
            .ok_or_else(|| "no default output device".into())
    }
}

#[cfg(any())]
fn supported_config(
    device: &Device,
    input: bool,
) -> Result<(StreamConfig, SampleFormat), Box<dyn std::error::Error>> {
    let ranges: Vec<_> = if input {
        device.supported_input_configs()?.collect()
    } else {
        device.supported_output_configs()?.collect()
    };
    let selected = ranges
        .into_iter()
        .filter(|range| {
            range.min_sample_rate().0 <= SAMPLE_RATE && range.max_sample_rate().0 >= SAMPLE_RATE
        })
        .min_by_key(|range| match range.sample_format() {
            SampleFormat::F32 => 0,
            SampleFormat::I16 => 1,
            SampleFormat::U16 => 2,
            _ => 3,
        })
        .ok_or("device does not support 48 kHz")?
        .with_sample_rate(SampleRate(SAMPLE_RATE));
    let format = selected.sample_format();
    let buffer_samples = match *selected.buffer_size() {
        SupportedBufferSize::Range { min, max } => {
            Some(DEVICE_BUFFER_TARGET_SAMPLES.clamp(min.max(1), max))
        }
        SupportedBufferSize::Unknown => None,
    };
    let mut config = selected.config();
    if let Some(samples) = buffer_samples {
        config.buffer_size = BufferSize::Fixed(samples);
        println!(
            "{} device buffer requested: {} samples ({:.3} ms)",
            if input { "Input" } else { "Output" },
            samples,
            samples as f64 * 1_000.0 / SAMPLE_RATE as f64
        );
    } else {
        println!(
            "{} device does not report a buffer range; using the platform default",
            if input { "Input" } else { "Output" }
        );
    }
    Ok((config, format))
}

#[cfg(any())]
fn build_input_stream(
    device: &Device,
    mut producer: Producer,
    mut local_monitor: Option<Producer>,
    local_monitor_level: f32,
    mut effects: Option<KaraokeEffects>,
    stats: InputCallbackStats,
) -> Result<Stream, Box<dyn std::error::Error>> {
    let (config, format) = supported_config(device, true)?;
    let channels = config.channels as usize;
    let error = |value| eprintln!("audio input error: {value}");
    let stream = match format {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _| {
                let started = Instant::now();
                push_input(
                    data,
                    channels,
                    &mut producer,
                    &mut local_monitor,
                    local_monitor_level,
                    &mut effects,
                    |v| v,
                );
                stats.record(started.elapsed());
            },
            error,
            None,
        )?,
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _| {
                let started = Instant::now();
                push_input(
                    data,
                    channels,
                    &mut producer,
                    &mut local_monitor,
                    local_monitor_level,
                    &mut effects,
                    |v| v as f32 / 32768.0,
                );
                stats.record(started.elapsed());
            },
            error,
            None,
        )?,
        SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _| {
                let started = Instant::now();
                push_input(
                    data,
                    channels,
                    &mut producer,
                    &mut local_monitor,
                    local_monitor_level,
                    &mut effects,
                    |v| (v as f32 - 32768.0) / 32768.0,
                );
                stats.record(started.elapsed());
            },
            error,
            None,
        )?,
        _ => return Err(format!("unsupported input sample format: {format:?}").into()),
    };
    Ok(stream)
}

#[cfg(any())]
fn push_input<T: Copy>(
    data: &[T],
    channels: usize,
    producer: &mut Producer,
    local_monitor: &mut Option<Producer>,
    local_monitor_level: f32,
    effects: &mut Option<KaraokeEffects>,
    convert: impl Fn(T) -> f32,
) {
    for frame in data.chunks_exact(channels) {
        let mono = frame.iter().copied().map(&convert).sum::<f32>() / channels as f32;
        let processed = effects
            .as_mut()
            .map_or(mono, |effects| effects.process_sample(mono));
        let _ = producer.push(processed);
        if let Some(monitor) = local_monitor.as_mut() {
            let _ = monitor.push(processed * local_monitor_level);
        }
    }
}

#[cfg(any())]
fn build_output_stream(
    device: &Device,
    mut consumer: Consumer,
    mut local_consumer: Option<Consumer>,
    policy: PlaybackBufferPolicy,
    stats: PlaybackStats,
) -> Result<Stream, Box<dyn std::error::Error>> {
    let (config, format) = supported_config(device, false)?;
    let channels = config.channels as usize;
    let error = |value| eprintln!("audio output error: {value}");
    let mut state = PlaybackOutputState::new(
        policy.prebuffer_samples == 0,
        policy.target_queue_samples.max(1),
    );
    let stream = match format {
        SampleFormat::F32 => device.build_output_stream(
            &config,
            move |data: &mut [f32], _| {
                fill_output(
                    data,
                    channels,
                    &mut consumer,
                    &mut local_consumer,
                    policy,
                    &stats,
                    &mut state,
                    |v| v,
                )
            },
            error,
            None,
        )?,
        SampleFormat::I16 => device.build_output_stream(
            &config,
            move |data: &mut [i16], _| {
                fill_output(
                    data,
                    channels,
                    &mut consumer,
                    &mut local_consumer,
                    policy,
                    &stats,
                    &mut state,
                    |v| (v.clamp(-1.0, 1.0) * i16::MAX as f32) as i16,
                )
            },
            error,
            None,
        )?,
        SampleFormat::U16 => device.build_output_stream(
            &config,
            move |data: &mut [u16], _| {
                fill_output(
                    data,
                    channels,
                    &mut consumer,
                    &mut local_consumer,
                    policy,
                    &stats,
                    &mut state,
                    |v| ((v.clamp(-1.0, 1.0) * 32767.0) + 32768.0) as u16,
                )
            },
            error,
            None,
        )?,
        _ => return Err(format!("unsupported output sample format: {format:?}").into()),
    };
    Ok(stream)
}

#[allow(clippy::too_many_arguments)]
fn fill_output<T: Copy>(
    data: &mut [T],
    channels: usize,
    consumer: &mut Consumer,
    local_consumer: &mut Option<Consumer>,
    policy: PlaybackBufferPolicy,
    stats: &PlaybackStats,
    state: &mut PlaybackOutputState,
    convert: impl Fn(f32) -> T,
) {
    let local_device_period_samples = state.output_period_samples.max(SAMPLES_PER_FRAME);
    let local_target_queue_samples = (local_device_period_samples
        .saturating_mul(2)
        .saturating_add(SAMPLES_PER_FRAME))
    .min(LOCAL_MONITOR_MAX_QUEUE_SAMPLES);
    if let Some(local) = local_consumer.as_mut() {
        if local.available() > LOCAL_MONITOR_MAX_QUEUE_SAMPLES {
            let discard = local.available().saturating_sub(local_target_queue_samples);
            for _ in 0..discard {
                let _ = local.pop();
            }
            state.local_resampler.reset();
            state.local_started = false;
            state.local_ratio = 1.0;
            state.local_fade_gain = 0.0;
        }
    }
    if policy.max_queue_samples > 0 && consumer.available() > policy.max_queue_samples {
        let needed = consumer.available().saturating_sub(policy.trim_to_samples);
        let discard_frames = needed.div_ceil(SAMPLES_PER_FRAME);
        let discard = (discard_frames * SAMPLES_PER_FRAME).min(consumer.available());
        stats
            .trimmed_samples
            .fetch_add(discard as u64, Ordering::Relaxed);
        for _ in 0..discard {
            let _ = consumer.pop();
        }
        state.resampler.reset();
        state.trim_crossfade_from = state.last_remote_sample;
        state.trim_crossfade_remaining = TRIM_CROSSFADE_SAMPLES;
        state.limiter_gain = 1.0;
    }
    let remote_ready = state.started
        || (consumer.available() > 0 && consumer.available() >= policy.prebuffer_samples);
    if !remote_ready && local_consumer.is_none() {
        data.fill(convert(0.0));
        return;
    }
    if remote_ready {
        state.started = true;
    }
    let adjustment_ppm = playback_speed_adjustment_ppm(policy, consumer.available());
    stats.record_speed(adjustment_ppm);
    let ratio = 1.0 + adjustment_ppm as f64 / 1_000_000.0;
    let local_available = local_consumer.as_ref().map_or(0, Consumer::available);
    if !state.local_started && local_available >= local_target_queue_samples {
        state.local_started = true;
        state.local_fade_gain = 0.0;
        state.local_dropout_remaining = 0;
    }
    let local_error = local_available as i64 - local_target_queue_samples as i64;
    let local_response_range = (local_target_queue_samples as i64 / 2).max(1);
    let local_adjustment_ppm =
        (local_error * LOCAL_MONITOR_MAX_SPEED_ADJUSTMENT_PPM / local_response_range).clamp(
            -LOCAL_MONITOR_MAX_SPEED_ADJUSTMENT_PPM,
            LOCAL_MONITOR_MAX_SPEED_ADJUSTMENT_PPM,
        );
    let local_target_ratio = 1.0 + local_adjustment_ppm as f64 / 1_000_000.0;
    for frame in data.chunks_exact_mut(channels) {
        let mut remote = if state.started {
            match state.resampler.render(consumer, ratio) {
                Some(sample) => sample,
                None => {
                    stats.underrun_events.fetch_add(1, Ordering::Relaxed);
                    state.started = false;
                    state.resampler.reset();
                    0.0
                }
            }
        } else {
            0.0
        };
        if state.trim_crossfade_remaining > 0 {
            let progress = (TRIM_CROSSFADE_SAMPLES - state.trim_crossfade_remaining + 1) as f32
                / TRIM_CROSSFADE_SAMPLES as f32;
            remote = state.trim_crossfade_from * (1.0 - progress) + remote * progress;
            state.trim_crossfade_remaining -= 1;
        }
        state.last_remote_sample = remote;
        let local_sample = if state.local_started {
            // Smooth the asynchronous device-clock correction sample by sample.
            // Abrupt callback-level ratio changes can sound like low-level sizzling.
            state.local_ratio +=
                (local_target_ratio - state.local_ratio) * LOCAL_MONITOR_RATIO_SMOOTHING;
            local_consumer
                .as_mut()
                .and_then(|local| state.local_resampler.render(local, state.local_ratio))
        } else {
            None
        };
        let local = if let Some(sample) = local_sample {
            state.local_fade_gain =
                (state.local_fade_gain + 1.0 / LOCAL_MONITOR_FADE_SAMPLES as f32).min(1.0);
            state.last_local_sample = sample;
            sample * state.local_fade_gain * LOCAL_MONITOR_GAIN
        } else {
            if state.local_started {
                stats
                    .local_monitor_underrun_events
                    .fetch_add(1, Ordering::Relaxed);
                state.local_started = false;
                state.local_resampler.reset();
                state.local_ratio = 1.0;
                state.local_fade_gain = 0.0;
                state.local_dropout_from = state.last_local_sample;
                state.local_dropout_remaining = LOCAL_MONITOR_FADE_SAMPLES;
            }
            if state.local_dropout_remaining > 0 {
                let gain = state.local_dropout_remaining as f32 / LOCAL_MONITOR_FADE_SAMPLES as f32;
                state.local_dropout_remaining -= 1;
                state.local_dropout_from * gain * LOCAL_MONITOR_GAIN
            } else {
                0.0
            }
        };
        let combined = remote + local;
        let required_gain = if combined.abs() > PLAYBACK_OUTPUT_CEILING {
            PLAYBACK_OUTPUT_CEILING / combined.abs()
        } else {
            1.0
        };
        if required_gain < state.limiter_gain {
            state.limiter_gain = required_gain;
        } else {
            state.limiter_gain += (1.0 - state.limiter_gain) * PLAYBACK_LIMITER_RELEASE_PER_SAMPLE;
            state.limiter_gain = state.limiter_gain.min(required_gain);
        }
        frame.fill(convert(combined * state.limiter_gain));
    }
}

fn playback_speed_adjustment_ppm(policy: PlaybackBufferPolicy, available: usize) -> i64 {
    if policy.target_queue_samples == 0 || policy.max_speed_adjustment_ppm == 0 {
        return 0;
    }
    let error = available as i64 - policy.target_queue_samples as i64;
    let response_range = (policy.target_queue_samples as i64 / 2).max(1);
    (error * policy.max_speed_adjustment_ppm / response_range).clamp(
        -policy.max_speed_adjustment_ppm,
        policy.max_speed_adjustment_ppm,
    )
}

fn wait_until(target: Instant) {
    while Instant::now() < target {
        std::hint::spin_loop();
    }
}

fn elapsed_ns(epoch: Instant) -> u64 {
    epoch.elapsed().as_nanos().min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buffered_frame(arrived: Instant) -> BufferedOpusFrame {
        BufferedOpusFrame {
            packet: Vec::new(),
            arrived,
        }
    }

    #[test]
    fn synthetic_frame_validates_exact_content() {
        let mut samples = [0.0; SAMPLES_PER_FRAME];
        fill_synthetic_frame(&mut samples, 7, 11);
        assert!(synthetic_frame_matches(&samples, 7, 11));
        samples[3] = 0.0;
        assert!(!synthetic_frame_matches(&samples, 7, 11));
    }

    #[test]
    fn playback_rebuffers_after_an_underrun() {
        let (mut producer, mut consumer) = ring_buffer(16);
        producer.push(0.1).unwrap();
        producer.push(0.2).unwrap();
        let policy = PlaybackBufferPolicy {
            prebuffer_samples: 2,
            target_queue_samples: 0,
            max_queue_samples: 0,
            trim_to_samples: 0,
            max_speed_adjustment_ppm: 0,
        };
        let mut state = PlaybackOutputState::new(false, 1);
        let stats = PlaybackStats::default();
        let mut local_consumer = None;
        let mut output = [0.0; 4];
        fill_output(
            &mut output,
            1,
            &mut consumer,
            &mut local_consumer,
            policy,
            &stats,
            &mut state,
            |sample| sample,
        );
        assert_eq!(output, [0.1, 0.2, 0.0, 0.0]);
        assert!(!state.started);

        producer.push(0.3).unwrap();
        fill_output(
            &mut output,
            1,
            &mut consumer,
            &mut local_consumer,
            policy,
            &stats,
            &mut state,
            |sample| sample,
        );
        assert_eq!(output, [0.0; 4]);

        producer.push(0.4).unwrap();
        fill_output(
            &mut output,
            1,
            &mut consumer,
            &mut local_consumer,
            policy,
            &stats,
            &mut state,
            |sample| sample,
        );
        assert_eq!(output, [0.3, 0.4, 0.0, 0.0]);
        assert_eq!(stats.underrun_events.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn zero_prebuffer_waits_for_the_first_sample() {
        let (_producer, mut consumer) = ring_buffer(8);
        let policy = PlaybackBufferPolicy {
            prebuffer_samples: 0,
            target_queue_samples: 0,
            max_queue_samples: 0,
            trim_to_samples: 0,
            max_speed_adjustment_ppm: 0,
        };
        let mut state = PlaybackOutputState::new(false, 1);
        let stats = PlaybackStats::default();
        let mut local_consumer = None;
        let mut output = [1.0; 4];

        fill_output(
            &mut output,
            1,
            &mut consumer,
            &mut local_consumer,
            policy,
            &stats,
            &mut state,
            |sample| sample,
        );

        assert_eq!(output, [0.0; 4]);
        assert!(!state.started);
        assert_eq!(stats.underrun_events.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn local_monitor_prebuffers_then_fades_in_at_full_level() {
        let (_remote_producer, mut remote_consumer) = ring_buffer(16);
        let (mut local_producer, local_consumer) = ring_buffer(1_024);
        let local_target = SAMPLES_PER_FRAME * 3;
        for _ in 0..local_target - 1 {
            local_producer.push(0.5).unwrap();
        }
        let policy = PlaybackBufferPolicy {
            prebuffer_samples: 0,
            target_queue_samples: 0,
            max_queue_samples: 0,
            trim_to_samples: 0,
            max_speed_adjustment_ppm: 0,
        };
        let stats = PlaybackStats::default();
        let mut state = PlaybackOutputState::new(false, SAMPLES_PER_FRAME);
        let mut local_consumer = Some(local_consumer);
        let mut output = [1.0; 64];

        fill_output(
            &mut output,
            1,
            &mut remote_consumer,
            &mut local_consumer,
            policy,
            &stats,
            &mut state,
            |sample| sample,
        );
        assert_eq!(output, [0.0; 64]);

        for _ in 0..128 {
            local_producer.push(0.5).unwrap();
        }
        fill_output(
            &mut output,
            1,
            &mut remote_consumer,
            &mut local_consumer,
            policy,
            &stats,
            &mut state,
            |sample| sample,
        );

        assert!(output[0] > 0.0 && output[0] < 0.5);
        assert!((output[47] - 0.5).abs() < 0.0001);
        assert!(output[48..]
            .iter()
            .all(|sample| (*sample - 0.5).abs() < 0.0001));
    }

    #[test]
    fn concealment_frame_is_finite_and_attenuated() {
        let previous = [0.5; SAMPLES_PER_FRAME];
        let concealed = conceal_pcm_frame(&previous, 0, 1);
        assert!(concealed.iter().all(|sample| sample.is_finite()));
        assert!(concealed.iter().all(|sample| sample.abs() < 0.5));
    }

    #[test]
    fn adaptive_speed_tracks_queue_error_with_a_bounded_adjustment() {
        let policy = PlaybackBufferPolicy {
            prebuffer_samples: 0,
            target_queue_samples: 480,
            max_queue_samples: 4_800,
            trim_to_samples: 960,
            max_speed_adjustment_ppm: 5_000,
        };
        assert_eq!(playback_speed_adjustment_ppm(policy, 480), 0);
        assert_eq!(playback_speed_adjustment_ppm(policy, 960), 5_000);
        assert_eq!(playback_speed_adjustment_ppm(policy, 0), -5_000);
        assert_eq!(playback_speed_adjustment_ppm(policy, 720), 5_000);
    }

    #[test]
    fn frame_clock_slows_when_network_queue_is_low() {
        let target_frames = JITTER_PREBUFFER_FRAMES - 1;
        let (low_interval, low_ppm) = frame_clock_interval(0, target_frames);
        let (target_interval, target_ppm) = frame_clock_interval(target_frames, target_frames);
        let (high_interval, high_ppm) = frame_clock_interval(JITTER_MAX_FRAMES, target_frames);

        assert!(low_interval > Duration::from_micros(FRAME_DURATION_MICROS));
        assert!(low_ppm < 0);
        assert_eq!(
            target_interval,
            Duration::from_micros(FRAME_DURATION_MICROS)
        );
        assert_eq!(target_ppm, 0);
        assert!(high_interval < Duration::from_micros(FRAME_DURATION_MICROS));
        assert_eq!(
            high_ppm,
            ((JITTER_MAX_FRAMES - target_frames) as i64 * 1_000)
                .min(FRAME_CLOCK_MAX_ADJUSTMENT_PPM)
        );
    }

    #[test]
    fn deferred_playout_restarts_without_a_catch_up_burst() {
        let now = Instant::now();
        let interval = Duration::from_micros(FRAME_DURATION_MICROS);
        let rebased = rebase_deferred_playout(now);

        assert_eq!(rebased, now);
        assert_eq!(rebased + interval, now + interval);
    }

    #[test]
    fn stale_network_frames_are_dropped_and_playout_rebuffers() {
        let now = Instant::now();
        let mut peer = PeerAudioState {
            playout_sequence: Some(10),
            last_playback_frame: Some([0.25; SAMPLES_PER_FRAME]),
            ..PeerAudioState::default()
        };
        peer.frame_buffer.insert(
            10,
            buffered_frame(
                now - Duration::from_micros(FRAME_DURATION_MICROS * JITTER_TARGET_FRAMES as u64)
                    - STALE_FRAME_MARGIN
                    - Duration::from_millis(1),
            ),
        );
        peer.frame_buffer.insert(11, buffered_frame(now));

        assert_eq!(peer.discard_stale_buffered_frames(now), 1);
        assert_eq!(peer.late_playback_frames, 1);
        assert_eq!(peer.playback_resyncs, 1);
        assert_eq!(peer.playout_sequence, None);
        assert!(peer.last_playback_frame.is_none());
        assert!(peer.frame_buffer.contains_key(&11));
    }

    #[test]
    fn peer_join_waits_for_its_own_prebuffer() {
        let now = Instant::now();
        let mut peer = PeerAudioState::default();
        for sequence in 40..40 + JITTER_PREBUFFER_FRAMES as u64 {
            peer.frame_buffer.insert(sequence, buffered_frame(now));
        }

        assert!(peer.start_playout_if_ready());
        assert_eq!(peer.playout_sequence, Some(40));
        assert!(!peer.start_playout_if_ready());
    }

    #[test]
    fn peer_leave_clears_only_live_playout_state() {
        let now = Instant::now();
        let mut peer = PeerAudioState {
            received: 123,
            playout_sequence: Some(7),
            last_playback_frame: Some([0.5; SAMPLES_PER_FRAME]),
            ..PeerAudioState::default()
        };
        peer.frame_buffer.insert(7, buffered_frame(now));

        peer.reset_playout();

        assert_eq!(peer.received, 123);
        assert!(peer.frame_buffer.is_empty());
        assert_eq!(peer.playout_sequence, None);
        assert!(peer.last_playback_frame.is_none());
    }

    #[test]
    fn jitter_buffer_targets_ten_milliseconds() {
        let peer = PeerAudioState::default();
        assert_eq!(JITTER_PREBUFFER_FRAMES, 4);
        assert_eq!(JITTER_TARGET_FRAMES, 4);
        assert_eq!(JITTER_MAX_FRAMES, 6);
        assert_eq!(peer.jitter_target_frames, 4);
    }

    #[test]
    fn departure_concealment_is_separate_from_network_concealment() {
        let mut peer = PeerAudioState {
            concealed_frames: 4,
            current_gap_concealed_frames: 3,
            playout_sequence: Some(10),
            ..PeerAudioState::default()
        };

        peer.mark_departed();
        assert!(peer.departed);
        assert_eq!(peer.concealed_frames, 1);
        assert_eq!(peer.departure_concealed_frames, 3);
        assert_eq!(peer.playout_sequence, None);
    }

    #[test]
    fn opus_round_trip_uses_exactly_one_two_and_a_half_millisecond_frame() {
        let mut encoder =
            Encoder::builder(SAMPLE_RATE, Channels::Mono, Application::RestrictedLowDelay)
                .bitrate(Bitrate::Bits(128_000))
                .build()
                .unwrap();
        let mut decoder = Decoder::new(SAMPLE_RATE, Channels::Mono).unwrap();
        let input = [0.1_f32; SAMPLES_PER_FRAME];
        let mut packet = [0_u8; OPUS_MAX_PACKET_BYTES];
        let bytes = encoder.encode_float(&input, &mut packet).unwrap();
        let mut output = [0.0_f32; SAMPLES_PER_FRAME];
        let decoded = decoder
            .decode_float(&packet[..bytes], &mut output, DecodeMode::Normal)
            .unwrap();
        let mut plc_output = [0.0_f32; SAMPLES_PER_FRAME];
        let plc_decoded = decoder
            .decode_float(&[], &mut plc_output, DecodeMode::Normal)
            .unwrap();

        assert_eq!(FRAME_DURATION_MICROS, 2_500);
        assert_eq!(SAMPLES_PER_FRAME, 120);
        assert_eq!(decoded, SAMPLES_PER_FRAME);
        assert_eq!(plc_decoded, SAMPLES_PER_FRAME);
        assert!(plc_output.iter().all(|sample| sample.is_finite()));
        assert!(bytes < PCM_FRAME_BYTES);
        assert!(output.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn bundled_ice_description_selects_only_the_requested_target() {
        let bundle = concat!(
            "@@ultra-sync-target:1@@\nfirst-description\n",
            "@@ultra-sync-target:3@@\nthird-description\n"
        );
        assert_eq!(
            ice_description_for_target(bundle, 1),
            Some("first-description")
        );
        assert_eq!(
            ice_description_for_target(bundle, 3),
            Some("third-description")
        );
        assert_eq!(ice_description_for_target(bundle, 2), None);
    }

    #[test]
    fn remote_mixer_limits_three_full_scale_peers_without_clipping() {
        let frames = [
            [1.0; SAMPLES_PER_FRAME],
            [1.0; SAMPLES_PER_FRAME],
            [1.0; SAMPLES_PER_FRAME],
        ];
        let mixed = mix_remote_frames(&frames);
        assert!(mixed.iter().all(|sample| sample.is_finite()));
        assert!(mixed.iter().all(|sample| sample.abs() <= 0.98));
    }

    #[test]
    fn mr_track_is_mixed_only_when_local_playback_is_started() {
        let mut track = MrTrack {
            performance_id: 77,
            samples: vec![0.5; SAMPLES_PER_FRAME],
            position: 0,
            playing: false,
            gain: 0.72,
        };
        let mut output = [0.0; SAMPLES_PER_FRAME];
        assert!(!track.mix_next_frame(&mut output));
        assert!(output.iter().all(|sample| *sample == 0.0));

        track.playing = true;
        assert!(track.mix_next_frame(&mut output));
        assert!(output.iter().all(|sample| (*sample - 0.36).abs() < 0.0001));
        assert!(!track.playing);
    }

    #[test]
    fn adaptive_resampler_interpolates_while_consuming_faster() {
        let (mut producer, mut consumer) = ring_buffer(32);
        for sample in 0..20 {
            producer.push(sample as f32).unwrap();
        }
        let mut resampler = AdaptiveResampler::default();
        let output: Vec<_> = (0..4)
            .map(|_| resampler.render(&mut consumer, 1.5).unwrap())
            .collect();
        assert_eq!(output, vec![0.0, 1.5, 3.0, 4.5]);
    }

    #[test]
    fn disabled_karaoke_effects_preserve_samples_exactly() {
        let config = EffectsConfig {
            output_gain: 1.0,
            dry: 1.0,
            echo: 0.0,
            echo_delay_ms: 110.0,
            echo_feedback: 0.0,
            reverb: 0.0,
            reverb_time_seconds: 1.2,
        };
        let mut effects = KaraokeEffects::new(config);
        let mut frame = [0.25; SAMPLES_PER_FRAME];
        effects.process_frame(&mut frame);
        assert_eq!(frame, [0.25; SAMPLES_PER_FRAME]);
    }

    #[test]
    fn echo_keeps_dry_impulse_immediate_and_delays_only_wet_signal() {
        let config = EffectsConfig {
            output_gain: 1.0,
            dry: 1.0,
            echo: 0.5,
            echo_delay_ms: 50.0,
            echo_feedback: 0.0,
            reverb: 0.0,
            reverb_time_seconds: 1.2,
        };
        let mut effects = KaraokeEffects::new(config);
        let mut rendered = Vec::new();
        for frame_index in 0..21 {
            let mut frame = [0.0; SAMPLES_PER_FRAME];
            if frame_index == 0 {
                frame[0] = 1.0;
            }
            effects.process_frame(&mut frame);
            rendered.extend(frame);
        }
        assert!((rendered[0] - 0.92).abs() < 0.0001);
        assert!(rendered[1..2_400].iter().all(|&sample| sample == 0.0));
        assert!((0.45..=0.5).contains(&rendered[2_400]));
    }

    #[test]
    fn effect_gain_is_limited_without_hard_clipping() {
        let config = EffectsConfig {
            output_gain: 1.5,
            dry: 1.0,
            echo: 0.4,
            echo_delay_ms: 50.0,
            echo_feedback: 0.2,
            reverb: 0.4,
            reverb_time_seconds: 1.2,
        };
        let mut effects = KaraokeEffects::new(config);
        let mut frame = [1.0; SAMPLES_PER_FRAME];
        effects.process_frame(&mut frame);

        assert!(frame.iter().all(|sample| sample.is_finite()));
        assert!(frame.iter().all(|sample| sample.abs() <= 0.92));
    }

    #[test]
    fn peer_receive_mix_applies_local_volume_and_mute() {
        let mut mix = PeerReceiveMix::new(PeerMixSettings::default());
        mix.update(PeerMixSettings {
            volume_percent: 50.0,
            echo_percent: 0.0,
            reverb_percent: 0.0,
            muted: false,
        });
        let mut frame = [0.4_f32; SAMPLES_PER_FRAME];
        assert!(mix.process(&mut frame));
        assert!(frame.iter().all(|sample| (*sample - 0.2).abs() < 0.0001));

        mix.update(PeerMixSettings {
            muted: true,
            ..PeerMixSettings::default()
        });
        assert!(!mix.process(&mut frame));
    }

    #[test]
    fn mr_track_uses_the_selected_local_gain() {
        let mut track = MrTrack {
            performance_id: 78,
            samples: vec![0.5; SAMPLES_PER_FRAME],
            position: 0,
            playing: true,
            gain: 0.4,
        };
        let mut output = [0.0; SAMPLES_PER_FRAME];
        assert!(track.mix_next_frame(&mut output));
        assert!(output.iter().all(|sample| (*sample - 0.2).abs() < 0.0001));
    }

    #[test]
    fn playback_policy_uses_peer_jitter_as_the_only_startup_prebuffer() {
        let five_ms = playback_policy_for_output_period(240);
        assert_eq!(five_ms.prebuffer_samples, 0);
        assert_eq!(five_ms.target_queue_samples, 240);

        let ten_ms = playback_policy_for_output_period(480);
        assert_eq!(ten_ms.prebuffer_samples, 0);
        assert_eq!(ten_ms.target_queue_samples, 480);

        let below_packet_size = playback_policy_for_output_period(120);
        assert_eq!(below_packet_size.prebuffer_samples, 0);
        assert_eq!(below_packet_size.target_queue_samples, 120);
    }
}
