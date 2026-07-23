//! The sidecar configuration, parsed + validated at startup, fail-closed (CS.1).
//!
//! The installer provisions a JSON config file; the sidecar reads it at boot and validates it before any
//! listener starts. Validation is FAIL-CLOSED: the admin bind must be the node's own IP literal (never a
//! wildcard/hostname), and the two BFF <-> sidecar cleartext hops must be loopback (never routable). A
//! missing/unknown field or a widened bind refuses startup rather than serving half-configured. The TLS
//! material (paths) is carried here and its existence is checked at the point of use (CS.2 admin leaf,
//! CS.3 engine mTLS), so this module has no dependency on the crypto crates.

use std::path::PathBuf;

use serde::Deserialize;

use crate::bind::{assert_loopback_addr, assert_node_ip_bind, SidecarError};

/// The validated sidecar configuration. `deny_unknown_fields` makes a typo a startup failure, not a
/// silently-ignored setting (fail-closed).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SidecarConfig {
    /// The node's own IP literal the admin plane binds (never wildcard/hostname).
    pub admin_bind_ip: String,
    /// The admin-plane TCP port (the browser -> Console leg; TRD-CONSOLE-00 Section 8 fixes 8443).
    pub admin_port: u16,
    /// The loopback `ip:port` of the BFF's admin HTTP listener the terminator forwards decrypted bytes to.
    pub admin_upstream: String,
    /// The engine wire gateway `host:port` the sidecar originates mTLS to.
    pub engine_addr: String,
    /// The name to verify in the engine's server certificate (its SAN, e.g. `wire.localhost`).
    pub engine_servername: String,
    /// Path to the CA bundle that signs the engine's server certificate (the wire CA).
    pub engine_ca: PathBuf,
    /// Path to the sidecar's client certificate presented to the engine (the service Principal).
    pub engine_cert: PathBuf,
    /// Path to the sidecar's engine-identity **private key** (PEM): the long-lived software Console-CA leaf
    /// the node installer generates for the dedicated control plane (IP-CONSOLE-CONTROL-PLANE D2,
    /// `/etc/cdb/control/client.key`). The sidecar presents this permanent, pinned software P-384 identity
    /// on `:7879`, decoupled from the box TPM (so no identity collision with Torch). This is the only
    /// engine-identity path; the retired ZTP/TPM `console-enroll` path is gone.
    pub engine_key: PathBuf,
    /// The loopback `ip:port` the sidecar listens on for the BFF's outbound wire bytes.
    pub egress_addr: String,
    /// Path to the admin-plane server certificate (the installer-provisioned CNSA-grade leaf).
    pub admin_cert: PathBuf,
    /// Path to the admin-plane server private key.
    pub admin_key: PathBuf,
    /// The loopback `ip:port` the Forge bundle-signing service listens on (FD.2), or absent.
    ///
    /// OPTIONAL BY DESIGN, unlike every field above: the signing plane is a provisioned capability --
    /// FD.5's installer generates the seed and writes both fields together -- and a sidecar deployed
    /// before that provisioning must keep terminating TLS rather than refuse startup. Setting one of
    /// the pair without the other IS a refused misconfiguration (see `validate`).
    #[serde(default)]
    pub sign_addr: Option<String>,
    /// Path to the ML-DSA-87 signing seed the sidecar owns (FD.2), or absent. See `sign_addr`.
    #[serde(default)]
    pub sign_seed: Option<PathBuf>,
    /// The loopback `ip:port` the IdAM secret-set service listens on (ID.4 part 3), or absent.
    ///
    /// OPTIONAL like the signing pair, and provisioned with `secret_path`: a connector onboarding
    /// capability, absent on a sidecar not yet configured for it. Setting one of the pair without the
    /// other IS a refused misconfiguration (see `validate`).
    #[serde(default)]
    pub secret_addr: Option<String>,
    /// Path the accepted connector secret is written to, the engine's `client_secret_ref` (ID.4 part
    /// 3), or absent. See `secret_addr`. MUST match the path the BFF names to `IDAM_CONNECT`.
    #[serde(default)]
    pub secret_path: Option<PathBuf>,
}

