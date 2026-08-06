# 실시간 합창 Spring 서버 개발 방향

마지막 갱신: 2026-07-23

현재 결정(2026-07-23): 이 문서는 서버 2의 후속 설계 참고자료이며 아래의 “Rust rendezvous 교체” 방안은 채택되지 않았다. 서버 1인 Rust `audio-relay-server`는 P2P UDP 연결용으로 유지한다. 서버 2는 `http://localhost:8080`에서 MR presigned URL과 재생 동기화만 담당할 예정이며 아직 구현하지 않는다. 최신 서버 경계는 `server-topology.md`를 따른다.

## 1. 문서 목적

이 문서는 현재 Rust `audio-relay-server`가 담당하는 rendezvous 기능을 독립 Spring 서버로 교체하고, 실시간 합창 모드에 필요한 세션·참가자·ICE signaling·MR 전달·동시 재생 기능을 한 서버에서 제공하기 위한 개발 방향을 정의한다.

현재 단계에서는 방향만 확정한다. Spring 서버와 Rust 클라이언트 코드는 아직 변경하지 않는다.

## 2. 확정된 결정

- 실시간 합창 모드 전용 Spring 서버 하나가 관련 기능 전체를 담당한다.
- 서버는 Docker container로 실행한다.
- 데이터베이스는 Docker 환경의 MySQL을 사용한다.
- 클라이언트와 Spring 서버는 HTTP와 일반 WebSocket(`ws://`)으로 통신한다.
- MR 파일은 Spring 서버가 HTTP로 직접 제공한다.
- MR binary를 WebSocket으로 전송하지 않는다.
- WebSocket은 ICE signaling, 참가자 상태, 다운로드 완료, READY, 재생 제어에 사용한다.
- 최대 참가자는 4명이며 `client_id`는 서버가 1~4 범위에서 발급한다.
- 음성 PCM은 Spring 서버를 통과하지 않고 Rust 클라이언트 사이의 직접 UDP Full Mesh로 전송한다.
- 기존 Rust `audio-relay-server`는 Spring 전환과 회귀 검증이 끝날 때까지 테스트용으로 유지하고 이후 서비스 경로에서 제거한다.
- 기존 서비스의 다른 기능은 이 서버 범위에 포함하지 않는다.
- HTTPS/WSS 전환은 후속 운영 보안 항목으로 보류한다.

## 3. 목표 구조

```text
Windows Rust Client 1~4
        │
        ├─ HTTP: 세션 참가, 상태 조회, MR 다운로드
        └─ WebSocket: ICE, 참가자, READY, MR 재생 제어
                         │
                         ▼
             Spring Realtime Server
             ├─ 세션과 참가자 관리
             ├─ client_id 1~4 발급
             ├─ 참가자 인증
             ├─ ICE description 전달
             ├─ MR 파일 제공
             ├─ 다운로드 완료 관리
             └─ 공통 재생 시각 전달
                         │
                         ▼
                       MySQL

Client 1 ◀──────── 직접 UDP P2P ────────▶ Client 2~4
```

Spring 서버는 제어 경로만 담당한다. 연결이 완료된 이후의 실시간 음성 지연은 Rust 클라이언트 사이의 직접 P2P 경로에 의해 결정된다.

## 4. Spring 서버 책임

### 4.1 세션 관리

- 실시간 합창 세션 생성과 종료
- 추측하기 어려운 `session_id` 생성
- 최대 참가자 수 4명 강제
- 세션 상태 관리: `WAITING`, `PREPARING`, `READY`, `PLAYING`, `ENDED`
- 세션에 사용할 MR 지정
- 참가자 입장과 퇴장 시각 기록

### 4.2 참가자 인증과 ClientId 발급

- 참가 요청의 사용자 또는 참가 코드 검증
- `client_id` 1~4 중 사용하지 않는 번호를 서버가 발급
- 동일 세션에서 사용자와 ClientId 중복 방지
- 참가자별 짧은 수명의 무작위 토큰 발급
- HTTP와 WebSocket 요청에서 세션·ClientId·토큰 일치 여부 확인
- 재접속 시 기존 ClientId 복구 여부는 구현 전에 정책 확정

### 4.3 ICE signaling

- 인증된 참가자의 WebSocket 연결 관리
- 현재 참가자 목록 snapshot 전달
- `sender_client_id`를 서버의 인증 정보로 결정
- 대상 `target_client_id`에게만 ICE description 전달
- 참가자별 P2P 연결 상태 전달
- 한 참가자의 연결 실패가 다른 참가자 연결을 종료하지 않도록 상태 분리
- ICE description은 임시 데이터로 취급하고 세션 종료 시 삭제

Spring 서버는 ICE candidate를 직접 검사하거나 음성 packet을 중계하지 않는다.

### 4.4 MR 파일 제공

