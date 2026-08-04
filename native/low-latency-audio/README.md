# 저지연 오디오 기술 실험

> 2026-08-02 보안·오디오 장치 선택·Windows MSI 변경 사항은 [`docs/security-and-device-update.md`](docs/security-and-device-update.md)를 참고한다. 이 문서의 이전 "암호화 없음" 설명보다 새 문서가 우선한다.

현재 구현 범위와 검증 현황은 [`docs/phase-status.md`](docs/phase-status.md)에 기록한다. 패킷 형식은 [`docs/packet-protocol.md`](docs/packet-protocol.md)를 참고한다.

이 디렉터리는 기존 노래방 서비스와 분리된 저지연 음성 실험이다. 최종 목표는 Windows PC 최대 네 대에서 MR을 기준으로 실시간 합창을 체감할 수 있도록 만드는 것이다. 참가자들은 UDP rendezvous 서버를 통해 서로를 찾은 뒤, 서버를 미디어 경로에 포함하지 않고 모든 참가자 쌍이 직접 UDP P2P로 음성을 교환한다. 최대 4인 Full Mesh 코드는 구현됐으며 실제 Windows PC 4대의 10분 실장치 검증이 남아 있다.

서버 역할은 두 개로 구분한다. Rust UDP rendezvous 서버는 참가자 탐색만 담당하고, 기존 Spring Boot는 곡 목록·공연 상태·MR 다운로드 URL·재생 시작 이벤트를 담당한다. Spring Boot 코드는 변경하지 않고 현재 REST/STOMP 계약을 그대로 사용한다. 자세한 경계는 [`docs/server-topology.md`](docs/server-topology.md)를 참고한다.

## 필수 사용 조건

최대 4인 실시간 합창 모드는 다음 조건을 모든 참가자가 만족하는 환경을 지원 대상으로 한다.

- 유선 LAN
- 유선 이어폰 또는 유선 헤드셋
- 참가자들이 동일 국가에 위치
- 직접 P2P 연결 성공
- VPN과 이동통신망을 사용하지 않음
- 백그라운드 다운로드를 중지하고 절전 기능을 해제

특정 오디오 인터페이스, 동일 지역 거주 또는 고정 RTT 수치는 필수 사용 조건으로 두지 않는다. RTT, jitter, 장치 buffer 등의 측정값은 실시간 합창 가능 여부와 품질을 진단하는 지표로 사용한다.

## 최대 4인 목표 구조

- 참가자 4명 기준 최대 6개의 직접 P2P 연결을 사용하는 Full Mesh
- 마이크 frame은 한 번 생성한 뒤 연결된 최대 3명의 peer에게 fan-out
- peer별 독립 sequence, jitter buffer, 손실 복원과 통계
- 한 peer의 지연이 다른 peer와 MR 재생을 막지 않는 독립 재생 기한
- 최대 3개의 원격 음성을 실시간으로 합성하는 mixer와 limiter
- 모든 참가자 쌍의 직접 P2P 연결 성공 후 MR 시작
- 20ms 주기 누적 DeliveryAck의 실장치 효과 검증

현재 두 PC 테스트는 이 구조의 전송·지연 기반을 검증하는 단계다.

## 현재 구현