impl SidecarConfig {
    /// Read and validate the configuration from a JSON file at `path`.
    ///
    /// # Errors
    /// [`SidecarError::Config`] when the file cannot be read or parsed; [`SidecarError::WidenedBind`] or
    /// [`SidecarError::Config`] when validation fails.
    pub fn from_path(path: &str) -> Result<Self, SidecarError> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| SidecarError::Config(format!("cannot read config {path}: {e}")))?;
        Self::from_json_str(&raw)
    }

    /// Parse and validate the configuration from a JSON string.
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a parse error; a validation error (see [`Self::validate`]) otherwise.
    pub fn from_json_str(json: &str) -> Result<Self, SidecarError> {
        let config: SidecarConfig = serde_json::from_str(json)
            .map_err(|e| SidecarError::Config(format!("config parse: {e}")))?;
        config.validate()?;
        Ok(config)
    }

    /// Validate the configuration fail-closed: the admin bind is the node's own IP literal, and the two
    /// internal hops are loopback.
    ///
    /// # Errors
    /// [`SidecarError::WidenedBind`] on a widened admin bind; [`SidecarError::Config`] on a non-loopback
    /// internal hop.
    pub fn validate(&self) -> Result<(), SidecarError> {
        assert_node_ip_bind(&self.admin_bind_ip)?;
        assert_loopback_addr(&self.admin_upstream)?;
        assert_loopback_addr(&self.egress_addr)?;
        // The signing pair travels together: half a signing plane is a misconfiguration, not a mode.
        match (&self.sign_addr, &self.sign_seed) {
            (Some(addr), Some(_)) => assert_loopback_addr(addr)?,
            (None, None) => {}
            _ => {
                return Err(SidecarError::Config(
                    "sign_addr and sign_seed must be set together (FD.5 provisions both)"
                        .to_owned(),
                ))
            }
        }
        // The IdAM secret-set pair travels together too: half of it cannot accept a secret.
        match (&self.secret_addr, &self.secret_path) {
            (Some(addr), Some(_)) => assert_loopback_addr(addr)?,
            (None, None) => {}
            _ => {
                return Err(SidecarError::Config(
                    "secret_addr and secret_path must be set together".to_owned(),
                ))
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    // Tests may unwrap a known-good fixture parse; the crate lint denies unwrap in production code only.
    #![allow(clippy::unwrap_used)]

    use super::SidecarConfig;

    fn valid_json() -> String {
        r#"{
            "admin_bind_ip": "10.0.0.5",
            "admin_port": 8443,
            "admin_upstream": "127.0.0.1:8788",
            "engine_addr": "engine.internal:7878",
            "engine_servername": "wire.localhost",
            "engine_ca": "/etc/console/engine-ca.pem",
            "engine_cert": "/etc/cdb/control/client.pem",
            "engine_key": "/etc/cdb/control/client.key",
            "egress_addr": "127.0.0.1:8789",
            "admin_cert": "/etc/console/admin-cert.pem",
            "admin_key": "/etc/console/admin-key.pem"
        }"#
        .to_owned()
    }

    #[test]
    fn parses_and_validates_a_well_formed_config() {
        let config = SidecarConfig::from_json_str(&valid_json()).unwrap();
        assert_eq!(config.admin_port, 8443);
        assert_eq!(config.engine_addr, "engine.internal:7878");
        // IP-CONSOLE-CONTROL-PLANE D2: the engine identity is the software Console-CA leaf on :7879.
        assert_eq!(
            config.engine_key,
            std::path::Path::new("/etc/cdb/control/client.key")
        );
    }

    #[test]
    fn a_config_without_the_engine_key_is_refused() {
        // The software engine key is required; the retired TPM/ZTP path is gone, so an absent key is a
        // fail-closed startup error (no silent fallback).
        let json = valid_json().replace("\"engine_key\": \"/etc/cdb/control/client.key\",", "");
        assert!(SidecarConfig::from_json_str(&json).is_err());
    }

    #[test]
    fn a_half_configured_signing_plane_is_refused() {
        // FD.2: the pair travels together. Half a signing plane is a misconfiguration, not a mode.
        let with_addr_only = valid_json().replace(
            "\"egress_addr\"",
            "\"sign_addr\": \"127.0.0.1:8790\", \"egress_addr\"",
        );
        assert!(SidecarConfig::from_json_str(&with_addr_only).is_err());
        // Both set parses, and a routable sign_addr is refused like every internal hop.
        let both = valid_json().replace(
            "\"egress_addr\"",
            "\"sign_addr\": \"127.0.0.1:8790\", \"sign_seed\": \"/var/lib/console/sign.seed\", \"egress_addr\"",
        );
        assert!(SidecarConfig::from_json_str(&both).is_ok());
        let routable = both.replace("127.0.0.1:8790", "10.0.0.5:8790");
        assert!(SidecarConfig::from_json_str(&routable).is_err());
    }

    #[test]
    fn rejects_a_widened_admin_bind() {
        let json = valid_json().replace("10.0.0.5", "0.0.0.0");
        assert!(SidecarConfig::from_json_str(&json).is_err());
    }

    #[test]
    fn rejects_a_routable_internal_hop() {
        let json = valid_json().replace("127.0.0.1:8789", "10.0.0.5:8789");
        assert!(SidecarConfig::from_json_str(&json).is_err());
    }

    #[test]
    fn rejects_an_unknown_field_fail_closed() {
        let json = valid_json().replace(
            "\"admin_port\": 8443,",
            "\"admin_port\": 8443, \"extra\": 1,",
        );
        assert!(SidecarConfig::from_json_str(&json).is_err());
    }

    #[test]
    fn rejects_a_missing_required_field() {
        let json = valid_json().replace("\"admin_port\": 8443,", "");
        assert!(SidecarConfig::from_json_str(&json).is_err());
    }
}