- MR metadata와 파일 버전 관리
- HTTP download endpoint 제공
- `Content-Length`, `Content-Type`, HTTP Range 지원
- 파일의 SHA-256 제공
- 클라이언트의 다운로드 재시도 지원
- 참가자별 다운로드 완료와 checksum 일치 여부 기록

초기 구현에서는 Spring 서버의 지정된 파일 경로에서 MR을 제공한다. 파일 수와 트래픽이 커지면 Object Storage 또는 CDN으로 분리하는 것을 후속 검토한다.

### 4.5 동시 재생 제어

- 모든 참가자의 MR 다운로드 및 checksum 검증 완료 확인
- 모든 참가자의 P2P READY 상태 확인
- 현재보다 충분히 미래인 공통 `start_at_epoch_ms` 결정
- 모든 참가자에게 동일한 `MR_START` 메시지 전달
- `start_sample`, `sample_rate`, MR version 포함
- 참가자별 sample position과 drift 보고 수집
- 참가자 퇴장 또는 준비 취소 시 시작 gate 재평가

WebSocket 메시지의 동시 도착을 기대하지 않는다. 각 Rust 클라이언트는 서버와의 시각 차이를 추정하고 미래의 공통 시각에 로컬 오디오 장치 재생을 예약해야 한다.

## 5. HTTP API 초안

구체적인 URL과 DTO는 구현 전에 확정한다. 현재 방향은 다음과 같다.

| Method | Endpoint | 역할 |
| --- | --- | --- |
| `POST` | `/api/realtime/sessions` | 세션 생성과 MR 지정 |
| `POST` | `/api/realtime/sessions/{sessionId}/join` | 참가 인증, ClientId와 토큰 발급 |
| `GET` | `/api/realtime/sessions/{sessionId}` | 세션과 참가자 상태 조회 |
| `POST` | `/api/realtime/sessions/{sessionId}/leave` | 명시적 퇴장 |
| `POST` | `/api/realtime/sessions/{sessionId}/close` | 세션 종료 |
| `GET` | `/api/realtime/mr/{mrId}` | MR metadata와 checksum 조회 |
| `GET` | `/api/realtime/mr/{mrId}/file` | MR 파일 HTTP 다운로드 |
| `GET` | `/actuator/health` | container 상태 점검 |

참가 응답에는 최소한 다음 값이 포함된다.

```json
{
  "sessionId": "generated-session-id",
  "clientId": 1,
  "participantToken": "short-lived-random-token",
  "webSocketUrl": "ws://server:8080/ws/realtime",
  "mrUrl": "http://server:8080/api/realtime/mr/song-001/file",
  "mrSha256": "..."
}
```

## 6. WebSocket event 초안

| Event | 방향 | 역할 |
| --- | --- | --- |
| `JOIN` | Client → Server | 발급받은 토큰으로 WebSocket 참가 |
| `PARTICIPANT_SNAPSHOT` | Server → Client | 현재 참가자 목록 |
| `PARTICIPANT_JOINED` | Server → Client | 참가자 입장 |
| `PARTICIPANT_LEFT` | Server → Client | 참가자 퇴장 |
| `ICE_DESCRIPTION` | 양방향 | 대상별 ICE description 전달 |
| `PEER_CONNECTION_STATE` | Client → Server | peer별 ICE 연결 상태 |
| `MR_PREPARE` | Server → Client | MR metadata, URL, checksum 전달 |
| `MR_DOWNLOAD_COMPLETE` | Client → Server | 다운로드와 checksum 검증 완료 |
| `READY` | Client → Server | P2P와 오디오 장치 준비 완료 |
| `ALL_READY` | Server → Client | 모든 참가자 준비 완료 |
| `MR_START` | Server → Client | 공통 미래 재생 시각 전달 |
| `MR_POSITION_REPORT` | Client → Server | 현재 sample position과 drift 보고 |
| `MR_STOP` | Server → Client | 재생 중단 |
| `SESSION_CLOSED` | Server → Client | 세션 종료 |
| `ERROR` | Server → Client | 명시적인 오류 코드 |

ICE event는 최소한 `session_id`, `target_client_id`, `generation`, `description`을 포함한다. 송신자 ID는 클라이언트 입력을 신뢰하지 않고 서버가 WebSocket 인증 정보로 채운다.

## 7. MySQL 저장 방향

### 영구 저장 대상

- 세션 ID, 상태, 생성·종료 시각
- MR ID, 파일 경로, 버전, 크기, SHA-256
- 참가 사용자, ClientId, 입장·퇴장 시각
- 참가자 다운로드 및 READY 최종 상태
- 세션 실행 결과와 품질 통계 요약
- 인증 실패와 운영 감사 정보

### 임시 상태

- WebSocket connection 객체
- 최신 ICE description
- heartbeat
- 순간적인 peer 연결 상태
- 실시간 MR sample position

