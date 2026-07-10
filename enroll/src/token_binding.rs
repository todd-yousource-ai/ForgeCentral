//! DPoP token-to-key binding (RFC 9449 + RFC 7638), the load-bearing piece of the software-key
//! enrollment (`IP-CONSOLE-00-DEPLOY` D.3a-console.2).
//!
//! A software key can enroll only via the engine's `TokenAsserted` binding: the IdP token must carry
//! `cnf.jkt == jwk_thumbprint(the software key)`. That requires the client to present a DPoP proof at the
//! IdP's token endpoint, so the IdP mints a `cnf`-bound token. (A bare token drives the `NodeEstablished`
//! binding, which forces a verified TPM attestation and refuses a software key.) This module builds the
//! canonical EC JWK, the `jkt` thumbprint, and the DPoP proof JWT signed by the [`SoftwareKeystore`].
//!
//! The canonical JWK + the JWT header/claims are hand-built (lexicographic keys, no whitespace) so the
//! thumbprint is stable and no JSON dependency is pulled in. All hashing/signing is AWS-LC.

use aws_lc_rs::digest::{digest, SHA256};
use aws_lc_rs::rand::{SecureRandom, SystemRandom};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;

use crate::keystore::{EnrollError, SoftwareKeystore};

/// Base64url (no padding) of `bytes` -- the JOSE encoding.
fn b64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Split a raw uncompressed P-384 public point (`0x04 || X(48) || Y(48)`) into its `X`, `Y` coordinates.
fn xy(public_point: &[u8]) -> Result<(&[u8], &[u8]), EnrollError> {
    if public_point.len() != 97 || public_point[0] != 0x04 {
        return Err(EnrollError::Sign(
            "public point is not a 97-byte uncompressed P-384 point".to_owned(),
        ));
    }
    Ok((&public_point[1..49], &public_point[49..97]))
}

/// The RFC 7638 canonical EC JWK for a P-384 public point: members in lexicographic order, no whitespace.
///
/// # Errors
/// [`EnrollError::Sign`] if the point is not a valid uncompressed P-384 point.
pub fn canonical_ec_jwk(public_point: &[u8]) -> Result<String, EnrollError> {
    let (x, y) = xy(public_point)?;
    Ok(format!(
        r#"{{"crv":"P-384","kty":"EC","x":"{}","y":"{}"}}"#,
        b64url(x),
        b64url(y),
    ))
}

/// The RFC 7638 JWK thumbprint (`jkt`): `base64url(SHA-256(canonical_jwk))`. The IdP sets the token's
/// `cnf.jkt` to this value; the engine re-derives it from the CSR's public key and matches.
///
/// # Errors
/// [`EnrollError::Sign`] if the point is invalid.
pub fn jwk_thumbprint(public_point: &[u8]) -> Result<String, EnrollError> {
    let jwk = canonical_ec_jwk(public_point)?;
    Ok(b64url(digest(&SHA256, jwk.as_bytes()).as_ref()))
}

/// The DPoP `ath` claim: `base64url(SHA-256(access_token))`, binding the proof to a specific token.
#[must_use]
pub fn access_token_hash(access_token: &str) -> String {
    b64url(digest(&SHA256, access_token.as_bytes()).as_ref())
}

/// A random `jti` (DPoP proof unique id): 16 bytes, base64url.
fn random_jti(rng: &SystemRandom) -> Result<String, EnrollError> {
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes)
        .map_err(|_| EnrollError::Sign("jti randomness failed".to_owned()))?;
    Ok(b64url(&bytes))
}

