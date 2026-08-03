# Phase 진행 현황

마지막 갱신: 2026-08-01

이 문서는 구현 완료와 검증 완료를 구분한다. 모든 작업은 `experiments/low-latency-audio` 아래에 격리되어 있으며 기존 backend, frontend, database, 인증 또는 WebRTC 서비스 코드는 변경하지 않았다.

서버는 두 역할로 분리한다. Rust `audio-relay-server`는 P2P UDP rendezvous만 담당하고, 기존 Spring Boot는 곡 API·공연 상태·MR URL·재생 이벤트를 담당한다. Spring Boot 코드는 수정하지 않고 기존 REST/STOMP 계약만 사용한다. 최신 경계는 [`server-topology.md`](server-topology.md)를 기준으로 한다.

최종 기준 환경은 최대 네 대의 Windows PC, 유선 LAN, 유선 이어폰 또는 유선 헤드셋이다. 참가자들은 동일 국가에 있어야 하며 모든 참가자 쌍이 직접 P2P 연결에 성공해야 한다. VPN과 이동통신망은 제외하고 백그라운드 다운로드를 중지하며 절전 기능을 해제한다. 현재 Wi-Fi 결과는 개발 중 참고 자료로만 사용하고, 최종 실시간 합창 gate는 유선 LAN에서 검증한다.

## 제품 목표와 필수 사용 조건

제품 목표는 MR을 기준으로 최대 4명이 동시에 부르는 실시간 합창 체감을 제공하는 것이다. 다음 여섯 조건을 지원 환경의 필수조건으로 사용한다.

1. 유선 LAN
2. 유선 이어폰 또는 유선 헤드셋
3. 동일 국가
4. 직접 P2P 연결 성공
5. VPN과 이동통신망 제외
6. 백그라운드 다운로드 중지와 절전 기능 해제

특정 오디오 인터페이스, 동일 지역 또는 고정 RTT 수치는 필수조건이 아니다. 측정 결과가 목표 지연에 미달하면 해당 구간을 최적화하거나 품질 경고에 활용한다.

## 요약

| Phase | 범위 | 구현 | 현재 검증 상태 |
| --- | --- | --- | --- |
| Phase 0 | Rust workspace와 공통 module | 완료 | 완료 |
| Phase 1 | UDP Echo 네트워크 측정 | 완료 | AWS Wi-Fi 10분 gate 통과, LAN 비교 연기 |
| Phase 2 | 48 kHz local audio와 monitoring | 완료 | 실제 장치 반복 실행 완료, 물리 지연 측정 대기 |
| Phase 3 | 최대 4 client Full Mesh P2P Opus | 2.5ms Opus와 4 client 구조 구현·로컬 합성 검증 완료 | 실제 Windows PC 4대 LAN 음성 검증 필요 |
| Phase 4 | end-to-end 지연 계측 | 두 client 구간별 소프트웨어 계측 구현 | 4 client peer별 계측·물리 계측 대기 |
| Phase 4.5 | Windows client GUI와 core 분리 | 구현 완료 | config·control·effects·MR·signaling·peer/jitter·playback·ICE·WASAPI 분리, 실장치 UX 검증 대기 |
| Phase 5 | 서버 기반 동기 재생 | 부분 구현 | Spring MR 다운로드·로컬 출력 재생 구현, 미래 기준 시각·READY 집계 미구현 |
| Phase 6 | 기존 서비스 통합 | 미구현 | 시작 전 |

## Phase 0 — workspace와 공통 모듈

상태: **완료**

구현:

- Rust workspace
- `protocol`, `metrics`, `audio-core` crates
- `network-tester-client`, `audio-client`, `audio-relay-server`
- big-endian 명시적 packet encoding
- sequence wraparound 처리
- percentile, loss, duplicate, out-of-order 계산
- lock-free SPSC audio sample buffer

검증:

- Windows release build
- Linux AWS server release build
- workspace unit tests

## Phase 1 — UDP 네트워크 측정

상태: **구현 완료, AWS Wi-Fi gate 통과, LAN 비교 연기**

구현:

- 기본 2.5ms 주기의 UDP Ping
- monotonic timestamp
- RTT, jitter, inter-arrival, loss, duplicate, out-of-order, deadline miss
- p50, p95, p99 요약
- CSV 출력과 Ctrl+C 종료

AWS Wi-Fi 10분 결과:

```text
sent/received:    239976 / 239914
loss:             0.0258%
deadline misses:  16, 약 0.0067%
RTT p50/p95/p99:  11.244 / 16.695 / 33.585 ms
RTT maximum:      133.742 ms
jitter p95/p99:   3.536 / 7.112 ms
```

적용 gate:

- loss ≤ 0.5%
- deadline miss < 0.1%
- RTT p50 ≤ 15ms
- RTT p95 ≤ 20ms

이 Wi-Fi 측정은 gate를 통과했다. 유선 LAN에서 p99와 maximum spike가 얼마나 줄어드는지는 후속 검증으로 남긴다.

## Phase 2 — local audio와 monitoring

상태: **구현 완료, 실제 장치 동작 확인, 물리 지연 측정 대기**

구현:

- WASAPI Shared Event-Driven input stream
- WASAPI Exclusive Event-Driven output stream
- 기본 장치의 48kHz PCM 형식 자동 협상
- 장치별 PCM 16/24/32-bit 입력을 내부 mono f32로 변환
- 내부 f32 출력을 장치 PCM 형식으로 변환
- 입력은 `IAudioClient3` 저지연 period 우선 협상, 불가능하면 기본 Shared period 사용
- 출력은 Exclusive 최소 period와 정확한 48kHz stereo PCM 16-bit 형식을 필수로 사용
- 48 kHz 설정 선택
- f32/i16/u16을 내부 mono f32로 변환
- 첫 번째 입력 channel 사용
- 요청 장치 buffer 120샘플(2.5ms)
- lock-free capture/playback ring
- underrun 시 안전한 silence 출력
- 입력 callback에서 echo·reverb 처리
- 송신 신호와 같은 처리 결과를 조절된 level로 local monitor에 분기
- local monitor queue 누적 제한

현재 local monitor 기본값:

```text
level:       100%
max queue:   40ms
trim to:     10ms
```

남은 검증:

- local monitor 10분 안정성
- 외부 click/loopback 방식 mouth-to-ear p50/p95
- CPU/DPC spike가 실제 장치 callback에 미치는 영향

## Phase 3 — 최대 4 client Full Mesh P2P Opus

상태: **최대 4 client Full Mesh 구현 및 로컬 합성 검증 완료, 실제 PC 4대 LAN 검증 필요**

### 구현된 전송 구조

- 내부 48 kHz mono f32, 네트워크 전송 Opus Restricted Low Delay
- 120샘플, 2.5ms frame, 128kbps constrained VBR, music signal
- AWS 서버는 rendezvous와 ICE 설명 교환만 수행
- host, IPv4/IPv6, 복수 STUN server-reflexive candidate
- direct-only ICE, media relay와 TURN fallback 없음
- 실패한 connectivity check는 10초 timeout 후 새 UDP mapping으로 재시도
- 고우선순위 Windows ICE network thread
- Audio 수신은 network thread에서 즉시 전달하고 DeliveryAck는 최신 sequence 기준 20ms마다 전송
- deterministic synthetic 신호의 Opus encode/decode 및 패킷 무결성 검증
- client별 최대 3개의 독립 ICE transport
- 대상 client별 ICE description bundle과 rendezvous 교환
- 단일 microphone frame을 연결된 최대 3개 peer에 fan-out
- client ID 1~4 제한과 peer별 연결 상태 출력

### 구현된 재생 안정화

- 입력 callback이 한 번에 전달한 완성 frame을 최대 16개까지 즉시 송신 큐로 배출
- sequence 기반 2.5ms 고정 jitter buffer
- peer별 2 frame(5ms) 고정으로 지연을 우선하고 late frame은 concealment 처리
- 재생 sequence보다 늦은 frame은 sample ring 진입 전에 폐기
- 재생 시각에 frame이 없을 때만 zero-lookahead concealment
- 장치 clock drift와 과도한 출력 큐 회수용 adaptive linear resampling 최대 ±0.3%
- 최종 출력 ring 30ms 초과 시 15ms 정리는 비상 안전장치로만 유지
- 누락 frame에 zero-lookahead Opus PLC를 적용하고 실패 시 기존 감쇠 concealment로 fallback
- late frame 거부와 resync
- stale frame 기한은 고정 jitter 5ms+30ms로 계산
- 새 peer는 자신의 jitter prebuffer가 준비된 뒤 기존 전역 재생 시계를 변경하지 않고 mixer에 합류
- 명시적 `Leave` 또는 ICE `Disconnected`에서만 해당 peer의 live playout buffer와 concealment 상태를 초기화하고 다른 peer 재생은 유지
- 단순 음성 무수신과 긴 지연은 퇴장으로 판정하지 않고 jitter buffer와 concealment로 처리
- 오래된 누적 음성은 2.5ms frame 경계에서 정리
- frame 정리 직후 1ms crossfade 적용
- 누락 concealment 후 실제 frame 복귀 시 16 sample crossfade 적용
- underrun, overflow, trim, speed adjustment 통계
- peer별 독립 sequence tracker, 고정 jitter buffer, 네트워크 concealment·퇴장 concealment 분리 및 RTT 통계
- 최대 3개 원격 frame의 동시 mixer
- 참가자 수에 따른 `1/sqrt(N)` gain과 peak limiter
- 한 peer의 연결 해제 시 해당 buffer만 초기화