- Rust 워크스페이스와 `protocol`, `metrics`, `audio-core` 공통 크레이트
- AWS UDP Echo 및 ICE 설명 교환용 rendezvous 서버
- 호스트·IPv4/IPv6·복수 STUN 후보를 사용하는 direct-only ICE
- 실패 시 새 인증정보와 UDP 매핑으로 ICE 자동 재시도
- 장치의 모든 입력 channel을 평균해 48kHz mono f32로 변환
- Opus Restricted Low Delay 128kbps constrained VBR, 프레임당 120샘플(2.5ms)
- WASAPI Shared Event-Driven 입력과 Exclusive Event-Driven 출력
- 현재 검증 장치 기준 입력 2ms, 출력 period·큐·WASAPI stream latency 3ms
- 고우선순위 ICE 네트워크 스레드와 20ms 주기 누적 DeliveryAck
- 입력 callback이 전달한 완성 프레임을 최대 16개까지 즉시 송신 큐로 배출
- 완성된 PCM frame을 출력 ring에 원자적으로 공개하고 별도 startup prebuffer 없이 재생
- sequence 기반 2.5ms jitter buffer: 목표 4 frame(10ms), 최대 6 frame(15ms)
- 재생 시각이 지난 frame은 sample ring 진입 전에 폐기
- 누락 frame은 지연 추가 없는 Opus PLC로 은폐하고 실제 frame 복귀 시 crossfade
- 장치 clock drift와 과도한 재생 큐를 회수하는 적응형 재생속도 보정 최대 ±0.3%
- sample ring의 30ms → 15ms 정리는 비상 안전장치로만 유지
- stale frame 기한은 목표 jitter 10ms에 30ms 여유를 더한 40ms
- 손실 은폐, 늦은 프레임 거부, 언더런·삭제·속도 보정 통계
- 오래된 음성은 2.5ms frame 경계에서 정리하고 1ms crossfade로 연결
- 누락 frame concealment 후 실제 음성 복귀 시 짧은 crossfade 적용
- peer 퇴장은 명시적 `Leave` 또는 ICE `Disconnected`에서만 판정하며, 일시적인 음성 무수신과 ICE 재확인은 퇴장으로 보지 않음
- 내 마이크 송신 음량·Dry·Echo·Reverb 조절. 이 처리는 Opus 송신 전에 적용되어 상대 참가자가 듣는 음성에 반영
- 상대 참가자별 로컬 수신 음량·Mute·Echo·Reverb 조절. 이 값은 내 출력에만 적용되고 상대의 송신 설정은 바꾸지 않음
- RTT, p50/p95/p99, 손실, 중복, 순서역전, 송신 마감 실패 통계
- effects·signaling·peer/jitter·playback·ICE·WASAPI가 내부 client library module로 분리됨
- GUI와 client library는 하나의 프로세스에서 동작하며 최종 사용자 실행 파일은 `audio-gui.exe` 하나
- 참가자는 2열 카드가 아닌 한 줄씩 이어지는 음성 믹서 목록으로 표시하며 실제 참가자 수만 렌더링
- 참가자별 조절기는 중앙 폭에 맞춰 자동 축소되고 중앙·우측 패널은 세로 스크롤로 모든 항목에 접근
- 영상 송수신과 로컬 모니터는 제거됨
- Spring 공연 준비 이벤트의 MR URL을 각 클라이언트가 내려받아 MP3/WAV를 48kHz mono로 디코딩
- Spring 재생 시작 이벤트 수신 시 각 클라이언트의 MR을 로컬 출력에 재생
- MR은 최종 출력 mixer에만 합류하며 마이크 캡처·Opus 송신 경로에는 들어가지 않음
- 로컬 MR 음량을 참가자마다 독립적으로 조절 가능하며 조절값 역시 네트워크로 전송하지 않음
- P2P `MR_READY`에서 공연 ID·샘플 수·오디오 지문이 모두 일치한 참가자만 준비 완료로 집계
- 가장 낮은 Client ID를 동기화 leader로 선택하고 300ms 뒤 `MR_START`를 전파해 모든 준비된 참가자가 함께 시작
- leader의 MR sample position을 500ms마다 교환하고 10ms를 넘는 차이를 회당 최대 0.5ms씩 제한 보정
- presigned URL의 query가 바뀌어도 재사용하는 SHA-256 검증 로컬 MR 캐시
- MR 파일 불일치는 즉시 전체 재생을 중단하고, 준비 응답이 없는 참가자는 15초 뒤 닉네임과 함께 실패 처리
- 준비 중 참가자가 바뀌면 기존 예약을 취소하고 500ms 동안 연결 인원이 안정된 뒤 READY를 다시 집계
- 노래를 시작한 사용자는 재생 중 취소할 수 있으며 Spring 기존 취소 요청과 P2P `MR_CANCEL`을 함께 사용해 모든 참가자의 로컬 MR을 중단
- WASAPI 입력 callback에서 이펙트 적용 전 peak dBFS와 clipping sample을 계측하고 GUI에 실시간 경고

현재 direct-only 정책에는 TURN 미디어 relay가 없다. 대칭형 NAT나 UDP 차단 환경에서는 직접 연결이 실패할 수 있다.

현재 전송 형식은 내부 48kHz mono f32를 2.5ms Opus Restricted Low Delay로 압축한다. 목표 bitrate는 128kbps constrained VBR이며 노래 음질을 위해 music signal hint를 사용한다.

## 요구사항

