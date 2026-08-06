//! Explicit, big-endian wire format for the UDP network experiment.

use std::fmt;

pub const MAGIC: [u8; 4] = *b"LLAT";
pub const VERSION: u8 = 2;
pub const HEADER_LEN: usize = 56;
pub const DEFAULT_PACKET_BYTES: usize = 300;
pub const MAX_PACKET_BYTES: usize = 65_507;
pub const MAX_ICE_DESCRIPTION_BYTES: usize = 16 * 1024;
pub const MAX_REGISTRATION_BYTES: usize = MAX_ICE_DESCRIPTION_BYTES + registration::ENVELOPE_LEN;

pub mod registration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum PacketKind {
    Ping = 1,
    Pong = 2,
    Register = 3,
    RegisterAck = 4,
    Audio = 5,
    DeliveryAck = 6,
    PeerInfo = 7,
    DirectProbe = 8,
    DirectProbeAck = 9,
    Leave = 10,
    MrReady = 11,
    MrStart = 12,
    MrPosition = 13,
    MrSyncReset = 14,
    MrAbort = 15,
    MrCancel = 16,
    RendezvousError = 17,
    /// 서버가 남은 피어들에게 알리는 이탈 통보. client_id가 사라진 피어다.
    PeerGone = 18,
}

impl TryFrom<u8> for PacketKind {
    type Error = DecodeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Ping),
            2 => Ok(Self::Pong),
            3 => Ok(Self::Register),
            4 => Ok(Self::RegisterAck),
            5 => Ok(Self::Audio),
            6 => Ok(Self::DeliveryAck),
            7 => Ok(Self::PeerInfo),
            8 => Ok(Self::DirectProbe),
            9 => Ok(Self::DirectProbeAck),
            10 => Ok(Self::Leave),
            11 => Ok(Self::MrReady),
            12 => Ok(Self::MrStart),
            13 => Ok(Self::MrPosition),
            14 => Ok(Self::MrSyncReset),
            15 => Ok(Self::MrAbort),
            16 => Ok(Self::MrCancel),
            17 => Ok(Self::RendezvousError),
            18 => Ok(Self::PeerGone),
            _ => Err(DecodeError::UnknownKind(value)),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u64)]
pub enum RendezvousErrorCode {
    RoomFull = 1,
    ClientIdConflict = 2,
    InvalidSession = 3,
    PayloadTooLarge = 4,
    RateLimited = 5,
    ProtocolVersionMismatch = 6,
    InvalidRegistration = 7,
}

impl TryFrom<u64> for RendezvousErrorCode {
    type Error = ();

    fn try_from(value: u64) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::RoomFull),
            2 => Ok(Self::ClientIdConflict),
            3 => Ok(Self::InvalidSession),
            4 => Ok(Self::PayloadTooLarge),
            5 => Ok(Self::RateLimited),
            6 => Ok(Self::ProtocolVersionMismatch),
            7 => Ok(Self::InvalidRegistration),
            _ => Err(()),
        }
    }
}

impl fmt::Display for RendezvousErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::RoomFull => "rendezvous room is full",
            Self::ClientIdConflict => "rendezvous client ID conflict",
            Self::InvalidSession => "rendezvous session is invalid",
            Self::PayloadTooLarge => "rendezvous ICE description is too large",
            Self::RateLimited => "rendezvous request rate limit exceeded",
            Self::ProtocolVersionMismatch => "rendezvous protocol version mismatch",
            Self::InvalidRegistration => "rendezvous registration is invalid",
        };
        f.write_str(message)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PacketHeader {
    pub kind: PacketKind,
    pub sequence: u64,
    /// Nanoseconds since the sending client process started.
    pub client_sent_ns: u64,
    /// Nanoseconds since the relay process started.
    pub server_received_ns: u64,
    /// Nanoseconds since the relay process started.
    pub server_sent_ns: u64,
    /// Non-zero for session-scoped register and audio packets.
    pub session_id: u64,
    /// Non-zero sender identifier for session-scoped packets.
    pub client_id: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecodeError {
    TooShort(usize),
    BadMagic,
    UnsupportedVersion(u8),
    BadHeaderLength(u16),
    UnknownKind(u8),
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid packet: {self:?}")
    }
}

impl std::error::Error for DecodeError {}