### 최대 4 client 로컬 합성 검증

- 4개 client가 각각 나머지 3개 client와 연결되어 전체 6개 P2P link 형성
- 각 client에서 `peers=3` 확인
- 약 25초 실행에서 client별 약 2.2만 peer packet 송수신
- corrupt, duplicate, out-of-order, concealment, late, resync 모두 0
- 실제 Windows PC 4대의 microphone, WASAPI output, mixer 체감 품질은 후속 LAN 검증 필요

### 구현된 노래방 효과

- Dry level
- Echo level, delay, feedback
- Reverb level, time
- 입력 callback에서 sample 단위 처리해 별도 block 대기 없음
- 처리한 동일 신호를 network와 local monitor로 분기

기본 효과값:

```text
Dry:             100%
Echo:             12%
Echo delay:      110ms
Echo feedback:    18%
Reverb:           15%
Reverb time:      1.2s
```

### 실제 두 PC Wi-Fi 검증에서 확인한 내용

- P2P 연결 성공 시 bidirectional 5ms Opus 전달
- 반복 테스트에서 corrupt, duplicate, out-of-order가 대부분 0
- 성공 run의 delivery RTT는 대략 p50 10~15ms, p95 28~45ms 범위
- network ACK가 main audio loop를 기다리지 않음
- real microphone과 wired headphone 동작
- local monitor는 P2P 실패 중에도 독립적으로 동작

### 실제 두 PC 유선 LAN 검증 판정

- 두 client 직접 P2P 양방향 음성 경로는 현재 단계에서 조건부 합격으로 판정
- 정상 완료된 한 방향에서 RTT p50 13.917ms, p95 20.383ms, p99 25.425ms
- 같은 방향에서 40,956개 수신 frame 중 late/concealment 7개(약 0.017%)
- playback underrun, emergency trim, resync 모두 0
- 반대 방향 로그는 `ICE state: Disconnected`에서 끝나 최종 `Relay completed` 통계가 없었음
- 따라서 기능 진행을 막지 않고 다음 단계로 이동하되, 반대 방향 자동 종료 로그 확인을 회귀 검증 항목으로 유지

### 알려진 제한

- 양쪽 테스트 network 모두 STUN 목적지별 public UDP port가 달라지는 symmetric NAT 성향을 보임
- direct-only 정책에서는 모든 candidate pair가 실패할 수 있음
- ICE retry는 성공률을 높일 수 있지만 symmetric NAT 조합의 연결을 보장하지 않음
- UPnP/PCP/NAT-PMP 또는 TURN fallback은 아직 없음
- device clock 차이와 network jitter에 따라 underrun과 queue trim이 증가함
- 실제 local/remote mouth-to-ear latency는 측정하지 않음

### Phase 3 남은 작업

1. 20ms 주기 누적 DeliveryAck의 다중 PC 효과 검증
2. 참가자 입장·퇴장과 연결 재시도 수명주기 회귀 검증
3. 모든 peer 연결 READY 후 MR 시작 gate
4. 네 명 실제 Opus 10분 이상 실행
5. 유선 LAN에서 모든 client의 `Full Mesh completed` 로그를 남기는 회귀 테스트
6. 참가자 시간차 입장·중도 퇴장 실장치 회귀 테스트

코덱 결정:

- 현재 Phase 3~5 기본 전송 형식은 48kHz mono 2.5ms Opus Restricted Low Delay
- 128kbps constrained VBR와 music signal hint 사용
- 최대 4명 유선 LAN에서 Opus packet rate, CPU, 꼬리 지연과 청감 품질 검증 필요

