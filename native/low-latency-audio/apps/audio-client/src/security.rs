use chacha20poly1305::{
    aead::{Aead, Payload},
    ChaCha20Poly1305, KeyInit, Nonce,
};
use hkdf::Hkdf;
use rand_core::OsRng;
use sha2::Sha256;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use x25519_dalek::{PublicKey, StaticSecret};

const MAGIC: [u8; 4] = *b"LLSE";
const VERSION: u8 = 1;
const ENVELOPE_HEADER_LEN: usize = 24;
const REPLAY_WINDOW_BITS: u64 = 128;
const KDF_DOMAIN: &[u8] = b"SSAFYStar/P2P/ChaCha20Poly1305/v1";

pub(crate) struct SessionSecurity {
    secret: StaticSecret,
    public: [u8; 32],
}

impl SessionSecurity {
    pub(crate) fn generate() -> Self {
        let secret = StaticSecret::random_from_rng(OsRng);
        let public = PublicKey::from(&secret).to_bytes();
        Self { secret, public }
    }

    pub(crate) fn public_key(&self) -> [u8; 32] {
        self.public
    }

    pub(crate) fn peer_cipher(
        &self,
        session_id: u64,
        local_client_id: u64,
        remote_client_id: u64,
        remote_public_key: [u8; 32],
    ) -> Result<PeerCipher, &'static str> {
        PeerCipher::new(
            session_id,
            local_client_id,
            remote_client_id,
            &self.secret,
            remote_public_key,
        )
    }
}

pub(crate) struct PeerCipher {
    local_client_id: u64,
    remote_client_id: u64,
    send_cipher: ChaCha20Poly1305,
    receive_cipher: ChaCha20Poly1305,
    send_nonce_prefix: [u8; 4],
    receive_nonce_prefix: [u8; 4],
    send_sequence: AtomicU64,
    replay: Mutex<ReplayWindow>,
}

impl PeerCipher {
    fn new(
        session_id: u64,
        local_client_id: u64,
        remote_client_id: u64,
        secret: &StaticSecret,
        remote_public_key: [u8; 32],
    ) -> Result<Self, &'static str> {
        if local_client_id == remote_client_id || local_client_id == 0 || remote_client_id == 0 {
            return Err("peer encryption requires distinct non-zero client IDs");
        }
        let shared = secret.diffie_hellman(&PublicKey::from(remote_public_key));
        if !shared.was_contributory() {
            return Err("peer supplied a non-contributory exchange key");
        }
        let low = local_client_id.min(remote_client_id);
        let high = local_client_id.max(remote_client_id);
        let salt = session_id.to_be_bytes();
        let mut info = Vec::with_capacity(KDF_DOMAIN.len() + 16);
        info.extend_from_slice(KDF_DOMAIN);
        info.extend_from_slice(&low.to_be_bytes());
        info.extend_from_slice(&high.to_be_bytes());
        let mut material = [0_u8; 72];
        Hkdf::<Sha256>::new(Some(&salt), shared.as_bytes())
            .expand(&info, &mut material)
            .map_err(|_| "peer key derivation failed")?;
        let (low_key, high_key) = material.split_at(32);
        let (high_key, prefixes) = high_key.split_at(32);
        let low_prefix: [u8; 4] = prefixes[..4].try_into().expect("fixed prefix");
        let high_prefix: [u8; 4] = prefixes[4..8].try_into().expect("fixed prefix");
        let local_is_low = local_client_id == low;
        let (send_key, receive_key, send_nonce_prefix, receive_nonce_prefix) = if local_is_low {
            (low_key, high_key, low_prefix, high_prefix)
        } else {
            (high_key, low_key, high_prefix, low_prefix)
        };
        Ok(Self {
            local_client_id,
            remote_client_id,
            send_cipher: ChaCha20Poly1305::new_from_slice(send_key)
                .map_err(|_| "invalid send key")?,
            receive_cipher: ChaCha20Poly1305::new_from_slice(receive_key)
                .map_err(|_| "invalid receive key")?,
            send_nonce_prefix,
            receive_nonce_prefix,
            send_sequence: AtomicU64::new(0),
            replay: Mutex::new(ReplayWindow::default()),
        })
    }

    pub(crate) fn seal(&self, plaintext: &[u8]) -> Result<Vec<u8>, &'static str> {
        let sequence = self.send_sequence.fetch_add(1, Ordering::Relaxed);
        if sequence == u64::MAX {
            return Err("peer encryption sequence exhausted");
        }
        let mut header = [0_u8; ENVELOPE_HEADER_LEN];
        header[..4].copy_from_slice(&MAGIC);
        header[4] = VERSION;
        header[8..16].copy_from_slice(&self.local_client_id.to_be_bytes());
        header[16..24].copy_from_slice(&sequence.to_be_bytes());
        let nonce = packet_nonce(self.send_nonce_prefix, sequence);
        let ciphertext = self
            .send_cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: plaintext,
                    aad: &header,
                },
            )
            .map_err(|_| "peer packet encryption failed")?;
        let mut packet = Vec::with_capacity(header.len() + ciphertext.len());
        packet.extend_from_slice(&header);
        packet.extend_from_slice(&ciphertext);
        Ok(packet)
    }

    pub(crate) fn open(&self, packet: &[u8]) -> Result<Vec<u8>, &'static str> {
        if packet.len() < ENVELOPE_HEADER_LEN + 16 || packet[..4] != MAGIC || packet[4] != VERSION {
            return Err("peer security envelope is invalid");
        }
        let sender = u64::from_be_bytes(packet[8..16].try_into().expect("fixed sender"));
        if sender != self.remote_client_id {
            return Err("encrypted packet sender does not match the peer");
        }
        let sequence = u64::from_be_bytes(packet[16..24].try_into().expect("fixed sequence"));
        {
            let replay = self.replay.lock().map_err(|_| "replay window poisoned")?;
            if !replay.would_accept(sequence) {
                return Err("replayed or stale encrypted packet");
            }
        }
        let nonce = packet_nonce(self.receive_nonce_prefix, sequence);
        let plaintext = self
            .receive_cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &packet[ENVELOPE_HEADER_LEN..],
                    aad: &packet[..ENVELOPE_HEADER_LEN],
                },
            )
            .map_err(|_| "peer packet authentication failed")?;
        self.replay
            .lock()
            .map_err(|_| "replay window poisoned")?
            .mark(sequence)?;
        Ok(plaintext)
    }
}

