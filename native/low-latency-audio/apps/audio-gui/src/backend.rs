use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{ErrorKind, Read, Write},
    net::TcpStream,
    sync::mpsc::{self, Receiver, Sender, TryRecvError},
    thread,
    time::{Duration, Instant},
};
use tungstenite::{stream::MaybeTlsStream, Message, WebSocket};

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);
const SOCKET_POLL_INTERVAL: Duration = Duration::from_millis(100);
const RECONNECT_INTERVAL: Duration = Duration::from_secs(5);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(8);
const REFRESH_SAFETY_MARGIN: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct BackendConfig {
    pub base_url: String,
    pub websocket_url: Option<String>,
    pub room_id: u64,
    pub access_token: String,
    pub app_refresh_token: Option<String>,
    pub access_token_expires_in_seconds: Option<u64>,
}

pub enum BackendCommand {
    SearchSongs {
        query: String,
        filter: String,
        cursor: Option<u64>,
    },
    UpdateAccessToken {
        access_token: String,
    },
    PrepareSong {
        song_id: u64,
    },
    StartPlayback {
        performance_id: u64,
    },
    FinishPlayback {
        performance_id: u64,
    },
    CancelPerformance {
        performance_id: u64,
    },
    LeaveRoom,
    Stop,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackendSong {
    pub song_id: u64,
    pub title: String,
    pub artist: String,
    pub duration_seconds: u32,
}

pub enum BackendEvent {
    Connected,
    AuthenticationRequired,
    AccessTokenUpdated,
    Disconnected(String),
    SongsLoaded {
        songs: Vec<BackendSong>,
        next_cursor: Option<u64>,
        append: bool,
    },
    SearchFailed(String),
    PreparationStarted {
        performance_id: u64,
        song: BackendSong,
        mr_download_url: String,
    },
    PlaybackStarted {
        performance_id: u64,
    },
    PlaybackEnded {
        performance_id: u64,
        cancelled: bool,
    },
    RoomTerminated,
    RoomLeaveFinished {
        warning: Option<String>,
    },
    RequestFailed(String),
    Stopped,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LowLatencyAppSession {
    pub room_id: u64,
    pub participant_id: u64,
    pub session_id: u64,
    pub room_name: String,
    pub nickname: String,
    pub invite_code: String,
    pub rendezvous_server: String,
    pub access_token: String,
    pub app_refresh_token: String,
    pub access_token_expires_in_seconds: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenRefreshResponse {
    access_token: String,
    app_refresh_token: String,
    access_token_expires_in_seconds: u64,
}

pub struct BackendHandle {
    pub command_tx: Sender<BackendCommand>,
    pub event_rx: Receiver<BackendEvent>,
}

pub struct MockBackend {
    pub base_url: String,
    pub websocket_url: String,
}

pub fn spawn_mock_backend() -> Result<MockBackend, String> {
    let http_listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("모의 곡 검색 서버를 열지 못했습니다: {error}"))?;
    let websocket_listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("모의 STOMP 서버를 열지 못했습니다: {error}"))?;
    let http_address = http_listener
        .local_addr()
        .map_err(|error| format!("모의 HTTP 주소를 확인하지 못했습니다: {error}"))?;
    let websocket_address = websocket_listener
        .local_addr()
        .map_err(|error| format!("모의 WebSocket 주소를 확인하지 못했습니다: {error}"))?;
    let mr_download_url = format!("http://{http_address}/mr.wav");
    thread::spawn(move || run_mock_http_server(http_listener));
    thread::spawn(move || run_mock_websocket_server(websocket_listener, mr_download_url));
    Ok(MockBackend {
        base_url: format!("http://{http_address}"),
        websocket_url: format!("ws://{websocket_address}/ws"),
    })
}

pub fn create_low_latency_app_session(
    base_url: &str,
    room_id: u64,
    access_token: &str,
) -> Result<LowLatencyAppSession, String> {
    let client = Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|error| format!("Spring HTTP 클라이언트를 만들지 못했습니다: {error}"))?;
    let url = format!(
        "{}/api/rooms/{room_id}/low-latency/app-session",
        base_url.trim_end_matches('/')
    );
    let response = client
        .post(url)
        .bearer_auth(access_token)
        .send()
        .map_err(|error| format!("저지연 방 실행 정보를 요청하지 못했습니다: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(http_error_message(
            response,
            "저지연 방 실행 정보를 가져오지 못했습니다",
        ));
    }
    response
        .json()
        .map_err(|error| format!("저지연 방 실행 정보 형식이 올바르지 않습니다: {error}"))
}

/// 백엔드 워커를 띄우지 못한 상태에서 방을 나간다.
///
/// app-session 요청 단계에서 실패하면 워커가 없어 `BackendCommand::LeaveRoom`을 보낼 수
/// 없다. 그대로 앱을 닫으면 웹이 만들어 둔 참가자가 방에 남으므로, 실행 정보만으로
/// 퇴장 요청을 직접 보낸다.
pub fn leave_room_directly(
    base_url: &str,
    room_id: u64,
    access_token: &str,
) -> Result<(), String> {
    let client = Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|error| format!("Spring HTTP 클라이언트를 만들지 못했습니다: {error}"))?;
    leave_spring_room(
        &client,
        &BackendConfig {
            base_url: base_url.to_owned(),
            websocket_url: None,
            room_id,
            access_token: access_token.to_owned(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        },
        access_token,
    )
}

