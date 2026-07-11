//! The SPIFFE provenance URI derived from the operator's federated token (FQ.4).
//!
//! The enrollment CSR carries a `URI` SAN of the form `spiffe://<issuer-host>/<subject>`, byte-identical
//! to the value the node derives from the same token when it mints the CA one-time token -- so step-ca
//! accepts the CSR's names. The operator subject rides as the SAN provenance, never the CN.
//!
//! Faithful port of the torch-core derivation; the JWT is parsed for `iss`/`sub` only (no signature
//! check -- the node re-verifies the token server-side).

use crate::error::EnrollError;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;

/// The `spiffe://<issuer-host>/<subject>` provenance URI for `token`.
///
/// # Errors
/// [`EnrollError::Provision`] if the token is not a JWT or lacks an `iss`/`sub` claim.
pub fn spiffe_provenance_uri(token: &str) -> Result<String, EnrollError> {
    let issuer = token_issuer(token)?;
    let subject = token_subject(token)?;
    Ok(format!("spiffe://{}/{subject}", issuer_host(&issuer)))
}

/// The `sub` claim of a JWT `token` (no signature verification).
///
/// # Errors
/// [`EnrollError::Provision`] if the token is malformed or has no `sub`.
pub fn token_subject(token: &str) -> Result<String, EnrollError> {
    claim(token, "sub")
}

/// The `iss` claim of a JWT `token` (no signature verification).
///
/// # Errors
/// [`EnrollError::Provision`] if the token is malformed or has no `iss`.
pub fn token_issuer(token: &str) -> Result<String, EnrollError> {
    claim(token, "iss")
}

/// Extract a string `name` claim from the JWT payload (the second dot-segment).
fn claim(token: &str, name: &str) -> Result<String, EnrollError> {
    let malformed = || EnrollError::Provision(format!("malformed token (no {name} claim)"));
    let payload_b64 = token.split('.').nth(1).ok_or_else(malformed)?;
    let payload = URL_SAFE_NO_PAD
        .decode(payload_b64)
        .map_err(|_| malformed())?;
    let claims: serde_json::Value = serde_json::from_slice(&payload).map_err(|_| malformed())?;
    claims
        .get(name)
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(malformed)
}

/// The host authority of an issuer URL (scheme, path, and port stripped).
fn issuer_host(issuer: &str) -> &str {
    let without_scheme = issuer
        .strip_prefix("https://")
        .or_else(|| issuer.strip_prefix("http://"))
        .unwrap_or(issuer);
    let authority = without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme);
    authority.split(':').next().unwrap_or(authority)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;

    fn jwt(payload_json: &[u8]) -> String {
        format!("header.{}.sig", URL_SAFE_NO_PAD.encode(payload_json))
    }

    // FQ.4: the provenance URI is spiffe://<issuer-host>/<sub>, matching the node's derivation so the
    // CSR's URI SAN equals the issuance token's SANs.
    #[test]
    fn spiffe_provenance_uri_is_built_from_iss_and_sub() {
        let token =
            jwt(br#"{"iss":"https://dev-6rcwumbp1tsae8me.us.auth0.com/","sub":"auth0|6a3abf93"}"#);
        assert_eq!(
            spiffe_provenance_uri(&token).unwrap(),
            "spiffe://dev-6rcwumbp1tsae8me.us.auth0.com/auth0|6a3abf93"
        );
    }

    #[test]
    fn issuer_host_strips_scheme_path_and_port() {
        let token = jwt(br#"{"iss":"https://idp.example.com:8443/realm","sub":"u1"}"#);
        assert_eq!(
            spiffe_provenance_uri(&token).unwrap(),
            "spiffe://idp.example.com/u1"
        );
    }

    #[test]
    fn a_malformed_token_or_missing_claim_fails_closed() {
        assert!(spiffe_provenance_uri("not-a-jwt").is_err());
        let no_sub = jwt(br#"{"iss":"https://idp/","aud":"x"}"#);
        assert!(matches!(
            token_subject(&no_sub),
            Err(EnrollError::Provision(_))
        ));
    }
}