## Phase 4 — end-to-end 지연 계측

상태: **Rust 앱 구현 완료, 실장치 통합 검증 대기**

현재 측정 가능:

- delivery RTT p50/p95/p99
- RTT/2 기반 추정 편도 값
- loss, duplicate, out-of-order, deadline miss
- concealment, underrun, overflow, trim
- 평균·최대 playback speed adjustment
- 요청 input/output device buffer
- peer ICE 수신부터 DeliveryAck 발송 준비까지의 지연
- ICE network thread 수신부터 audio main loop 처리까지의 지연
- capture ring queue 체류시간 추정값
- remote playback ring queue 체류시간 추정값
- echo·reverb를 포함한 input callback 처리시간 평균·최대
- 각 구간의 min, mean, p50, p95, p99, max 로그

구현 및 검증이 남은 항목:

- 송신 main loop에서 ICE 실제 UDP send 완료까지의 queue 지연
- frame별 playback enqueue부터 output callback 소비까지의 실제 체류시간
- 양쪽 결과 파일을 session과 실행 시각 기준으로 자동 결합하는 분석 도구
- 두 명과 네 명 테스트에서 peer별 p50/p95/p99 결과 확보
- 외부 click/loopback 실제 mouth-to-ear 측정 절차

WASAPI Shared-input/Exclusive-output 진행 상태:

- 기본 입력·출력 장치를 자동 검사하는 `wasapi-probe` 구현 완료
- 48kHz PCM mono/stereo 및 16/24/32-bit·WAVEFORMATEXTENSIBLE 형식 협상 검사 구현
- 현재 개발 PC에서 입력 최소 2ms, 출력 최소 3ms 확인
- 현재 개발 PC의 호환 형식은 입력 Extensible PCM 32/24-bit stereo, 출력 PCM 16/24-bit mono·stereo 계열
- 기본 입력·출력 장치의 Shared mix format과 Shared/Exclusive period 후보 자동 확인 구현
- 실제 Shared Event-Driven input과 Exclusive Event-Driven output stream 연결 완료
- 현재 개발 PC에서 입력 2ms, 출력 period·큐·WASAPI stream latency 3ms로 로컬 실행 확인
- 10초 출력 callback 측정: p50 2.998ms, p95 3.140ms, p99 3.463ms, 최대 7.529ms
- 두 번째 PC에서 자동 형식 협상과 실제 음성 회귀 테스트 필요

현재 capture/playback queue 수치는 샘플 수와 48kHz sample rate로 계산한 추정값이다. Windows와 장치 driver 내부 buffer는 포함하지 않는다. RTT/2 역시 대칭 경로 가정일 뿐 방향별 지연 측정값이 아니다.

## Phase 4.5 — Windows client GUI

상태: **부분 구현**

2026-08-01 GUI 개편:

- 영상형 중앙 무대를 없애고 최대 4명의 음성 연결 상태를 보여주는 오디오 전용 화면으로 재구성
- 대기, 웹 실행 정보 수신, P2P 연결 중, 오디오 방, 연결 오류의 실제 이식 흐름을 각각 구현
- 앱 내부의 닉네임·세션 ID·초대 코드 직접 입력을 제거하고 웹 실행 정보만 수신
- `ssafystar://low-latency/join?...` URI 또는 명시적 실행 인자로 방 정보 수신
- 방 화면은 방/참가자, Full Mesh 음성 상태, 마이크 효과와 네트워크 상태의 3열 구조
- 영상, 채팅, 점수판과 로컬 모니터 경로를 통합 앱에서 제거
- `audio-client`를 library target으로 전환하고 GUI가 channel로 직접 제어하여 별도 프로세스와 stdin 로그 파싱 제거
- 최종 사용자 실행 파일은 `audio-gui.exe` 하나이며 같은 폴더의 `audio-client.exe`가 필요하지 않음
- 개발 중 레이아웃 검증을 위한 `--ui-preview`, `--ui-waiting`, `--ui-connecting`, `--ui-error` 옵션 추가
- 실제 참가자 수만 한 줄씩 이어지는 음성 믹서 목록으로 렌더링하고 최대 4명까지 중앙 스크롤로 접근
- 참가자별 Volume·Mute·Echo·Reverb 조절기는 중앙 폭에 맞춰 자동 축소하고 중앙·우측 패널에 항상 보이는 세로 스크롤 제공
- rendezvous의 `PeerName` 이벤트를 참가자 표시 상태에 반영하여 닉네임 변경을 하드코딩 없이 갱신
- 메인 화면에는 로컬 선곡·준비·재생 상태를 표시하고 `곡 검색` 버튼에서 Spring 곡 API 기반 검색 모달을 여는 흐름 구현
- 모달의 곡 선택은 각 앱의 로컬 상태에만 저장하며 `공연 준비`를 눌렀을 때만 Spring 요청 전송
- 방 공연 곡과 로컬 MR 상태는 오른쪽 위 `재생 중인 노래` 패널에 표시
- access JWT로 저지연 앱 세션을 발급받은 뒤 `GET /api/songs`, `/ws` STOMP 인증, 방 topic 구독, 공연 준비·재생 시작을 수행하는 Rust 어댑터 연결
- Spring의 공연 준비·재생 시작·재생 종료·공연 취소 이벤트를 GUI 선곡 상태에 반영하고 `ROOM_TERMINATED` 수신 시 오디오 앱 종료
- Spring의 회전형 앱 refresh token으로 백엔드 access JWT를 만료 전에 자동 갱신하고 STOMP를 새 토큰으로 재연결
- `run-spring-integration-test.ps1`과 `--backend-only-test`를 추가해 오디오 장치 없이 실제 JWT·방 ID로 REST/STOMP 연동을 수동 검증 가능
- 같은 실행기에 `-FullAudio`를 지정하면 Spring 연동과 WASAPI/rendezvous/P2P를 한 번에 검증 가능
- 테스트 입력 JWT는 명령행 대신 프로세스 환경 변수로 전달하고 앱 종료 후 제거
- 실행기를 인자 없이 실행하면 실제 Spring 방 ID와 JWT를 입력받아 운영 REST/STOMP를 확인하며, 로컬 mock은 `-Mock`을 명시한 경우에만 사용
- 실험 모드도 실제 방과 동일한 3열 GUI를 사용하고 오디오 장치 실행 여부만 다름
- 준비 이벤트의 `mrDownloadUrl`에서 MP3/WAV를 각 클라이언트가 다운로드하고 48kHz mono로 변환
- 재생 시작 이벤트 수신 시 MR을 최종 출력 mixer에만 추가하여 마이크 캡처·Opus 송신에서 제외
- MR 마지막 샘플과 백업 종료 타이머를 감지해 재생 패널을 초기화하고 가창자 앱에서 Spring 재생 종료 요청 전송
- 곡 검색 모달 검증용 `--ui-song-modal` 미리보기 옵션 추가
- 곡 검색에 전체·인기·추천 filter, cursor 기반 추가 조회, 최근 검색어 로컬 상태 추가
- presigned query와 무관한 MR 캐시 key, SHA-256 손상 검증, 14일·512MB 정리 정책 추가
- P2P MR READY·leader 예약 시작·sample position 제한 보정을 Spring 변경 없이 추가
- 기본 오디오 장치 런타임 장애 감지와 2초 간격 WASAPI 자동 재연결 추가
- Windows 단일 인스턴스 잠금으로 이미 참여한 방 외의 두 번째 앱 실행 차단
- `--register-protocol`, `--unregister-protocol`으로 사용자 계정 `ssafystar://` 연결 등록 지원
- 네트워크·MR·장치·Spring 상태를 `%LOCALAPPDATA%\SSAFYStar\diagnostics`에 JSONL로 기록
- READY 미응답 참가자 15초 timeout, MR 지문 불일치 즉시 중단, 실패 Client ID·닉네임 표시
- 준비 중 참가자 변경 시 stale READY 제거·예약 취소·500ms 안정 후 재집계
- raw 마이크 입력의 최근 1초 peak dBFS, clipping sample 계측과 GUI 경고·진단 기록
- 내 마이크 송신 음량·Echo·Reverb를 Opus 인코딩 전에 적용하고, 상대 참가자별 음량·Mute·Echo·Reverb는 디코딩 뒤 내 로컬 출력에만 적용
- 참가자별 독립 로컬 MR 음량 조절을 추가하고 MR이 마이크·Opus 송신 경로에 섞이지 않는 구조 유지
- 노래 시작자 전용 취소 버튼, Spring 기존 `/cancel` 요청, P2P 150ms 예약 중단을 연결해 모든 참가자의 로컬 MR 종료

2026-07-23 구조 정리:

- CLI argument와 validation을 `config.rs`로 분리
- 종료·효과·MR stdin 제어를 `control.rs`로 분리
- MR WAV decode·리샘플링·재생 상태·출력 믹싱을 `mr.rs`로 분리
- 실시간 Echo·Reverb와 atomic parameter 상태를 `effects.rs`로 분리
- UDP 등록·Client ID 할당·ICE description bundle을 `signaling.rs`로 분리
- peer별 sequence·jitter buffer·PLC 상태를 `peer.rs`로 분리
- 출력 queue policy·callback 통계·adaptive resampler를 `playback.rs`로 분리
- ICE와 WASAPI는 각각 `ice_transport.rs`, `wasapi.rs` 유지
- GUI와 `audio-client` library를 한 프로세스의 typed channel로 결합하고 최종 실행 파일을 `audio-gui.exe` 하나로 통일
- 기존 Spring Boot REST/STOMP를 곡·공연·MR 제어 서버로 연결

2026-07-20 구현:

- `audio-gui` 네이티브 Windows 앱 추가
- Windows 맑은 고딕을 GUI 글꼴로 등록해 한국어 렌더링 지원
- `audio-client.exe`를 GUI binary에 포함해 최종 배포 파일을 `audio-gui.exe` 하나로 통일
- rendezvous 서버가 접속 순서대로 빈 ClientId 1~4를 할당하고 GUI의 수동 참가 슬롯 입력 제거
- 닉네임, 세션 ID, 참가 슬롯(1~4) 입력 후 기존 `audio-client` Full Mesh 실행
- 기존 콘솔의 peer 연결·퇴장 로그를 참여자 카드와 통신 상태에 반영
- 보라색 네온 테마의 3열 방 화면: 방/참여자, 라이브 상태, 음성 효과
- local monitor, dry, echo level/delay/feedback, reverb level/time을 실행 중 stdin 제어로 즉시 반영
- GUI 프로세스 종료 시 `audio-client`에 정상 종료 요청

남은 범위:

- 실제 브라우저의 `ssafystar://` 호출과 설치본을 함께 사용한 종단 간 검증
- Windows installer가 앱의 `--register-protocol`을 호출하도록 패키징
- 같은 방의 두 번째 실행 요청을 기존 창 앞으로 가져오는 선택적 IPC (다른 방은 현재 차단됨)
- 실제 Windows 장치와 최대 4대 환경에서 GUI 수명주기 회귀 검증

2026-08-02 rendezvous 운영 보강:

- `RendezvousError`와 정원 초과·Client ID 충돌·잘못된 세션·payload 초과·rate limit·version 불일치 코드 추가
- 앱에서 오류별 한국어 안내를 표시하고 종료 시 rendezvous 서버에 `Leave`를 세 번 전송
- 서버가 source endpoint까지 일치하는 `Leave`만 즉시 제거하고 비정상 종료는 기존 30초 만료로 정리
- ICE description 16KiB 제한, IP별 전체 packet 및 등록 token-bucket rate limit 추가
- JSONL 시작·할당·퇴장·30초 상태 통계와 hardened systemd unit·설치 스크립트 추가
- Spring 참가 인증과 payload 암호화는 Rust-only 범위 밖이므로 후속 통합으로 유지
- Windows 전체 79개 테스트·Clippy 경고 0개·Windows/Linux release 빌드 통과
- EC2 `15.165.205.31:50000`에 hardened systemd unit과 새 Linux binary 배포 완료. 이전 파일은 `backup-pre-hardening`으로 보존
- 배포 직후 2초·10ms 간격 Ping smoke에서 200송신/199수신, RTT p50 10.870ms·p95 20.553ms 확인. 최대 4대 실제 음성·MR 검증은 마지막 통합 gate로 유지

2026-08-02 Rendezvous v2 보안 배포:

- wire protocol v2와 Ed25519 서명 등록·nonce replay 차단을 적용한 Linux x86-64 서버를 EC2 `15.165.205.31:50000/UDP`에 배포
- systemd 서비스 재시작 후 `protocolVersion: 2` 기동 로그와 UDP 50000 포트 수신 상태 확인
- version 1 실행 파일은 `/usr/local/bin/audio-relay-server.backup-v1-20260802-before-v2`에 보존
- 배포 후 2초·10ms·300 byte Ping smoke에서 200송신/200수신, 손실 0%, RTT p50 10.663ms·p95 20.639ms 확인
- 별도 Ed25519 서명 등록 smoke에서 Client ID 할당과 정상 Leave를 확인했으며 rejected·rateLimited·malformed는 모두 0
- P2P 암호화 음성을 포함한 실제 2~4대 Windows 장치 검증은 마지막 통합 gate로 유지