fn run_mock_http_server(listener: std::net::TcpListener) {
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else {
            continue;
        };
        thread::spawn(move || {
            let mut request = [0_u8; 8192];
            let Ok(length) = stream.read(&mut request) else {
                return;
            };
            let request = String::from_utf8_lossy(&request[..length]);
            let request_lower = request.to_ascii_lowercase();
            let (status, content_type, body) = if request.starts_with("GET /api/songs")
                && request_lower.contains("authorization: bearer expired-token")
            {
                (
                    "401 Unauthorized",
                    "application/json",
                    br#"{"message":"expired"}"#.to_vec(),
                )
            } else if request.starts_with("GET /api/songs") {
                (
                    "200 OK",
                    "application/json",
                    br#"{"items":[{"songId":101,"title":"SKYFALL","artist":"Adele","durationSeconds":286,"thumbnailUrl":null,"favorite":false},{"songId":102,"title":"BLINDING LIGHTS","artist":"The Weeknd","durationSeconds":200,"thumbnailUrl":null,"favorite":false},{"songId":103,"title":"BOHEMIAN RHAPSODY","artist":"Queen","durationSeconds":354,"thumbnailUrl":null,"favorite":false}]}"#.to_vec(),
                )
            } else if request.starts_with("GET /mr.wav") {
                ("200 OK", "audio/wav", mock_wav())
            } else if request.starts_with("GET /actuator/health") {
                ("200 OK", "application/json", br#"{"status":"UP"}"#.to_vec())
            } else {
                (
                    "404 Not Found",
                    "application/json",
                    br#"{"message":"not found"}"#.to_vec(),
                )
            };
            let header = format!(
                "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(header.as_bytes());
            let _ = stream.write_all(&body);
        });
    }
}

pub(crate) fn mock_wav() -> Vec<u8> {
    const SAMPLE_RATE: u32 = 48_000;
    const SAMPLE_COUNT: u32 = SAMPLE_RATE * 3;
    let data_len = SAMPLE_COUNT * 2;
    let mut wav = Vec::with_capacity((44 + data_len) as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for index in 0..SAMPLE_COUNT {
        let seconds = index as f32 / SAMPLE_RATE as f32;
        let sample = (seconds * 440.0 * std::f32::consts::TAU).sin() * 0.12;
        wav.extend_from_slice(&((sample * i16::MAX as f32) as i16).to_le_bytes());
    }
    wav
}

fn run_mock_websocket_server(listener: std::net::TcpListener, mr_download_url: String) {
    for stream in listener.incoming() {
        let Ok(stream) = stream else {
            continue;
        };
        let mr_download_url = mr_download_url.clone();
        thread::spawn(move || {
            let Ok(mut socket) = tungstenite::accept(stream) else {
                return;
            };
            while let Ok(message) = socket.read() {
                let Ok(text) = message_text(message) else {
                    continue;
                };
                for frame in parse_stomp_frames(&text) {
                    match frame.command {
                        "CONNECT" => {
                            let _ = socket.send(Message::Text(
                                "CONNECTED\nversion:1.2\nheart-beat:10000,10000\n\n\0".into(),
                            ));
                        }
                        "SEND" => {
                            let destination =
                                stomp_header(&text, "destination").unwrap_or_default();
                            if destination.ends_with("/performance/prepare") {
                                let song_id = serde_json::from_str::<Value>(frame.body)
                                    .ok()
                                    .and_then(|value| value.get("songId")?.as_u64())
                                    .unwrap_or(101);
                                let (title, artist) = mock_song(song_id);
                                let event = json!({
                                    "eventType": "PERFORMANCE_PREPARATION_STARTED",
                                    "roomId": 1,
                                    "occurredAt": "2026-08-01T12:00:00+09:00",
                                    "payload": {
                                        "performanceId": 9001,
                                        "performerParticipantId": 1,
                                        "songId": song_id,
                                        "songTitle": title,
                                        "artist": artist,
                                        "difficultyLevel": 2,
                                        "thumbnailImageUrl": null,
                                        "mrDownloadUrl": mr_download_url,
                                        "midiJsonDownloadUrl": "https://mock.invalid/midi",
                                        "lyricsDownloadUrl": "https://mock.invalid/lyrics"
                                    }
                                });
                                let _ = send_mock_event(&mut socket, &event);
                            } else if destination.ends_with("/playback/start") {
                                let event = json!({
                                    "eventType": "PLAYBACK_STARTED",
                                    "roomId": 1,
                                    "occurredAt": "2026-08-01T12:00:01+09:00",
                                    "payload": {
                                        "performanceId": 9001,
                                        "performerParticipantId": 1,
                                        "startedAt": "2026-08-01T12:00:01+09:00"
                                    }
                                });
                                let _ = send_mock_event(&mut socket, &event);
                            } else if destination.ends_with("/playback/finish") {
                                let event = json!({
                                    "eventType": "PLAYBACK_FINISHED",
                                    "roomId": 1,
                                    "occurredAt": "2026-08-01T12:03:01+09:00",
                                    "payload": {
                                        "performanceId": 9001,
                                        "performerParticipantId": 1,
                                        "playbackFinishedAt": "2026-08-01T12:03:01+09:00"
                                    }
                                });
                                let _ = send_mock_event(&mut socket, &event);
                            } else if destination.ends_with("/cancel") {
                                let event = json!({
                                    "eventType": "PERFORMANCE_CANCELLED",
                                    "roomId": 1,
                                    "occurredAt": "2026-08-01T12:01:00+09:00",
                                    "payload": {
                                        "performanceId": 9001,
                                        "performerParticipantId": 1,
                                        "cancelReason": "PERFORMER_REQUEST"
                                    }
                                });
                                let _ = send_mock_event(&mut socket, &event);
                            }
                        }
                        "DISCONNECT" => return,
                        _ => {}
                    }
                }
            }
        });
    }
}

fn stomp_header<'a>(frame: &'a str, name: &str) -> Option<&'a str> {
    let header = frame
        .split_once("\r\n\r\n")
        .or_else(|| frame.split_once("\n\n"))
        .map(|(header, _)| header)
        .unwrap_or(frame);
    header.lines().skip(1).find_map(|line| {
        let (key, value) = line.split_once(':')?;
        (key == name).then_some(value)
    })
}

fn mock_song(song_id: u64) -> (&'static str, &'static str) {
    match song_id {
        102 => ("BLINDING LIGHTS", "The Weeknd"),
        103 => ("BOHEMIAN RHAPSODY", "Queen"),
        _ => ("SKYFALL", "Adele"),
    }
}

