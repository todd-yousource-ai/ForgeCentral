//! A minimal HTTP/1.1 request/response codec for the IdP device-grant calls (`IP-CONSOLE-00-DEPLOY`
//! D.3a-console.2c). Just enough to POST a form body (optionally with a `DPoP` header) and read a
//! complete response -- hand-rolled so no HTTP-client crate (and its own bundled TLS) is pulled in; the
//! transport runs over the platform's `tokio-rustls`/AWS-LC stack (D.3a-console.2c-2). This module is the
//! pure, fixture-testable half: build the request bytes, parse a complete response buffer.

use crate::error::EnrollError;

/// A parsed HTTP response: the status code and the body bytes.
#[derive(Debug)]
pub struct HttpResponse {
    /// The HTTP status code (e.g. 200, 400).
    pub status: u16,
    /// The response body.
    pub body: Vec<u8>,
}

impl HttpResponse {
    /// Whether the status is 2xx.
    #[must_use]
    pub const fn is_success(&self) -> bool {
        self.status >= 200 && self.status < 300
    }
}

/// Build an HTTP/1.1 `POST` request as bytes: the request line, `Host`, `Content-Type`, `Content-Length`,
/// `Connection: close`, any `extra_headers` (e.g. `DPoP`), a blank line, then the body.
#[must_use]
pub fn build_post(
    host: &str,
    path: &str,
    content_type: &str,
    extra_headers: &[(&str, &str)],
    body: &[u8],
) -> Vec<u8> {
    let mut head = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len(),
    );
    for (name, value) in extra_headers {
        head.push_str(name);
        head.push_str(": ");
        head.push_str(value);
        head.push_str("\r\n");
    }
    head.push_str("\r\n");
    let mut out = head.into_bytes();
    out.extend_from_slice(body);
    out
}

/// Find the first index of `needle` in `haystack`.
fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Parse a complete HTTP/1.1 response buffer (headers + body already fully read by the transport) into a
/// status code + body. The body is taken from after the header terminator, truncated to `Content-Length`
/// when present.
///
/// # Errors
/// [`EnrollError::Sign`] if the buffer is not a well-formed HTTP response.
pub fn parse_response(raw: &[u8]) -> Result<HttpResponse, EnrollError> {
    let split = find(raw, b"\r\n\r\n")
        .ok_or_else(|| EnrollError::Sign("no HTTP header terminator".into()))?;
    let head = std::str::from_utf8(&raw[..split])
        .map_err(|_| EnrollError::Sign("non-UTF-8 HTTP headers".into()))?;

    let status_line = head
        .lines()
        .next()
        .ok_or_else(|| EnrollError::Sign("empty HTTP response".into()))?;
    // "HTTP/1.1 200 OK" -> the second whitespace-separated token is the status code.
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| EnrollError::Sign(format!("bad HTTP status line: {status_line}")))?;

    let content_length = head.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.trim()
            .eq_ignore_ascii_case("content-length")
            .then(|| value.trim().parse::<usize>().ok())
            .flatten()
    });

    let body_start = split + 4;
    let body = match content_length {
        Some(len) if body_start + len <= raw.len() => raw[body_start..body_start + len].to_vec(),
        _ => raw[body_start..].to_vec(),
    };
    Ok(HttpResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_post_sets_the_length_and_extra_headers() {
        let body = b"grant_type=x&device_code=y";
        let req = build_post(
            "idp.example",
            "/oauth/token",
            "application/x-www-form-urlencoded",
            &[("DPoP", "the.dpop.proof")],
            body,
        );
        let text = String::from_utf8(req).unwrap();
        assert!(text.starts_with("POST /oauth/token HTTP/1.1\r\n"));
        assert!(text.contains("Host: idp.example\r\n"));
        assert!(text.contains(&format!("Content-Length: {}\r\n", body.len())));
        assert!(text.contains("DPoP: the.dpop.proof\r\n"));
        assert!(text.ends_with("\r\n\r\ngrant_type=x&device_code=y"));
    }

    #[test]
    fn parse_response_reads_status_and_content_length_body() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{\"ok\":true}!!extra-past-length";
        let resp = parse_response(raw).unwrap();
        assert_eq!(resp.status, 200);
        assert!(resp.is_success());
        assert_eq!(
            resp.body, b"{\"ok\":true}!!",
            "body truncated to Content-Length"
        );
    }

    #[test]
    fn parse_response_handles_an_error_status_without_content_length() {
        let raw = b"HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\n\r\n{\"error\":\"authorization_pending\"}";
        let resp = parse_response(raw).unwrap();
        assert_eq!(resp.status, 400);
        assert!(!resp.is_success());
        assert_eq!(resp.body, b"{\"error\":\"authorization_pending\"}");
    }

    #[test]
    fn a_malformed_buffer_is_refused() {
        assert!(parse_response(b"not http").is_err());
    }
}
