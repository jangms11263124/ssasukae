#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;
mod diagnostics;
mod mr;
mod protocol_registration;
mod single_instance;

use audio_client::{
    enumerate_audio_devices, measure_input_peak, play_output_test, run_embedded,
    AudioDeviceCatalog, AudioDeviceInfo, EffectSettings, EmbeddedCommand, EmbeddedConfig,
    EmbeddedEvent, PeerMixSettings,
};
use backend::{
    create_low_latency_app_session, spawn_backend, spawn_mock_backend, BackendCommand,
    BackendConfig, BackendEvent, LowLatencyAppSession,
};
use eframe::egui::{self, Color32, RichText, Stroke, Vec2};
use std::{
    collections::BTreeMap,
    env, fs,
    sync::mpsc::{self, Receiver, Sender},
    thread,
    time::{Duration, Instant},
};

const CYAN: Color32 = Color32::from_rgb(0, 238, 239);
const PURPLE: Color32 = Color32::from_rgb(255, 18, 247);
const GREEN: Color32 = Color32::from_rgb(61, 220, 132);
const RED: Color32 = Color32::from_rgb(255, 82, 82);
const BACKGROUND: Color32 = Color32::from_rgb(8, 9, 10);
const PANEL: Color32 = Color32::from_rgb(25, 26, 28);
const PANEL_ALT: Color32 = Color32::from_rgb(32, 33, 35);
const BORDER: Color32 = Color32::from_rgb(70, 73, 75);
const MUTED: Color32 = Color32::from_rgb(151, 153, 156);
const PRODUCTION_BACKEND_URL: &str = "https://ssafystar-k.site";
const PRODUCTION_RENDEZVOUS_SERVER: &str = "15.165.205.31:50000";
const LEAVE_TIMEOUT: Duration = Duration::from_secs(3);

fn main() -> eframe::Result {
    if let Some(action) = protocol_registration::requested_action() {
        if let Err(error) = protocol_registration::apply(action) {
            eprintln!("Failed to update ssafystar:// registration: {error}");
        }
        return Ok(());
    }
    if let Err(error) = protocol_registration::ensure_current_executable() {
        eprintln!("Failed to register ssafystar:// protocol: {error}");
    }
    let instance_guard = match single_instance::acquire() {
        Ok(Some(guard)) => guard,
        Ok(None) => {
            eprintln!("SSAFY STAR Low Latency Audio is already running.");
            return Ok(());
        }
        Err(error) => {
            eprintln!("Failed to create the application instance lock: {error}");
            return Ok(());
        }
    };
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1200.0, 760.0])
            .with_min_inner_size([1080.0, 700.0])
            .with_title("SSAFY STAR · LOW LATENCY AUDIO"),
        ..Default::default()
    };
    eframe::run_native(
        "SSAFY STAR LOW LATENCY AUDIO",
        options,
        Box::new(move |cc| Ok(Box::new(App::new(cc, instance_guard)))),
    )
}

fn install_korean_font(ctx: &egui::Context) {
    let Ok(bytes) = fs::read(r"C:\Windows\Fonts\malgun.ttf") else {
        return;
    };
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "malgun-gothic".into(),
        egui::FontData::from_owned(bytes).into(),
    );
    for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
        fonts
            .families
            .entry(family)
            .or_default()
            .insert(0, "malgun-gothic".into());
    }
    ctx.set_fonts(fonts);
}

#[derive(Clone)]
struct LaunchContext {
    room_id: String,
    room_name: String,
    invite_code: String,
    session_id: u64,
    nickname: String,
    server: String,
    backend_url: String,
    backend_ws_url: Option<String>,
    auth_token: String,
    app_refresh_token: Option<String>,
    access_token_expires_in_seconds: Option<u64>,
}

impl LaunchContext {
    fn preview() -> Self {
        Self {
            room_id: "55001".into(),
            room_name: "노래하자~".into(),
            invite_code: "A24G2T".into(),
            session_id: 55_001,
            nickname: "유진".into(),
            server: PRODUCTION_RENDEZVOUS_SERVER.into(),
            backend_url: "http://localhost:8080".into(),
            backend_ws_url: None,
            auth_token: "preview-only".into(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        }
    }

    fn from_process_args() -> Result<Option<Self>, String> {
        let args: Vec<String> = env::args().skip(1).collect();
        if args.is_empty() || args.first().is_some_and(|value| value == "--ui-waiting") {
            return Ok(None);
        }
        if args.first().is_some_and(|value| value == "--ui-preview") {
            return Ok(Some(Self::preview()));
        }

        let uri_values = args
            .iter()
            .find(|value| value.starts_with("ssafystar://"))
            .map(|value| parse_launch_uri(value))
            .unwrap_or_default();
        let argument_value = |name: &str| {
            args.windows(2)
                .find(|pair| pair[0] == name)
                .map(|pair| pair[1].clone())
        };
        let value = |name: &str, uri_key: &str| {
            argument_value(name).or_else(|| uri_values.get(uri_key).cloned())
        };

        let any_launch_value = args.iter().any(|value| {
            value.starts_with("ssafystar://")
                || matches!(
                    value.as_str(),
                    "--room-id" | "--session-id" | "--invite-code" | "--auth-token"
                )
        });
        if !any_launch_value {
            return Ok(None);
        }

        let required =
            |name: &str, uri_key: &str| {
                value(name, uri_key).filter(|value| !value.trim().is_empty()).ok_or_else(|| {
                format!("웹 실행 정보에 {name} 값이 없습니다. 웹에서 방 입장을 다시 시도해주세요.")
            })
            };
        let room_id = required("--room-id", "roomId")?;
        let room_name = value("--room-name", "roomName").unwrap_or_else(|| "저지연 방".into());
        let invite_code = value("--invite-code", "inviteCode").unwrap_or_default();
        let session_id = value("--session-id", "sessionId")
            .unwrap_or_else(|| room_id.clone())
            .parse::<u64>()
            .map_err(|_| "웹 실행 정보의 세션 번호가 올바르지 않습니다.".to_owned())?;
        let nickname = value("--nickname", "nickname").unwrap_or_else(|| "참가자".into());
        let auth_token = value("--auth-token", "authToken")
            .or_else(|| env::var("SSAFYSTAR_ACCESS_TOKEN").ok())
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                "앱 실행 정보에 access token이 없습니다. 테스트 실행기에서 토큰을 입력해주세요."
                    .to_owned()
            })?;
        let server =
            value("--server", "server").unwrap_or_else(|| PRODUCTION_RENDEZVOUS_SERVER.to_owned());
        let backend_url = value("--backend-url", "backendUrl")
            .or_else(|| env::var("SSAFYSTAR_BACKEND_URL").ok())
            .unwrap_or_else(|| PRODUCTION_BACKEND_URL.to_owned());
        let backend_ws_url = argument_value("--backend-ws-url")
            .or_else(|| env::var("SSAFYSTAR_BACKEND_WS_URL").ok());
        if room_id
            .parse::<u64>()
            .ok()
            .filter(|value| *value > 0)
            .is_none()
        {
            return Err("앱 실행 정보의 방 번호는 양의 정수여야 합니다.".into());
        }
        if session_id == 0 {
            return Err("웹 실행 정보의 세션 번호는 0일 수 없습니다.".into());
        }
        Ok(Some(Self {
            room_id,
            room_name,
            invite_code,
            session_id,
            nickname,
            server,
            backend_url,
            backend_ws_url,
            auth_token,
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        }))
    }
}

