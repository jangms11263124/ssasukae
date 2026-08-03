use protocol::{
    decode, encode, encode_with_payload, registration::RegistrationSigner, PacketHeader,
    PacketKind, HEADER_LEN, VERSION,
};
use std::{
    env,
    net::UdpSocket,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let server = env::args()
        .nth(1)
        .unwrap_or_else(|| "15.165.205.31:50000".into());
    let session_id = env::args()
        .nth(2)
        .map(|value| value.parse::<u64>())
        .transpose()?
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
        });
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect(&server)?;
    socket.set_read_timeout(Some(Duration::from_secs(3)))?;
    let signer = RegistrationSigner::generate();
    let exchange_public_key = [7_u8; 32];

    send_registration(&socket, &signer, session_id, 0, exchange_public_key, b"")?;
    let assigned = receive_ack(&socket, session_id, None)?;
    send_registration(
        &socket,
        &signer,
        session_id,
        assigned,
        exchange_public_key,
        b"signed-registration-smoke-ice",
    )?;
    receive_ack(&socket, session_id, Some(assigned))?;

    let leave = encode(
        PacketHeader {
            kind: PacketKind::Leave,
            sequence: VERSION as u64,
            client_sent_ns: 0,
            server_received_ns: 0,
            server_sent_ns: 0,
            session_id,
            client_id: assigned,
        },
        HEADER_LEN,
    )?;
    socket.send(&leave)?;
    println!(
        "signed rendezvous registration passed: server={server}, protocol={VERSION}, session={session_id}, client={assigned}"
    );
    Ok(())
}

fn send_registration(
    socket: &UdpSocket,
    signer: &RegistrationSigner,
    session_id: u64,
    client_id: u64,
    exchange_public_key: [u8; 32],
    ice: &[u8],
) -> Result<(), Box<dyn std::error::Error>> {
    let signed = signer.sign(session_id, client_id, exchange_public_key, ice);
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
        &signed,
    )?;
    socket.send(&packet)?;
    Ok(())
}

fn receive_ack(
    socket: &UdpSocket,
    session_id: u64,
    expected_client_id: Option<u64>,
) -> Result<u64, Box<dyn std::error::Error>> {
    let mut buffer = [0_u8; 512];
    let size = socket.recv(&mut buffer)?;
    let packet = decode(&buffer[..size])?;
    if packet.kind != PacketKind::RegisterAck
        || packet.sequence != VERSION as u64
        || packet.session_id != session_id
        || packet.client_id == 0
        || expected_client_id.is_some_and(|expected| expected != packet.client_id)
    {
        return Err(format!("unexpected rendezvous response: {packet:?}").into());
    }
    Ok(packet.client_id)
}