fn send_mock_event(socket: &mut WebSocket<TcpStream>, event: &Value) -> Result<(), String> {
    let body = event.to_string();
    let frame = format!(
        "MESSAGE\nsubscription:room-events\ndestination:/topic/rooms/1\ncontent-type:application/json\ncontent-length:{}\n\n{body}\0",
        body.len()
    );
    socket
        .send(Message::Text(frame.into()))
        .map_err(|error| error.to_string())
}

pub fn spawn_backend(config: BackendConfig) -> BackendHandle {
    let (command_tx, command_rx) = mpsc::channel();
    let (event_tx, event_rx) = mpsc::channel();
    thread::spawn(move || run_backend(config, command_rx, event_tx));
    BackendHandle {
        command_tx,
        event_rx,
    }
}

fn run_backend(
    config: BackendConfig,
    command_rx: Receiver<BackendCommand>,
    event_tx: Sender<BackendEvent>,
) {
    let http_client = match Client::builder().timeout(HTTP_TIMEOUT).build() {
        Ok(client) => client,
        Err(error) => {
            let _ = event_tx.send(BackendEvent::Disconnected(format!(
                "백엔드 HTTP 클라이언트를 만들지 못했습니다: {error}"
            )));
            return;
        }
    };
    let mut socket = None;
    let mut reconnect_at = Instant::now();
    let mut last_heartbeat = Instant::now();
    let mut access_token = config.access_token.clone();
    let mut app_refresh_token = config.app_refresh_token.clone();
    let mut refresh_at = config.access_token_expires_in_seconds.map(refresh_deadline);
    let mut pending_song_search: Option<(String, String, Option<u64>)> = None;

    loop {
        if refresh_at.is_some_and(|deadline| Instant::now() >= deadline) {
            match refresh_backend_tokens(
                &http_client,
                &config,
                &mut access_token,
                &mut app_refresh_token,
                &mut refresh_at,
            ) {
                Ok(()) => {
                    disconnect_socket(&mut socket);
                    reconnect_at = Instant::now();
                    let _ = event_tx.send(BackendEvent::AccessTokenUpdated);
                }
                Err(error) => {
                    refresh_at = None;
                    app_refresh_token = None;
                    let _ = event_tx.send(BackendEvent::Disconnected(error));
                    let _ = event_tx.send(BackendEvent::AuthenticationRequired);
                }
            }
        }
        if socket.is_none() && Instant::now() >= reconnect_at {
            match connect_stomp(&config, &access_token) {
                Ok(connected) => {
                    socket = Some(connected);
                    last_heartbeat = Instant::now();
                    let _ = event_tx.send(BackendEvent::Connected);
                }
                Err(error) => {
                    let _ = event_tx.send(BackendEvent::Disconnected(error));
                    reconnect_at = Instant::now() + RECONNECT_INTERVAL;
                }
            }
        }

        loop {
            match command_rx.try_recv() {
                Ok(BackendCommand::SearchSongs {
                    query,
                    filter,
                    cursor,
                }) => {
                    match search_songs(
                        &http_client,
                        &config,
                        &access_token,
                        &query,
                        &filter,
                        cursor,
                    ) {
                        Ok(page) => {
                            pending_song_search = None;
                            let _ = event_tx.send(BackendEvent::SongsLoaded {
                                songs: page.songs,
                                next_cursor: page.next_cursor,
                                append: cursor.is_some(),
                            });
                        }
                        Err(SearchError::AuthenticationRequired) => {
                            let refreshed = refresh_backend_tokens(
                                &http_client,
                                &config,
                                &mut access_token,
                                &mut app_refresh_token,
                                &mut refresh_at,
                            );
                            if refreshed.is_ok() {
                                disconnect_socket(&mut socket);
                                reconnect_at = Instant::now();
                                let _ = event_tx.send(BackendEvent::AccessTokenUpdated);
                                match search_songs(
                                    &http_client,
                                    &config,
                                    &access_token,
                                    &query,
                                    &filter,
                                    cursor,
                                ) {
                                    Ok(page) => {
                                        pending_song_search = None;
                                        let _ = event_tx.send(BackendEvent::SongsLoaded {
                                            songs: page.songs,
                                            next_cursor: page.next_cursor,
                                            append: cursor.is_some(),
                                        });
                                    }
                                    Err(SearchError::AuthenticationRequired) => {
                                        pending_song_search = Some((query, filter, cursor));
                                        let _ = event_tx.send(BackendEvent::AuthenticationRequired);
                                    }
                                    Err(SearchError::Message(error)) => {
                                        let _ = event_tx.send(BackendEvent::SearchFailed(error));
                                    }
                                }
                            } else {
                                pending_song_search = Some((query, filter, cursor));
                                let _ = event_tx.send(BackendEvent::AuthenticationRequired);
                            }
                        }
                        Err(SearchError::Message(error)) => {
                            let _ = event_tx.send(BackendEvent::SearchFailed(error));
                        }
                    }
                }
                Ok(BackendCommand::UpdateAccessToken {
                    access_token: replacement,
                }) => {
                    let replacement = replacement.trim();
                    if replacement.is_empty() {
                        let _ = event_tx.send(BackendEvent::RequestFailed(
                            "새 access JWT가 비어 있습니다".into(),
                        ));
                        continue;
                    }
                    access_token = replacement.to_owned();
                    disconnect_socket(&mut socket);
                    reconnect_at = Instant::now();
                    let _ = event_tx.send(BackendEvent::AccessTokenUpdated);
                    if let Some((query, filter, cursor)) = pending_song_search.take() {
                        match search_songs(
                            &http_client,
                            &config,
                            &access_token,
                            &query,
                            &filter,
                            cursor,
                        ) {
                            Ok(page) => {
                                let _ = event_tx.send(BackendEvent::SongsLoaded {
                                    songs: page.songs,
                                    next_cursor: page.next_cursor,
                                    append: cursor.is_some(),
                                });
                            }
                            Err(SearchError::AuthenticationRequired) => {
                                pending_song_search = Some((query, filter, cursor));
                                let _ = event_tx.send(BackendEvent::AuthenticationRequired);
                            }
                            Err(SearchError::Message(error)) => {
                                let _ = event_tx.send(BackendEvent::SearchFailed(error));
                            }
                        }
                    }
                }
                Ok(BackendCommand::PrepareSong { song_id }) => {
                    let result = socket
                        .as_mut()
                        .ok_or_else(|| "Spring WebSocket이 연결되지 않았습니다".to_owned())
                        .and_then(|socket| {
                            send_json(
                                socket,
                                &format!("/app/rooms/{}/performance/prepare", config.room_id),
                                &json!({ "songId": song_id }),
                            )
                        });
                    if let Err(error) = result {
                        let _ = event_tx.send(BackendEvent::RequestFailed(error));
                    }
                }
                Ok(BackendCommand::StartPlayback { performance_id }) => {
                    let result = socket
                        .as_mut()
                        .ok_or_else(|| "Spring WebSocket이 연결되지 않았습니다".to_owned())
                        .and_then(|socket| {
                            send_empty(
                                socket,
                                &format!(
                                    "/app/rooms/{}/performances/{performance_id}/playback/start",
                                    config.room_id
                                ),
                            )
                        });
                    if let Err(error) = result {
                        let _ = event_tx.send(BackendEvent::RequestFailed(error));
                    }
                }
                Ok(BackendCommand::FinishPlayback { performance_id }) => {
                    let result = socket
                        .as_mut()
                        .ok_or_else(|| "Spring WebSocket이 연결되지 않았습니다".to_owned())
                        .and_then(|socket| {
                            send_empty(
                                socket,
                                &format!(
                                    "/app/rooms/{}/performances/{performance_id}/playback/finish",
                                    config.room_id
                                ),
                            )
                        });
                    if let Err(error) = result {
                        let _ = event_tx.send(BackendEvent::RequestFailed(error));
                    }
                }
                Ok(BackendCommand::CancelPerformance { performance_id }) => {
                    let result = socket
                        .as_mut()
                        .ok_or_else(|| "Spring WebSocket이 연결되지 않았습니다".to_owned())
                        .and_then(|socket| {
                            send_empty(
                                socket,
                                &format!(
                                    "/app/rooms/{}/performances/{performance_id}/cancel",
                                    config.room_id
                                ),
                            )
                        });
                    if let Err(error) = result {
                        let _ = event_tx.send(BackendEvent::RequestFailed(error));
                    }
                }
                Ok(BackendCommand::LeaveRoom) => {
                    let warning = leave_spring_room(&http_client, &config, &access_token).err();
                    let _ = event_tx.send(BackendEvent::RoomLeaveFinished { warning });
                }
                Ok(BackendCommand::Stop) => {
                    disconnect_socket(&mut socket);
                    let _ = event_tx.send(BackendEvent::Stopped);
                    return;
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }

        let mut connection_error = None;
        if let Some(connected) = socket.as_mut() {
            if last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
                if let Err(error) = connected.send(Message::Text("\n".into())) {
                    connection_error = Some(format!("Spring heartbeat 전송 실패: {error}"));
                } else {
                    last_heartbeat = Instant::now();
                }
            }
            if connection_error.is_none() {
                match connected.read() {
                    Ok(message) => handle_message(message, &event_tx),
                    Err(tungstenite::Error::Io(error))
                        if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                    Err(
                        tungstenite::Error::ConnectionClosed | tungstenite::Error::AlreadyClosed,
                    ) => {
                        connection_error = Some("Spring WebSocket 연결이 종료되었습니다".into());
                    }
                    Err(error) => {
                        connection_error = Some(format!("Spring WebSocket 수신 실패: {error}"));
                    }
                }
            }
        } else {
            thread::sleep(SOCKET_POLL_INTERVAL);
        }

        if let Some(error) = connection_error {
            socket = None;
            reconnect_at = Instant::now() + RECONNECT_INTERVAL;
            let _ = event_tx.send(BackendEvent::Disconnected(error));
        }
    }
}

fn search_songs(
    client: &Client,
    config: &BackendConfig,
    access_token: &str,
    query: &str,
    filter: &str,
    cursor: Option<u64>,
) -> Result<SongPage, SearchError> {
    let url = format!("{}/api/songs", config.base_url.trim_end_matches('/'));
    let request = client.get(url).bearer_auth(access_token).query(&[
        ("query", query),
        ("filter", filter),
        ("size", "20"),
    ]);
    let request = if let Some(cursor) = cursor {
        request.query(&[("cursor", cursor)])
    } else {
        request
    };
    let response = request
        .send()
        .map_err(|error| SearchError::Message(format!("곡 검색 요청 실패: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => SearchError::AuthenticationRequired,
            403 => SearchError::Message("곡 검색 권한이 없습니다".into()),
            _ => SearchError::Message(format!("곡 검색 서버 응답 오류: HTTP {status}")),
        });
    }
    let body: SongSearchResponse = response.json().map_err(|error| {
        SearchError::Message(format!("곡 검색 응답을 읽지 못했습니다: {error}"))
    })?;
    Ok(SongPage {
        songs: body
            .items
            .into_iter()
            .map(|song| BackendSong {
                song_id: song.song_id,
                title: song.title,
                artist: song.artist,
                duration_seconds: song.duration_seconds,
            })
            .collect(),
        next_cursor: body.cursor,
    })
}

fn refresh_backend_tokens(
    client: &Client,
    config: &BackendConfig,
    access_token: &mut String,
    app_refresh_token: &mut Option<String>,
    refresh_at: &mut Option<Instant>,
) -> Result<(), String> {
    let token = app_refresh_token
        .as_deref()
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "Rust 앱 refresh token이 없습니다".to_owned())?;
    let url = format!(
        "{}/api/low-latency/auth/refresh",
        config.base_url.trim_end_matches('/')
    );
    let response = client
        .post(url)
        .json(&json!({ "appRefreshToken": token }))
        .send()
        .map_err(|error| format!("자동 로그인 갱신 요청 실패: {error}"))?;
    if !response.status().is_success() {
        return Err(http_error_message(
            response,
            "자동 로그인을 갱신하지 못했습니다",
        ));
    }
    let refreshed: TokenRefreshResponse = response
        .json()
        .map_err(|error| format!("자동 로그인 갱신 응답이 올바르지 않습니다: {error}"))?;
    if refreshed.access_token.trim().is_empty() || refreshed.app_refresh_token.trim().is_empty() {
        return Err("자동 로그인 갱신 응답에 token이 없습니다".into());
    }
    *access_token = refreshed.access_token;
    *app_refresh_token = Some(refreshed.app_refresh_token);
    *refresh_at = Some(refresh_deadline(refreshed.access_token_expires_in_seconds));
    Ok(())
}

