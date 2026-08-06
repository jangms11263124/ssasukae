use crate::ice_transport::IceTransport;
use protocol::{
    decode, encode, encode_with_payload,
    registration::{self, RegistrationSigner},
    DecodeError, PacketHeader, PacketKind, RendezvousErrorCode, HEADER_LEN,
    MAX_ICE_DESCRIPTION_BYTES, MAX_PACKET_BYTES, VERSION,
};
use std::{
    collections::BTreeMap,
    io,
    net::{SocketAddr, UdpSocket},
    thread,
    time::{Duration, Instant},
};

pub(crate) const MAX_CLIENTS: u64 = 4;
const ICE_BUNDLE_MARKER: &str = "@@ultra-sync-target:";
const NICKNAME_MARKER: &str = "@@ultra-sync-nickname-hex:";

/// Windows WSAEMSGSIZE. 데이터그램이 수신 버퍼보다 크면 잘린 채 이 오류가 온다.
/// 다른 OS는 조용히 잘라내고 성공을 반환하므로 Windows에서만 나타난다.
#[cfg(windows)]
const WSAEMSGSIZE: i32 = 10_040;

/// 등록 대기 루프에서 무시해도 되는 수신 오류인지 판단한다.
///
/// 이 소켓은 등록 응답만 오는 전용 소켓이 아니다. 서버가 피어 ICE 정보를
/// 페이로드로 실어 보내므로(최대 MAX_ICE_DESCRIPTION_BYTES) 등록을 기다리는 동안
/// 큰 패킷이 끼어들 수 있다. 그때 루프를 죽이지 않고 다음 패킷을 기다린다.
fn is_skippable_recv_error(error: &io::Error) -> bool {
    if error.kind() == io::ErrorKind::WouldBlock {
        return true;
    }
    #[cfg(windows)]
    if error.raw_os_error() == Some(WSAEMSGSIZE) {
        return true;
    }
    false
}

pub(crate) fn ice_description_bundle(
    transports: &BTreeMap<u64, IceTransport>,
    nickname: &str,
) -> String {
    let mut bundle = format!("{NICKNAME_MARKER}{}@@\n", hex_encode(nickname.as_bytes()));
    for (&target_peer_id, transport) in transports {
        bundle.push_str(&format!("{ICE_BUNDLE_MARKER}{target_peer_id}@@\n"));
        bundle.push_str(&transport.local_description());
        if !bundle.ends_with('\n') {
            bundle.push('\n');
        }
    }
    bundle
}

pub(crate) fn nickname_from_bundle(bundle: &str) -> Option<String> {
    let encoded = bundle.strip_prefix(NICKNAME_MARKER)?.split("@@\n").next()?;
    String::from_utf8(hex_decode(encoded)?).ok()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
}

pub(crate) fn ice_description_for_target(bundle: &str, target_peer_id: u64) -> Option<&str> {
    let marker = format!("{ICE_BUNDLE_MARKER}{target_peer_id}@@\n");
    let start = bundle.find(&marker)? + marker.len();
    let tail = &bundle[start..];
    let end = tail.find(ICE_BUNDLE_MARKER).unwrap_or(tail.len());
    let description = tail[..end].trim_end();
    (!description.is_empty()).then_some(description)
}

pub(crate) fn register(
    socket: &UdpSocket,
    server: SocketAddr,
    session_id: u64,
    client_id: u64,
    ice_description: &str,
    signer: &RegistrationSigner,
    exchange_public_key: [u8; 32],
) -> Result<(), Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut next_send = Instant::now();
    let mut buffer = vec![0_u8; MAX_PACKET_BYTES];
    while Instant::now() < deadline {
        if Instant::now() >= next_send {
            send_registration(
                socket,
                server,
                session_id,
                client_id,
                ice_description,
                signer,
                exchange_public_key,
            )?;
            next_send = Instant::now() + Duration::from_millis(250);
        }
        match socket.recv_from(&mut buffer) {
            Ok((size, source)) => {
                if source != server {
                    continue;
                }
                let packet = decode_rendezvous_response(&buffer[..size])?;
                reject_rendezvous_error(packet, session_id)?;
                if packet.kind == PacketKind::RegisterAck
                    && packet.session_id == session_id
                    && packet.client_id == client_id
                {
                    validate_server_version(packet.sequence)?;
                    return Ok(());
                }
            }
            Err(error) if is_skippable_recv_error(&error) => {
                thread::sleep(Duration::from_millis(5));
            }
            Err(error) => return Err(error.into()),
        }
    }
    Err("rendezvous registration timed out".into())
}