사용자는 Windows 통합 GUI 하나에서 연결과 음향 설정을 조작한다. GUI thread와 오디오·네트워크 thread는 분리되어 있으나 동일 프로세스 안에서 typed channel로 제어와 상태를 교환한다.

최소 화면 범위:

- 웹 실행 정보 대기와 자동 방 연결
- 연결 단계와 일반 사용자가 이해할 수 있는 오류 표시
- 방 정보, 초대 코드, 참가자 음성 연결 상태
- ICE 연결 상태와 현재 전송 경로 표시
- 마이크는 기본 장치를 자동 선택하고 출력은 Exclusive mode 사용
- 마이크 송신 끄기, Dry, Echo, Reverb 조절
- ping, concealment, underrun, resync 상태 표시
- 방 퇴장 시 오디오 engine을 정상 종료한 뒤 통합 앱 창도 종료

구조 원칙:

- 오디오 callback과 ICE network thread는 GUI thread와 분리
- GUI 갱신 때문에 오디오 callback이 대기하거나 lock을 획득하지 않음
- 실시간 통계는 snapshot/channel 방식으로 GUI에 전달
- 콘솔과 GUI가 동일한 audio/network core와 설정 모델을 사용
- 효과 slider 변경은 block 재생성 없이 실시간 parameter만 갱신
- GUI가 멈춰도 현재 음성 연결은 가능한 한 유지

구현 후보는 Rust 생태계와 Windows 배포 단순성을 기준으로 비교한 뒤 결정한다. GUI framework 선정 자체가 Phase 3~4에서 확정한 통신 구조와 지연 목표를 변경해서는 안 된다.

## Phase 5 — 서버 기반 동기 재생

상태: **Rust P2P 동기화 구현 완료, 실제 최대 4대 정밀 동기 검증 대기**

구현됨:

- 기존 Spring 준비 이벤트에서 곡 정보와 인증된 MR 다운로드 URL 수신
- 각 클라이언트가 MR을 개별 다운로드하고 MP3/WAV 디코딩 및 48kHz mono 변환
- 기존 Spring 재생 시작 이벤트를 받으면 로컬 MR 재생 시작
- MR은 WASAPI 출력 직전 원격 음성 mixer에만 합성하고 음성 송신에서 제외
- 각 클라이언트가 SHA-256 검증 로컬 캐시에서 MR을 준비
- 공연 ID·sample 수·오디오 지문이 일치하는 최대 4명 READY 상태 교환
- 최소 Client ID leader가 300ms 미래 guard를 배포하고 추정 편도 전송 시간을 보정해 시작
- 500ms마다 leader sample position을 보고하고 10ms 초과 오차를 회당 최대 24 sample씩 제한 보정

남은 검증:

- 실제 Windows PC 2대와 4대에서 MR 시작 위치 차이 측정
- 서로 다른 RTT·jitter 조건에서도 MR position error ≤ 10ms 목표 확인
- 10분 이상 재생에서 제한 보정의 클릭·왜곡·누적 오차 확인
- READY 대기 중 실제 참가자 입장·퇴장과 15초 timeout의 다중 PC 회귀 확인
- 실제 마이크 gain 변화에 따른 dBFS 표시와 clipping 경고 임계값 확인

## Phase 6 — 기존 서비스 통합

상태: **미구현**

선행 Phase gate 통과 후 진행한다.

- 기존 song 기반 karaoke room의 optional low-latency mode
- 기존 Spring WebSocket은 chat, queue, participant, READY, playback control에 사용
- 실시간 음성은 Spring 밖의 direct P2P 경로 사용
- session authorization과 payload encryption 추가. IP rate limiting·Leave·systemd lifecycle은 Rust rendezvous에 선반영됨
- optional mode 실패가 기존 karaoke flow에 영향을 주지 않도록 격리

## 현재 결론

발표와 외부 공유에는 [`realtime-audio-presentation-brief.md`](realtime-audio-presentation-brief.md)를
현재 구현 설명과 검증 근거를 함께 보는 요약 문서로 사용한다.

