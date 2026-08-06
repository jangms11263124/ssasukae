# UDP 패킷 프로토콜 버전 2

현재 상태: 2026-07-23 기준 서버 1(P2P UDP rendezvous 및 직접 음성 경로)에서 사용한다. 서버 2(`http://localhost:8080`)의 후속 HTTP/WebSocket 계약과는 별개다.

버전 2부터 Rendezvous `Register` payload는 Ed25519 서명 envelope를 사용하고, 직접 P2P 패킷 전체는 X25519/HKDF-SHA256으로 합의한 방향별 키와 ChaCha20-Poly1305로 암호화·인증한다. 상세 내용은 [`security-and-device-update.md`](security-and-device-update.md)를 참고한다.

모든 정수와 f32 PCM bit pattern은 network byte order(big-endian)로 인코딩한다. 고정 헤더는 56바이트이며 이후 영역은 packet kind별 payload다. encoder가 허용하는 UDP payload 최대 크기는 65507바이트다.

## 고정 헤더

| Offset | 크기 | 필드 |
| ---: | ---: | --- |
| 0 | 4 | magic ASCII `LLAT` |
| 4 | 1 | version(`2`) |
| 5 | 1 | kind |
| 6 | 2 | header length(`56`) |
| 8 | 8 | `sequence` |
| 16 | 8 | client send monotonic nanoseconds |
| 24 | 8 | server receive monotonic nanoseconds |
| 32 | 8 | server send monotonic nanoseconds |
| 40 | 8 | `session_id`, Ping/Pong은 0 |
| 48 | 8 | `client_id`, Ping/Pong은 0 |

## Packet kind

| 값 | 이름 | 현재 용도 |
| ---: | --- | --- |
| 1 | `Ping` | 네트워크 RTT probe |
| 2 | `Pong` | Ping 응답 |
| 3 | `Register` | endpoint 및 ICE 설명 등록 |
| 4 | `RegisterAck` | 등록 확인 |
| 5 | `Audio` | P2P PCM Audio |
| 6 | `DeliveryAck` | Audio 수신 확인 |
| 7 | `PeerInfo` | 상대 ICE 설명 전달 |
| 8 | `DirectProbe` | 이전 hole-punch 구현과의 wire enum 호환용, 현재 미사용 |
| 9 | `DirectProbeAck` | 이전 hole-punch 구현과의 wire enum 호환용, 현재 미사용 |
| 10 | `Leave` | 직접 연결 종료 알림 |
| 11 | `MrReady` | 로컬 MR 준비 완료와 파일 일치 확인 |
| 12 | `MrStart` | leader가 전파하는 상대 지연 기반 예약 시작 |
| 13 | `MrPosition` | leader의 현재 MR sample position |
| 14 | `MrSyncReset` | 준비 중 참가자 변경으로 기존 시작 예약 취소 |
| 15 | `MrAbort` | READY timeout 또는 MR 불일치로 재생 중단 |
| 16 | `MrCancel` | 노래 시작자가 요청한 동기 취소 |
| 17 | `RendezvousError` | 등록·정원·제한 오류 응답 |

`Register`에서 `client_id=0`은 자동 슬롯 할당 요청이다. 서버는 같은 세션에서 비어 있는
가장 작은 번호(1~4)를 예약하고 `RegisterAck.client_id`로 반환한다. 클라이언트는 할당된
번호로 ICE transport를 만든 뒤 ICE description을 포함한 `Register`를 다시 보낸다.
기존의 `client_id=1..4` 직접 지정 등록도 진단용 호환 경로로 유지한다.

새 서버는 `RegisterAck.sequence`와 `PeerInfo.sequence`에 protocol version을 넣는다. `0`은 기존 서버 호환값이며, 그 외에는 현재 `VERSION`과 일치해야 한다. `RendezvousError.sequence`는 다음 오류 코드다.

