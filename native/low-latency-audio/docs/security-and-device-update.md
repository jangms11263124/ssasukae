# 2026-08-02 보안·오디오 장치·설치 업데이트

## 오디오 장치

- GUI에서 활성 마이크와 출력 장치를 각각 선택할 수 있다.
- `Windows 기본 장치`를 선택하면 실행 시점의 기본 endpoint를 사용한다.
- 마이크 적용 전 1초 동안 입력 peak dBFS를 측정할 수 있다.
- 출력 적용 전 선택한 장치에서 440Hz 테스트음을 800ms 재생할 수 있다.
- 적용하면 P2P·Spring 연결은 유지하고 WASAPI 입력·출력 스트림만 다시 연다.
- 입력은 WASAPI Shared Event-Driven, 출력은 WASAPI Exclusive Event-Driven 정책을 유지한다.

## P2P 패킷 보호

- 참가자는 실행 시 X25519 임시 키 쌍을 만든다.
- 각 peer 조합은 세션 ID와 정렬된 Client ID를 HKDF-SHA256 문맥에 포함해 방향별 키와 nonce prefix를 만든다.
- Audio, DeliveryAck, MR 제어, Cancel, Leave를 포함한 모든 직접 P2P 패킷을 ChaCha20-Poly1305로 암호화·인증한다.
- 암호화 envelope는 송신 Client ID와 독립적인 64-bit 암호화 sequence를 인증 데이터에 포함한다.
- 수신자는 128개 패킷 replay window를 유지한다. 인증에 성공한 패킷만 window에 기록하며, 중복 패킷과 너무 오래된 패킷은 폐기한다.
- MR 취소처럼 UDP 손실 대응을 위해 같은 명령을 반복할 때도 매 전송은 새로운 암호화 sequence를 사용한다.

## Rendezvous 등록 서명

- 프로토콜 wire version은 `2`다.
- 앱은 실행 시 Ed25519 등록 identity를 생성한다.
- Register payload는 session ID, Client ID, UNIX timestamp, 128-bit random nonce, identity 공개키, X25519 공개키, ICE payload SHA-256을 함께 서명한다.
- 서버는 서명과 5분 timestamp 범위를 확인하고 `(identity 공개키, nonce)` 재사용을 거부한다.
- 자동 Client ID 예약 후에는 source endpoint와 identity 공개키가 모두 같아야 등록을 갱신할 수 있다.
- PeerInfo에는 원본 서명 payload가 전달되므로 상대 앱도 서명과 X25519 공개키를 확인한다.

현재 Ed25519 identity는 Rust 앱 실행 단위의 자기서명 identity다. 패킷 변조·키 바꿔치기·등록 replay 방어는 제공하지만, 이 공개키가 실제 Spring 사용자 계정 소유인지까지 증명하지는 않는다. 운영용 계정 인증을 완성하려면 Spring이 발급하는 단기 입장 credential에 identity 공개키 또는 그 지문을 포함해야 한다.

## Windows 설치 프로그램

릴리스 MSI:

```text
dist\windows-installer\SSAFYStar-LowLatencyAudio-0.1.4-x64.msi
```

다시 빌드:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1
```

MSI는 사용자 LocalAppData에 앱을 설치하고 시작 메뉴 바로가기를 만든다. 설치 중 `HKCU\Software\Classes\ssafystar`를 등록하고 제거 시 함께 삭제한다. 포터블 실행 파일도 시작할 때 현재 실행 경로로 `ssafystar://` 등록을 자동 보정한다.

MSI는 아직 코드 서명되지 않았다. 외부 배포 전에는 조직의 Authenticode 인증서로 실행 파일과 MSI를 서명해야 한다.

## 호환성 및 배포 주의

wire version 2 앱은 기존 version 1 Rendezvous 서버와 연결되지 않는다. Rust 서버 코드와 Windows 앱을 같은 버전으로 배포해야 한다.

2026-08-02에 EC2 `15.165.205.31:50000/UDP`의 Rendezvous 서버를 version 2 Linux binary로 교체하고 systemd 재시작을 완료했다. 실행 파일 SHA-256은 `F7684F9954B2540FB2E3D125125A7B341498975C33444D7F0093BF2282C06857`이며, 이전 version 1 실행 파일은 `/usr/local/bin/audio-relay-server.backup-v1-20260802-before-v2`에 보존했다. 배포 후 일반 Ping/Pong과 Ed25519 서명 등록 smoke test를 모두 통과했다.