Phase 0~2와 Phase 3의 최대 4명 Full Mesh 구조는 실행 가능한 상태다. Phase 1은 AWS Wi-Fi gate를 통과했다. Phase 3은 로컬 합성 4 client에서 전체 6개 P2P link와 fan-out 무결성을 검증했으며, 실제 Windows PC 4대와 실제 audio device 검증이 남아 있다.

아직 production 경로로 승인할 수 없는 이유:

- symmetric NAT에서 direct P2P 성공률이 낮음
- 최대 4명 구조는 합성 검증만 완료되어 실제 PC 4대의 mixer·대역폭·장치 안정성이 미검증
- playback과 local-monitor 안정화 회귀 테스트가 남음
- 실제 mouth-to-ear latency가 없음
- P2P 패킷 암호화·서명 등록·운영 lifecycle은 구현됐지만 Spring 사용자 계정과 Rust identity를 묶는 단기 credential 검증이 없음

두 client 유선 LAN 양방향 경로는 조건부 합격으로 처리한다. 반대 방향 최종 통계와 10분 안정성은 확인 필요 항목으로 유지한다. 이 확인은 Phase 4 계측과 Phase 5 MR 동기화 구현을 막지 않지만, 최종 목표가 유선 LAN 기반 최대 4인 실시간 합창이므로 Phase 6 통합 전 필수 승인 gate로 유지한다. 두 명 테스트 통과만으로 최대 4인 목표 완료를 판정하지 않는다.

## 진행 순서 — 2026-07-15 지정

1. **Phase 3 최대 4명 실제 장치 검증**
   - local monitor 100%와 40/10ms local queue 확인
   - remote 30/15ms queue와 capture burst drain 정책 확인
   - ICE attempt 2 동작 확인
   - 10분 실제 음성 run 확보
   - 구현된 다중 ICE, peer별 jitter buffer, fan-out, mixer 회귀 확인
   - 실제 Windows PC 4대 Full Mesh 실행 확인
2. **Phase 4 구간별 지연 계측과 통신 검증 완료**
   - capture부터 output callback까지 timestamp
   - 구간별 p50/p95/p99와 queue 체류시간
   - 외부 mouth-to-ear 측정 절차
   - 두 명과 최대 4명 통신 안정성과 peer별 지연 목표 확인
3. **Phase 4.5 GUI 기반과 core 분리**
   - 통신 검증이 끝난 콘솔 구현에서 audio/network core 분리
   - GUI framework 선정과 최소 화면 구현
   - 연결·효과·로컬 모니터·통계 제어 연결
4. **Phase 5 MR 동기화 구현**
   - pre-download, checksum, READY, future start, drift correction
5. **환경 확보 후 LAN 회귀 테스트**
   - Phase 1과 Phase 3 각각 10분 이상
   - Wi-Fi와 LAN의 RTT, jitter, underrun, trim, mouth-to-ear 비교
6. **선행 결과 기록 후 Phase 6 통합**

## 진행 현황 기록 규칙

이 파일을 프로젝트 진행 현황의 단일 기준 문서로 사용한다. 이후 Codex를 통한 작업에서는 다음 규칙을 적용한다.

- 구현을 변경한 작업이 끝나면 해당 Phase의 구현 상태와 남은 작업을 갱신
- 실제 테스트 결과를 받으면 구현 완료와 검증 완료를 구분해 기록
- buffer, queue, 효과 기본값처럼 체감에 영향을 주는 값이 바뀌면 현재값 수정
- 실행 파일을 새로 만들면 관련 실행 방법과 배포 위치 확인
- 실패 원인을 확인했지만 해결하지 못했다면 알려진 제한에 추가
- 다음 작업 순서가 바뀌면 `진행 순서`를 함께 수정
- 추정값은 측정값과 명확히 구분하고 근거가 된 결과 파일을 기록

단순 질의나 코드 변경이 없는 분석까지 매번 문서를 수정하지는 않는다. 구현, 설정 기본값, 검증 결과 또는 진행 순서가 달라진 경우에 갱신한다.

## 대표 실행 명령

PC 1:

```powershell
.\run-audio-test.ps1 -ClientId 1 -SessionId 55001 -DurationSeconds 120
```

PC 2:

```powershell
.\run-audio-test.ps1 -ClientId 2 -SessionId 55001 -DurationSeconds 120
```

성공 판정:

```text
ICE state: Connected
Audio path: direct P2P via ICE
```

자기 목소리가 들리는 것은 local monitor 동작이며 P2P 성공 판정이 아니다.
