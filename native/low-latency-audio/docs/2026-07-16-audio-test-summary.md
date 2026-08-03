# 2026-07-16 실장치 오디오 테스트 정리

> 역사적 결과 문서: 아래 5/7.5ms 출력 큐 값은 2026-07-16 당시 설정이다. 현재 구현값과 서버 구조는 `phase-status.md`와 `server-topology.md`를 기준으로 한다.

## 최종 기준 설정

- 48kHz mono f32 내부 처리
- Opus Restricted Low Delay, 128kbps constrained VBR, music signal
- 240 samples, 5ms frame
- 고정 jitter buffer 10ms(2 frame)
- zero-lookahead Opus PLC, 실패 시 기존 감쇠 concealment fallback
- 출력 prebuffer 5ms(1 frame), 목표 7.5ms, 최대 30ms, 초과 시 15ms로 정리
- adaptive playback speed 최대 ±0.3%
- Audio는 즉시 전달하고 DeliveryAck는 최신 sequence 기준 20ms마다 전송
- 명시적 `Leave` 또는 ICE `Disconnected`에서만 퇴장 판정
- 중간 참가·퇴장 시 해당 peer 상태만 변경하고 다른 peer 재생 유지

최종 배포 파일:

```text
windows-four-client-full-mesh-20260716.zip
ZIP SHA-256: 5E114325EC553570ED4A6D3484D0DD0627A1DDB05BC6BF9725720B3A1C4BBE8E
audio-client.exe SHA-256: A9AE5231C963CBE6714F935384D6BC6751CA6F108A657B861F62EC1B2498193B
```

## 주요 변경과 판단

### 퇴장 처리

- 시간 기반 음성 무수신 판정을 제거했다.
- 명시적 `Leave`와 ICE `Disconnected`만 퇴장으로 처리한다.
- 종료 키 또는 Ctrl+C 정상 종료 시 연결된 peer에게 `Leave`를 전송한다.
- 단순 지연, 무수신, ICE 재확인은 퇴장으로 처리하지 않는다.

### 지터와 출력 큐

- 동적 15~40ms jitter는 음질을 개선했지만 체감 지연이 커졌다.
- jitter를 10ms로 고정한 뒤 평균 playback residence가 약 26ms에서 약 10ms로 감소했다.
- 출력 큐는 여러 단계를 비교한 뒤 저지연 설정인 5/7.5/30/15ms로 결정했다.
- 0ms prebuffer 시험에서는 underrun 3회와 누적 trim 6,240 samples가 발생해 최종값은 5ms로 결정했다.

### Opus PLC

- 누락 시 다음 packet을 기다리지 않고 재생 순서 전용 Opus decoder로 PLC frame을 즉시 생성한다.
- FEC와 재전송은 사용하지 않는다.
- `opus_plc_frames`와 `fallback_concealed_frames`를 별도로 기록한다.
- 실장치 로그에서 PLC 2,294 frame 및 3,353 frame이 모두 Opus PLC로 처리됐고 fallback은 0이었다.
- 체감 개선은 소폭이었으며 추가 지연은 관찰되지 않았다.

### DeliveryAck 축소

- 기존에는 5ms Audio packet마다 ACK를 전송했다.
- 최종 구현은 20ms마다 최신 sequence 하나를 ACK한다.
- 13:17 로그에서 23,849개 수신 frame에 ACK 4,927개가 기록되어 ACK 비율이 약 20.7%로 감소했다.
- 같은 시험에서 RTT p99는 직전 81.6ms에서 39.8ms로 낮아졌다. 네트워크 조건 차이가 있으므로 장시간 회귀 검증이 필요하다.

## 대표 실장치 결과

### 10ms 고정 jitter 도입

`audio-client-2-20260716-122334.txt`

- playback residence mean 26.654ms, p99 31.227ms
- RTT p50 6.678ms, p95 13.265ms, p99 35.118ms
- concealment/late 964 frame, resync 6회
- corrupt, duplicate, out-of-order 0

### Opus PLC 적용

`audio-client-2-20260716-123335.txt`

- playback residence mean 25.859ms, p99 30.659ms
- Opus PLC 2,294 frame, fallback 0
- emergency trim 0, 추가 지연 증가 없음

### 3명 시간차 참가 및 퇴장

`audio-client-2-20260716-125108.txt`, `audio-client-3-20260716-125352.txt`, `audio-client-4-20260716-124951.txt`

- Client 3가 늦게 참가한 뒤 Client 1·2·4와 모두 연결됐다.
- 기존 peer 음성을 중단하지 않고 새 peer가 합류했다.
- Client 3는 다른 세 peer의 `Leave`를 각각 수신했다.
- Client 2와 4의 peer별 playback residence mean은 약 9.7~10.6ms, p99는 약 14.5~15.4ms였다.
- 초기 ICE 실패가 발생한 link도 자동 재시도로 연결됐다.

### ACK 20ms 및 0ms prebuffer 시험

`audio-client-2-20260716-131725.txt`

- 수신 23,849 frame, ACK 4,927개
- playback residence mean 8.407ms, p99 13.213ms
- RTT p95 22.566ms, p99 39.795ms
- Opus PLC 3,353 frame, fallback 0
- underrun 3회, emergency trim 6,240 samples
- ACK 20ms는 유지하고 prebuffer는 최종 5ms로 복원했다.

## 로그 정책

- PowerShell 화면에는 시작, peer 연결·퇴장, 오류, 종료와 결과 파일 위치만 표시한다.
- 결과 파일에는 실행 PC, PowerShell 버전, 실행 파일 SHA-256, 모든 실행 옵션, ICE 과정, 장치 형식, 지연·PLC·큐 통계와 종료 코드를 저장한다.
- WASAPI 또는 실행 오류는 화면에도 즉시 표시한다.

## 알려진 제한과 다음 작업

- Windows 마이크 설정 100은 실제 PCM level 100%를 의미하지 않는다.
- 2채널 이상 입력은 모든 channel을 평균해 mono로 변환하도록 수정했다. 한쪽 channel만 유효한 특수 장치는 RMS 기반 활성 channel 선택을 추가 검토한다.
- 입력, Opus 전후, 최종 출력 RMS/Peak 계측이 아직 없다.
- 별도의 `InputGain`과 `RemoteLevel` 설정이 없다.
- 다음 우선순위는 RMS/Peak 통계, 원격 음량 조절과 soft limiter다.
- 최종 5ms prebuffer + 20ms ACK 설정은 실제 PC 4대에서 10분 이상 회귀 검증해야 한다.