- 최신 stable Rust([rustup](https://rustup.rs/))
- Windows: Visual Studio 2022 Build Tools의 **Desktop development with C++** workload
- AWS/Linux 보안 그룹 및 방화벽에서 UDP 50000 허용
- 실제 음성 테스트에는 유선 LAN과 유선 이어폰 또는 유선 헤드셋 사용

Windows와 Linux의 시스템 시각을 동기화할 필요는 없다. 측정에는 프로세스 기준 monotonic clock을 사용한다.

## 빌드와 검증

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release -p audio-gui -p audio-relay-server
```

## Linux/AWS rendezvous 서버 실행

```bash
cargo build --release -p audio-relay-server
./target/release/audio-relay-server --bind 0.0.0.0:50000
```

서버 역할은 다음으로 제한된다.

- 유효한 Ping에 Pong 응답
- session/client endpoint 등록
- ICE 인증정보와 후보 설명 교환
- 최대 4명 정원·Client ID 충돌·잘못된 등록 오류 응답
- 16KiB ICE 설명 제한과 IP별 전체/등록 token-bucket rate limit
- 앱 `Leave` 수신 시 즉시 제거하고, 비정상 종료 참가자는 30초 뒤 만료
- 30초 주기 JSONL 상태 통계와 systemd journal 기록
- Audio와 DeliveryAck 미디어 패킷 거부

EC2에 Linux release binary를 준비한 뒤 저장소 구조를 유지한 상태에서 다음 설치기를 사용한다.

```bash
sudo bash ./scripts/install-rendezvous-server.sh ./target/release/audio-relay-server
journalctl -u audio-relay-server.service -f
```

현재 등록 절차에는 IP rate limit과 구조 검증은 있지만 운영용 참가자 인증·암호화는 없다. 실제 방 참가 여부 검증은 Spring이 발급할 단기 session credential이 추가된 뒤에만 가능하므로 현재 UDP 포트를 불특정 공개 운영 서비스에 사용하면 안 된다.

2026-08-02 기준 새 서버는 `15.165.205.31:50000`에 배포됐다. 배포 직후 smoke 결과는 [`results/rendezvous-post-deploy-smoke.csv`](results/rendezvous-post-deploy-smoke.csv)에 기록했다. 이는 서버 응답 확인용 2초 측정이며 최대 4대 실시간 음성 승인 결과는 아니다.

## Windows 네트워크 측정

```powershell
cargo run --release -p network-tester-client -- `
  --server 15.165.205.31:50000 `
  --duration-seconds 600 `
  --interval-micros 2500 `
  --packet-bytes 300 `
  --output results\network-test.csv
```

`packet-bytes`는 56바이트 헤더를 포함한 전체 UDP payload 크기다. 유효 범위는 56~65507바이트다.

## Windows 통합 앱 실행

최종 사용자에게는 `target\release\audio-gui.exe` 하나만 배포한다. 앱을 직접 실행하면 웹의 방 입장 요청을 기다리는 화면이 나타나며, 앱 안에서 방을 검색하거나 초대 코드를 직접 입력하지 않는다.

최초 설치 시 사용자 계정의 `ssafystar://` 실행 연결을 등록한다. 관리자 권한은 필요하지 않다.

```powershell
target\release\audio-gui.exe --register-protocol
```

등록 해제는 `--unregister-protocol`을 사용한다. 앱은 Windows 단일 인스턴스로 동작하므로 한 방에 연결된 상태에서 두 번째 실행으로 다른 방을 열 수 없다.

웹 실행 연동은 다음 두 입력 형식을 지원한다.

```text
ssafystar://low-latency/join?roomId=55001&authToken=ACCESS_JWT
```

운영 웹은 `roomId`와 현재 access JWT만 전달한다. 방 이름·초대 코드·닉네임·오디오 세션 ID·Rendezvous 주소는 앱이 Spring의 저지연 앱 세션 API에서 다시 조회하며, URI에 포함된 `backendUrl`과 `backendWsUrl`은 사용하지 않는다.

아래 명시적 인자는 로컬·통합 시험용이다.

```powershell
target\release\audio-gui.exe `
  --room-id 55001 `
  --room-name "저지연 방" `
  --invite-code A24G2T `
  --session-id 55001 `
  --nickname 유진 `
  --auth-token ACCESS_JWT `
  --server 15.165.205.31:50000 `
  --backend-url https://ssafystar-k.site
```

`room-id`는 Spring Boot의 숫자형 방 ID다. `auth-token`에는 Spring Boot가 발급한 현재 access JWT를 전달한다. 운영 백엔드는 앱 내부의 `https://ssafystar-k.site`를 사용하며, 개발 시험에서만 `--backend-url` 또는 `SSAFYSTAR_BACKEND_URL`로 덮어쓸 수 있다.

통합 앱은 다음 Spring 경로를 사용한다.

- `POST /api/rooms/{roomId}/low-latency/app-session`: 방 참가 상태 검증 및 앱 전용 실행 정보·갱신 토큰 발급
- `POST /api/low-latency/auth/refresh`: 앱 access JWT와 1회용 앱 refresh token 자동 회전
- `GET /api/songs`: 곡 검색
- `/ws` STOMP 연결 및 `/topic/rooms/{roomId}` 구독
- `/app/rooms/{roomId}/performance/prepare`: 선택 곡 공연 준비
- `/app/rooms/{roomId}/performances/{performanceId}/playback/start`: 재생 시작
- `/app/rooms/{roomId}/performances/{performanceId}/cancel`: 시작한 사용자의 노래 취소
- `PERFORMANCE_PREPARATION_STARTED`: 곡 정보와 `mrDownloadUrl` 수신 및 로컬 다운로드
- `PLAYBACK_STARTED`: 준비된 로컬 MR 재생 시작
- `PERFORMANCE_CANCELLED`: 각 앱의 로컬 MR 중단과 재생 패널 초기화
- 로컬 MR의 마지막 샘플 재생 시 오른쪽 재생 패널을 자동 초기화하고, 가창자 앱은 기존 `/playback/finish` STOMP 요청 전송
- `ROOM_TERMINATED`: 웹 방 종료 시 오디오 앱도 종료
- `DELETE /api/rooms/{roomId}/leave`: 앱의 퇴장 버튼 또는 창 닫기 시 Spring 참가 상태 정리

Rust 앱은 Spring이 함께 발급한 불투명 앱 refresh token으로 access JWT 만료 전에 자동 갱신한다. refresh token은 사용할 때마다 폐기·재발급되며, 갱신 뒤 STOMP도 새 JWT로 다시 연결한다. 곡 검색 중 `401`이 발생한 경우에도 한 번 자동 갱신하고 검색을 재시도한다.

### Spring 연동 직접 시험

아무 인자 없이 실행하면 실제 Spring 방 ID와 JWT를 입력받고 운영 Spring의 곡 검색 REST와 공연 STOMP를 시험한다. 따라서 화면의 곡 목록은 Spring Boot 응답이다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-spring-integration-test.ps1
```

고정된 시험곡을 제공하는 내장 Mock Spring은 명시적으로 `-Mock`을 붙였을 때만 사용한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-spring-integration-test.ps1 -Mock
```

실제 Spring 서버를 시험할 때만 숫자형 방 ID와 서버 주소를 지정한다. `실제숫자형방ID`라는 문자열을 그대로 입력하는 것이 아니라 DB에 존재하는 숫자값으로 바꿔야 한다. access JWT는 화면에 표시되지 않는 보안 입력으로 요청한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-spring-integration-test.ps1 `
  -RoomId 55001 `
  -BackendUrl http://localhost:8080
```

앱에서 다음 순서로 확인한다.

1. `SPRING`과 `STOMP`가 `CONNECTED`인지 확인
2. `곡 검색`을 눌러 실제 Spring 곡 목록 확인
3. 모달에서 `이 곡 선택`을 눌러 내 로컬 선곡에만 반영되는지 확인
4. 메인 화면에서 `공연 준비`를 눌러 모든 참가자가 MR을 개별 다운로드하는지 확인
5. 오른쪽 위 `재생 중인 노래`의 `LOCAL MR`이 `READY`가 된 뒤 `재생 시작` 실행

공연 준비 요청이 성공하려면 입력한 JWT의 사용자가 해당 방에서 온라인 상태인 가창자여야 하며 방 상태가 `PREPARING`이어야 한다. 조건이 다르면 Spring이 반환한 오류가 곡 상태 영역에 표시된다.

Spring 연동 확인 후 같은 실행기에 `-FullAudio`를 붙이면 WASAPI와 rendezvous/P2P까지 함께 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-spring-integration-test.ps1 `
  -RoomId 55001 `
  -BackendUrl https://ssafystar-k.site `
  -FullAudio `
  -RelayServer 15.165.205.31:50000 `
  -SessionId 55001
```

테스트 실행기는 JWT를 명령행 인자에 넣지 않고 현재 프로세스의 `SSAFYSTAR_ACCESS_TOKEN` 환경 변수로만 자식 앱에 전달한 뒤 제거한다.

기본 입력 장치는 WASAPI Shared Event-Driven 최소 period를 사용하고, 출력 장치는 WASAPI Exclusive Event-Driven 최소 period를 사용한다. 로컬 모니터는 하지 않으며 상대 참가자의 P2P 음성과 로컬에서 내려받은 MR만 출력한다. MR은 입력 및 네트워크 송신 경로와 분리된다.

마이크 패널의 입력 레벨은 이펙트 적용 전 기본 입력 장치의 최근 1초 peak다. `-60~0 dBFS`로 표시하며 raw sample이 `0.98` 이상이면 clipping으로 집계한다. clipping 경고가 반복되면 마이크 또는 오디오 인터페이스의 입력 gain을 낮춘다.

실행 중 기본 오디오 장치가 끊기면 앱은 음성 연결을 유지한 채 2초 간격으로 WASAPI 장치를 다시 연다. 세션별 진단 기록은 `%LOCALAPPDATA%\SSAFYStar\diagnostics\session-*.jsonl`, 검증된 MR 캐시는 `%LOCALAPPDATA%\SSAFYStar\mr-cache`에 저장된다. 진단 기록은 최대 20개·14일, MR 캐시는 최대 512MB·14일 기준으로 정리된다. JWT와 MR 다운로드 URL은 진단 기록에 저장하지 않는다.

방 퇴장 버튼이나 창 닫기를 누르면 P2P 연결과 오디오 장치를 정상 종료한 뒤 앱도 종료한다.

두 PC 검증에서는 같은 `session-id`를 사용하고 `nickname`만 다르게 실행한다. Client ID는 rendezvous 서버가 1~4에서 자동 할당한다. 연결·지연·concealment·underrun 상태는 통합 GUI에서 확인한다.

## 주요 통계 해석

| 로그 항목 | 의미 |
| --- | --- |
| `delivery round-trip` | Audio 송신부터 상대의 DeliveryAck 수신까지 걸린 시간 |
| `unique_received` | 새 sequence로 인정한 Audio 프레임 수 |
| `corrupt_frames` | synthetic payload 검증 실패 수 |
| `duplicates` | 중복 sequence 수 |
| `out_of_order` | 순서가 뒤바뀐 프레임 수 |
| `playback_underrun_events` | 원격 재생 큐가 비어 무음으로 전환한 횟수 |
| `emergency_trimmed_samples` | 누적 지연 제한을 위해 삭제한 샘플 수 |
| `average_speed_adjustment_ppm` | 장치 clock 차이를 흡수하기 위한 평균 재생속도 보정 |
| `Peer receive-to-ACK dispatch` | 상대 ICE 수신 스레드의 ACK 처리 지연 |
| `ICE receive-to-audio main loop` | 로컬 ICE 수신부터 오디오 처리 루프까지의 지연 |
| `Capture queue age estimate` | 캡처 ring에 쌓인 샘플 수 기반 대기시간 추정 |
| `Playback queue residence estimate` | 원격 재생 ring의 샘플 수 기반 체류시간 추정 |
| `Input callback effect processing` | 효과 처리를 포함한 입력 callback 실행시간 |

`Estimated one-way`는 RTT/2 추정값이며 실제 방향별 지연 측정값이 아니다.

## 현재 Phase gate

- Phase 1: AWS Wi-Fi 10분 측정 통과, 유선 LAN 비교는 연기
- Phase 2: 실제 장치 동작 확인, 물리 mouth-to-ear 측정 대기
- Phase 3: 최대 4명 Full Mesh 구현·합성 검증 완료, 실제 PC 4대 검증 대기
- Phase 4: 소프트웨어 통계 일부 구현, 구간별·물리 지연 계측 대기
- Phase 4.5: Windows GUI와 핵심 client module 분리 완료, 실장치 UX 검증 대기
- Phase 5: Spring MR 다운로드와 P2P READY·예약 시작·sample-position 제한 보정 구현, 실제 최대 4대의 10ms 이내 동기 검증 대기
- Phase 6: 기존 서비스 통합 미구현

상세 진행 순서와 Codex 작업 후 문서 갱신 규칙은 [`docs/phase-status.md`](docs/phase-status.md)를 단일 기준으로 사용한다.

## 격리와 제거

실험 관련 소스·문서·결과·빌드 산출물은 이 디렉터리 아래에만 둔다. 실험을 폐기하려면 `experiments/low-latency-audio`만 제거하면 된다.
