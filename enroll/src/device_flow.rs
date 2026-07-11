//! The device-grant orchestrator (`IP-CONSOLE-00-DEPLOY` D.3a-console.2c): the RFC 8628 poll state
//! machine that drives the IdP calls to a `cnf`-bound access token.
//!
//! It composes the pure pieces -- the device-grant message modeling ([`crate::device_grant`]), the DPoP
//! proof ([`crate::token_binding`]), and the HTTP codec ([`crate::http`]) -- over a [`PostTransport`] seam.
//! The seam keeps the valuable logic (the poll loop, a fresh DPoP proof per token request, the
//! pending/slow-down/approved/denied handling) testable with a mock; the real TLS transport (D.3a-
//! console.2c-3) is a thin `PostTransport` impl over `tokio-rustls`/AWS-LC (or blocking rustls).

use crate::device_grant::{
    device_authorization_form, parse_device_authorization, parse_token_poll, token_poll_form,
    DeviceAuthorization, PollOutcome,
};
use crate::http::HttpResponse;
use crate::keystore::{EnrollError, SoftwareKeystore};
use crate::token_binding::dpop_proof;

/// The federated IdP endpoints + client the device grant runs against (host + paths, not full URLs, so no
/// URL-parsing dependency).
pub struct IdpConfig {
    /// The IdP host (e.g. `dev-tenant.us.auth0.com`).
    pub host: String,
    /// The device-authorization endpoint path.
    pub device_authorization_path: String,
    /// The token endpoint path.
    pub token_path: String,
    /// The device-code client id.
    pub client_id: String,
    /// The requested scope.
    pub scope: String,
    /// The API audience (Auth0), when required.
    pub audience: Option<String>,
}

/// The transport seam: POST `body` (+ `headers`) to `host``path` and return the parsed response. The real
/// impl runs TLS over AWS-LC (D.3a-console.2c-3); tests supply a scripted mock.
pub trait PostTransport {
    /// POST to `host` at `path` with the given headers + body.
    ///
    /// # Errors
    /// An [`EnrollError`] on a transport or parse failure.
    fn post(
        &mut self,
        host: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> Result<HttpResponse, EnrollError>;
}

/// Hooks the orchestrator needs from its environment, injected so the state machine stays deterministic +
/// testable (the real impls are `SystemTime`, `thread::sleep`, and a `println!` prompt).
pub struct DeviceFlowEnv<'a> {
    /// Current unix time in seconds (the DPoP `iat`).
    pub now: &'a dyn Fn() -> u64,
    /// Sleep for `seconds` between polls.
    pub sleep: &'a dyn Fn(u64),
    /// Show the operator the code + verification URI to approve (MFA).
    pub prompt: &'a dyn Fn(&DeviceAuthorization),
    /// A hard cap on poll iterations (belt-and-suspenders over `expires_in`).
    pub max_polls: u32,
}