fn leave_spring_room(
    client: &Client,
    config: &BackendConfig,
    access_token: &str,
) -> Result<(), String> {
    let url = format!(
        "{}/api/rooms/{}/leave",
        config.base_url.trim_end_matches('/'),
        config.room_id
    );
    let response = client
        .delete(url)
        .bearer_auth(access_token)
        .send()
        .map_err(|error| format!("Spring 방 퇴장 요청 실패: {error}"))?;
    if response.status().is_success() || response.status().as_u16() == 404 {
        Ok(())
    } else {
        Err(http_error_message(
            response,
            "Spring 방 퇴장 처리에 실패했습니다",
        ))
    }
}

fn refresh_deadline(expires_in_seconds: u64) -> Instant {
    let lifetime = Duration::from_secs(expires_in_seconds.max(1));
    Instant::now() + lifetime.saturating_sub(REFRESH_SAFETY_MARGIN.min(lifetime / 2))
}

fn disconnect_socket(socket: &mut Option<WebSocket<MaybeTlsStream<TcpStream>>>) {
    if let Some(mut connected) = socket.take() {
        let _ = connected.send(Message::Text("DISCONNECT\n\n\0".into()));
        let _ = connected.close(None);
    }
}

fn http_error_message(response: reqwest::blocking::Response, fallback: &str) -> String {
    let status = response.status();
    let message = response
        .json::<ErrorPayload>()
        .ok()
        .map(|body| body.message)
        .filter(|message| !message.trim().is_empty());
    message
        .map(|message| format!("{fallback}: {message}"))
        .unwrap_or_else(|| format!("{fallback}: HTTP {status}"))
}

