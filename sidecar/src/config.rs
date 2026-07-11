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

/// The default TPM TCTI: the host TPM resource manager.
fn default_tcti() -> String {
    "device:/dev/tpmrm0".to_owned()
}

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
    /// Path to the sidecar's enrolled client certificate presented to the engine (the service Principal).
    /// There is NO key file: the engine-identity key is non-exportable and TPM-resident (see `tcti`).
    pub engine_cert: PathBuf,
    /// The TPM TCTI the sidecar opens to re-derive the non-exportable engine-identity key and sign the
    /// mTLS handshake in-device (the same deterministic primary `console-enroll` enrolled). Defaults to
    /// the host TPM.
    #[serde(default = "default_tcti")]
    pub tcti: String,
    /// The loopback `ip:port` the sidecar listens on for the BFF's outbound wire bytes.
    pub egress_addr: String,
    /// Path to the admin-plane server certificate (the installer-provisioned CNSA-grade leaf).
    pub admin_cert: PathBuf,
    /// Path to the admin-plane server private key.
    pub admin_key: PathBuf,
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
            "engine_cert": "/etc/console/bff-cert.pem",
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
        // No key file: the engine key is TPM-resident; the TCTI defaults to the host TPM.
        assert_eq!(config.tcti, "device:/dev/tpmrm0");
    }

    #[test]
    fn rejects_a_stale_engine_key_field_fail_closed() {
        // engine_key is gone (the key is TPM-resident); a config still carrying it is refused.
        let json = valid_json().replace(
            "\"engine_cert\": \"/etc/console/bff-cert.pem\",",
            "\"engine_cert\": \"/etc/console/bff-cert.pem\", \"engine_key\": \"/x.key\",",
        );
        assert!(SidecarConfig::from_json_str(&json).is_err());
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