fn parse_launch_uri(uri: &str) -> BTreeMap<String, String> {
    uri.split_once('?')
        .map(|(_, query)| {
            query
                .split('&')
                .filter_map(|pair| {
                    let (key, value) = pair.split_once('=')?;
                    Some((percent_decode(key), percent_decode(value)))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => output.push(b' '),
            b'%' if index + 2 < bytes.len() => {
                if let Ok(decoded) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                    output.push(decoded);
                    index += 2;
                } else {
                    output.push(bytes[index]);
                }
            }
            byte => output.push(byte),
        }
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Waiting,
    Connecting,
    Room,
    Error,
}

#[derive(Clone)]
struct Participant {
    name: String,
    connected: bool,
    is_me: bool,
}

#[derive(Clone, Copy)]
struct PeerMixControl {
    volume: f32,
    echo: f32,
    reverb: f32,
    muted: bool,
}

impl Default for PeerMixControl {
    fn default() -> Self {
        Self {
            volume: 100.0,
            echo: 8.0,
            reverb: 0.0,
            muted: false,
        }
    }
}

impl From<PeerMixControl> for PeerMixSettings {
    fn from(value: PeerMixControl) -> Self {
        Self {
            volume_percent: value.volume,
            echo_percent: value.echo,
            reverb_percent: value.reverb,
            muted: value.muted,
        }
    }
}

#[derive(Clone)]
struct Song {
    song_id: u64,
    title: String,
    artist: String,
    duration_seconds: u32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PlaybackState {
    Idle,
    Ready,
    Playing,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SongFilter {
    All,
    Popular,
    Recommend,
}

impl SongFilter {
    fn api_value(self) -> &'static str {
        match self {
            Self::All => "ALL",
            Self::Popular => "POPULAR",
            Self::Recommend => "RECOMMEND",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::All => "전체",
            Self::Popular => "인기",
            Self::Recommend => "추천",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MrState {
    Idle,
    Downloading,
    Ready,
    Playing,
    Failed,
}

enum WorkerEvent {
    Client(EmbeddedEvent),
    Failed(String),
}

enum DevicePreviewEvent {
    Input(Result<f32, String>),
    Output(Result<(), String>),
}

struct App {
    _instance_guard: single_instance::InstanceGuard,
    screen: Screen,
    launch: Option<LaunchContext>,
    preview: bool,
    backend_only_test: bool,
    start_pending: bool,
    leaving: bool,
    close_pending: bool,
    audio_leave_finished: bool,
    backend_leave_finished: bool,
    leave_deadline: Option<Instant>,
    error_message: String,
    status: String,
    client_id: Option<u64>,
    participants: BTreeMap<u64, Participant>,
    command_tx: Option<Sender<EmbeddedCommand>>,
    event_rx: Option<Receiver<WorkerEvent>>,
    app_session_rx: Option<Receiver<Result<LowLatencyAppSession, String>>>,
    backend_command_tx: Option<Sender<BackendCommand>>,
    backend_event_rx: Option<Receiver<BackendEvent>>,
    backend_connected: bool,
    mic_gain: f32,
    dry: f32,
    echo: f32,
    echo_delay: f32,
    echo_feedback: f32,
    reverb: f32,
    reverb_time: f32,
    microphone_muted: bool,
    peer_mix_controls: BTreeMap<u64, PeerMixControl>,
    mr_volume: f32,
    ping_ms: Option<f64>,
    concealment_percent: f64,
    underruns: u64,
    resyncs: u64,
    connected_peers: usize,
    song_query: String,
    song_catalog: Vec<Song>,
    song_search_open: bool,
    song_search_loading: bool,
    song_filter: SongFilter,
    song_next_cursor: Option<u64>,
    recent_song_queries: Vec<String>,
    selected_song_id: Option<u64>,
    selected_song: Option<Song>,
    prepared_song: Option<Song>,
    active_performance_id: Option<u64>,
    playback_state: PlaybackState,
    song_status: String,
    mr_state: MrState,
    mr_event_tx: Sender<mr::MrEvent>,
    mr_event_rx: Receiver<mr::MrEvent>,
    pending_mr_start: Option<u64>,
    mr_duration: Option<Duration>,
    mr_end_deadline: Option<Instant>,
    local_prepare_song_id: Option<u64>,
    controls_active_performance: bool,
    cancel_confirmation_open: bool,
    cancel_request_pending: bool,
    authentication_required: bool,
    replacement_access_token: String,
    mr_ready_clients: usize,
    mr_total_clients: usize,
    mr_waiting_clients: Vec<u64>,
    mr_mismatched_clients: Vec<u64>,
    mr_timeout_remaining_seconds: Option<u64>,
    mr_sync_error: Option<String>,
    mr_leader_id: Option<u64>,
    mr_scheduled_in_ms: Option<u64>,
    mr_drift_correction_samples: i64,
    mr_cache_hit: bool,
    audio_device_status: String,
    audio_devices: AudioDeviceCatalog,
    selected_input_device_id: Option<String>,
    selected_output_device_id: Option<String>,
    device_settings_open: bool,
    device_preview_status: String,
    device_preview_rx: Option<Receiver<DevicePreviewEvent>>,
    input_peak_dbfs: f32,
    input_clipping: bool,
    input_clipped_samples: u64,
    diagnostics: Option<diagnostics::Diagnostics>,
    last_diagnostic_metrics: Instant,
}

impl App {
    fn new(
        cc: &eframe::CreationContext<'_>,
        instance_guard: single_instance::InstanceGuard,
    ) -> Self {
        install_korean_font(&cc.egui_ctx);
        let mut visuals = egui::Visuals::dark();
        visuals.panel_fill = BACKGROUND;
        visuals.window_fill = PANEL;
        visuals.extreme_bg_color = Color32::from_rgb(12, 13, 14);
        visuals.faint_bg_color = PANEL_ALT;
        visuals.widgets.inactive.bg_fill = Color32::from_rgb(36, 38, 40);
        visuals.widgets.inactive.bg_stroke = Stroke::new(1.0_f32, BORDER);
        visuals.widgets.hovered.bg_fill = Color32::from_rgb(45, 49, 51);
        visuals.widgets.hovered.bg_stroke = Stroke::new(1.0_f32, CYAN);
        visuals.widgets.active.bg_fill = Color32::from_rgb(24, 72, 74);
        visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, CYAN);
        visuals.selection.bg_fill = PURPLE;
        visuals.override_text_color = Some(Color32::from_rgb(225, 227, 229));
        visuals.window_corner_radius = 0.0.into();
        cc.egui_ctx.set_visuals(visuals);

        let args: Vec<String> = env::args().collect();
        let preview = args.iter().any(|value| value == "--ui-preview");
        let mock_spring_test = args.iter().any(|value| value == "--mock-spring-test");
        let backend_only_test =
            mock_spring_test || args.iter().any(|value| value == "--backend-only-test");
        let forced_error = args.iter().any(|value| value == "--ui-error");
        let forced_connecting = args.iter().any(|value| value == "--ui-connecting");
        let launch_result = if mock_spring_test {
            spawn_mock_backend().map(|mock| {
                let mut launch = LaunchContext::preview();
                launch.room_id = "1".into();
                launch.room_name = "Mock Spring Test".into();
                launch.invite_code = "MOCK".into();
                launch.backend_url = mock.base_url;
                launch.backend_ws_url = Some(mock.websocket_url);
                launch.auth_token = "mock-access-token".into();
                Some(launch)
            })
        } else if forced_error {
            Err("방 인증 정보가 만료되었습니다. 웹에서 초대 코드를 다시 입력해주세요.".into())
        } else if forced_connecting {
            Ok(Some(LaunchContext::preview()))
        } else {
            LaunchContext::from_process_args()
        };
        let (screen, launch, error_message, start_pending) = match launch_result {
            Ok(Some(launch)) if preview || mock_spring_test => {
                (Screen::Room, Some(launch), String::new(), false)
            }
            Ok(Some(launch)) if forced_connecting => {
                (Screen::Connecting, Some(launch), String::new(), false)
            }
            Ok(Some(launch)) => (Screen::Connecting, Some(launch), String::new(), true),
            Ok(None) => (Screen::Waiting, None, String::new(), false),
            Err(error) => (Screen::Error, None, error, false),
        };
        let (mr_event_tx, mr_event_rx) = mpsc::channel();
        let diagnostics = launch.as_ref().and_then(|launch| {
            diagnostics::Diagnostics::start(launch.room_id.clone(), launch.session_id).ok()
        });
        let audio_devices = enumerate_audio_devices().unwrap_or_default();
        let mut app = Self {
            _instance_guard: instance_guard,
            screen,
            launch,
            preview,
            backend_only_test,
            start_pending,
            leaving: false,
            close_pending: false,
            audio_leave_finished: false,
            backend_leave_finished: false,
            leave_deadline: None,
            error_message,
            status: if backend_only_test {
                "저지연 방 연결 완료 · 실험 모드에서는 오디오 장치만 미실행".into()
            } else if screen == Screen::Room {
                "직접 P2P 오디오 연결 완료".into()
            } else {
                "웹의 방 입장 요청을 기다리고 있습니다".into()
            },
            client_id: (preview || mock_spring_test).then_some(1),
            participants: BTreeMap::new(),
            command_tx: None,
            event_rx: None,
            app_session_rx: None,
            backend_command_tx: None,
            backend_event_rx: None,
            backend_connected: preview,
            mic_gain: 100.0,
            dry: 100.0,
            echo: 15.0,
            echo_delay: 90.0,
            echo_feedback: 18.0,
            reverb: 5.5,
            reverb_time: 1.2,
            microphone_muted: false,
            peer_mix_controls: BTreeMap::new(),
            mr_volume: 72.0,
            ping_ms: preview.then_some(12.0),
            concealment_percent: 0.0,
            underruns: 0,
            resyncs: 0,
            connected_peers: if preview || mock_spring_test { 2 } else { 0 },
            song_query: String::new(),
            song_catalog: if preview {
                vec![
                    Song {
                        song_id: 101,
                        title: "SKYFALL".into(),
                        artist: "Adele".into(),
                        duration_seconds: 286,
                    },
                    Song {
                        song_id: 102,
                        title: "BLINDING LIGHTS".into(),
                        artist: "The Weeknd".into(),
                        duration_seconds: 200,
                    },
                    Song {
                        song_id: 103,
                        title: "BOHEMIAN RHAPSODY".into(),
                        artist: "Queen".into(),
                        duration_seconds: 354,
                    },
                ]
            } else {
                Vec::new()
            },
            song_search_open: args.iter().any(|value| value == "--ui-song-modal"),
            song_search_loading: false,
            song_filter: SongFilter::All,
            song_next_cursor: None,
            recent_song_queries: Vec::new(),
            selected_song_id: None,
            selected_song: None,
            prepared_song: None,
            active_performance_id: None,
            playback_state: PlaybackState::Idle,
            song_status: if preview {
                "곡을 검색하고 선택해주세요".into()
            } else {
                "웹 서비스의 곡 검색 연결을 기다리고 있습니다".into()
            },
            mr_state: MrState::Idle,
            mr_event_tx,
            mr_event_rx,
            pending_mr_start: None,
            mr_duration: None,
            mr_end_deadline: None,
            local_prepare_song_id: None,
            controls_active_performance: false,
            cancel_confirmation_open: false,
            cancel_request_pending: false,
            authentication_required: false,
            replacement_access_token: String::new(),
            mr_ready_clients: 0,
            mr_total_clients: 0,
            mr_waiting_clients: Vec::new(),
            mr_mismatched_clients: Vec::new(),
            mr_timeout_remaining_seconds: None,
            mr_sync_error: None,
            mr_leader_id: None,
            mr_scheduled_in_ms: None,
            mr_drift_correction_samples: 0,
            mr_cache_hit: false,
            audio_device_status: if backend_only_test {
                "실험 모드 · 장치 미실행".into()
            } else {
                "WASAPI 장치 준비 중".into()
            },
            audio_devices,
            selected_input_device_id: None,
            selected_output_device_id: None,
            device_settings_open: args.iter().any(|value| value == "--ui-device-settings"),
            device_preview_status: "장치를 선택한 뒤 입력 레벨과 출력음을 확인할 수 있습니다."
                .into(),
            device_preview_rx: None,
            input_peak_dbfs: if preview { -18.0 } else { -60.0 },
            input_clipping: false,
            input_clipped_samples: 0,
            diagnostics,
            last_diagnostic_metrics: Instant::now(),
        };
        if preview || mock_spring_test {
            app.participants.extend([
                (
                    1,
                    Participant {
                        name: "유진".into(),
                        connected: true,
                        is_me: true,
                    },
                ),
                (
                    2,
                    Participant {
                        name: "민석".into(),
                        connected: true,
                        is_me: false,
                    },
                ),
                (
                    3,
                    Participant {
                        name: "현호".into(),
                        connected: true,
                        is_me: false,
                    },
                ),
            ]);
        }
        if mock_spring_test {
            if let Some(launch) = app.launch.clone() {
                app.start_backend(&launch);
            }
        }
        app
    }

    fn ensure_diagnostics(&mut self, launch: &LaunchContext) {
        if self.diagnostics.is_none() {
            self.diagnostics =
                diagnostics::Diagnostics::start(launch.room_id.clone(), launch.session_id).ok();
        }
    }

    fn diagnostic(&self, event: &str, details: serde_json::Value) {
        if let Some(diagnostics) = &self.diagnostics {
            diagnostics.event(event, details);
        }
    }

    fn client_labels(&self, client_ids: &[u64]) -> String {
        client_ids
            .iter()
            .map(|client_id| {
                self.participants
                    .get(client_id)
                    .map(|participant| participant.name.clone())
                    .unwrap_or_else(|| format!("CLIENT {client_id}"))
            })
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn mr_sync_failure_message(&self) -> String {
        let mut reasons = Vec::new();
        if !self.mr_waiting_clients.is_empty() {
            reasons.push(format!(
                "MR 준비 응답 없음: {}",
                self.client_labels(&self.mr_waiting_clients)
            ));
        }
        if !self.mr_mismatched_clients.is_empty() {
            reasons.push(format!(
                "MR 파일 불일치: {}",
                self.client_labels(&self.mr_mismatched_clients)
            ));
        }
        if reasons.is_empty() {
            "MR 준비 시간이 초과되었습니다".into()
        } else if !self.mr_mismatched_clients.is_empty() {
            format!("MR 파일 불일치로 재생 중단 · {}", reasons.join(" · "))
        } else {
            format!("MR 준비 시간 초과 · {}", reasons.join(" · "))
        }
    }

    fn start_client(&mut self) {
        let Some(launch) = self.launch.clone() else {
            self.fail("웹에서 전달된 방 정보가 없습니다.");
            return;
        };
        if launch.auth_token.trim().is_empty() {
            self.fail("방 인증 정보가 없습니다. 웹에서 다시 입장해주세요.");
            return;
        }
        self.screen = Screen::Connecting;
        self.status = "Spring Boot에서 저지연 방 실행 정보를 확인하고 있습니다".into();
        self.leaving = false;
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let room_id = launch
                .room_id
                .parse::<u64>()
                .map_err(|_| "방 번호가 올바르지 않습니다".to_owned())
                .and_then(|room_id| {
                    create_low_latency_app_session(&launch.backend_url, room_id, &launch.auth_token)
                });
            let _ = tx.send(room_id);
        });
        self.app_session_rx = Some(rx);
    }

    fn poll_app_session(&mut self) {
        let result = self
            .app_session_rx
            .as_ref()
            .and_then(|receiver| receiver.try_recv().ok());
        let Some(result) = result else {
            return;
        };
        self.app_session_rx = None;
        match result {
            Ok(session) => {
                let participant_id = session.participant_id;
                let Some(mut launch) = self.launch.clone() else {
                    self.fail("저지연 방 실행 정보를 적용하지 못했습니다");
                    return;
                };
                launch.room_id = session.room_id.to_string();
                launch.room_name = session.room_name;
                launch.invite_code = session.invite_code;
                launch.session_id = session.session_id;
                launch.nickname = session.nickname;
                launch.server = session.rendezvous_server;
                launch.auth_token = session.access_token;
                launch.app_refresh_token = Some(session.app_refresh_token);
                launch.access_token_expires_in_seconds =
                    Some(session.access_token_expires_in_seconds);
                self.launch = Some(launch.clone());
                self.diagnostic(
                    "app_session_created",
                    serde_json::json!({ "participantId": participant_id }),
                );
                self.start_connected_client(launch);
            }
            Err(error) => self.fail(&error),
        }
    }

    fn start_connected_client(&mut self, launch: LaunchContext) {
        self.ensure_diagnostics(&launch);
        self.diagnostic(
            "client_starting",
            serde_json::json!({ "relayServer": &launch.server }),
        );
        self.status = "오디오 장치와 P2P 경로를 준비하고 있습니다".into();
        self.start_backend(&launch);
        if self.backend_only_test {
            self.screen = Screen::Room;
            self.status = "저지연 방 인증 완료 · 실험 모드에서는 오디오 장치만 미실행".into();
            return;
        }
        let (command_tx, command_rx) = mpsc::channel();
        let (event_tx, event_rx) = mpsc::channel();
        let (worker_tx, worker_rx) = mpsc::channel();
        let config = EmbeddedConfig {
            server: launch.server,
            session_id: launch.session_id,
            nickname: launch.nickname,
            mic_gain_percent: self.mic_gain,
            dry_percent: self.dry,
            echo_percent: self.echo,
            echo_delay_ms: self.echo_delay,
            echo_feedback_percent: self.echo_feedback,
            reverb_percent: self.reverb,
            reverb_time_seconds: self.reverb_time,
            input_device_id: self.selected_input_device_id.clone(),
            output_device_id: self.selected_output_device_id.clone(),
        };
        thread::spawn(move || {
            let forward_tx = worker_tx.clone();
            thread::spawn(move || {
                while let Ok(event) = event_rx.recv() {
                    if forward_tx.send(WorkerEvent::Client(event)).is_err() {
                        break;
                    }
                }
            });
            if let Err(error) = run_embedded(config, command_rx, event_tx) {
                let _ = worker_tx.send(WorkerEvent::Failed(error.to_string()));
            }
        });
        self.command_tx = Some(command_tx);
        self.event_rx = Some(worker_rx);
    }

    fn start_backend(&mut self, launch: &LaunchContext) {
        if self.preview {
            return;
        }
        self.stop_backend();
        let Ok(room_id) = launch.room_id.parse::<u64>() else {
            self.song_status = "Spring 연동에 사용할 방 번호가 올바르지 않습니다".into();
            return;
        };
        let handle = spawn_backend(BackendConfig {
            base_url: launch.backend_url.clone(),
            websocket_url: launch.backend_ws_url.clone(),
            room_id,
            access_token: launch.auth_token.clone(),
            app_refresh_token: launch.app_refresh_token.clone(),
            access_token_expires_in_seconds: launch.access_token_expires_in_seconds,
        });
        self.backend_command_tx = Some(handle.command_tx);
        self.backend_event_rx = Some(handle.event_rx);
        self.backend_connected = false;
        self.song_status = "Spring Boot 연결 중".into();
    }

    fn stop_backend(&mut self) {
        if let Some(sender) = self.backend_command_tx.take() {
            let _ = sender.send(BackendCommand::Stop);
        }
        self.backend_event_rx = None;
        self.backend_connected = false;
        self.song_search_loading = false;
    }

    fn poll_events(&mut self) {
        let mut pending = Vec::new();
        if let Some(receiver) = &self.event_rx {
            while let Ok(event) = receiver.try_recv() {
                pending.push(event);
            }
        }
        for event in pending {
            match event {
                WorkerEvent::Client(EmbeddedEvent::Registered { client_id }) => {
                    self.client_id = Some(client_id);
                    let name = self
                        .launch
                        .as_ref()
                        .map(|launch| launch.nickname.clone())
                        .unwrap_or_else(|| "나".into());
                    self.participants.insert(
                        client_id,
                        Participant {
                            name,
                            connected: true,
                            is_me: true,
                        },
                    );
                    self.screen = Screen::Room;
                    self.status = "오디오 방 연결 완료".into();
                    self.audio_device_status = "WASAPI 작동 중".into();
                    self.diagnostic(
                        "client_registered",
                        serde_json::json!({ "clientId": client_id }),
                    );
                }
                WorkerEvent::Client(EmbeddedEvent::PeerName {
                    client_id,
                    nickname,
                }) => {
                    self.participants
                        .entry(client_id)
                        .and_modify(|participant| participant.name = nickname.clone())
                        .or_insert(Participant {
                            name: nickname,
                            connected: false,
                            is_me: false,
                        });
                }
                WorkerEvent::Client(EmbeddedEvent::PeerConnection {
                    client_id,
                    connected,
                }) => {
                    self.participants
                        .entry(client_id)
                        .and_modify(|participant| participant.connected = connected)
                        .or_insert(Participant {
                            name: format!("참가자 {client_id}"),
                            connected,
                            is_me: false,
                        });
                    self.diagnostic(
                        "peer_connection",
                        serde_json::json!({
                            "clientId": client_id,
                            "connected": connected,
                        }),
                    );
                }
                WorkerEvent::Client(EmbeddedEvent::Metrics {
                    connected_peers,
                    ping_ms,
                    concealment_percent,
                    underruns,
                    local_monitor_underruns,
                    resyncs,
                }) => {
                    self.connected_peers = connected_peers;
                    self.ping_ms = ping_ms;
                    self.concealment_percent = concealment_percent;
                    self.underruns = underruns;
                    self.resyncs = resyncs;
                    if self.last_diagnostic_metrics.elapsed() >= Duration::from_secs(5) {
                        self.last_diagnostic_metrics = Instant::now();
                        self.diagnostic(
                            "audio_metrics",
                            serde_json::json!({
                                "connectedPeers": connected_peers,
                                "pingMs": ping_ms,
                                "concealmentPercent": concealment_percent,
                                "underruns": underruns,
                                "localMonitorUnderruns": local_monitor_underruns,
                                "resyncs": resyncs,
                            }),
                        );
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::MrFinished { performance_id }) => {
                    self.finish_local_performance(performance_id);
                }
                WorkerEvent::Client(EmbeddedEvent::MrStarted { performance_id }) => {
                    if self.active_performance_id == Some(performance_id) {
                        self.mr_state = MrState::Playing;
                        self.mr_end_deadline =
                            self.mr_duration.map(|duration| Instant::now() + duration);
                        self.mr_scheduled_in_ms = None;
                        self.song_status =
                            "모든 P2P 참가자와 동기화하여 MR 재생을 시작했습니다".into();
                        self.diagnostic(
                            "mr_started",
                            serde_json::json!({ "performanceId": performance_id }),
                        );
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::MrCancelled { performance_id }) => {
                    if self.active_performance_id == Some(performance_id) {
                        self.reset_finished_performance();
                        self.cancel_request_pending = false;
                        self.song_status = "노래 시작자가 재생을 취소했습니다".into();
                        self.diagnostic(
                            "mr_cancelled",
                            serde_json::json!({ "performanceId": performance_id }),
                        );
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::MrSyncStatus {
                    performance_id,
                    ready_clients,
                    total_clients,
                    waiting_clients,
                    mismatched_clients,
                    timeout_remaining_seconds,
                    leader_id,
                    scheduled_in_ms,
                    drift_correction_samples,
                }) => {
                    if self.active_performance_id == Some(performance_id) {
                        self.mr_ready_clients = ready_clients;
                        self.mr_total_clients = total_clients;
                        self.mr_waiting_clients = waiting_clients;
                        self.mr_mismatched_clients = mismatched_clients;
                        self.mr_timeout_remaining_seconds = timeout_remaining_seconds;
                        self.mr_leader_id = Some(leader_id);
                        self.mr_scheduled_in_ms = scheduled_in_ms;
                        self.mr_drift_correction_samples = drift_correction_samples;
                        if scheduled_in_ms.is_some() || drift_correction_samples != 0 {
                            self.diagnostic(
                                "mr_sync",
                                serde_json::json!({
                                    "performanceId": performance_id,
                                    "readyClients": ready_clients,
                                    "totalClients": total_clients,
                                    "waitingClients": self.mr_waiting_clients,
                                    "mismatchedClients": self.mr_mismatched_clients,
                                    "timeoutRemainingSeconds": timeout_remaining_seconds,
                                    "leaderId": leader_id,
                                    "scheduledInMs": scheduled_in_ms,
                                    "driftCorrectionSamples": drift_correction_samples,
                                }),
                            );
                        }
                        if self.playback_state == PlaybackState::Playing
                            && self.mr_state != MrState::Playing
                        {
                            self.song_status = if let Some(delay) = scheduled_in_ms {
                                format!("MR 동기 재생 예약 · 약 {delay}ms 후 시작")
                            } else if !self.mr_mismatched_clients.is_empty() {
                                format!(
                                    "MR 파일 불일치 · {} · {}초 후 중단",
                                    self.client_labels(&self.mr_mismatched_clients),
                                    timeout_remaining_seconds.unwrap_or(0)
                                )
                            } else if !self.mr_waiting_clients.is_empty() {
                                format!(
                                    "MR 준비 대기 · {} · {}초 남음",
                                    self.client_labels(&self.mr_waiting_clients),
                                    timeout_remaining_seconds.unwrap_or(0)
                                )
                            } else {
                                format!("참가자 MR 준비 대기 · {ready_clients}/{total_clients}")
                            };
                        }
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::MrSyncFailed {
                    performance_id,
                    waiting_clients,
                    mismatched_clients,
                }) => {
                    if self.active_performance_id == Some(performance_id) {
                        self.mr_waiting_clients = waiting_clients;
                        self.mr_mismatched_clients = mismatched_clients;
                        self.mr_timeout_remaining_seconds = Some(0);
                        self.mr_state = MrState::Failed;
                        self.pending_mr_start = None;
                        let message = self.mr_sync_failure_message();
                        self.mr_sync_error = Some(message.clone());
                        self.song_status = message.clone();
                        self.diagnostic(
                            "mr_sync_failed",
                            serde_json::json!({
                                "performanceId": performance_id,
                                "waitingClients": self.mr_waiting_clients,
                                "mismatchedClients": self.mr_mismatched_clients,
                            }),
                        );
                        if self.controls_active_performance {
                            if let Some(sender) = &self.backend_command_tx {
                                let _ =
                                    sender.send(BackendCommand::FinishPlayback { performance_id });
                            }
                        }
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::AudioDeviceRecovery { recovered, message }) => {
                    self.audio_device_status = message.clone();
                    self.status = message.clone();
                    self.diagnostic(
                        "audio_device_recovery",
                        serde_json::json!({ "recovered": recovered, "message": message }),
                    );
                    if recovered {
                        self.status = "오디오 장치가 복구되어 P2P 음성을 계속합니다".into();
                    } else {
                        self.input_peak_dbfs = -60.0;
                        self.input_clipping = false;
                        self.input_clipped_samples = 0;
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::InputLevel {
                    peak_dbfs,
                    clipping,
                    clipped_samples,
                }) => {
                    self.input_peak_dbfs = peak_dbfs;
                    self.input_clipping = clipping;
                    self.input_clipped_samples = clipped_samples;
                    if clipping {
                        self.diagnostic(
                            "microphone_clipping",
                            serde_json::json!({
                                "peakDbfs": peak_dbfs,
                                "clippedSamples": clipped_samples,
                            }),
                        );
                    }
                }
                WorkerEvent::Client(EmbeddedEvent::Stopped) => {
                    self.command_tx = None;
                    self.event_rx = None;
                    self.audio_leave_finished = true;
                    self.maybe_finish_leave();
                }
                WorkerEvent::Failed(error) => {
                    if self.leaving {
                        self.command_tx = None;
                        self.event_rx = None;
                        self.audio_leave_finished = true;
                        self.maybe_finish_leave();
                    } else {
                        self.fail(&friendly_error(&error));
                    }
                }
            }
        }
    }

    fn poll_backend_events(&mut self) {
        let mut pending = Vec::new();
        if let Some(receiver) = &self.backend_event_rx {
            while let Ok(event) = receiver.try_recv() {
                pending.push(event);
            }
        }
        for event in pending {
            match event {
                BackendEvent::Connected => {
                    self.backend_connected = true;
                    self.song_status = "Spring Boot 연결 완료 · 곡을 검색해주세요".into();
                    self.diagnostic("backend_connected", serde_json::json!({}));
                }
                BackendEvent::AuthenticationRequired => {
                    self.song_search_loading = false;
                    self.authentication_required = true;
                    self.song_status =
                        "access JWT가 만료되었습니다 · 새 토큰 전달을 기다리고 있습니다".into();
                    self.diagnostic("backend_authentication_required", serde_json::json!({}));
                }
                BackendEvent::AccessTokenUpdated => {
                    self.authentication_required = false;
                    self.replacement_access_token.clear();
                    self.song_status = "로그인 자동 갱신 완료".into();
                }
                BackendEvent::Disconnected(error) => {
                    self.backend_connected = false;
                    self.song_status = error.clone();
                    self.diagnostic(
                        "backend_disconnected",
                        serde_json::json!({ "message": error }),
                    );
                }
                BackendEvent::SongsLoaded {
                    songs,
                    next_cursor,
                    append,
                } => {
                    let loaded: Vec<Song> = songs
                        .into_iter()
                        .map(|song| Song {
                            song_id: song.song_id,
                            title: song.title,
                            artist: song.artist,
                            duration_seconds: song.duration_seconds,
                        })
                        .collect();
                    if append {
                        for song in loaded {
                            if !self
                                .song_catalog
                                .iter()
                                .any(|existing| existing.song_id == song.song_id)
                            {
                                self.song_catalog.push(song);
                            }
                        }
                    } else {
                        self.song_catalog = loaded;
                    }
                    self.song_next_cursor = next_cursor;
                    self.song_search_loading = false;
                    self.song_status =
                        format!("Spring Boot 곡 API 검색 결과 {}곡", self.song_catalog.len());
                    self.diagnostic(
                        "song_search_loaded",
                        serde_json::json!({
                            "resultCount": self.song_catalog.len(),
                            "nextCursor": next_cursor,
                            "append": append,
                        }),
                    );
                }
                BackendEvent::SearchFailed(error) => {
                    self.song_search_loading = false;
                    self.song_status = error;
                }
                BackendEvent::PreparationStarted {
                    performance_id,
                    song,
                    mr_download_url,
                } => {
                    let prepared = self
                        .song_catalog
                        .iter()
                        .find(|candidate| candidate.song_id == song.song_id)
                        .cloned()
                        .unwrap_or(Song {
                            song_id: song.song_id,
                            title: song.title,
                            artist: song.artist,
                            duration_seconds: song.duration_seconds,
                        });
                    let prepared_song_id = prepared.song_id;
                    self.active_performance_id = Some(performance_id);
                    self.prepared_song = Some(prepared);
                    self.controls_active_performance =
                        self.local_prepare_song_id.take() == Some(prepared_song_id);
                    self.cancel_confirmation_open = false;
                    self.cancel_request_pending = false;
                    self.playback_state = PlaybackState::Ready;
                    self.mr_state = MrState::Downloading;
                    self.pending_mr_start = None;
                    self.mr_duration = None;
                    self.mr_end_deadline = None;
                    self.mr_ready_clients = 0;
                    self.mr_total_clients = 0;
                    self.mr_waiting_clients.clear();
                    self.mr_mismatched_clients.clear();
                    self.mr_timeout_remaining_seconds = None;
                    self.mr_sync_error = None;
                    self.mr_leader_id = None;
                    self.mr_scheduled_in_ms = None;
                    self.mr_drift_correction_samples = 0;
                    self.mr_cache_hit = false;
                    self.song_status = "공연 준비 완료 · 로컬 MR 다운로드 중".into();
                    self.diagnostic(
                        "performance_preparing",
                        serde_json::json!({
                            "performanceId": performance_id,
                            "songId": prepared_song_id,
                        }),
                    );
                    mr::download(
                        performance_id,
                        prepared_song_id,
                        mr_download_url,
                        self.mr_event_tx.clone(),
                    );
                }
                BackendEvent::PlaybackStarted { performance_id } => {
                    if self.active_performance_id == Some(performance_id) {
                        self.playback_state = PlaybackState::Playing;
                        if self.mr_state == MrState::Ready {
                            self.start_local_mr(performance_id);
                        } else {
                            self.pending_mr_start = Some(performance_id);
                            self.song_status =
                                "재생 신호 수신 · MR 준비가 끝나는 즉시 로컬 재생합니다".into();
                        }
                    }
                }
                BackendEvent::PlaybackEnded {
                    performance_id,
                    cancelled,
                } => {
                    if self.active_performance_id == Some(performance_id) {
                        self.diagnostic(
                            "playback_ended",
                            serde_json::json!({ "performanceId": performance_id }),
                        );
                        if let Some(sender) = &self.command_tx {
                            let _ = sender.send(EmbeddedCommand::StopMr {
                                performance_id: Some(performance_id),
                            });
                        }
                        self.reset_finished_performance();
                        self.cancel_request_pending = false;
                        if cancelled {
                            self.song_status = "노래 시작자가 재생을 취소했습니다".into();
                        }
                    }
                }
                BackendEvent::RoomTerminated => {
                    self.status = "웹 방이 종료되어 앱 연결을 닫습니다".into();
                    self.leave_room_without_backend_request();
                }
                BackendEvent::RoomLeaveFinished { warning } => {
                    self.backend_leave_finished = true;
                    if let Some(warning) = warning {
                        self.status =
                            format!("방 퇴장 처리는 완료되지 않았지만 앱을 종료합니다 · {warning}");
                    }
                    self.maybe_finish_leave();
                }
                BackendEvent::RequestFailed(error) => {
                    self.local_prepare_song_id = None;
                    self.song_status = error;
                }
                BackendEvent::Stopped => {
                    self.backend_connected = false;
                }
            }
        }
    }

    fn poll_mr_events(&mut self) {
        let mut pending = Vec::new();
        while let Ok(event) = self.mr_event_rx.try_recv() {
            pending.push(event);
        }
        for event in pending {
            match event {
                mr::MrEvent::Ready {
                    performance_id,
                    samples,
                    cache_hit,
                } if self.active_performance_id == Some(performance_id) => {
                    self.mr_cache_hit = cache_hit;
                    let sample_count = samples.len();
                    self.mr_duration =
                        Some(Duration::from_secs_f64(sample_count as f64 / 48_000.0));
                    if let Some(sender) = &self.command_tx {
                        let _ = sender.send(EmbeddedCommand::LoadMr {
                            performance_id,
                            samples,
                        });
                    }
                    self.mr_state = MrState::Ready;
                    self.diagnostic(
                        "mr_ready",
                        serde_json::json!({
                            "performanceId": performance_id,
                            "cacheHit": cache_hit,
                            "sampleCount": sample_count,
                        }),
                    );
                    self.song_status = if cache_hit {
                        "로컬 MR 캐시 확인 완료 · 재생 신호 대기 중".into()
                    } else {
                        "로컬 MR 다운로드 완료 · 재생 신호 대기 중".into()
                    };
                    if self.pending_mr_start == Some(performance_id) {
                        self.start_local_mr(performance_id);
                    }
                }
                mr::MrEvent::Failed {
                    performance_id,
                    message,
                } if self.active_performance_id == Some(performance_id) => {
                    self.mr_state = MrState::Failed;
                    self.song_status = message.clone();
                    self.diagnostic(
                        "mr_failed",
                        serde_json::json!({
                            "performanceId": performance_id,
                            "message": message,
                        }),
                    );
                }
                _ => {}
            }
        }
    }

    fn start_local_mr(&mut self, performance_id: u64) {
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::StartMr { performance_id });
            self.song_status = "P2P 참가자 MR 준비 상태를 확인하고 있습니다".into();
        } else {
            self.mr_state = MrState::Playing;
            self.mr_end_deadline = self.mr_duration.map(|duration| Instant::now() + duration);
            self.song_status = "실험 모드 로컬 MR 재생을 시작했습니다".into();
        }
        self.pending_mr_start = None;
    }

    fn finish_local_performance(&mut self, performance_id: u64) {
        if self.active_performance_id != Some(performance_id) {
            return;
        }
        if self.controls_active_performance {
            if let Some(sender) = &self.backend_command_tx {
                let _ = sender.send(BackendCommand::FinishPlayback { performance_id });
            }
        }
        self.diagnostic(
            "local_performance_finished",
            serde_json::json!({ "performanceId": performance_id }),
        );
        self.reset_finished_performance();
    }

    fn reset_finished_performance(&mut self) {
        self.active_performance_id = None;
        self.prepared_song = None;
        self.playback_state = PlaybackState::Idle;
        self.mr_state = MrState::Idle;
        self.pending_mr_start = None;
        self.mr_duration = None;
        self.mr_end_deadline = None;
        self.controls_active_performance = false;
        self.cancel_confirmation_open = false;
        self.cancel_request_pending = false;
        self.mr_ready_clients = 0;
        self.mr_total_clients = 0;
        self.mr_waiting_clients.clear();
        self.mr_mismatched_clients.clear();
        self.mr_timeout_remaining_seconds = None;
        self.mr_leader_id = None;
        self.mr_scheduled_in_ms = None;
        self.mr_drift_correction_samples = 0;
        self.mr_cache_hit = false;
        self.song_status = self
            .mr_sync_error
            .clone()
            .unwrap_or_else(|| "곡 재생이 끝났습니다 · 다음 곡을 선택해주세요".into());
    }

    fn poll_mr_end_deadline(&mut self) {
        if self
            .mr_end_deadline
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            if let Some(performance_id) = self.active_performance_id {
                self.finish_local_performance(performance_id);
            }
        }
    }

    fn request_song_search(&mut self) {
        if self.preview {
            self.song_status = "미리보기 곡 목록".into();
            return;
        }
        let Some(sender) = &self.backend_command_tx else {
            self.song_status = "Spring Boot 연결이 준비되지 않았습니다".into();
            return;
        };
        let query = self.song_query.trim().to_owned();
        if sender
            .send(BackendCommand::SearchSongs {
                query: query.clone(),
                filter: self.song_filter.api_value().into(),
                cursor: None,
            })
            .is_ok()
        {
            self.song_next_cursor = None;
            if !query.is_empty() {
                self.recent_song_queries.retain(|recent| recent != &query);
                self.recent_song_queries.insert(0, query);
                self.recent_song_queries.truncate(5);
            }
            self.song_search_loading = true;
            self.song_status = "곡 검색 중".into();
        }
    }

    fn request_more_songs(&mut self) {
        let Some(cursor) = self.song_next_cursor else {
            return;
        };
        let Some(sender) = &self.backend_command_tx else {
            return;
        };
        if sender
            .send(BackendCommand::SearchSongs {
                query: self.song_query.trim().to_owned(),
                filter: self.song_filter.api_value().into(),
                cursor: Some(cursor),
            })
            .is_ok()
        {
            self.song_search_loading = true;
            self.song_status = "다음 곡 목록을 불러오는 중".into();
        }
    }

    fn submit_replacement_access_token(&mut self) {
        let replacement = self.replacement_access_token.trim().to_owned();
        if replacement.is_empty() {
            return;
        }
        if let Some(launch) = self.launch.as_mut() {
            launch.auth_token = replacement.clone();
        }
        if let Some(sender) = &self.backend_command_tx {
            let _ = sender.send(BackendCommand::UpdateAccessToken {
                access_token: replacement,
            });
        }
    }

    fn prepare_selected_song(&mut self) -> bool {
        let Some(song_id) = self.selected_song_id else {
            return false;
        };
        if self.preview {
            self.prepared_song = self.selected_song.clone();
            self.active_performance_id = Some(90_001);
            self.playback_state = PlaybackState::Ready;
            self.mr_state = MrState::Ready;
            self.song_status = "미리보기 공연 준비 완료".into();
            return true;
        }
        let Some(sender) = &self.backend_command_tx else {
            self.song_status = "Spring Boot 연결이 준비되지 않았습니다".into();
            return false;
        };
        if sender.send(BackendCommand::PrepareSong { song_id }).is_ok() {
            self.local_prepare_song_id = Some(song_id);
            self.song_status = "Spring Boot에 공연 준비를 요청했습니다".into();
            return true;
        }
        false
    }

    fn request_playback_start(&mut self) {
        let Some(performance_id) = self.active_performance_id else {
            return;
        };
        if self.preview {
            self.playback_state = PlaybackState::Playing;
            self.mr_state = MrState::Playing;
            self.song_status = "미리보기 재생 시작".into();
            return;
        }
        let Some(sender) = &self.backend_command_tx else {
            self.song_status = "Spring Boot 연결이 준비되지 않았습니다".into();
            return;
        };
        if sender
            .send(BackendCommand::StartPlayback { performance_id })
            .is_ok()
        {
            self.song_status = "Spring Boot에 재생 시작을 요청했습니다".into();
        }
    }

    fn finish_leave(&mut self) {
        self.diagnostic("room_left", serde_json::json!({}));
        let close_after_leave = self.leaving;
        self.command_tx = None;
        self.event_rx = None;
        self.app_session_rx = None;
        self.participants.clear();
        self.client_id = None;
        self.connected_peers = 0;
        self.stop_backend();
        self.song_catalog.clear();
        self.selected_song_id = None;
        self.selected_song = None;
        self.prepared_song = None;
        self.active_performance_id = None;
        self.playback_state = PlaybackState::Idle;
        self.mr_state = MrState::Idle;
        self.pending_mr_start = None;
        self.mr_duration = None;
        self.mr_end_deadline = None;
        self.local_prepare_song_id = None;
        self.controls_active_performance = false;
        self.cancel_confirmation_open = false;
        self.cancel_request_pending = false;
        self.mr_ready_clients = 0;
        self.mr_total_clients = 0;
        self.mr_waiting_clients.clear();
        self.mr_mismatched_clients.clear();
        self.mr_timeout_remaining_seconds = None;
        self.mr_sync_error = None;
        self.mr_leader_id = None;
        self.mr_scheduled_in_ms = None;
        self.mr_drift_correction_samples = 0;
        self.mr_cache_hit = false;
        self.authentication_required = false;
        self.replacement_access_token.clear();
        self.peer_mix_controls.clear();
        self.input_peak_dbfs = -60.0;
        self.input_clipping = false;
        self.input_clipped_samples = 0;
        self.leaving = false;
        self.audio_leave_finished = false;
        self.backend_leave_finished = false;
        self.leave_deadline = None;
        self.close_pending = close_after_leave;
        self.screen = Screen::Waiting;
        self.status = "방에서 나왔습니다. 웹에서 다음 방 입장을 진행해주세요".into();
    }

    fn fail(&mut self, message: &str) {
        self.diagnostic(
            "application_error",
            serde_json::json!({ "message": message }),
        );
        self.command_tx = None;
        self.event_rx = None;
        self.app_session_rx = None;
        self.error_message = message.to_owned();
        self.screen = Screen::Error;
        self.status = "연결 실패".into();
    }

    fn leave_room(&mut self) {
        if self.leaving {
            return;
        }
        self.diagnostic("room_leave_requested", serde_json::json!({}));
        if self.preview {
            self.leaving = true;
            self.finish_leave();
            return;
        }
        self.leaving = true;
        self.audio_leave_finished = self.command_tx.is_none();
        self.backend_leave_finished = self.backend_command_tx.is_none();
        self.leave_deadline = Some(Instant::now() + LEAVE_TIMEOUT);
        self.status = "방 연결을 안전하게 종료하고 있습니다".into();
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::Stop);
        }
        if let Some(sender) = &self.backend_command_tx {
            let _ = sender.send(BackendCommand::LeaveRoom);
        }
        self.maybe_finish_leave();
    }

    fn leave_room_without_backend_request(&mut self) {
        if self.leaving {
            return;
        }
        self.leaving = true;
        self.audio_leave_finished = self.command_tx.is_none();
        self.backend_leave_finished = true;
        self.leave_deadline = Some(Instant::now() + LEAVE_TIMEOUT);
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::Stop);
        }
        self.maybe_finish_leave();
    }

    fn maybe_finish_leave(&mut self) {
        if !self.leaving {
            return;
        }
        let timed_out = self
            .leave_deadline
            .is_some_and(|deadline| Instant::now() >= deadline);
        if (self.audio_leave_finished && self.backend_leave_finished) || timed_out {
            if timed_out {
                self.diagnostic("room_leave_timeout", serde_json::json!({}));
            }
            self.finish_leave();
        }
    }

    fn send_effects(&self) {
        let Some(sender) = &self.command_tx else {
            return;
        };
        let settings = if self.microphone_muted {
            EffectSettings {
                mic_gain_percent: 0.0,
                dry_percent: 0.0,
                echo_percent: 0.0,
                echo_delay_ms: self.echo_delay,
                echo_feedback_percent: self.echo_feedback,
                reverb_percent: 0.0,
                reverb_time_seconds: self.reverb_time,
            }
        } else {
            EffectSettings {
                mic_gain_percent: self.mic_gain,
                dry_percent: self.dry,
                echo_percent: self.echo,
                echo_delay_ms: self.echo_delay,
                echo_feedback_percent: self.echo_feedback,
                reverb_percent: self.reverb,
                reverb_time_seconds: self.reverb_time,
            }
        };
        let _ = sender.send(EmbeddedCommand::UpdateEffects(settings));
    }

    fn send_peer_mix(&self, client_id: u64, control: PeerMixControl) {
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::UpdatePeerMix {
                client_id,
                settings: control.into(),
            });
        }
    }

    fn send_mr_volume(&self) {
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::UpdateMrVolume {
                volume_percent: self.mr_volume,
            });
        }
    }

    fn selected_device_label(devices: &[AudioDeviceInfo], selected: &Option<String>) -> String {
        selected
            .as_deref()
            .and_then(|id| devices.iter().find(|device| device.id == id))
            .map(|device| device.name.clone())
            .unwrap_or_else(|| "Windows 기본 장치".into())
    }

    fn apply_audio_devices(&mut self) {
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::ChangeAudioDevices {
                input_device_id: self.selected_input_device_id.clone(),
                output_device_id: self.selected_output_device_id.clone(),
            });
            self.audio_device_status = "선택한 오디오 장치로 전환 중".into();
        } else {
            self.audio_device_status = "선택한 장치는 다음 연결부터 사용됩니다".into();
        }
        self.device_settings_open = false;
    }

    fn start_input_device_preview(&mut self) {
        let device_id = self.selected_input_device_id.clone();
        let (sender, receiver) = mpsc::channel();
        self.device_preview_rx = Some(receiver);
        self.device_preview_status = "선택한 마이크의 입력 레벨을 1초 동안 확인 중입니다.".into();
        thread::spawn(move || {
            let result = measure_input_peak(device_id, Duration::from_secs(1));
            let _ = sender.send(DevicePreviewEvent::Input(result));
        });
    }

    fn start_output_device_preview(&mut self) {
        let device_id = self.selected_output_device_id.clone();
        let (sender, receiver) = mpsc::channel();
        self.device_preview_rx = Some(receiver);
        self.device_preview_status = "선택한 출력 장치에서 테스트음을 재생 중입니다.".into();
        thread::spawn(move || {
            let result = play_output_test(device_id, Duration::from_millis(800));
            let _ = sender.send(DevicePreviewEvent::Output(result));
        });
    }

    fn poll_device_preview(&mut self) {
        let event = self
            .device_preview_rx
            .as_ref()
            .and_then(|receiver| receiver.try_recv().ok());
        let Some(event) = event else {
            return;
        };
        self.device_preview_rx = None;
        self.device_preview_status = match event {
            DevicePreviewEvent::Input(Ok(dbfs)) => {
                format!("선택한 마이크 입력 최고 레벨: {dbfs:.1} dBFS")
            }
            DevicePreviewEvent::Input(Err(error)) => {
                format!("마이크 미리 보기 실패: {error}")
            }
            DevicePreviewEvent::Output(Ok(())) => "출력 테스트음 재생을 완료했습니다.".into(),
            DevicePreviewEvent::Output(Err(error)) => {
                format!("출력 미리 듣기 실패: {error}")
            }
        };
    }

    fn cancel_active_performance(&mut self) {
        let Some(performance_id) = self.active_performance_id else {
            return;
        };
        if !self.controls_active_performance || self.cancel_request_pending {
            return;
        }
        self.cancel_request_pending = true;
        self.cancel_confirmation_open = false;
        self.song_status = "노래 취소 요청을 전송했습니다".into();
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::CancelMr { performance_id });
        }
        if let Some(sender) = &self.backend_command_tx {
            let _ = sender.send(BackendCommand::CancelPerformance { performance_id });
        }
        self.diagnostic(
            "performance_cancel_requested",
            serde_json::json!({ "performanceId": performance_id }),
        );
    }

    fn panel() -> egui::Frame {
        egui::Frame::new()
            .fill(PANEL)
            .stroke(Stroke::new(1.0_f32, BORDER))
            .inner_margin(18.0)
            .corner_radius(0)
    }

    fn section_title(ui: &mut egui::Ui, title: &str, detail: &str) {
        ui.horizontal(|ui| {
            ui.label(
                RichText::new(title)
                    .monospace()
                    .size(16.0)
                    .strong()
                    .color(CYAN),
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(RichText::new(detail).monospace().size(11.0).color(MUTED));
            });
        });
        ui.separator();
    }

    fn metric(ui: &mut egui::Ui, label: &str, value: impl Into<String>, color: Color32) {
        ui.horizontal(|ui| {
            ui.label(RichText::new(label).monospace().size(11.0).color(MUTED));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(
                    RichText::new(value.into())
                        .monospace()
                        .size(12.0)
                        .color(color),
                );
            });
        });
    }

    fn header(&self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("header")
            .exact_height(82.0)
            .frame(egui::Frame::new().fill(PANEL).inner_margin(20.0))
            .show(ctx, |ui| {
                ui.horizontal_centered(|ui| {
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("SSAFY STAR")
                                .monospace()
                                .size(22.0)
                                .strong()
                                .color(Color32::WHITE),
                        );
                        ui.label(
                            RichText::new("LOW LATENCY AUDIO")
                                .monospace()
                                .size(11.0)
                                .color(CYAN),
                        );
                    });
                    ui.add_space(70.0);
                    let navigation = ["AUDIO ONLY", "DIRECT P2P", "NO VIDEO"];
                    ui.label(
                        RichText::new(navigation[0])
                            .monospace()
                            .size(12.0)
                            .color(Color32::WHITE),
                    );
                    ui.add_space(34.0);
                    ui.label(
                        RichText::new(navigation[1])
                            .monospace()
                            .size(12.0)
                            .color(MUTED),
                    );
                    ui.add_space(34.0);
                    ui.label(
                        RichText::new(navigation[2])
                            .monospace()
                            .size(12.0)
                            .color(MUTED),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let (label, color) = match self.screen {
                            Screen::Waiting => ("WEB LAUNCH WAITING", MUTED),
                            Screen::Connecting => ("CONNECTING", CYAN),
                            Screen::Room => ("ROOM LOCKED", GREEN),
                            Screen::Error => ("ACTION REQUIRED", RED),
                        };
                        ui.label(RichText::new(label).monospace().size(12.0).color(color));
                        ui.label(RichText::new("●").color(color));
                    });
                });
            });
    }

    fn footer(&self, ctx: &egui::Context) {
        egui::TopBottomPanel::bottom("footer")
            .exact_height(40.0)
            .frame(egui::Frame::new().fill(PANEL).inner_margin(12.0))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("[AUDIO_SYSTEM]")
                            .monospace()
                            .size(10.0)
                            .color(CYAN),
                    );
                    ui.label(RichText::new(&self.status).size(11.0).color(MUTED));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(
                            RichText::new(
                                "ONE PROCESS  ·  OPUS 2.5MS  ·  DIRECT P2P  ·  CHACHA20-POLY1305",
                            )
                            .monospace()
                            .size(10.0)
                            .color(MUTED),
                        );
                    });
                });
            });
    }

    fn waiting_ui(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.add_space(70.0);
            ui.label(RichText::new("◉").size(58.0).color(CYAN));
            ui.add_space(12.0);
            ui.label(
                RichText::new("웹에서 저지연 방 입장을 진행해주세요")
                    .size(29.0)
                    .strong()
                    .color(Color32::WHITE),
            );
            ui.label(
                RichText::new("이 앱에서는 방을 직접 검색하거나 초대 코드를 입력하지 않습니다.")
                    .size(13.0)
                    .color(MUTED),
            );
            ui.add_space(34.0);
            Self::panel().show(ui, |ui| {
                ui.set_width(760.0);
                Self::section_title(ui, "WEB → AUDIO APP", "자동 연결 흐름");
                ui.add_space(12.0);
                for (number, title, detail) in [
                    (
                        "01",
                        "웹에서 초대 코드 입력",
                        "방 정보와 저지연 모드를 확인합니다.",
                    ),
                    (
                        "02",
                        "오디오 앱 실행",
                        "웹에서 발급한 방 정보가 이 앱으로 전달됩니다.",
                    ),
                    (
                        "03",
                        "자동 연결",
                        "별도 로그인이나 방 선택 없이 P2P 오디오 방에 입장합니다.",
                    ),
                ] {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(number).monospace().size(20.0).color(PURPLE));
                        ui.add_space(14.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(title)
                                    .size(15.0)
                                    .strong()
                                    .color(Color32::WHITE),
                            );
                            ui.label(RichText::new(detail).size(11.0).color(MUTED));
                        });
                    });
                    ui.add_space(14.0);
                }
            });
            ui.add_space(22.0);
            ui.label(
                RichText::new("●  앱 실행 요청 대기 중")
                    .monospace()
                    .size(12.0)
                    .color(CYAN),
            );
        });
    }

    fn connecting_ui(&self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.add_space(90.0);
            ui.spinner();
            ui.add_space(24.0);
            ui.label(
                RichText::new("저지연 오디오 방에 연결하고 있습니다")
                    .size(29.0)
                    .strong()
                    .color(Color32::WHITE),
            );
            if let Some(launch) = &self.launch {
                ui.label(
                    RichText::new(format!("{}  ·  {}", launch.room_name, launch.nickname))
                        .size(13.0)
                        .color(CYAN),
                );
            }
            ui.add_space(34.0);
            Self::panel().show(ui, |ui| {
                ui.set_width(700.0);
                Self::metric(ui, "WEB LAUNCH", "TOKEN RECEIVED", GREEN);
                ui.add_space(14.0);
                Self::metric(ui, "AUDIO DEVICE", "WASAPI EXCLUSIVE 준비", CYAN);
                ui.add_space(14.0);
                Self::metric(ui, "RENDEZVOUS", "참가자 정보 교환 중", CYAN);
                ui.add_space(14.0);
                Self::metric(ui, "VOICE PATH", "DIRECT P2P 연결 중", PURPLE);
            });
            ui.add_space(22.0);
            ui.label(
                RichText::new("연결 중에는 다른 방 입장 요청을 받지 않습니다.")
                    .size(11.0)
                    .color(MUTED),
            );
        });
    }

    fn error_ui(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.add_space(90.0);
            ui.label(RichText::new("!").monospace().size(58.0).color(RED));
            ui.label(
                RichText::new("오디오 방에 연결하지 못했습니다")
                    .size(29.0)
                    .strong()
                    .color(Color32::WHITE),
            );
            ui.add_space(16.0);
            ui.label(RichText::new(&self.error_message).size(13.0).color(MUTED));
            ui.add_space(28.0);
            if self.launch.is_some()
                && ui
                    .add_sized(
                        [280.0, 44.0],
                        egui::Button::new(RichText::new("같은 방 다시 연결").color(Color32::WHITE))
                            .fill(PANEL_ALT),
                    )
                    .clicked()
            {
                self.start_client();
            }
            ui.add_space(12.0);
            ui.label(
                RichText::new("계속 실패하면 웹에서 방을 나간 뒤 초대 코드를 다시 입력해주세요.")
                    .size(11.0)
                    .color(MUTED),
            );
        });
    }

    fn room_left_ui(&mut self, ui: &mut egui::Ui) {
        let launch = self
            .launch
            .as_ref()
            .cloned()
            .unwrap_or_else(LaunchContext::preview);
        Self::panel().show(ui, |ui| {
            Self::section_title(ui, "ROOM", "AUDIO ONLY");
            ui.label(
                RichText::new(&launch.room_name)
                    .size(20.0)
                    .strong()
                    .color(Color32::WHITE),
            );
            ui.label(RichText::new("저지연 음성 모드").size(11.0).color(MUTED));
            ui.add_space(14.0);
            Self::metric(ui, "INVITE", &launch.invite_code, CYAN);
            Self::metric(ui, "ROOM", &launch.room_id, MUTED);
            Self::metric(
                ui,
                "SPRING",
                if self.backend_connected {
                    "CONNECTED"
                } else {
                    "RECONNECTING"
                },
                if self.backend_connected { GREEN } else { MUTED },
            );
            ui.add_space(12.0);
            ui.label(
                RichText::new("웹 방과 연결되어 다른 방 입장이 잠겨 있습니다.")
                    .size(10.0)
                    .color(MUTED),
            );
        });
        ui.add_space(14.0);
        Self::panel().show(ui, |ui| {
            Self::section_title(
                ui,
                "PARTICIPANTS",
                &format!("{} / 4", self.participants.len()),
            );
            if self.participants.is_empty() {
                ui.label(
                    RichText::new("참가자 연결을 기다리고 있습니다.")
                        .size(11.0)
                        .color(MUTED),
                );
            }
            for participant in self.participants.values() {
                egui::Frame::new()
                    .fill(PANEL_ALT)
                    .inner_margin(10.0)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            let color = if participant.connected { CYAN } else { MUTED };
                            ui.label(RichText::new("●").color(color));
                            let suffix = if participant.is_me { " (나)" } else { "" };
                            ui.label(
                                RichText::new(format!("{}{}", participant.name, suffix))
                                    .size(13.0)
                                    .color(Color32::WHITE),
                            );
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.label(
                                        RichText::new(if participant.connected {
                                            "P2P"
                                        } else {
                                            "WAIT"
                                        })
                                        .monospace()
                                        .size(9.0)
                                        .color(color),
                                    );
                                },
                            );
                        });
                    });
                ui.add_space(7.0);
            }
        });
        ui.with_layout(egui::Layout::bottom_up(egui::Align::Center), |ui| {
            let button = egui::Button::new(
                RichText::new(if self.leaving {
                    "종료 중..."
                } else {
                    "방 퇴장 및 앱 연결 종료"
                })
                .color(RED),
            )
            .fill(Color32::from_rgb(50, 20, 22))
            .stroke(Stroke::new(1.0_f32, RED));
            if ui.add_enabled(!self.leaving, button).clicked() {
                self.leave_room();
            }
        });
    }

    fn participant_row(
        ui: &mut egui::Ui,
        participant: &Participant,
        slot: usize,
        mix: Option<&mut PeerMixControl>,
    ) -> bool {
        let mut changed = false;
        let name = participant.name.as_str();
        let connected = participant.connected;
        let is_me = participant.is_me;
        let color = if connected { CYAN } else { MUTED };
        let muted = mix.as_ref().is_some_and(|control| control.muted);
        let mut mute_clicked = false;
        egui::Frame::new()
            .fill(PANEL_ALT)
            .stroke(Stroke::new(
                1.0_f32,
                if connected {
                    Color32::from_rgb(42, 112, 114)
                } else {
                    BORDER
                },
            ))
            .inner_margin(10.0)
            .show(ui, |ui| {
                ui.set_min_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(format!("0{slot}"))
                            .monospace()
                            .size(11.0)
                            .color(MUTED),
                    );
                    ui.add_space(8.0);
                    ui.vertical(|ui| {
                        let suffix = if is_me { "  (나)" } else { "" };
                        ui.label(
                            RichText::new(format!("{name}{suffix}"))
                                .size(16.0)
                                .strong()
                                .color(Color32::WHITE),
                        );
                        ui.label(
                            RichText::new(if connected {
                                "실시간 음성 연결됨"
                            } else {
                                "입장을 기다리고 있습니다"
                            })
                            .size(10.0)
                            .color(MUTED),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if !is_me
                            && ui
                                .selectable_label(muted, if muted { "음소거됨" } else { "MUTE" })
                                .clicked()
                        {
                            mute_clicked = true;
                        }
                        ui.label(
                            RichText::new(if connected { "VOICE LINK" } else { "WAITING" })
                                .monospace()
                                .size(9.0)
                                .color(color),
                        );
                    });
                });
                if is_me {
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new("내 송신 음량과 이펙트는 우측 MY MIC에서 조절")
                            .size(9.0)
                            .color(MUTED),
                    );
                } else if let Some(mix) = mix {
                    if mute_clicked {
                        mix.muted = !mix.muted;
                        changed = true;
                    }
                    ui.add_space(4.0);
                    ui.columns(3, |columns| {
                        changed |= Self::effect_slider(
                            &mut columns[0],
                            "VOLUME",
                            &mut mix.volume,
                            0.0..=150.0,
                            "%",
                        );
                        changed |= Self::effect_slider(
                            &mut columns[1],
                            "ECHO",
                            &mut mix.echo,
                            0.0..=60.0,
                            "%",
                        );
                        changed |= Self::effect_slider(
                            &mut columns[2],
                            "REVERB",
                            &mut mix.reverb,
                            0.0..=60.0,
                            "%",
                        );
                    });
                }
            });
        changed
    }

    fn format_duration(seconds: u32) -> String {
        format!("{}:{:02}", seconds / 60, seconds % 60)
    }

    fn song_control_ui(&mut self, ui: &mut egui::Ui) {
        let local_selection = self
            .selected_song
            .as_ref()
            .map(|song| format!("내 선곡  {} · {}", song.title, song.artist))
            .unwrap_or_else(|| "내 선곡이 없습니다".into());
        Self::panel().show(ui, |ui| {
            Self::section_title(ui, "SONG CONTROL", "로컬 선곡 · 방 공연 준비 · 시작");
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new(local_selection).size(12.0).color(CYAN));
                    ui.label(RichText::new(&self.song_status).size(9.0).color(MUTED));
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let can_start = self.can_request_playback_start();
                    let start_label = if !self.preview
                        && self.controls_active_performance
                        && self.mr_state == MrState::Ready
                        && self.mr_total_clients > 0
                        && self.mr_ready_clients < self.mr_total_clients
                    {
                        format!(
                            "MR 준비 {}/{}",
                            self.mr_ready_clients, self.mr_total_clients
                        )
                    } else {
                        "재생 시작".into()
                    };
                    if ui
                        .add_enabled(can_start, egui::Button::new(start_label))
                        .clicked()
                    {
                        self.request_playback_start();
                    }
                    if ui
                        .add_sized([92.0, 34.0], egui::Button::new("곡 검색"))
                        .clicked()
                    {
                        self.song_search_open = true;
                        self.request_song_search();
                    }
                    let can_prepare = (self.preview || self.backend_connected)
                        && self.selected_song_id.is_some()
                        && self.playback_state == PlaybackState::Idle;
                    if ui
                        .add_enabled(can_prepare, egui::Button::new("공연 준비"))
                        .clicked()
                    {
                        self.prepare_selected_song();
                    }
                });
            });
        });
    }

    fn can_request_playback_start(&self) -> bool {
        let performance_is_ready = self.active_performance_id.is_some()
            && self.playback_state == PlaybackState::Ready
            && self.mr_state == MrState::Ready;
        if self.preview {
            return performance_is_ready;
        }

        self.backend_connected
            && self.controls_active_performance
            && performance_is_ready
            && self.mr_total_clients > 0
            && self.mr_ready_clients == self.mr_total_clients
            && self.mr_waiting_clients.is_empty()
            && self.mr_mismatched_clients.is_empty()
    }

    fn song_search_modal(&mut self, ctx: &egui::Context) {
        if !self.song_search_open {
            return;
        }

        let screen = ctx.screen_rect();
        egui::Area::new(egui::Id::new("song_search_backdrop"))
            .order(egui::Order::Foreground)
            .fixed_pos(screen.min)
            .show(ctx, |ui| {
                let (response, painter) = ui.allocate_painter(screen.size(), egui::Sense::click());
                painter.rect_filled(
                    response.rect,
                    0.0,
                    Color32::from_rgba_unmultiplied(0, 0, 0, 190),
                );
            });

        let mut open = self.song_search_open;
        let mut close_requested = false;
        egui::Window::new("곡 검색")
            .id(egui::Id::new("song_search_window"))
            .order(egui::Order::Foreground)
            .collapsible(false)
            .resizable(false)
            .default_width(560.0)
            .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
            .open(&mut open)
            .frame(
                egui::Frame::new()
                    .fill(PANEL)
                    .stroke(Stroke::new(1.0_f32, CYAN))
                    .inner_margin(22.0),
            )
            .show(ctx, |ui| {
                ui.set_min_width(520.0);
                ui.label(
                    RichText::new("노래할 곡을 찾아 선택하세요")
                        .size(20.0)
                        .strong()
                        .color(Color32::WHITE),
                );
                ui.label(
                    RichText::new("Spring Boot 곡 API에서 제목 또는 가수 이름으로 검색합니다.")
                        .size(11.0)
                        .color(MUTED),
                );
                ui.add_space(14.0);
                ui.horizontal(|ui| {
                    ui.label(RichText::new("목록").size(10.0).color(MUTED));
                    for filter in [SongFilter::All, SongFilter::Popular, SongFilter::Recommend] {
                        if ui
                            .selectable_label(self.song_filter == filter, filter.label())
                            .clicked()
                        {
                            self.song_filter = filter;
                            self.request_song_search();
                        }
                    }
                });
                if !self.recent_song_queries.is_empty() {
                    let recent_queries = self.recent_song_queries.clone();
                    ui.horizontal_wrapped(|ui| {
                        ui.label(RichText::new("최근").size(10.0).color(MUTED));
                        for recent in recent_queries {
                            if ui.small_button(&recent).clicked() {
                                self.song_query = recent;
                                self.request_song_search();
                            }
                        }
                    });
                }
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    let search_width = (ui.available_width() - 78.0).max(200.0);
                    let response = ui.add_sized(
                        [search_width, 36.0],
                        egui::TextEdit::singleline(&mut self.song_query)
                            .hint_text("곡 제목 또는 가수 이름"),
                    );
                    let enter_pressed = response.lost_focus()
                        && ui.input(|input| input.key_pressed(egui::Key::Enter));
                    let clicked = ui
                        .add_enabled(
                            !self.song_search_loading,
                            egui::Button::new(if self.song_search_loading {
                                "검색 중"
                            } else {
                                "검색"
                            }),
                        )
                        .clicked();
                    if clicked || enter_pressed {
                        self.request_song_search();
                    }
                });
                ui.add_space(12.0);

                let query = self.song_query.trim().to_lowercase();
                let songs: Vec<Song> = self
                    .song_catalog
                    .iter()
                    .filter(|song| {
                        query.is_empty()
                            || song.title.to_lowercase().contains(&query)
                            || song.artist.to_lowercase().contains(&query)
                    })
                    .cloned()
                    .collect();

                egui::ScrollArea::vertical()
                    .max_height(260.0)
                    .show(ui, |ui| {
                        if songs.is_empty() {
                            ui.add_space(24.0);
                            ui.vertical_centered(|ui| {
                                ui.label(
                                    RichText::new(if self.song_catalog.is_empty() {
                                        "앱 인증 연결 후 Spring Boot의 곡 목록이 표시됩니다."
                                    } else {
                                        "검색 결과가 없습니다."
                                    })
                                    .color(MUTED),
                                );
                            });
                            ui.add_space(24.0);
                        }
                        for song in songs {
                            let selected = self.selected_song_id == Some(song.song_id);
                            let response = egui::Frame::new()
                                .fill(if selected {
                                    Color32::from_rgb(21, 70, 72)
                                } else {
                                    PANEL_ALT
                                })
                                .stroke(Stroke::new(1.0_f32, if selected { CYAN } else { BORDER }))
                                .inner_margin(12.0)
                                .show(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        ui.vertical(|ui| {
                                            ui.label(
                                                RichText::new(&song.title)
                                                    .size(14.0)
                                                    .strong()
                                                    .color(Color32::WHITE),
                                            );
                                            ui.label(
                                                RichText::new(&song.artist).size(11.0).color(MUTED),
                                            );
                                        });
                                        ui.with_layout(
                                            egui::Layout::right_to_left(egui::Align::Center),
                                            |ui| {
                                                ui.label(
                                                    RichText::new(Self::format_duration(
                                                        song.duration_seconds,
                                                    ))
                                                    .monospace()
                                                    .color(CYAN),
                                                );
                                            },
                                        );
                                    });
                                })
                                .response
                                .interact(egui::Sense::click());
                            if response.clicked() {
                                self.selected_song_id = Some(song.song_id);
                                self.selected_song = Some(song.clone());
                            }
                            ui.add_space(7.0);
                        }
                    });

                if self.song_next_cursor.is_some() {
                    ui.add_space(8.0);
                    ui.vertical_centered(|ui| {
                        if ui
                            .add_enabled(
                                !self.song_search_loading,
                                egui::Button::new(if self.song_search_loading {
                                    "불러오는 중"
                                } else {
                                    "곡 더 보기"
                                }),
                            )
                            .clicked()
                        {
                            self.request_more_songs();
                        }
                    });
                }

                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    if ui.button("취소").clicked() {
                        close_requested = true;
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add_enabled(
                                (self.preview || self.backend_connected)
                                    && self.selected_song_id.is_some(),
                                egui::Button::new("이 곡 선택"),
                            )
                            .clicked()
                        {
                            if let Some(song) = &self.selected_song {
                                self.song_status =
                                    format!("내 선곡 저장 · {} · {}", song.title, song.artist);
                            }
                            close_requested = true;
                        }
                    });
                });
            });
        self.song_search_open = open && !close_requested;
    }

    fn authentication_modal(&mut self, ctx: &egui::Context) {
        if !self.authentication_required {
            return;
        }
        egui::Window::new("로그인 갱신 필요")
            .id(egui::Id::new("authentication_refresh_window"))
            .order(egui::Order::Foreground)
            .collapsible(false)
            .resizable(false)
            .default_width(520.0)
            .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
            .frame(
                egui::Frame::new()
                    .fill(PANEL)
                    .stroke(Stroke::new(1.0_f32, RED))
                    .inner_margin(22.0),
            )
            .show(ctx, |ui| {
                ui.label(
                    RichText::new("Spring 로그인 정보가 만료되었습니다")
                        .size(19.0)
                        .strong()
                        .color(Color32::WHITE),
                );
                ui.label(
                    RichText::new(
                        "Rust 앱은 새 access JWT를 받으면 실패한 곡 검색을 자동 재시도합니다.",
                    )
                    .size(11.0)
                    .color(MUTED),
                );
                ui.add_space(14.0);
                ui.add_sized(
                    [ui.available_width(), 36.0],
                    egui::TextEdit::singleline(&mut self.replacement_access_token)
                        .password(true)
                        .hint_text("새 access JWT"),
                );
                ui.add_space(12.0);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_enabled(
                            !self.replacement_access_token.trim().is_empty(),
                            egui::Button::new("새 토큰 적용"),
                        )
                        .clicked()
                    {
                        self.submit_replacement_access_token();
                    }
                });
            });
    }

    fn device_settings_modal(&mut self, ctx: &egui::Context) {
        if !self.device_settings_open {
            return;
        }
        let mut open = self.device_settings_open;
        let inputs = self.audio_devices.inputs.clone();
        let outputs = self.audio_devices.outputs.clone();
        egui::Window::new("오디오 장치 설정")
            .id(egui::Id::new("audio_device_settings"))
            .order(egui::Order::Foreground)
            .collapsible(false)
            .resizable(false)
            .default_width(590.0)
            .open(&mut open)
            .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
            .frame(
                egui::Frame::new()
                    .fill(PANEL)
                    .stroke(Stroke::new(1.0_f32, CYAN))
                    .inner_margin(22.0),
            )
            .show(ctx, |ui| {
                ui.label(
                    RichText::new("장치를 적용하기 전에 입력 레벨과 출력음을 확인하세요.")
                        .size(12.0)
                        .color(MUTED),
                );
                ui.add_space(14.0);
                ui.label(RichText::new("마이크 장치").strong().color(Color32::WHITE));
                egui::ComboBox::from_id_salt("input_device_selector")
                    .selected_text(Self::selected_device_label(
                        &inputs,
                        &self.selected_input_device_id,
                    ))
                    .width(540.0)
                    .show_ui(ui, |ui| {
                        ui.selectable_value(
                            &mut self.selected_input_device_id,
                            None,
                            "Windows 기본 장치",
                        );
                        for device in &inputs {
                            let label = if device.is_default {
                                format!("{} (기본)", device.name)
                            } else {
                                device.name.clone()
                            };
                            ui.selectable_value(
                                &mut self.selected_input_device_id,
                                Some(device.id.clone()),
                                label,
                            );
                        }
                    });
                if ui
                    .add_enabled(
                        self.device_preview_rx.is_none(),
                        egui::Button::new("입력 레벨 확인 (1초)"),
                    )
                    .clicked()
                {
                    self.start_input_device_preview();
                }
                ui.add_space(14.0);
                ui.label(RichText::new("출력 장치").strong().color(Color32::WHITE));
                egui::ComboBox::from_id_salt("output_device_selector")
                    .selected_text(Self::selected_device_label(
                        &outputs,
                        &self.selected_output_device_id,
                    ))
                    .width(540.0)
                    .show_ui(ui, |ui| {
                        ui.selectable_value(
                            &mut self.selected_output_device_id,
                            None,
                            "Windows 기본 장치",
                        );
                        for device in &outputs {
                            let label = if device.is_default {
                                format!("{} (기본)", device.name)
                            } else {
                                device.name.clone()
                            };
                            ui.selectable_value(
                                &mut self.selected_output_device_id,
                                Some(device.id.clone()),
                                label,
                            );
                        }
                    });
                if ui
                    .add_enabled(
                        self.device_preview_rx.is_none(),
                        egui::Button::new("출력 미리 듣기"),
                    )
                    .clicked()
                {
                    self.start_output_device_preview();
                }
                ui.add_space(12.0);
                ui.label(
                    RichText::new(&self.device_preview_status)
                        .size(11.0)
                        .color(CYAN),
                );
                ui.add_space(14.0);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("선택 장치 적용").clicked() {
                        self.apply_audio_devices();
                    }
                });
            });
        self.device_settings_open = open && self.device_settings_open;
    }

    fn cancel_confirmation_modal(&mut self, ctx: &egui::Context) {
        if !self.cancel_confirmation_open {
            return;
        }
        let mut keep_open = true;
        egui::Window::new("노래 취소")
            .id(egui::Id::new("performance_cancel_confirmation"))
            .order(egui::Order::Foreground)
            .collapsible(false)
            .resizable(false)
            .default_width(430.0)
            .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
            .frame(
                egui::Frame::new()
                    .fill(PANEL)
                    .stroke(Stroke::new(1.0_f32, RED))
                    .inner_margin(22.0),
            )
            .show(ctx, |ui| {
                ui.label(
                    RichText::new("재생 중인 노래를 취소할까요?")
                        .size(19.0)
                        .strong()
                        .color(Color32::WHITE),
                );
                ui.add_space(8.0);
                ui.label(
                    RichText::new(
                        "모든 참가자의 로컬 MR이 함께 중단됩니다. 취소 권한은 이 노래를 시작한 사용자에게만 있습니다.",
                    )
                    .size(11.0)
                    .color(MUTED),
                );
                ui.add_space(16.0);
                ui.horizontal(|ui| {
                    if ui.button("계속 재생").clicked() {
                        keep_open = false;
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("노래 취소").strong().color(Color32::WHITE),
                                )
                                .fill(Color32::from_rgb(92, 24, 28))
                                .stroke(Stroke::new(1.0_f32, RED)),
                            )
                            .clicked()
                        {
                            keep_open = false;
                            self.cancel_active_performance();
                        }
                    });
                });
            });
        self.cancel_confirmation_open &= keep_open;
    }

    fn room_center_ui(&mut self, ui: &mut egui::Ui) {
        self.song_control_ui(ui);
        ui.add_space(14.0);
        if false && self.backend_only_test {
            Self::panel().show(ui, |ui| {
                Self::section_title(ui, "INTEGRATION CHECK", "실제 Spring Boot 응답 상태");
                ui.add_space(8.0);
                Self::metric(
                    ui,
                    "STOMP",
                    if self.backend_connected {
                        "CONNECTED"
                    } else {
                        "RECONNECTING"
                    },
                    if self.backend_connected { GREEN } else { RED },
                );
                Self::metric(
                    ui,
                    "SONG API",
                    if self.song_catalog.is_empty() {
                        "NOT TESTED"
                    } else {
                        "RESPONSE OK"
                    },
                    if self.song_catalog.is_empty() {
                        MUTED
                    } else {
                        GREEN
                    },
                );
                Self::metric(
                    ui,
                    "PERFORMANCE",
                    match self.playback_state {
                        PlaybackState::Idle => "NOT STARTED",
                        PlaybackState::Ready => "PREPARED",
                        PlaybackState::Playing => "PLAYING",
                    },
                    if self.playback_state == PlaybackState::Idle {
                        MUTED
                    } else {
                        GREEN
                    },
                );
                ui.add_space(24.0);
                ui.label(
                    RichText::new("테스트 순서")
                        .size(20.0)
                        .strong()
                        .color(Color32::WHITE),
                );
                ui.add_space(12.0);
                for step in [
                    "1. SPRING 상태가 CONNECTED인지 확인",
                    "2. 곡 검색을 눌러 실제 곡 목록 확인",
                    "3. 곡을 선택하고 공연 준비 이벤트 확인",
                    "4. 재생 시작을 눌러 PLAYING 상태 확인",
                ] {
                    ui.label(RichText::new(step).size(13.0).color(MUTED));
                    ui.add_space(8.0);
                }
                ui.add_space(18.0);
                ui.label(
                    RichText::new(&self.song_status)
                        .monospace()
                        .size(12.0)
                        .color(CYAN),
                );
            });
            return;
        }
        Self::panel().show(ui, |ui| {
            Self::section_title(ui, "LIVE VOICE MIXER", "참가자별 내 수신 소리 조절");
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("VOLUME · ECHO · REVERB는 내 출력에만 적용됩니다")
                        .size(10.0)
                        .color(MUTED),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(
                        RichText::new(format!("{} VOICE LINKS", self.connected_peers))
                            .monospace()
                            .size(13.0)
                            .color(PURPLE),
                    );
                });
            });
            ui.add_space(12.0);
            let participants: Vec<(u64, Participant)> = self
                .participants
                .iter()
                .map(|(client_id, participant)| (*client_id, participant.clone()))
                .collect();
            let mut mix_updates = Vec::new();
            if participants.is_empty() {
                ui.vertical_centered(|ui| {
                    ui.add_space(18.0);
                    ui.label(
                        RichText::new("참가자의 오디오 연결을 기다리고 있습니다").color(MUTED),
                    );
                    ui.add_space(18.0);
                });
            } else {
                for (participant_index, (client_id, participant)) in participants.iter().enumerate()
                {
                    if participant.is_me {
                        let _ = Self::participant_row(ui, participant, participant_index + 1, None);
                    } else {
                        let mix = self.peer_mix_controls.entry(*client_id).or_default();
                        let changed = Self::participant_row(
                            ui,
                            participant,
                            participant_index + 1,
                            Some(mix),
                        );
                        if changed {
                            mix_updates.push((*client_id, *mix));
                        }
                    }
                    if participant_index + 1 < participants.len() {
                        ui.add_space(10.0);
                    }
                }
            }
            for (client_id, control) in mix_updates {
                self.send_peer_mix(client_id, control);
            }
        });
    }

    fn effect_slider(
        ui: &mut egui::Ui,
        label: &str,
        value: &mut f32,
        range: std::ops::RangeInclusive<f32>,
        suffix: &str,
    ) -> bool {
        ui.label(RichText::new(label).monospace().size(11.0).color(MUTED));
        let width = ui.available_width();
        ui.add_sized(
            [width, 24.0],
            egui::Slider::new(value, range).suffix(suffix),
        )
        .changed()
    }

    fn compact_effect_slider(
        ui: &mut egui::Ui,
        label: &str,
        value: &mut f32,
        range: std::ops::RangeInclusive<f32>,
        suffix: &str,
    ) -> bool {
        ui.horizontal(|ui| {
            ui.label(RichText::new(label).monospace().size(9.0).color(MUTED));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(
                    RichText::new(format!("{value:.1}{suffix}"))
                        .monospace()
                        .size(9.0)
                        .color(Color32::WHITE),
                );
            });
        });
        let width = ui.available_width();
        ui.add_sized(
            [width, 20.0],
            egui::Slider::new(value, range).show_value(false),
        )
        .changed()
    }

    fn room_right_ui(&mut self, ui: &mut egui::Ui) {
        Self::panel().show(ui, |ui| {
            Self::section_title(ui, "NOW PLAYING", "재생 중인 노래");
            if let Some(song) = &self.prepared_song {
                ui.label(RichText::new(&song.title).size(17.0).strong().color(
                    if self.playback_state == PlaybackState::Playing {
                        PURPLE
                    } else {
                        Color32::WHITE
                    },
                ));
                ui.label(RichText::new(&song.artist).size(11.0).color(MUTED));
                ui.add_space(12.0);
                Self::metric(
                    ui,
                    "ROOM",
                    match self.playback_state {
                        PlaybackState::Idle => "IDLE",
                        PlaybackState::Ready => "READY",
                        PlaybackState::Playing => "PLAYING",
                    },
                    if self.playback_state == PlaybackState::Playing {
                        PURPLE
                    } else {
                        CYAN
                    },
                );
                Self::metric(
                    ui,
                    "LOCAL MR",
                    match self.mr_state {
                        MrState::Idle => "NOT LOADED",
                        MrState::Downloading => "DOWNLOADING",
                        MrState::Ready => "READY",
                        MrState::Playing => "PLAYING",
                        MrState::Failed => "FAILED",
                    },
                    match self.mr_state {
                        MrState::Ready | MrState::Playing => GREEN,
                        MrState::Failed => RED,
                        _ => MUTED,
                    },
                );
                if self.mr_total_clients > 0 {
                    Self::metric(
                        ui,
                        "MR READY",
                        format!("{} / {}", self.mr_ready_clients, self.mr_total_clients),
                        if self.mr_ready_clients == self.mr_total_clients {
                            GREEN
                        } else {
                            MUTED
                        },
                    );
                    Self::metric(
                        ui,
                        "SYNC LEADER",
                        self.mr_leader_id
                            .map(|leader| format!("CLIENT {leader}"))
                            .unwrap_or_else(|| "-".into()),
                        CYAN,
                    );
                    if !self.mr_waiting_clients.is_empty() {
                        Self::metric(
                            ui,
                            "WAITING",
                            self.client_labels(&self.mr_waiting_clients),
                            MUTED,
                        );
                    }
                    if !self.mr_mismatched_clients.is_empty() {
                        Self::metric(
                            ui,
                            "MR MISMATCH",
                            self.client_labels(&self.mr_mismatched_clients),
                            RED,
                        );
                    }
                    if let Some(seconds) = self.mr_timeout_remaining_seconds {
                        Self::metric(
                            ui,
                            "READY TIMEOUT",
                            format!("{seconds}s"),
                            if seconds <= 5 { RED } else { CYAN },
                        );
                    }
                    Self::metric(
                        ui,
                        "DRIFT FIX",
                        format!("{} samples", self.mr_drift_correction_samples),
                        if self.mr_drift_correction_samples == 0 {
                            GREEN
                        } else {
                            CYAN
                        },
                    );
                    Self::metric(
                        ui,
                        "MR SOURCE",
                        if self.mr_cache_hit {
                            "CACHE"
                        } else {
                            "DOWNLOAD"
                        },
                        CYAN,
                    );
                }
                ui.add_space(12.0);
                let mr_volume_changed = Self::effect_slider(
                    ui,
                    "LOCAL MR VOLUME",
                    &mut self.mr_volume,
                    0.0..=150.0,
                    "%",
                );
                ui.label(
                    RichText::new("LOCAL ONLY · 상대방에게 송신하지 않음")
                        .monospace()
                        .size(9.0)
                        .color(MUTED),
                );
                if mr_volume_changed {
                    self.send_mr_volume();
                }
                if self.controls_active_performance
                    && self.active_performance_id.is_some()
                    && self.playback_state == PlaybackState::Playing
                {
                    ui.add_space(12.0);
                    if ui
                        .add_enabled(
                            !self.cancel_request_pending,
                            egui::Button::new(if self.cancel_request_pending {
                                "취소 처리 중..."
                            } else {
                                "노래 취소"
                            })
                            .min_size(Vec2::new(265.0, 38.0))
                            .fill(Color32::from_rgb(66, 20, 23))
                            .stroke(Stroke::new(1.0_f32, RED)),
                        )
                        .clicked()
                    {
                        self.cancel_confirmation_open = true;
                    }
                    ui.label(
                        RichText::new("이 노래를 시작한 사용자만 취소할 수 있습니다")
                            .size(9.0)
                            .color(MUTED),
                    );
                }
            } else {
                ui.add_space(8.0);
                ui.label(
                    RichText::new("현재 재생 중인 노래가 없습니다")
                        .size(12.0)
                        .color(MUTED),
                );
                ui.label(
                    RichText::new(
                        self.mr_sync_error.as_deref().unwrap_or(
                            "내 선곡은 공연 준비 전까지 다른 사용자에게 보이지 않습니다.",
                        ),
                    )
                    .size(9.0)
                    .color(if self.mr_sync_error.is_some() {
                        RED
                    } else {
                        MUTED
                    }),
                );
                ui.add_space(8.0);
            }
        });
        ui.add_space(14.0);
        if false && self.backend_only_test {
            Self::panel().show(ui, |ui| {
                Self::section_title(ui, "TEST MODE", "AUDIO DISABLED");
                ui.label(
                    RichText::new(
                        "이 모드에서는 오디오 장치와 rendezvous 서버에 연결하지 않습니다.",
                    )
                    .size(12.0)
                    .color(MUTED),
                );
                ui.add_space(18.0);
                Self::metric(
                    ui,
                    "BACKEND",
                    self.launch
                        .as_ref()
                        .map(|launch| launch.backend_url.clone())
                        .unwrap_or_else(|| "-".into()),
                    CYAN,
                );
                Self::metric(
                    ui,
                    "ROOM ID",
                    self.launch
                        .as_ref()
                        .map(|launch| launch.room_id.clone())
                        .unwrap_or_else(|| "-".into()),
                    CYAN,
                );
                ui.add_space(18.0);
                ui.label(
                    RichText::new(
                        "공연 준비는 현재 사용자가 해당 방의 온라인 가창자일 때만 성공합니다.",
                    )
                    .size(11.0)
                    .color(MUTED),
                );
            });
            return;
        }
        Self::panel().show(ui, |ui| {
            Self::section_title(ui, "MICROPHONE", "WASAPI SHARED INPUT");
            let label = if self.microphone_muted {
                "마이크 송신 다시 켜기"
            } else {
                "마이크 송신 끄기"
            };
            let color = if self.microphone_muted { GREEN } else { RED };
            if ui
                .add_sized(
                    [265.0, 42.0],
                    egui::Button::new(RichText::new(label).color(Color32::WHITE))
                        .fill(PANEL_ALT)
                        .stroke(Stroke::new(1.0_f32, color)),
                )
                .clicked()
            {
                self.microphone_muted = !self.microphone_muted;
                self.send_effects();
            }
            ui.add_space(12.0);
            let level = ((self.input_peak_dbfs + 60.0) / 60.0).clamp(0.0, 1.0);
            let level_color = if self.input_clipping {
                RED
            } else if self.input_peak_dbfs >= -6.0 {
                Color32::from_rgb(255, 190, 64)
            } else {
                GREEN
            };
            ui.label(
                RichText::new("INPUT LEVEL")
                    .monospace()
                    .size(11.0)
                    .color(MUTED),
            );
            ui.add_sized(
                [265.0, 20.0],
                egui::ProgressBar::new(level)
                    .text(format!("{:.1} dBFS", self.input_peak_dbfs))
                    .fill(level_color),
            );
            if self.input_clipping {
                ui.label(
                    RichText::new(format!(
                        "⚠ 입력 clipping 감지 · {} samples",
                        self.input_clipped_samples
                    ))
                    .size(10.0)
                    .strong()
                    .color(RED),
                );
            } else {
                ui.label(
                    RichText::new("-6 dBFS 이하로 입력 레벨을 유지해주세요")
                        .size(9.0)
                        .color(MUTED),
                );
            }
            ui.add_space(8.0);
            Self::metric(
                ui,
                "INPUT",
                Self::selected_device_label(
                    &self.audio_devices.inputs,
                    &self.selected_input_device_id,
                ),
                CYAN,
            );
            Self::metric(
                ui,
                "OUTPUT",
                Self::selected_device_label(
                    &self.audio_devices.outputs,
                    &self.selected_output_device_id,
                ),
                CYAN,
            );
            Self::metric(ui, "PERIOD", "2 MS", CYAN);
            Self::metric(
                ui,
                "DEVICE",
                self.audio_device_status.clone(),
                if self.audio_device_status.contains("실패") {
                    RED
                } else {
                    GREEN
                },
            );
            ui.add_space(8.0);
            if ui
                .add_sized([265.0, 34.0], egui::Button::new("마이크·출력 장치 설정"))
                .clicked()
            {
                self.device_settings_open = true;
            }
        });
        ui.add_space(14.0);
        Self::panel().show(ui, |ui| {
            Self::section_title(ui, "MY MIC SEND", "상대방에게 송신");
            let mut changed = false;
            ui.columns(2, |columns| {
                changed |= Self::compact_effect_slider(
                    &mut columns[0],
                    "SEND VOLUME",
                    &mut self.mic_gain,
                    0.0..=150.0,
                    "%",
                );
                changed |= Self::compact_effect_slider(
                    &mut columns[1],
                    "DRY SIGNAL",
                    &mut self.dry,
                    0.0..=120.0,
                    "%",
                );
            });
            ui.add_space(4.0);
            ui.columns(2, |columns| {
                changed |= Self::compact_effect_slider(
                    &mut columns[0],
                    "ECHO",
                    &mut self.echo,
                    0.0..=40.0,
                    "%",
                );
                changed |= Self::compact_effect_slider(
                    &mut columns[1],
                    "ECHO DELAY",
                    &mut self.echo_delay,
                    50.0..=300.0,
                    " ms",
                );
            });
            ui.add_space(4.0);
            ui.columns(2, |columns| {
                changed |= Self::compact_effect_slider(
                    &mut columns[0],
                    "REVERB",
                    &mut self.reverb,
                    0.0..=40.0,
                    "%",
                );
                changed |= Self::compact_effect_slider(
                    &mut columns[1],
                    "REVERB TIME",
                    &mut self.reverb_time,
                    0.3..=3.0,
                    " s",
                );
            });
            if changed {
                self.send_effects();
            }
        });
        ui.add_space(14.0);
        Self::panel().show(ui, |ui| {
            Self::section_title(
                ui,
                "NETWORK",
                if self.connected_peers > 0 {
                    "DIRECT P2P"
                } else {
                    "WAITING"
                },
            );
            Self::metric(
                ui,
                "PING",
                self.ping_ms
                    .map(|value| format!("{value:.1} ms"))
                    .unwrap_or_else(|| "측정 중".into()),
                self.ping_ms
                    .map(|value| if value <= 30.0 { GREEN } else { RED })
                    .unwrap_or(MUTED),
            );
            Self::metric(
                ui,
                "CONCEALMENT",
                format!("{:.2}%", self.concealment_percent),
                CYAN,
            );
            Self::metric(
                ui,
                "UNDERRUN",
                self.underruns.to_string(),
                if self.underruns == 0 { GREEN } else { RED },
            );
            Self::metric(
                ui,
                "RESYNC",
                self.resyncs.to_string(),
                if self.resyncs == 0 { GREEN } else { RED },
            );
        });
    }

    fn room_ui(&mut self, ctx: &egui::Context) {
        egui::SidePanel::left("room_left")
            .resizable(false)
            .exact_width(250.0)
            .frame(egui::Frame::new().fill(BACKGROUND).inner_margin(16.0))
            .show(ctx, |ui| self.room_left_ui(ui));
        egui::SidePanel::right("room_right")
            .resizable(false)
            .exact_width(315.0)
            .frame(egui::Frame::new().fill(BACKGROUND).inner_margin(16.0))
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysVisible)
                    .show(ui, |ui| self.room_right_ui(ui))
            });
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(BACKGROUND).inner_margin(16.0))
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysVisible)
                    .show(ui, |ui| self.room_center_ui(ui));
            });
        self.song_search_modal(ctx);
        self.authentication_modal(ctx);
        self.cancel_confirmation_modal(ctx);
        self.device_settings_modal(ctx);
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if ctx.input(|input| input.viewport().close_requested()) && !self.close_pending {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            self.leave_room();
        }
        if self.start_pending {
            self.start_pending = false;
            self.start_client();
        }
        self.poll_app_session();
        self.poll_events();
        self.poll_backend_events();
        self.poll_mr_events();
        self.poll_mr_end_deadline();
        self.poll_device_preview();
        self.maybe_finish_leave();
        if self.close_pending {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            return;
        }
        self.header(ctx);
        self.footer(ctx);
        match self.screen {
            Screen::Room => self.room_ui(ctx),
            screen => {
                egui::CentralPanel::default()
                    .frame(egui::Frame::new().fill(BACKGROUND).inner_margin(18.0))
                    .show(ctx, |ui| match screen {
                        Screen::Waiting => self.waiting_ui(ui),
                        Screen::Connecting => self.connecting_ui(ui),
                        Screen::Error => self.error_ui(ui),
                        Screen::Room => unreachable!(),
                    });
            }
        }
        ctx.request_repaint_after(Duration::from_millis(if self.screen == Screen::Room {
            5
        } else {
            100
        }));
    }
}

