//! The admin-plane bind guard (CS.1, INV-SIDECAR-BIND-FAILCLOSED).
//!
//! The admin plane listens ONLY on the installed node's own IP address -- never a wildcard/unspecified
//! bind (which would widen it to every interface) and never a hostname (which could resolve to one). The
//! guard is fail-closed: a widened bind is rejected before any listener starts (TRD-CONSOLE-00 Section 8,
//! INV-CONSOLE-ADMIN-PLANE). This is a *narrowing* check -- a concrete unicast literal (the node's
//! LAN/public IP, or loopback) is accepted; anything that would broaden the exposure is refused.

use std::net::{IpAddr, SocketAddr};

/// Errors from configuring or running the sidecar. Carries no secret material (paths/addresses only).
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum SidecarError {
    /// The admin bind address is not the node's own IP literal (a hostname, or a wildcard/unspecified addr).
    #[error("admin bind must be the node's own IP literal, not a hostname or wildcard: {0}")]
    WidenedBind(String),
    /// A required configuration value is missing or malformed.
    #[error("invalid configuration: {0}")]
    Config(String),
}

/// Assert `host` is the node's own IP literal, or return [`SidecarError::WidenedBind`].
///
/// Rejects a hostname (does not parse as an [`IpAddr`]) and the unspecified/wildcard addresses
/// (`0.0.0.0`, `::`); accepts any concrete unicast IPv4/IPv6 literal, including loopback (a stricter,
/// node-local bind -- a narrowing, not a widening).
///
/// # Errors
/// [`SidecarError::WidenedBind`] when `host` is a hostname or an unspecified/wildcard address.
pub fn assert_node_ip_bind(host: &str) -> Result<(), SidecarError> {
    let addr: IpAddr = host
        .parse()
        .map_err(|_| SidecarError::WidenedBind(host.to_owned()))?;
    if addr.is_unspecified() {
        return Err(SidecarError::WidenedBind(host.to_owned()));
    }
    Ok(())
}

/// Assert `addr` is a loopback socket address (`127.0.0.1`/`::1` + a port), or return an error.
///
/// The BFF <-> sidecar cleartext hops must be loopback only, never a routable interface (the local-capture
/// posture, IP-CONSOLE-00-CRYPTO-SIDECAR Section 9). Fail-closed: a routable or malformed internal-hop
/// address is refused before any listener starts.
///
/// # Errors
/// [`SidecarError::Config`] when `addr` is not a parseable loopback `ip:port`.
pub fn assert_loopback_addr(addr: &str) -> Result<(), SidecarError> {
    let socket: SocketAddr = addr
        .parse()
        .map_err(|_| SidecarError::Config(format!("internal hop must be `ip:port`: {addr}")))?;
    if !socket.ip().is_loopback() {
        return Err(SidecarError::Config(format!(
            "internal hop must be loopback (127.0.0.1/::1), not a routable address: {addr}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{assert_loopback_addr, assert_node_ip_bind};

    #[test]
    fn accepts_a_concrete_node_ipv4_literal() {
        assert!(assert_node_ip_bind("10.0.0.5").is_ok());
        assert!(assert_node_ip_bind("192.168.1.20").is_ok());
    }

    #[test]
    fn accepts_loopback_as_a_stricter_node_local_bind() {
        assert!(assert_node_ip_bind("127.0.0.1").is_ok());
        assert!(assert_node_ip_bind("::1").is_ok());
    }

    #[test]
    fn accepts_a_concrete_ipv6_literal() {
        assert!(assert_node_ip_bind("fd00::1").is_ok());
    }

    #[test]
    fn rejects_the_ipv4_wildcard() {
        assert!(assert_node_ip_bind("0.0.0.0").is_err());
    }

    #[test]
    fn rejects_the_ipv6_unspecified() {
        assert!(assert_node_ip_bind("::").is_err());
    }

    #[test]
    fn rejects_a_hostname_that_could_resolve_to_a_wildcard() {
        assert!(assert_node_ip_bind("localhost").is_err());
        assert!(assert_node_ip_bind("console.internal").is_err());
        assert!(assert_node_ip_bind("").is_err());
    }

    #[test]
    fn loopback_hop_accepts_loopback_socket_addrs() {
        assert!(assert_loopback_addr("127.0.0.1:8788").is_ok());
        assert!(assert_loopback_addr("[::1]:8788").is_ok());
    }

    #[test]
    fn loopback_hop_rejects_a_routable_or_wildcard_address() {
        assert!(assert_loopback_addr("10.0.0.5:8788").is_err());
        assert!(assert_loopback_addr("0.0.0.0:8788").is_err());
        assert!(assert_loopback_addr("not-an-addr").is_err());
    }
}