| 값 | 오류 | 의미 |
| ---: | --- | --- |
| 1 | `RoomFull` | 세션의 네 슬롯이 모두 사용 중 |
| 2 | `ClientIdConflict` | 활성 Client ID를 다른 endpoint가 사용하려 함 |
| 3 | `InvalidSession` | session ID가 0이거나 구조적으로 잘못됨 |
| 4 | `PayloadTooLarge` | ICE description이 16KiB를 초과 |
| 5 | `RateLimited` | IP별 등록 요청 한도 초과 |
| 6 | `ProtocolVersionMismatch` | 서버와 클라이언트 protocol version 불일치 |
| 7 | `InvalidRegistration` | Client ID·payload 등 등록 구조가 잘못됨 |

앱은 정상 종료 시 직접 peer와 rendezvous 서버 양쪽에 `Leave`를 보낸다. 서버는 `(session_id, client_id, source endpoint)`가 모두 일치할 때 등록을 즉시 제거한다. UDP 손실을 줄이기 위해 앱은 서버용 `Leave`를 세 번 보낸다.

알 수 없는 version, kind, header length, 짧은 packet은 거부한다. 기존 서비스 프로토콜과 호환되지 않는다.

## Ping/Pong

`Ping`은 지정된 전체 packet 크기만큼 padding할 수 있다. 서버는 sequence와 client timestamp를 보존하고 server receive/send timestamp를 기록한 `Pong`을 보낸다.

서로 다른 프로세스의 monotonic epoch는 비교할 수 없다. client timestamp와 server timestamp를 직접 빼면 안 된다.

## Register와 PeerInfo

클라이언트는 AWS rendezvous 서버에 `Register`를 보낸다. payload에는 다음 ICE 설명을 줄 단위로 넣는다.

```text
<ufrag>
<password>
<gathering 또는 complete>
<candidate 1>
<candidate 2>
...
```

서버는 session/client별 최신 endpoint와 ICE 설명을 보관하고, 같은 세션의 다른 참가자에게 `PeerInfo`로 전달한다. 서버가 관찰한 endpoint는 등록 관리에 사용하지만 Audio 경로로 전달하지 않는다.

이 절차는 기술 검증용 discovery이며 인증이 아니다. 현재 크기 제한, IP rate limit, 명시적 Leave와 30초 만료는 적용돼 있다. 운영 환경에는 backend가 발급한 session credential, 무결성 검증, 암호화와 replay protection이 추가로 필요하다.

## Audio

Audio payload는 mono f32 120샘플이다.

```text
48,000 samples/second
120 samples/frame
2.5 ms/frame
480 payload bytes
56 header bytes
536 bytes/datagram
```

ICE가 선택한 direct P2P connection에서만 Audio를 보낸다. AWS 서버는 `Audio`와 `DeliveryAck`를 거부하며 media relay로 동작하지 않는다.

## DeliveryAck와 RTT

수신 클라이언트의 고우선순위 ICE 네트워크 스레드는 유효한 Audio를 받으면 즉시 header-only `DeliveryAck`를 보낸다. ACK는 원본 sequence와 client send timestamp를 보존하고 ACK 송신자의 client ID를 기록한다.

Phase 4 계측에서는 수신 PC의 동일한 monotonic clock을 사용해 다음 필드를 채운다.

- `server_received_ns`: ICE network thread가 Audio를 받은 시각
- `server_sent_ns`: Audio를 main loop에 전달하고 DeliveryAck 발송을 준비한 시각

두 값의 차이는 상대 PC 내부의 receive-to-ACK dispatch 지연으로 사용할 수 있다. 이 값들은 AWS 서버 시각이 아니며 서로 다른 PC의 monotonic timestamp를 직접 비교하는 용도로 사용하면 안 된다.

원 송신자는 자기 monotonic clock만 사용해 다음 시간을 계산한다.

```text
Audio 송신 → 상대 수신 → DeliveryAck 송신 → 원 송신자 수신
```