impl Drop for App {
    fn drop(&mut self) {
        if let Some(sender) = &self.command_tx {
            let _ = sender.send(EmbeddedCommand::Stop);
        }
        if let Some(sender) = &self.backend_command_tx {
            let _ = sender.send(BackendCommand::Stop);
        }
    }
}

fn friendly_error(error: &str) -> String {
    if error.contains("room is full") {
        "저지연 방 정원이 가득 찼습니다. 최대 4명까지 입장할 수 있습니다.".into()
    } else if error.contains("client ID conflict") {
        "참가자 번호가 다른 연결에서 사용 중입니다. 잠시 후 다시 입장해주세요.".into()
    } else if error.contains("rate limit") {
        "Rendezvous 등록 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.".into()
    } else if error.contains("protocol version mismatch") {
        "앱과 Rendezvous 서버의 버전이 맞지 않습니다. 최신 앱 또는 서버가 필요합니다.".into()
    } else if error.contains("ICE description is too large") {
        "네트워크 연결 정보가 허용 크기를 초과했습니다. 네트워크 설정을 확인해주세요.".into()
    } else if error.contains("registration timed out")
        || error.contains("client ID assignment timed out")
    {
        "Rendezvous 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.".into()
    } else if error.contains("WASAPI") {
        "오디오 장치를 사용할 수 없습니다. 유선 이어폰과 마이크 연결을 확인해주세요.".into()
    } else if error.contains("session") || error.contains("registration is invalid") {
        "방 세션 정보가 올바르지 않습니다. 웹에서 다시 입장해주세요.".into()
    } else {
        format!("오디오 연결 오류: {error}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_uri_decodes_web_payload() {
        let values = parse_launch_uri(
            "ssafystar://low-latency/join?roomId=room-1&roomName=%EB%85%B8%EB%9E%98&inviteCode=A24G2T&backendUrl=http%3A%2F%2Flocalhost%3A8080",
        );
        assert_eq!(values.get("roomId").map(String::as_str), Some("room-1"));
        assert_eq!(values.get("roomName").map(String::as_str), Some("노래"));
        assert_eq!(values.get("inviteCode").map(String::as_str), Some("A24G2T"));
        assert_eq!(
            values.get("backendUrl").map(String::as_str),
            Some("http://localhost:8080")
        );
    }

    #[test]
    fn song_duration_uses_minute_second_format() {
        assert_eq!(App::format_duration(200), "3:20");
    }

    #[test]
    fn rendezvous_errors_have_user_facing_messages() {
        assert!(friendly_error("rendezvous room is full").contains("최대 4명"));
        assert!(friendly_error("rendezvous client ID conflict").contains("참가자 번호"));
        assert!(friendly_error("rendezvous request rate limit exceeded").contains("너무 많"));
        assert!(friendly_error("rendezvous protocol version mismatch").contains("버전"));
    }
}