/// Run the device-authorization grant to a `cnf`-bound access token.
///
/// Requests device authorization, prompts the operator, then polls the token endpoint -- each poll carries
/// a fresh DPoP proof so the IdP mints a token bound to this key's `jkt`. Returns the access token on
/// approval; fails closed on a terminal OAuth error or timeout.
///
/// # Errors
/// [`EnrollError`] on a transport failure, a terminal OAuth denial, or a poll timeout.
pub fn run_device_grant<T: PostTransport>(
    keystore: &SoftwareKeystore,
    idp: &IdpConfig,
    transport: &mut T,
    env: &DeviceFlowEnv<'_>,
) -> Result<String, EnrollError> {
    // 1. Device authorization: get the user code + the device code to poll.
    let auth_body = device_authorization_form(&idp.client_id, &idp.scope, idp.audience.as_deref());
    let auth_resp = transport.post(
        &idp.host,
        &idp.device_authorization_path,
        &[],
        auth_body.as_bytes(),
    )?;
    if !auth_resp.is_success() {
        return Err(EnrollError::Sign(format!(
            "device-authorization request failed (HTTP {})",
            auth_resp.status
        )));
    }
    let authorization = parse_device_authorization(&auth_resp.body)?;
    (env.prompt)(&authorization);

    // 2. Poll the token endpoint until the operator approves (each poll DPoP-bound to this key).
    let token_htu = format!("https://{}{}", idp.host, idp.token_path);
    let mut interval = authorization.interval;
    for _ in 0..env.max_polls {
        (env.sleep)(interval);
        let dpop = dpop_proof(keystore, "POST", &token_htu, (env.now)(), None)?;
        let poll_body = token_poll_form(&idp.client_id, &authorization.device_code);
        let resp = transport.post(
            &idp.host,
            &idp.token_path,
            &[("DPoP", &dpop)],
            poll_body.as_bytes(),
        )?;
        match parse_token_poll(resp.is_success(), &resp.body)? {
            PollOutcome::Approved(token) => return Ok(token.access_token),
            PollOutcome::Pending => {}
            PollOutcome::SlowDown => interval += 5,
            PollOutcome::Denied(reason) => {
                return Err(EnrollError::Sign(format!("device grant denied: {reason}")))
            }
        }
    }
    Err(EnrollError::Sign("device grant timed out".to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::parse_response;

    /// A scripted transport: returns the next queued raw HTTP response per call, recording requests.
    struct MockTransport {
        responses: Vec<Vec<u8>>,
        seen_dpop: Vec<bool>,
    }
    impl PostTransport for MockTransport {
        fn post(
            &mut self,
            _host: &str,
            _path: &str,
            headers: &[(&str, &str)],
            _body: &[u8],
        ) -> Result<HttpResponse, EnrollError> {
            self.seen_dpop
                .push(headers.iter().any(|(name, _)| *name == "DPoP"));
            let raw = self.responses.remove(0);
            parse_response(&raw)
        }
    }

    fn idp() -> IdpConfig {
        IdpConfig {
            host: "idp.example".to_owned(),
            device_authorization_path: "/oauth/device/code".to_owned(),
            token_path: "/oauth/token".to_owned(),
            client_id: "client-123".to_owned(),
            scope: "openid".to_owned(),
            audience: Some("https://crucibledb/enroll".to_owned()),
        }
    }

    fn ok(body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }
    fn err(body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 400 Bad Request\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    #[test]
    fn polls_through_pending_then_returns_the_approved_token() {
        let ks = SoftwareKeystore::generate().unwrap();
        let mut transport = MockTransport {
            responses: vec![
                ok(
                    r#"{"device_code":"DC","user_code":"WXYZ","verification_uri":"https://idp/act","expires_in":600,"interval":1}"#,
                ),
                err(r#"{"error":"authorization_pending"}"#),
                ok(r#"{"access_token":"the.jws.token","token_type":"DPoP"}"#),
            ],
            seen_dpop: Vec::new(),
        };
        let env = DeviceFlowEnv {
            now: &|| 1_700_000_000,
            sleep: &|_| {},
            prompt: &|_| {},
            max_polls: 5,
        };
        let token = run_device_grant(&ks, &idp(), &mut transport, &env).unwrap();
        assert_eq!(token, "the.jws.token");
        // The device-authorization request carried no DPoP; every token poll did.
        assert_eq!(transport.seen_dpop, vec![false, true, true]);
    }

    #[test]
    fn a_terminal_denial_fails_closed() {
        let ks = SoftwareKeystore::generate().unwrap();
        let mut transport = MockTransport {
            responses: vec![
                ok(
                    r#"{"device_code":"DC","user_code":"W","verification_uri":"https://idp/act","expires_in":600,"interval":1}"#,
                ),
                err(r#"{"error":"access_denied"}"#),
            ],
            seen_dpop: Vec::new(),
        };
        let env = DeviceFlowEnv {
            now: &|| 1_700_000_000,
            sleep: &|_| {},
            prompt: &|_| {},
            max_polls: 5,
        };
        let outcome = run_device_grant(&ks, &idp(), &mut transport, &env);
        assert!(outcome.is_err(), "access_denied fails closed");
    }
}