struct SongPage {
    songs: Vec<BackendSong>,
    next_cursor: Option<u64>,
}

#[derive(Debug)]
enum SearchError {
    AuthenticationRequired,
    Message(String),
}

fn connect_stomp(
    config: &BackendConfig,
    access_token: &str,
) -> Result<WebSocket<MaybeTlsStream<TcpStream>>, String> {
    let websocket_url = config
        .websocket_url
        .clone()
        .map(Ok)
        .unwrap_or_else(|| websocket_url(&config.base_url))?;
    let (mut socket, _) = tungstenite::connect(websocket_url.as_str())
        .map_err(|error| format!("Spring WebSocket 연결 실패: {error}"))?;
    set_socket_timeout(socket.get_mut())?;
    let connect_frame = format!(
        "CONNECT\naccept-version:1.2\nhost:ssafystar\nAuthorization:Bearer {}\nheart-beat:10000,10000\n\n\0",
        access_token
    );
    socket
        .send(Message::Text(connect_frame.into()))
        .map_err(|error| format!("STOMP 인증 요청 실패: {error}"))?;

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if Instant::now() >= deadline {
            return Err("Spring STOMP 인증 응답 시간이 초과되었습니다".into());
        }
        match socket.read() {
            Ok(message) => {
                let text = message_text(message)?;
                for frame in parse_stomp_frames(&text) {
                    if frame.command == "CONNECTED" {
                        subscribe(
                            &mut socket,
                            "room-events",
                            &format!("/topic/rooms/{}", config.room_id),
                        )?;
                        subscribe(&mut socket, "backend-errors", "/user/queue/errors")?;
                        return Ok(socket);
                    }
                    if frame.command == "ERROR" {
                        return Err(stomp_error_message(frame.body));
                    }
                }
            }
            Err(tungstenite::Error::Io(error))
                if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(error) => return Err(format!("Spring STOMP 인증 실패: {error}")),
        }
    }
}

fn websocket_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if let Some(rest) = trimmed.strip_prefix("https://") {
        Ok(format!("wss://{rest}/ws"))
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        Ok(format!("ws://{rest}/ws"))
    } else {
        Err("백엔드 주소는 http:// 또는 https://로 시작해야 합니다".into())
    }
}

fn set_socket_timeout(stream: &mut MaybeTlsStream<TcpStream>) -> Result<(), String> {
    let tcp_stream = match stream {
        MaybeTlsStream::Plain(stream) => stream,
        MaybeTlsStream::Rustls(stream) => stream.get_mut(),
        _ => return Err("지원하지 않는 Spring WebSocket TLS 방식입니다".into()),
    };
    tcp_stream
        .set_read_timeout(Some(SOCKET_POLL_INTERVAL))
        .map_err(|error| format!("WebSocket 수신 대기시간 설정 실패: {error}"))
}

fn subscribe(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
    id: &str,
    destination: &str,
) -> Result<(), String> {
    let frame = format!("SUBSCRIBE\nid:{id}\ndestination:{destination}\nack:auto\n\n\0");
    socket
        .send(Message::Text(frame.into()))
        .map_err(|error| format!("STOMP 구독 실패: {error}"))
}

fn send_json(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
    destination: &str,
    value: &Value,
) -> Result<(), String> {
    let body =
        serde_json::to_string(value).map_err(|error| format!("STOMP 요청 생성 실패: {error}"))?;
    let frame = format!(
        "SEND\ndestination:{destination}\ncontent-type:application/json\ncontent-length:{}\n\n{body}\0",
        body.len()
    );
    socket
        .send(Message::Text(frame.into()))
        .map_err(|error| format!("Spring 요청 전송 실패: {error}"))
}

fn send_empty(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
    destination: &str,
) -> Result<(), String> {
    let frame = format!("SEND\ndestination:{destination}\ncontent-length:0\n\n\0");
    socket
        .send(Message::Text(frame.into()))
        .map_err(|error| format!("Spring 요청 전송 실패: {error}"))
}