이 값은 peer delivery RTT다. RTT/2는 대칭 경로를 가정한 추정 편도 값일 뿐 실제 방향별 측정값은 아니다.

## MR 동기화 제어

MR 제어는 ICE가 선택한 직접 P2P 연결에서 header-only 패킷으로 교환한다. Spring 계약을 변경하지 않기 위해 기존 헤더 필드를 다음처럼 재사용한다.

| kind | `sequence` | `client_sent_ns` | `server_received_ns` | `server_sent_ns` |
| --- | --- | --- | --- | --- |
| `MrReady` | performance ID | 송신 monotonic 시각 | 전체 sample 수 | 디코딩된 f32 sample의 64-bit 지문 |
| `MrStart` | performance ID | 송신 monotonic 시각 | 남은 시작 guard(나노초) | 0 |
| `MrPosition` | performance ID | 현재 sample position | 송신 monotonic 시각 | 0 |
| `MrSyncReset` | performance ID | 송신 monotonic 시각 | 0 | 0 |
| `MrAbort` | performance ID | READY 미응답 Client ID bitmask | MR 불일치 Client ID bitmask | 0 |
| `MrCancel` | performance ID | 송신 monotonic 시각 | 취소 guard(나노초) | 0 |

가장 낮은 연결 Client ID가 leader다. Spring `PLAYBACK_STARTED`를 받은 뒤 모든 연결 참가자의 공연 ID·sample 수·지문이 일치해야 leader가 300ms guard를 배포한다. 수신자는 최근 DeliveryAck RTT의 절반을 전송 시간으로 추정해 남은 guard에서 뺀다. 시스템 시계나 서로 다른 프로세스의 monotonic epoch를 비교하지 않는다.

재생 중 leader는 500ms마다 position을 보낸다. follower는 추정 편도 전송 sample을 더한 뒤 10ms를 넘는 오차만 회당 최대 24 sample(0.5ms) 보정한다. 이 방식은 실제 PC 간 동기 오차를 보장하는 것이 아니며 최대 4대 실장치 측정이 승인 기준이다.

Spring 재생 시작 뒤 MR 지문 불일치가 확인되면 leader는 즉시 `MrAbort`를 보낸다. 불일치는 없지만 READY가 도착하지 않으면 15초 뒤 중단한다. `MrAbort`는 UDP 손실에 대비해 최초 전송 후 100ms 간격으로 네 번 더 보낸다.

노래 시작자의 취소 요청은 기존 Spring `/cancel` 요청과 함께 직접 P2P `MrCancel`로 전달한다. 패킷은 UDP 손실을 줄이기 위해 세 번 보내며, 수신자는 최근 RTT의 절반을 추정 전송 시간으로 빼고 150ms guard 뒤 로컬 MR을 중단한다. Spring의 `PERFORMANCE_CANCELLED` 이벤트는 권한 검증과 최종 상태 전파를 담당한다.

준비 또는 300ms 시작 guard 중 연결 참가자가 달라지면 scheduled start를 취소하고 `MrSyncReset`을 전달한다. 끊어진 Client ID의 과거 READY는 삭제하며, 새로운 참가자를 포함한 연결 집합이 500ms 동안 유지된 후에만 다시 예약한다. 이미 MR 재생이 시작된 뒤 입장한 참가자는 현재 곡의 동기화 집합에 추가하지 않으며 곡을 재시작하지 않는다. 기존 leader가 퇴장하면 시작 시점에 포함됐던 남은 참가자 중 가장 낮은 Client ID가 position leader가 된다.

## NAT와 ICE 제한

현재 candidate type은 host와 server-reflexive이며 TURN relay candidate를 사용하지 않는다. 테스트 네트워크처럼 목적지마다 공인 UDP port가 달라지는 대칭형 NAT 조합에서는 모든 direct candidate pair가 실패할 수 있다. 실패 시 클라이언트는 새 ICE 인증정보와 UDP mapping으로 재시도하지만 성공을 보장하지는 않는다.
