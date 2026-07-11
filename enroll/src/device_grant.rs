//! RFC 8628 device-authorization grant message modeling (`IP-CONSOLE-00-DEPLOY` D.3a-console.2c).
//!
//! The operator-MFA flow: the client POSTs a device-authorization request to the IdP, shows the operator
//! the `user_code` + `verification_uri`, then polls the token endpoint (carrying the DPoP proof, so the
//! IdP mints a `cnf`-bound token) until the operator approves or the request lapses. This module models
//! the request bodies + the response parsing + the poll outcome; the HTTPS transport is D.3a-console.2c-2.
//!
//! Request bodies are hand-built `application/x-www-form-urlencoded`; responses are parsed with serde_json.

use serde::Deserialize;

use crate::error::EnrollError;

/// The device-authorization response (RFC 8628 §3.2): what the operator approves + how to poll.
#[derive(Debug, Clone, Deserialize)]
pub struct DeviceAuthorization {
    /// The code the client presents at the token endpoint to poll.
    pub device_code: String,
    /// The short code the operator enters at the verification URI.
    pub user_code: String,
    /// Where the operator signs in + approves (MFA).
    pub verification_uri: String,
    /// The verification URI with the code pre-filled, when the IdP provides it.
    #[serde(default)]
    pub verification_uri_complete: Option<String>,
    /// Seconds until `device_code` expires.
    pub expires_in: u64,
    /// The minimum seconds between polls (defaults to 5 per RFC 8628 §3.2).
    #[serde(default = "default_interval")]
    pub interval: u64,
}

const fn default_interval() -> u64 {
    5
}

/// A successful token response: the `cnf`-bound access token the enrollment `token` field carries.
#[derive(Debug, Clone, Deserialize)]
pub struct TokenSuccess {
    /// The access token (opaque JWS) the client sends to the enrollment service.
    pub access_token: String,
    /// The token type (expected `DPoP` for a `cnf`-bound token).
    #[serde(default)]
    pub token_type: String,
    /// Seconds until the token expires, when provided.
    #[serde(default)]
    pub expires_in: Option<u64>,
}

/// The outcome of one poll of the token endpoint (RFC 8628 §3.5).
#[derive(Debug)]
pub enum PollOutcome {
    /// `authorization_pending`: keep polling at the current interval.
    Pending,
    /// `slow_down`: keep polling, but increase the interval (by 5s per the RFC).
    SlowDown,
    /// The operator approved: the `cnf`-bound token.
    Approved(Box<TokenSuccess>),
    /// A terminal refusal (`access_denied`, `expired_token`, or any other error): stop, fail closed.
    Denied(String),
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
}

/// Percent-encode a form value (`application/x-www-form-urlencoded`): keep RFC 3986 unreserved bytes,
/// percent-encode everything else (spaces become `%20`, which every OAuth endpoint accepts).
fn form_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for &b in value.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push('%');
            out.push_str(&format!("{b:02X}"));
        }
    }
    out
}

/// The device-authorization request body (RFC 8628 §3.1): `client_id`, `scope`, and (Auth0) `audience`.
#[must_use]
pub fn device_authorization_form(client_id: &str, scope: &str, audience: Option<&str>) -> String {
    let mut body = format!(
        "client_id={}&scope={}",
        form_encode(client_id),
        form_encode(scope)
    );
    if let Some(audience) = audience {
        body.push_str(&format!("&audience={}", form_encode(audience)));
    }
    body
}

/// The token-poll request body (RFC 8628 §3.4): the device-code grant + the `device_code` + `client_id`.
#[must_use]
pub fn token_poll_form(client_id: &str, device_code: &str) -> String {
    format!(
        "grant_type={}&device_code={}&client_id={}",
        form_encode("urn:ietf:params:oauth:grant-type:device_code"),
        form_encode(device_code),
        form_encode(client_id),
    )
}

/// Parse the device-authorization response body.
///
/// # Errors
/// [`EnrollError::Sign`] if the body is not a valid device-authorization response.
pub fn parse_device_authorization(body: &[u8]) -> Result<DeviceAuthorization, EnrollError> {
    serde_json::from_slice(body)
        .map_err(|e| EnrollError::Sign(format!("device-authorization response: {e}")))
}

/// Parse a token-endpoint response into a poll outcome. `http_ok` is whether the response was 2xx (a token)
/// versus a 4xx OAuth error (`authorization_pending`/`slow_down`/terminal).
///
/// # Errors
/// [`EnrollError::Sign`] if neither a token nor a recognizable OAuth error can be parsed.
pub fn parse_token_poll(http_ok: bool, body: &[u8]) -> Result<PollOutcome, EnrollError> {
    if http_ok {
        let token: TokenSuccess = serde_json::from_slice(body)
            .map_err(|e| EnrollError::Sign(format!("token response: {e}")))?;
        return Ok(PollOutcome::Approved(Box::new(token)));
    }
    let err: TokenError = serde_json::from_slice(body)
        .map_err(|e| EnrollError::Sign(format!("token error response: {e}")))?;
    Ok(match err.error.as_str() {
        "authorization_pending" => PollOutcome::Pending,
        "slow_down" => PollOutcome::SlowDown,
        other => PollOutcome::Denied(other.to_owned()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_authorization_form_encodes_scope_and_audience() {
        let body = device_authorization_form(
            "client-123",
            "openid profile",
            Some("https://crucibledb/enroll"),
        );
        assert!(body.contains("client_id=client-123"));
        assert!(body.contains("scope=openid%20profile"), "space is %20");
        assert!(body.contains("audience=https%3A%2F%2Fcrucibledb%2Fenroll"));
    }

    #[test]
    fn token_poll_form_uses_the_device_code_grant() {
        let body = token_poll_form("client-123", "dev-code-abc");
        assert!(
            body.contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"),
            "device-code grant is percent-encoded",
        );
        assert!(body.contains("device_code=dev-code-abc"));
    }

    #[test]
    fn parses_a_device_authorization_response_with_defaults() {
        let body = br#"{"device_code":"DC","user_code":"WXYZ-1234",
            "verification_uri":"https://idp/activate","expires_in":600}"#;
        let da = parse_device_authorization(body).unwrap();
        assert_eq!(da.device_code, "DC");
        assert_eq!(da.user_code, "WXYZ-1234");
        assert_eq!(da.interval, 5, "interval defaults to 5");
        assert!(da.verification_uri_complete.is_none());
    }

    #[test]
    fn a_2xx_body_is_the_approved_token() {
        let body = br#"{"access_token":"the.jws.token","token_type":"DPoP","expires_in":3600}"#;
        match parse_token_poll(true, body).unwrap() {
            PollOutcome::Approved(t) => assert_eq!(t.access_token, "the.jws.token"),
            other => panic!("expected Approved, got {other:?}"),
        }
    }

    #[test]
    fn oauth_errors_map_to_poll_outcomes() {
        let pending = br#"{"error":"authorization_pending"}"#;
        let slow = br#"{"error":"slow_down"}"#;
        let denied = br#"{"error":"access_denied"}"#;
        assert!(matches!(
            parse_token_poll(false, pending).unwrap(),
            PollOutcome::Pending
        ));
        assert!(matches!(
            parse_token_poll(false, slow).unwrap(),
            PollOutcome::SlowDown
        ));
        match parse_token_poll(false, denied).unwrap() {
            PollOutcome::Denied(e) => assert_eq!(e, "access_denied"),
            other => panic!("expected Denied, got {other:?}"),
        }
    }
}