fn packet_nonce(prefix: [u8; 4], sequence: u64) -> [u8; 12] {
    let mut nonce = [0_u8; 12];
    nonce[..4].copy_from_slice(&prefix);
    nonce[4..].copy_from_slice(&sequence.to_be_bytes());
    nonce
}

#[derive(Default)]
struct ReplayWindow {
    highest: Option<u64>,
    bitmap: u128,
}

impl ReplayWindow {
    fn would_accept(&self, sequence: u64) -> bool {
        let Some(highest) = self.highest else {
            return true;
        };
        if sequence > highest {
            return true;
        }
        let distance = highest - sequence;
        distance < REPLAY_WINDOW_BITS && self.bitmap & (1_u128 << distance) == 0
    }

    fn mark(&mut self, sequence: u64) -> Result<(), &'static str> {
        if !self.would_accept(sequence) {
            return Err("replayed or stale encrypted packet");
        }
        match self.highest {
            None => {
                self.highest = Some(sequence);
                self.bitmap = 1;
            }
            Some(highest) if sequence > highest => {
                let shift = sequence - highest;
                self.bitmap = if shift >= REPLAY_WINDOW_BITS {
                    1
                } else {
                    (self.bitmap << shift) | 1
                };
                self.highest = Some(sequence);
            }
            Some(highest) => {
                self.bitmap |= 1_u128 << (highest - sequence);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peers_encrypt_in_both_directions_and_reject_replay() {
        let first = SessionSecurity::generate();
        let second = SessionSecurity::generate();
        let first_cipher = first.peer_cipher(55, 1, 2, second.public_key()).unwrap();
        let second_cipher = second.peer_cipher(55, 2, 1, first.public_key()).unwrap();
        let packet = first_cipher.seal(b"audio").unwrap();
        assert_eq!(second_cipher.open(&packet).unwrap(), b"audio");
        assert!(second_cipher.open(&packet).is_err());
        let reply = second_cipher.seal(b"control").unwrap();
        assert_eq!(first_cipher.open(&reply).unwrap(), b"control");
    }

    #[test]
    fn authentication_detects_ciphertext_changes() {
        let first = SessionSecurity::generate();
        let second = SessionSecurity::generate();
        let first_cipher = first.peer_cipher(55, 1, 2, second.public_key()).unwrap();
        let second_cipher = second.peer_cipher(55, 2, 1, first.public_key()).unwrap();
        let mut packet = first_cipher.seal(b"cancel").unwrap();
        *packet.last_mut().unwrap() ^= 1;
        assert!(second_cipher.open(&packet).is_err());
    }

    #[test]
    fn replay_window_accepts_limited_reordering_once() {
        let mut replay = ReplayWindow::default();
        replay.mark(10).unwrap();
        replay.mark(12).unwrap();
        replay.mark(11).unwrap();
        assert!(replay.mark(11).is_err());
        replay.mark(200).unwrap();
        assert!(replay.mark(10).is_err());
    }
}