/// Build a DPoP proof JWT (RFC 9449) for the request `htm` (HTTP method) + `htu` (URL), signed by `key`.
///
/// The header carries the public JWK so the IdP derives `cnf.jkt`; `iat`/`jti` freshen the proof; `ath`
/// (when the proof accompanies an access token) binds it to that token. Signed ES384 over the software key
/// (fixed `r||s`), the JOSE encoding [`SoftwareKeystore::sign`] already produces. `iat` is supplied by the
/// caller (unix seconds) so the function stays testable and side-effect-free.
///
/// # Errors
/// [`EnrollError::Sign`] on an invalid key point, bad randomness, or a signing failure.
pub fn dpop_proof(
    key: &SoftwareKeystore,
    htm: &str,
    htu: &str,
    iat: u64,
    ath: Option<&str>,
) -> Result<String, EnrollError> {
    let jwk = canonical_ec_jwk(&key.public_point())?;
    let header = format!(r#"{{"alg":"ES384","jwk":{jwk},"typ":"dpop+jwt"}}"#);
    let jti = random_jti(&SystemRandom::new())?;
    let claims = match ath {
        Some(ath) => {
            format!(r#"{{"ath":"{ath}","htm":"{htm}","htu":"{htu}","iat":{iat},"jti":"{jti}"}}"#)
        }
        None => format!(r#"{{"htm":"{htm}","htu":"{htu}","iat":{iat},"jti":"{jti}"}}"#),
    };
    let signing_input = format!(
        "{}.{}",
        b64url(header.as_bytes()),
        b64url(claims.as_bytes())
    );
    let signature = key.sign(signing_input.as_bytes())?;
    Ok(format!("{signing_input}.{}", b64url(&signature)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_lc_rs::signature::{UnparsedPublicKey, ECDSA_P384_SHA384_FIXED};

    #[test]
    fn canonical_jwk_is_lexicographic_and_whitespace_free() {
        let ks = SoftwareKeystore::generate().unwrap();
        let jwk = canonical_ec_jwk(&ks.public_point()).unwrap();
        assert!(jwk.starts_with(r#"{"crv":"P-384","kty":"EC","x":""#));
        assert!(!jwk.contains(' '), "canonical JWK has no whitespace");
        // The thumbprint is a stable base64url string derived from that canonical form.
        let jkt = jwk_thumbprint(&ks.public_point()).unwrap();
        assert_eq!(jkt, jwk_thumbprint(&ks.public_point()).unwrap());
        assert!(!jkt.contains('=') && !jkt.contains('+') && !jkt.contains('/'));
    }

    #[test]
    fn a_bad_public_point_is_refused() {
        assert!(canonical_ec_jwk(&[0x04; 10]).is_err());
        assert!(jwk_thumbprint(&[0u8; 97]).is_err(), "wrong marker byte");
    }

    #[test]
    fn dpop_proof_is_a_three_part_jwt_that_verifies() {
        let ks = SoftwareKeystore::generate().unwrap();
        let jwt = dpop_proof(
            &ks,
            "POST",
            "https://idp.example/oauth/token",
            1_700_000_000,
            None,
        )
        .unwrap();
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3, "header.payload.signature");

        // The header decodes to the DPoP type + ES384.
        let header = URL_SAFE_NO_PAD.decode(parts[0]).unwrap();
        let header = String::from_utf8(header).unwrap();
        assert!(header.contains(r#""typ":"dpop+jwt""#));
        assert!(header.contains(r#""alg":"ES384""#));

        // The signature verifies over `header.payload` against the key's public point.
        let signing_input = format!("{}.{}", parts[0], parts[1]);
        let sig = URL_SAFE_NO_PAD.decode(parts[2]).unwrap();
        UnparsedPublicKey::new(&ECDSA_P384_SHA384_FIXED, ks.public_point())
            .verify(signing_input.as_bytes(), &sig)
            .expect("DPoP proof signature verifies");
    }

    #[test]
    fn dpop_proof_binds_the_access_token_via_ath() {
        let ks = SoftwareKeystore::generate().unwrap();
        let ath = access_token_hash("an-opaque-access-token");
        let jwt = dpop_proof(
            &ks,
            "POST",
            "https://node/enroll",
            1_700_000_000,
            Some(&ath),
        )
        .unwrap();
        let payload = URL_SAFE_NO_PAD
            .decode(jwt.split('.').nth(1).unwrap())
            .unwrap();
        let payload = String::from_utf8(payload).unwrap();
        assert!(payload.contains(&format!(r#""ath":"{ath}""#)));
    }
}
