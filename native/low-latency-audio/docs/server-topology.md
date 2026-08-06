# 서버 구성

마지막 갱신: 2026-08-01

프로젝트의 서버 역할은 두 개로 분리한다. Rust 앱은 Spring Boot의 저지연 앱 세션 및 기존 REST/STOMP 계약을 함께 사용한다.

## 서버 1 — P2P UDP Rendezvous

- 구현체: Rust `audio-relay-server`
- 기본 주소: `127.0.0.1:50000` 또는 배포된 UDP 서버
- 책임: 세션 등록, Client ID 할당, 참가자 탐색, 대상별 ICE description 교환, 정원·충돌 오류, IP rate limit, 명시적 Leave·30초 만료, 운영 통계
- 비책임: 음성 중계, MR 파일, 사용자 인증, 중앙 MR 재생 동기화
- 미디어 경로: 연결 후 Windows 클라이언트 간 직접 UDP Full Mesh

등록 오류는 UDP `RendezvousError`로 Rust 앱에 전달한다. ICE description은 16KiB로 제한하고, 동일 IP에서 최대 4개 클라이언트가 동시에 재등록할 수 있도록 burst 48·초당 16회의 등록 token bucket을 사용한다. 전체 UDP packet은 burst 800·초당 400개로 제한한다. 이 제한은 방 참가 인증을 대신하지 않으며 실제 Spring 방과의 연결은 후속 session credential 통합이 필요하다.

## 서버 2 — 기존 Spring Boot

- 주소: 운영 앱에 고정된 `https://ssafystar-k.site` (로컬 시험만 실행 인자/환경 변수로 재정의)
- 현재 사용 기능: 저지연 앱 세션·자동 JWT 갱신·방 퇴장, `GET /api/songs`, `/ws` STOMP, 공연 준비·시작·종료 이벤트, 준비 이벤트의 presigned MR URL
- 책임: 사용자와 저지연 방 참가 검증, 앱 인증 갱신, 곡 검색, 방 공연 상태, MR 다운로드 정보, 재생·중지 제어 이벤트
- 비책임: 실시간 음성 패킷 중계, ICE 연결

각 클라이언트는 준비 이벤트의 `mrDownloadUrl`을 사용해 MR을 개별 다운로드한다. MP3/WAV를 48kHz mono로 변환하고, `PLAYBACK_STARTED` 이벤트 수신 시 로컬 출력에 재생한다. MR은 마이크 캡처와 Opus 송신 경로에 들어가지 않으며 참가자마다 로컬 음량만 독립 조절한다. 시작자의 취소는 기존 Spring `/cancel` 및 `PERFORMANCE_CANCELLED` 계약을 그대로 사용하고, 빠른 동시 중단을 위해 Rust P2P `MrCancel`도 함께 보낸다.

현재 Spring 이벤트는 공통 미래 재생 시각과 참가자별 MR READY 집계를 제공하지 않는다. Rust 앱은 Spring `PLAYBACK_STARTED`를 시작 요청으로 사용한 뒤, 직접 P2P로 MR READY·300ms 예약 시작·sample position을 교환한다. 가장 낮은 Client ID가 임시 leader이며 모든 연결 참가자의 공연 ID·sample 수·오디오 지문이 일치해야 시작한다. 따라서 Spring 변경 없이 이벤트 도착 차이는 줄였지만, 중앙 기준 시계가 없는 상대 지연 방식이므로 실제 최대 4대에서 10ms 이내 동기 여부를 별도로 검증해야 한다.

기본 주소 예시는 `configs/server-endpoints.example.toml`에도 기록되어 있으며 운영 웹 URI가 백엔드 주소를 바꿀 수는 없다.