초기 단일 Spring instance에서는 임시 상태를 process memory에 둘 수 있다. 서버 재시작 복구 또는 여러 Spring instance가 필요해지는 시점에 Redis 도입을 검토한다.

MySQL에는 최소한 다음 unique constraint가 필요하다.

```text
UNIQUE(session_id, user_id)
UNIQUE(session_id, client_id)
CHECK(client_id BETWEEN 1 AND 4)
```

동시 참가 요청에서 ClientId가 중복되지 않도록 transaction과 row lock 또는 동등한 동시성 제어를 사용한다.

## 8. Docker 방향

초기 Docker 구성은 다음 두 container를 기본으로 한다.

```text
spring-realtime-server
mysql
```

- Spring container는 HTTP/WebSocket port를 노출한다.
- MySQL port는 외부에 공개하지 않고 Docker 내부 network에서만 접근한다.
- MR 파일 directory는 read-only volume mount를 우선 사용한다.
- DB password와 참가 토큰 secret은 image에 넣지 않고 environment 또는 Docker secret으로 전달한다.
- health check, restart policy, log rotation을 설정한다.

초기에는 Spring instance 하나를 사용한다. 여러 instance로 확장할 경우 WebSocket message routing과 임시 상태 공유를 위해 Redis 또는 message broker가 추가로 필요하다.

## 9. HTTP 사용에 따른 제한

HTTP와 `ws://`는 전송 암호화를 제공하지 않는다. 공개 인터넷에서는 다음 정보가 노출되거나 변조될 수 있다.

- 참가자 토큰과 세션 ID
- ICE candidate와 공인 IP
- MR 파일과 재생 제어 메시지
- 이후 추가할 P2P 공개키

따라서 초기 HTTP 구성은 개발·내부 검증 단계로 분류한다. 최소 보호 항목은 다음과 같다.

- 무작위 session ID와 짧은 수명의 참가자 token
- 세션당 최대 4명
- 요청·payload 크기 제한
- IP와 token 단위 rate limit
- MR SHA-256 검증
- token과 공인 IP 로그 마스킹
- MySQL 외부 접근 차단

MR SHA-256은 전송 오류 검출에는 유효하지만 HTTP 중간자에 의한 파일과 checksum 동시 변조까지 막지는 못한다. 공개 서비스 전에 HTTPS/WSS 또는 별도의 서명 검증 체계가 필요하다.

## 10. Rust 클라이언트 변경 방향

Spring 구현 후 Rust 클라이언트에서 다음 순서로 전환한다.

1. 기존 UDP `Register`, `RegisterAck`, `PeerInfo` 사용 제거
2. HTTP 세션 참가와 ClientId·token 수신
3. WebSocket 연결과 참가자 snapshot 처리
4. 현재 대상별 ICE description bundle을 `ICE_DESCRIPTION` event로 전달
5. peer별 연결 상태를 Spring에 보고
6. MR HTTP download와 SHA-256 검증
7. READY와 미래 시각 기반 MR 재생 구현
8. Spring 연결이 일시적으로 끊겨도 이미 연결된 P2P 음성은 유지
9. 전환 회귀 테스트 후 Rust `audio-relay-server` 서비스 경로 제거

P2P PCM packet 형식, WASAPI, peer별 jitter buffer와 mixer는 signaling 서버 교체 때문에 변경하지 않는다.

## 11. 구현 순서

1. Spring project와 Docker/MySQL 기본 구성
2. MySQL schema와 session state model
3. 세션 생성·참가·ClientId 발급 API
4. 참가 token 검증과 WebSocket 연결
5. 참가자 snapshot·입장·퇴장 event
6. 대상별 ICE signaling
7. 기존 Rust client의 signaling adapter 교체
8. 2 client P2P 회귀 테스트
9. 4 client Full Mesh 회귀 테스트
10. MR metadata와 HTTP file download
11. checksum·download complete·READY gate
12. 공통 미래 시각 기반 MR 시작
13. Docker 통합 테스트와 장애·재접속 검증
14. Rust rendezvous 서버 제거 여부 최종 승인

## 12. 완료 기준

- Spring 서버가 세션당 ClientId 1~4를 중복 없이 발급
- 인증되지 않은 HTTP와 WebSocket 요청 거부
- 같은 세션의 지정된 상대에게만 ICE 정보 전달
- Rust 클라이언트 4개가 Spring signaling으로 전체 6개 P2P link 형성
- MR 파일을 HTTP로 다운로드하고 모든 참가자가 동일 SHA-256 확인
- 모든 참가자 READY 이후에만 `MR_START` 발송
- 참가자 간 MR 시작 위치 차이 10ms 이하 목표 검증
- Spring 장애가 이미 연결된 P2P 음성을 즉시 중단시키지 않음
- 전환 후 AWS Rust rendezvous 없이 실제 테스트 가능