fn handle_message(message: Message, event_tx: &Sender<BackendEvent>) {
    let Ok(text) = message_text(message) else {
        return;
    };
    for frame in parse_stomp_frames(&text) {
        if frame.command == "ERROR" {
            let _ = event_tx.send(BackendEvent::RequestFailed(stomp_error_message(frame.body)));
            continue;
        }
        if frame.command != "MESSAGE" {
            continue;
        }
        match decode_backend_event(frame.body) {
            Some(event) => {
                let _ = event_tx.send(event);
            }
            None => continue,
        }
    }
}

fn message_text(message: Message) -> Result<String, String> {
    match message {
        Message::Text(text) => Ok(text.to_string()),
        Message::Binary(bytes) => String::from_utf8(bytes.to_vec())
            .map_err(|error| format!("WebSocket 텍스트 변환 실패: {error}")),
        Message::Ping(_) | Message::Pong(_) | Message::Close(_) | Message::Frame(_) => {
            Ok(String::new())
        }
    }
}

struct StompFrame<'a> {
    command: &'a str,
    body: &'a str,
}

fn parse_stomp_frames(text: &str) -> Vec<StompFrame<'_>> {
    text.split('\0')
        .filter_map(|raw| {
            let raw = raw.trim_start_matches(['\r', '\n']);
            if raw.is_empty() {
                return None;
            }
            let (header, body) = raw
                .split_once("\r\n\r\n")
                .or_else(|| raw.split_once("\n\n"))
                .unwrap_or((raw, ""));
            let command = header.lines().next()?.trim();
            Some(StompFrame { command, body })
        })
        .collect()
}

fn decode_backend_event(body: &str) -> Option<BackendEvent> {
    let envelope: EventEnvelope = serde_json::from_str(body).ok()?;
    match envelope.event_type.as_str() {
        "PERFORMANCE_PREPARATION_STARTED" => {
            let payload: PreparationPayload = serde_json::from_value(envelope.payload).ok()?;
            Some(BackendEvent::PreparationStarted {
                performance_id: payload.performance_id,
                song: BackendSong {
                    song_id: payload.song_id,
                    title: payload.song_title,
                    artist: payload.artist,
                    duration_seconds: payload.duration_seconds,
                },
                mr_download_url: payload.mr_download_url,
            })
        }
        "PLAYBACK_STARTED" => {
            let payload: PlaybackPayload = serde_json::from_value(envelope.payload).ok()?;
            Some(BackendEvent::PlaybackStarted {
                performance_id: payload.performance_id,
            })
        }
        "PLAYBACK_FINISHED" | "PERFORMANCE_CANCELLED" => {
            let cancelled = envelope.event_type == "PERFORMANCE_CANCELLED";
            let payload: PlaybackPayload = serde_json::from_value(envelope.payload).ok()?;
            Some(BackendEvent::PlaybackEnded {
                performance_id: payload.performance_id,
                cancelled,
            })
        }
        "ROOM_TERMINATED" => Some(BackendEvent::RoomTerminated),
        "ERROR" => {
            let payload: ErrorPayload = serde_json::from_value(envelope.payload).ok()?;
            Some(BackendEvent::RequestFailed(payload.message))
        }
        _ => None,
    }
}

fn stomp_error_message(body: &str) -> String {
    serde_json::from_str::<EventEnvelope>(body)
        .ok()
        .and_then(|envelope| serde_json::from_value::<ErrorPayload>(envelope.payload).ok())
        .map(|payload| payload.message)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| "Spring WebSocket 요청이 거부되었습니다".into())
}

#[derive(Deserialize)]
struct SongSearchResponse {
    items: Vec<SongItem>,
    cursor: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SongItem {
    song_id: u64,
    title: String,
    artist: String,
    duration_seconds: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventEnvelope {
    event_type: String,
    payload: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreparationPayload {
    performance_id: u64,
    song_id: u64,
    song_title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    duration_seconds: u32,
    mr_download_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackPayload {
    performance_id: u64,
}

#[derive(Deserialize)]
struct ErrorPayload {
    message: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn backend_url_maps_to_websocket_endpoint() {
        assert_eq!(
            websocket_url("https://api.ssafystar-k.site/").as_deref(),
            Ok("wss://api.ssafystar-k.site/ws")
        );
        assert_eq!(
            websocket_url("http://localhost:8080").as_deref(),
            Ok("ws://localhost:8080/ws")
        );
    }

    #[test]
    fn preparation_event_decodes_spring_payload() {
        let body = r#"{"eventType":"PERFORMANCE_PREPARATION_STARTED","roomId":12,"occurredAt":"2026-08-01T12:00:00+09:00","payload":{"performanceId":91,"performerParticipantId":4,"songId":7,"songTitle":"Skyfall","artist":"Adele","durationSeconds":286,"difficultyLevel":2,"mrDownloadUrl":"https://example.test/mr"}}"#;
        match decode_backend_event(body) {
            Some(BackendEvent::PreparationStarted {
                performance_id,
                song,
                mr_download_url,
            }) => {
                assert_eq!(performance_id, 91);
                assert_eq!(song.song_id, 7);
                assert_eq!(song.title, "Skyfall");
                assert_eq!(song.artist, "Adele");
                assert_eq!(song.duration_seconds, 286);
                assert_eq!(mr_download_url, "https://example.test/mr");
            }
            _ => panic!("preparation event was not decoded"),
        }
    }

    #[test]
    fn room_termination_event_is_forwarded_to_the_app() {
        let body = r#"{"eventType":"ROOM_TERMINATED","roomId":12,"occurredAt":"2026-08-01T12:00:00+09:00","payload":{"terminatedAt":"2026-08-01T12:00:00"}}"#;
        assert!(matches!(
            decode_backend_event(body),
            Some(BackendEvent::RoomTerminated)
        ));
    }

    #[test]
    fn cancellation_event_is_marked_as_cancelled() {
        let body = r#"{"eventType":"PERFORMANCE_CANCELLED","roomId":12,"occurredAt":"2026-08-01T12:01:00+09:00","payload":{"performanceId":91,"performerParticipantId":4,"cancelReason":"PERFORMER_REQUEST"}}"#;
        assert!(matches!(
            decode_backend_event(body),
            Some(BackendEvent::PlaybackEnded {
                performance_id: 91,
                cancelled: true
            })
        ));
    }

    #[test]
    fn stomp_message_frame_extracts_json_body() {
        let text = "MESSAGE\nsubscription:room-events\n\n{\"eventType\":\"X\",\"payload\":{}}\0";
        let frames = parse_stomp_frames(text);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].command, "MESSAGE");
        assert_eq!(frames[0].body, "{\"eventType\":\"X\",\"payload\":{}}");
    }

    #[test]
    fn app_session_uses_room_id_and_initial_bearer_token() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("test address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test connection");
            let mut request = [0_u8; 4096];
            let length = stream.read(&mut request).expect("test request");
            let request = String::from_utf8_lossy(&request[..length]);
            assert!(request.starts_with("POST /api/rooms/12/low-latency/app-session "));
            assert!(request.contains("authorization: Bearer browser-access"));
            let body = r#"{"roomId":12,"participantId":3,"sessionId":12,"roomName":"저지연 방","nickname":"테스터","inviteCode":"ABC123","rendezvousServer":"relay.test:50000","accessToken":"app-access","appRefreshToken":"app-refresh","accessTokenExpiresInSeconds":600}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("test response");
        });