pub(crate) fn request_client_id(
    socket: &UdpSocket,
    server: SocketAddr,
    session_id: u64,
    signer: &RegistrationSigner,
    exchange_public_key: [u8; 32],
) -> Result<u64, Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut next_send = Instant::now();
    let mut buffer = vec![0_u8; MAX_PACKET_BYTES];
    while Instant::now() < deadline {
        if Instant::now() >= next_send {
            send_registration(
                socket,
                server,
                session_id,
                0,
                "",
                signer,
                exchange_public_key,
            )?;
            next_send = Instant::now() + Duration::from_millis(250);
        }
        match socket.recv_from(&mut buffer) {
            Ok((size, source)) if source == server => {
                let packet = decode_rendezvous_response(&buffer[..size])?;
                reject_rendezvous_error(packet, session_id)?;
                if packet.kind == PacketKind::RegisterAck
                    && packet.session_id == session_id
                    && (1..=MAX_CLIENTS).contains(&packet.client_id)
                {
                    validate_server_version(packet.sequence)?;
                    return Ok(packet.client_id);
                }
            }
            Ok(_) => {}
            Err(error) if is_skippable_recv_error(&error) => {
                thread::sleep(Duration::from_millis(5));
            }
            Err(error) => return Err(error.into()),
        }
    }
    Err("rendezvous automatic client ID assignment timed out".into())
}

pub(crate) fn send_registration(
    socket: &UdpSocket,
    server: SocketAddr,
    session_id: u64,
    client_id: u64,
    ice_description: &str,
    signer: &RegistrationSigner,
    exchange_public_key: [u8; 32],
) -> io::Result<()> {
    if ice_description.len() > MAX_ICE_DESCRIPTION_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "rendezvous ICE description is too large",
        ));
    }
    let signed_payload = signer.sign(
        session_id,
        client_id,
        exchange_public_key,
        ice_description.as_bytes(),
    );
    let packet = encode_with_payload(
        PacketHeader {
            kind: PacketKind::Register,
            sequence: 0,
            client_sent_ns: 0,
            server_received_ns: 0,
            server_sent_ns: 0,
            session_id,
            client_id,
        },
        &signed_payload,
    )
    .map_err(io::Error::other)?;
    socket.send_to(&packet, server).map(|_| ())
}

pub(crate) struct PeerRegistration<'a> {
    pub(crate) ice_bundle: &'a str,
    pub(crate) exchange_public_key: [u8; 32],
}

pub(crate) fn verify_peer_registration(
    payload: &[u8],
    session_id: u64,
    client_id: u64,
) -> Result<PeerRegistration<'_>, Box<dyn std::error::Error>> {
    let verified = registration::verify(payload, session_id, client_id, true)
        .map_err(|error| Box::<dyn std::error::Error>::from(error.to_owned()))?;
    let ice_bundle = std::str::from_utf8(verified.ice_description)?;
    Ok(PeerRegistration {
        ice_bundle,
        exchange_public_key: verified.exchange_public_key,
    })
}

pub(crate) fn send_rendezvous_leave(
    socket: &UdpSocket,
    server: SocketAddr,
    session_id: u64,
    client_id: u64,
) {
    let Ok(packet) = encode(
        PacketHeader {
            kind: PacketKind::Leave,
            sequence: VERSION as u64,
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
    for _ in 0..3 {
        let _ = socket.send_to(&packet, server);
    }
}

fn decode_rendezvous_response(packet: &[u8]) -> Result<PacketHeader, Box<dyn std::error::Error>> {
    decode(packet).map_err(|error| match error {
        DecodeError::UnsupportedVersion(_) => {
            "rendezvous protocol version mismatch".to_owned().into()
        }
        other => Box::<dyn std::error::Error>::from(other),
    })
}

fn reject_rendezvous_error(
    packet: PacketHeader,
    expected_session_id: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    if packet.kind != PacketKind::RendezvousError || packet.session_id != expected_session_id {
        return Ok(());
    }
    let message = RendezvousErrorCode::try_from(packet.sequence)
        .map(|code| code.to_string())
        .unwrap_or_else(|_| "rendezvous rejected the registration".into());
    Err(message.into())
}

fn validate_server_version(version: u64) -> Result<(), Box<dyn std::error::Error>> {
    if version == 0 || version == VERSION as u64 {
        Ok(())
    } else {
        Err(
            format!("rendezvous protocol version mismatch: client={VERSION}, server={version}")
                .into(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_version_accepts_legacy_and_current_only() {
        assert!(validate_server_version(0).is_ok());
        assert!(validate_server_version(VERSION as u64).is_ok());
        assert!(validate_server_version(VERSION as u64 + 1).is_err());
    }

    #[test]
    fn rendezvous_error_packet_becomes_a_client_error() {
        let packet = PacketHeader {
            kind: PacketKind::RendezvousError,
            sequence: RendezvousErrorCode::RoomFull as u64,
            client_sent_ns: 0,
            server_received_ns: 0,
            server_sent_ns: 0,
            session_id: 77,
            client_id: 0,
        };
        let error = reject_rendezvous_error(packet, 77).unwrap_err();
        assert!(error.to_string().contains("room is full"));
        assert!(reject_rendezvous_error(packet, 78).is_ok());
    }
}