pub fn encode(header: PacketHeader, packet_bytes: usize) -> Result<Vec<u8>, &'static str> {
    if !(HEADER_LEN..=MAX_PACKET_BYTES).contains(&packet_bytes) {
        return Err("packet size must be between HEADER_LEN and 65507 bytes");
    }
    let mut out = vec![0_u8; packet_bytes];
    out[0..4].copy_from_slice(&MAGIC);
    out[4] = VERSION;
    out[5] = header.kind as u8;
    out[6..8].copy_from_slice(&(HEADER_LEN as u16).to_be_bytes());
    out[8..16].copy_from_slice(&header.sequence.to_be_bytes());
    out[16..24].copy_from_slice(&header.client_sent_ns.to_be_bytes());
    out[24..32].copy_from_slice(&header.server_received_ns.to_be_bytes());
    out[32..40].copy_from_slice(&header.server_sent_ns.to_be_bytes());
    out[40..48].copy_from_slice(&header.session_id.to_be_bytes());
    out[48..56].copy_from_slice(&header.client_id.to_be_bytes());
    Ok(out)
}

pub fn encode_with_payload(header: PacketHeader, payload: &[u8]) -> Result<Vec<u8>, &'static str> {
    let packet_bytes = HEADER_LEN
        .checked_add(payload.len())
        .ok_or("packet size overflow")?;
    let mut packet = encode(header, packet_bytes)?;
    packet[HEADER_LEN..].copy_from_slice(payload);
    Ok(packet)
}

pub fn decode(bytes: &[u8]) -> Result<PacketHeader, DecodeError> {
    if bytes.len() < HEADER_LEN {
        return Err(DecodeError::TooShort(bytes.len()));
    }
    if bytes[0..4] != MAGIC {
        return Err(DecodeError::BadMagic);
    }
    if bytes[4] != VERSION {
        return Err(DecodeError::UnsupportedVersion(bytes[4]));
    }
    let header_len = u16::from_be_bytes([bytes[6], bytes[7]]);
    if header_len as usize != HEADER_LEN {
        return Err(DecodeError::BadHeaderLength(header_len));
    }
    Ok(PacketHeader {
        kind: PacketKind::try_from(bytes[5])?,
        sequence: u64::from_be_bytes(bytes[8..16].try_into().expect("fixed slice")),
        client_sent_ns: u64::from_be_bytes(bytes[16..24].try_into().expect("fixed slice")),
        server_received_ns: u64::from_be_bytes(bytes[24..32].try_into().expect("fixed slice")),
        server_sent_ns: u64::from_be_bytes(bytes[32..40].try_into().expect("fixed slice")),
        session_id: u64::from_be_bytes(bytes[40..48].try_into().expect("fixed slice")),
        client_id: u64::from_be_bytes(bytes[48..56].try_into().expect("fixed slice")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_preserves_header() {
        let header = PacketHeader {
            kind: PacketKind::Ping,
            sequence: u64::MAX,
            client_sent_ns: 42,
            server_received_ns: 0,
            server_sent_ns: 0,
            session_id: 7,
            client_id: 9,
        };
        assert_eq!(
            decode(&encode(header, DEFAULT_PACKET_BYTES).unwrap()).unwrap(),
            header
        );
    }

    #[test]
    fn rejects_malformed_packets() {
        assert!(matches!(decode(&[0; 3]), Err(DecodeError::TooShort(3))));
        let mut packet = encode(
            PacketHeader {
                kind: PacketKind::Ping,
                sequence: 0,
                client_sent_ns: 0,
                server_received_ns: 0,
                server_sent_ns: 0,
                session_id: 0,
                client_id: 0,
            },
            HEADER_LEN,
        )
        .unwrap();
        packet[0] = 0;
        assert_eq!(decode(&packet), Err(DecodeError::BadMagic));
    }

    #[test]
    fn sequence_wraps_without_panicking() {
        assert_eq!(u64::MAX.wrapping_add(1), 0);
    }

    #[test]
    fn payload_is_preserved_after_header() {
        let header = PacketHeader {
            kind: PacketKind::Audio,
            sequence: 3,
            client_sent_ns: 4,
            server_received_ns: 5,
            server_sent_ns: 6,
            session_id: 7,
            client_id: 8,
        };
        let packet = encode_with_payload(header, &[1, 2, 3, 4]).unwrap();
        assert_eq!(decode(&packet).unwrap(), header);
        assert_eq!(&packet[HEADER_LEN..], &[1, 2, 3, 4]);
    }

    #[test]
    fn rendezvous_error_codes_are_stable() {
        for (wire, code) in [
            (1, RendezvousErrorCode::RoomFull),
            (2, RendezvousErrorCode::ClientIdConflict),
            (3, RendezvousErrorCode::InvalidSession),
            (4, RendezvousErrorCode::PayloadTooLarge),
            (5, RendezvousErrorCode::RateLimited),
            (6, RendezvousErrorCode::ProtocolVersionMismatch),
            (7, RendezvousErrorCode::InvalidRegistration),
        ] {
            assert_eq!(RendezvousErrorCode::try_from(wire), Ok(code));
            assert_eq!(code as u64, wire);
        }
        assert!(RendezvousErrorCode::try_from(8).is_err());
    }
}