        let session =
            create_low_latency_app_session(&format!("http://{address}"), 12, "browser-access")
                .expect("app session");
        server.join().expect("test server");
        assert_eq!(session.room_id, 12);
        assert_eq!(session.session_id, 12);
        assert_eq!(session.rendezvous_server, "relay.test:50000");
        assert_eq!(session.app_refresh_token, "app-refresh");
    }

    #[test]
    fn app_refresh_rotates_both_tokens() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("test address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test connection");
            let mut request = [0_u8; 4096];
            let length = stream.read(&mut request).expect("test request");
            let request = String::from_utf8_lossy(&request[..length]);
            assert!(request.starts_with("POST /api/low-latency/auth/refresh "));
            assert!(request.contains("\"appRefreshToken\":\"old-refresh\""));
            let body = r#"{"accessToken":"next-access","appRefreshToken":"next-refresh","accessTokenExpiresInSeconds":600}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("test response");
        });
        let client = Client::builder().build().expect("test client");
        let config = BackendConfig {
            base_url: format!("http://{address}"),
            websocket_url: None,
            room_id: 12,
            access_token: "old-access".into(),
            app_refresh_token: Some("old-refresh".into()),
            access_token_expires_in_seconds: Some(1),
        };
        let mut access_token = config.access_token.clone();
        let mut refresh_token = config.app_refresh_token.clone();
        let mut refresh_at = None;

        refresh_backend_tokens(
            &client,
            &config,
            &mut access_token,
            &mut refresh_token,
            &mut refresh_at,
        )
        .expect("token refresh");
        server.join().expect("test server");
        assert_eq!(access_token, "next-access");
        assert_eq!(refresh_token.as_deref(), Some("next-refresh"));
        assert!(refresh_at.is_some());
    }

    #[test]
    fn leave_calls_the_existing_spring_room_endpoint() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("test address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test connection");
            let mut request = [0_u8; 4096];
            let length = stream.read(&mut request).expect("test request");
            let request = String::from_utf8_lossy(&request[..length]);
            assert!(request.starts_with("DELETE /api/rooms/12/leave "));
            assert!(request.contains("authorization: Bearer app-access"));
            write!(
                stream,
                "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            )
            .expect("test response");
        });
        let client = Client::builder().build().expect("test client");
        let config = BackendConfig {
            base_url: format!("http://{address}"),
            websocket_url: None,
            room_id: 12,
            access_token: "app-access".into(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        };

        leave_spring_room(&client, &config, &config.access_token).expect("room leave");
        server.join().expect("test server");
    }

    #[test]
    fn direct_leave_reaches_the_same_endpoint_without_a_worker() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("test address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test connection");
            let mut request = [0_u8; 4096];
            let length = stream.read(&mut request).expect("test request");
            let request = String::from_utf8_lossy(&request[..length]);
            assert!(request.starts_with("DELETE /api/rooms/12/leave "));
            assert!(request.contains("authorization: Bearer app-access"));
            write!(
                stream,
                "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            )
            .expect("test response");
        });

        leave_room_directly(&format!("http://{address}"), 12, "app-access").expect("room leave");
        server.join().expect("test server");
    }

    #[test]
    fn song_search_sends_bearer_token_and_decodes_items() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("test address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test connection");
            let mut request = [0_u8; 4096];
            let length = stream.read(&mut request).expect("test request");
            let request = String::from_utf8_lossy(&request[..length]);
            assert!(request.contains("authorization: Bearer access-token"));
            assert!(request.contains("query=skyfall"));
            let body = r#"{"items":[{"songId":7,"title":"Skyfall","artist":"Adele","durationSeconds":286,"thumbnailUrl":null,"favorite":false}],"cursor":null}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("test response");
        });
        let client = Client::builder().build().expect("test client");
        let config = BackendConfig {
            base_url: format!("http://{address}"),
            websocket_url: None,
            room_id: 12,
            access_token: "access-token".into(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        };
        let page = search_songs(
            &client,
            &config,
            &config.access_token,
            "skyfall",
            "ALL",
            None,
        )
        .expect("song response");
        server.join().expect("test server");
        assert_eq!(
            page.songs,
            vec![BackendSong {
                song_id: 7,
                title: "Skyfall".into(),
                artist: "Adele".into(),
                duration_seconds: 286,
            }]
        );
    }

    #[test]
    fn stomp_connect_subscribe_prepare_start_and_finish_match_spring_destinations() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("test address");
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().expect("test connection");
            let mut socket = tungstenite::accept(stream).expect("websocket handshake");
            let connect = socket
                .read()
                .expect("connect frame")
                .into_text()
                .expect("connect text")
                .to_string();
            assert!(connect.starts_with("CONNECT\n"));
            assert!(connect.contains("Authorization:Bearer access-token\n"));
            socket
                .send(Message::Text("CONNECTED\nversion:1.2\n\n\0".into()))
                .expect("connected frame");

            let first_subscription = socket
                .read()
                .expect("first subscription")
                .into_text()
                .expect("first subscription text")
                .to_string();
            let second_subscription = socket
                .read()
                .expect("second subscription")
                .into_text()
                .expect("second subscription text")
                .to_string();
            let subscriptions = format!("{first_subscription}{second_subscription}");
            assert!(subscriptions.contains("destination:/topic/rooms/12\n"));
            assert!(subscriptions.contains("destination:/user/queue/errors\n"));

            let prepare = socket
                .read()
                .expect("prepare frame")
                .into_text()
                .expect("prepare text")
                .to_string();
            assert!(prepare.contains("destination:/app/rooms/12/performance/prepare\n"));
            assert!(prepare.ends_with("{\"songId\":7}\0"));

            let start = socket
                .read()
                .expect("start frame")
                .into_text()
                .expect("start text")
                .to_string();
            assert!(start.contains("destination:/app/rooms/12/performances/91/playback/start\n"));

            let finish = socket
                .read()
                .expect("finish frame")
                .into_text()
                .expect("finish text")
                .to_string();
            assert!(finish.contains("destination:/app/rooms/12/performances/91/playback/finish\n"));

            let cancel = socket
                .read()
                .expect("cancel frame")
                .into_text()
                .expect("cancel text")
                .to_string();
            assert!(cancel.contains("destination:/app/rooms/12/performances/91/cancel\n"));
        });

        let config = BackendConfig {
            base_url: format!("http://{address}"),
            websocket_url: None,
            room_id: 12,
            access_token: "access-token".into(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        };
        let mut socket = connect_stomp(&config, &config.access_token).expect("STOMP connection");
        send_json(
            &mut socket,
            "/app/rooms/12/performance/prepare",
            &json!({ "songId": 7 }),
        )
        .expect("prepare request");
        send_empty(&mut socket, "/app/rooms/12/performances/91/playback/start")
            .expect("start request");
        send_empty(&mut socket, "/app/rooms/12/performances/91/playback/finish")
            .expect("finish request");
        send_empty(&mut socket, "/app/rooms/12/performances/91/cancel").expect("cancel request");
        server.join().expect("test server");
    }

    #[test]
    fn embedded_mock_runs_search_prepare_and_playback_end_to_end() {
        let mock = spawn_mock_backend().expect("mock backend");
        let handle = spawn_backend(BackendConfig {
            base_url: mock.base_url,
            websocket_url: Some(mock.websocket_url),
            room_id: 1,
            access_token: "mock-access-token".into(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        });
        assert!(matches!(
            handle.event_rx.recv_timeout(Duration::from_secs(3)),
            Ok(BackendEvent::Connected)
        ));

        handle
            .command_tx
            .send(BackendCommand::SearchSongs {
                query: "Skyfall".into(),
                filter: "ALL".into(),
                cursor: None,
            })
            .expect("search command");
        let song = match handle.event_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(BackendEvent::SongsLoaded { songs, .. }) => {
                songs.into_iter().next().expect("mock song")
            }
            _ => panic!("mock search response was not received"),
        };
        assert_eq!(song.song_id, 101);

        handle
            .command_tx
            .send(BackendCommand::PrepareSong {
                song_id: song.song_id,
            })
            .expect("prepare command");
        assert!(matches!(
            handle.event_rx.recv_timeout(Duration::from_secs(3)),
            Ok(BackendEvent::PreparationStarted {
                performance_id: 9001,
                ..
            })
        ));

        handle
            .command_tx
            .send(BackendCommand::StartPlayback {
                performance_id: 9001,
            })
            .expect("playback command");
        assert!(matches!(
            handle.event_rx.recv_timeout(Duration::from_secs(3)),
            Ok(BackendEvent::PlaybackStarted {
                performance_id: 9001
            })
        ));
        handle
            .command_tx
            .send(BackendCommand::FinishPlayback {
                performance_id: 9001,
            })
            .expect("finish playback command");
        assert!(matches!(
            handle.event_rx.recv_timeout(Duration::from_secs(3)),
            Ok(BackendEvent::PlaybackEnded {
                performance_id: 9001,
                cancelled: false
            })
        ));
        let _ = handle.command_tx.send(BackendCommand::Stop);
    }

    #[test]
    fn expired_search_waits_for_replacement_token_and_retries() {
        let mock = spawn_mock_backend().expect("mock backend");
        let handle = spawn_backend(BackendConfig {
            base_url: mock.base_url,
            websocket_url: Some(mock.websocket_url),
            room_id: 1,
            access_token: "expired-token".into(),
            app_refresh_token: None,
            access_token_expires_in_seconds: None,
        });
        assert!(matches!(
            handle.event_rx.recv_timeout(Duration::from_secs(3)),
            Ok(BackendEvent::Connected)
        ));
        handle
            .command_tx
            .send(BackendCommand::SearchSongs {
                query: "Skyfall".into(),
                filter: "ALL".into(),
                cursor: None,
            })
            .expect("search command");
        assert!(matches!(
            handle.event_rx.recv_timeout(Duration::from_secs(3)),
            Ok(BackendEvent::AuthenticationRequired)
        ));
        handle
            .command_tx
            .send(BackendCommand::UpdateAccessToken {
                access_token: "replacement-token".into(),
            })
            .expect("token replacement command");

        let mut token_updated = false;
        let mut songs_loaded = false;
        for _ in 0..4 {
            match handle.event_rx.recv_timeout(Duration::from_secs(3)) {
                Ok(BackendEvent::AccessTokenUpdated) => token_updated = true,
                Ok(BackendEvent::SongsLoaded { songs, .. }) => songs_loaded = !songs.is_empty(),
                Ok(BackendEvent::Connected | BackendEvent::Disconnected(_)) => {}
                _ => {}
            }
            if token_updated && songs_loaded {
                break;
            }
        }
        assert!(token_updated);
        assert!(songs_loaded);
        let _ = handle.command_tx.send(BackendCommand::Stop);
    }
}
