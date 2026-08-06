use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

const MAGIC: [u8; 4] = *b"REG2";
const DOMAIN: &[u8] = b"SSAFYStar/rendezvous-registration/v2";
const TIMESTAMP_OFFSET: usize = 4;
const NONCE_OFFSET: usize = 12;
const IDENTITY_OFFSET: usize = 28;
const EXCHANGE_OFFSET: usize = 60;
const SIGNATURE_OFFSET: usize = 92;
pub const ENVELOPE_LEN: usize = 156;
pub const MAX_CLOCK_SKEW_MS: u64 = 5 * 60 * 1_000;

#[derive(Clone)]
pub struct RegistrationSigner {
    signing_key: SigningKey,
}

impl RegistrationSigner {
    pub fn generate() -> Self {
        Self {
            signing_key: SigningKey::generate(&mut OsRng),
        }
    }

    pub fn identity_public_key(&self) -> [u8; 32] {
        self.signing_key.verifying_key().to_bytes()
    }

    pub fn sign(
        &self,
        session_id: u64,
        client_id: u64,
        exchange_public_key: [u8; 32],
        ice_description: &[u8],
    ) -> Vec<u8> {
        let timestamp_ms = unix_time_ms();
        let mut nonce = [0_u8; 16];
        OsRng.fill_bytes(&mut nonce);
        let identity = self.identity_public_key();
        let message = signing_message(
            session_id,
            client_id,
            timestamp_ms,
            nonce,
            identity,
            exchange_public_key,
            ice_description,
        );
        let signature = self.signing_key.sign(&message).to_bytes();
        let mut output = Vec::with_capacity(ENVELOPE_LEN + ice_description.len());
        output.extend_from_slice(&MAGIC);
        output.extend_from_slice(&timestamp_ms.to_be_bytes());
        output.extend_from_slice(&nonce);
        output.extend_from_slice(&identity);
        output.extend_from_slice(&exchange_public_key);
        output.extend_from_slice(&signature);
        output.extend_from_slice(ice_description);
        output
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedRegistration<'a> {
    pub timestamp_ms: u64,
    pub nonce: [u8; 16],
    pub identity_public_key: [u8; 32],
    pub exchange_public_key: [u8; 32],
    pub ice_description: &'a [u8],
}

pub fn verify(
    payload: &[u8],
    session_id: u64,
    client_id: u64,
    enforce_freshness: bool,
) -> Result<VerifiedRegistration<'_>, &'static str> {
    if payload.len() < ENVELOPE_LEN || payload[..4] != MAGIC {
        return Err("registration signature envelope is missing");
    }
    let timestamp_ms = u64::from_be_bytes(
        payload[TIMESTAMP_OFFSET..NONCE_OFFSET]
            .try_into()
            .expect("fixed timestamp"),
    );
    if enforce_freshness && unix_time_ms().abs_diff(timestamp_ms) > MAX_CLOCK_SKEW_MS {
        return Err("registration timestamp is outside the allowed window");
    }
    let nonce: [u8; 16] = payload[NONCE_OFFSET..IDENTITY_OFFSET]
        .try_into()
        .expect("fixed nonce");
    let identity_public_key: [u8; 32] = payload[IDENTITY_OFFSET..EXCHANGE_OFFSET]
        .try_into()
        .expect("fixed identity key");
    let exchange_public_key: [u8; 32] = payload[EXCHANGE_OFFSET..SIGNATURE_OFFSET]
        .try_into()
        .expect("fixed exchange key");
    let signature = Signature::from_bytes(
        &payload[SIGNATURE_OFFSET..ENVELOPE_LEN]
            .try_into()
            .expect("fixed signature"),
    );
    let ice_description = &payload[ENVELOPE_LEN..];
    let message = signing_message(
        session_id,
        client_id,
        timestamp_ms,
        nonce,
        identity_public_key,
        exchange_public_key,
        ice_description,
    );
    VerifyingKey::from_bytes(&identity_public_key)
        .map_err(|_| "registration identity key is invalid")?
        .verify(&message, &signature)
        .map_err(|_| "registration signature is invalid")?;
    Ok(VerifiedRegistration {
        timestamp_ms,
        nonce,
        identity_public_key,
        exchange_public_key,
        ice_description,
    })
}

fn signing_message(
    session_id: u64,
    client_id: u64,
    timestamp_ms: u64,
    nonce: [u8; 16],
    identity_public_key: [u8; 32],
    exchange_public_key: [u8; 32],
    ice_description: &[u8],
) -> Vec<u8> {
    let digest = Sha256::digest(ice_description);
    let mut message = Vec::with_capacity(DOMAIN.len() + 8 * 3 + 16 + 32 * 3);
    message.extend_from_slice(DOMAIN);
    message.extend_from_slice(&session_id.to_be_bytes());
    message.extend_from_slice(&client_id.to_be_bytes());
    message.extend_from_slice(&timestamp_ms.to_be_bytes());
    message.extend_from_slice(&nonce);
    message.extend_from_slice(&identity_public_key);
    message.extend_from_slice(&exchange_public_key);
    message.extend_from_slice(&digest);
    message
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_registration_round_trips_and_binds_scope() {
        let signer = RegistrationSigner::generate();
        let exchange = [7_u8; 32];
        let payload = signer.sign(42, 3, exchange, b"ice");
        let verified = verify(&payload, 42, 3, true).unwrap();
        assert_eq!(verified.exchange_public_key, exchange);
        assert_eq!(verified.ice_description, b"ice");
        assert!(verify(&payload, 43, 3, true).is_err());
        assert!(verify(&payload, 42, 2, true).is_err());
    }

    #[test]
    fn tampering_is_rejected() {
        let signer = RegistrationSigner::generate();
        let mut payload = signer.sign(1, 1, [9_u8; 32], b"ice");
        *payload.last_mut().unwrap() ^= 1;
        assert!(verify(&payload, 1, 1, true).is_err());
    }
}
