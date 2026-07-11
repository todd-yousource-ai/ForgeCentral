//! The provisioning wrapper (`IP-CONSOLE-00-DEPLOY` D.3a-console.3): assemble the pieces into one run --
//! generate the software key, run the operator-MFA device grant to a `cnf`-bound token, submit the CSR
//! over the bootstrap wire, and write the minted `engine_cert` + `engine_key` PEMs the crypto sidecar
//! reads. The `console-enroll` binary (`main.rs`) is a thin shell over [`run_enrollment`].
//!
//! The config parse + the PEM helper are pure/testable; [`run_enrollment`] itself is the live orchestration
//! (operator MFA + the real IdP/node), exercised at D.3c.

use std::io::Write as _;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;

use crate::device_flow::{run_device_grant, DeviceFlowEnv, IdpConfig};
use crate::keystore::{EnrollError, SoftwareKeystore};
use crate::transport::WebPkiPostTransport;
use crate::wire_client::{software_attestation, submit_enrollment, EnrollWireConfig};

/// The provisioning configuration (from the environment).
pub struct EnrollmentConfig {
    /// The IdP host + device-grant client + endpoints.
    pub idp: IdpEnv,
    /// The node enrollment service address + pinned CA path.
    pub node: NodeEnv,
    /// The proposed `console-bff` FQDN (the cert CN + SAN, and the stable device anchor).
    pub fqdn: String,
    /// Where to write the minted leaf cert PEM (the sidecar's `engine_cert`).
    pub cert_out: String,
    /// Where to write the private key PEM (the sidecar's `engine_key`).
    pub key_out: String,
}

/// The IdP endpoints + client for the device grant.
pub struct IdpEnv {
    pub host: String,
    pub client_id: String,
    pub scope: String,
    pub audience: Option<String>,
    pub device_path: String,
    pub token_path: String,
}

/// The node enrollment service coordinates.
pub struct NodeEnv {
    pub addr: String,
    pub server_name: String,
    pub ca_path: String,
}

fn required(get: &impl Fn(&str) -> Option<String>, key: &str) -> Result<String, EnrollError> {
    get(key)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| EnrollError::Provision(format!("missing required env {key}")))
}

fn optional_or(get: &impl Fn(&str) -> Option<String>, key: &str, default: &str) -> String {
    get(key)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_owned())
}

impl EnrollmentConfig {
    /// Read the config from an environment getter (injected so it is testable).
    ///
    /// # Errors
    /// [`EnrollError::Provision`] if a required variable is missing.
    pub fn from_env(get: impl Fn(&str) -> Option<String>) -> Result<Self, EnrollError> {
        Ok(Self {
            idp: IdpEnv {
                host: required(&get, "CONSOLE_ENROLL_IDP_HOST")?,
                client_id: required(&get, "CONSOLE_ENROLL_IDP_CLIENT_ID")?,
                scope: optional_or(&get, "CONSOLE_ENROLL_IDP_SCOPE", "openid"),
                audience: get("CONSOLE_ENROLL_IDP_AUDIENCE").filter(|v| !v.is_empty()),
                device_path: optional_or(
                    &get,
                    "CONSOLE_ENROLL_IDP_DEVICE_PATH",
                    "/oauth/device/code",
                ),
                token_path: optional_or(&get, "CONSOLE_ENROLL_IDP_TOKEN_PATH", "/oauth/token"),
            },
            node: NodeEnv {
                addr: required(&get, "CONSOLE_ENROLL_NODE_ADDR")?,
                server_name: required(&get, "CONSOLE_ENROLL_NODE_SERVER_NAME")?,
                ca_path: required(&get, "CONSOLE_ENROLL_NODE_CA")?,
            },
            fqdn: required(&get, "CONSOLE_ENROLL_FQDN")?,
            cert_out: required(&get, "CONSOLE_ENROLL_CERT_OUT")?,
            key_out: required(&get, "CONSOLE_ENROLL_KEY_OUT")?,
        })
    }
}

/// Wrap a certificate DER in a PEM block (standard base64, 64-char lines).
#[must_use]
pub fn cert_pem_from_der(der: &[u8]) -> String {
    let b64 = STANDARD.encode(der);
    let mut pem = String::from("-----BEGIN CERTIFICATE-----\n");
    for line in b64.as_bytes().chunks(64) {
        pem.push_str(std::str::from_utf8(line).unwrap_or_default());
        pem.push('\n');
    }
    pem.push_str("-----END CERTIFICATE-----\n");
    pem
}

/// Current unix time in seconds.
fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Write the private key PEM to `path`, owner-read/write only (0600) on unix.
fn write_key(path: &str, pem: &str) -> Result<(), EnrollError> {
    let mut options = std::fs::OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|e| EnrollError::Provision(format!("open {path}: {e}")))?;
    file.write_all(pem.as_bytes())
        .map_err(|e| EnrollError::Provision(format!("write {path}: {e}")))
}

/// Run the full enrollment: MFA device grant -> `cnf`-bound token -> CSR submit -> write cert + key.
///
/// This is the live orchestration (operator MFA + the real IdP/node); it is exercised at D.3c.
///
/// # Errors
/// [`EnrollError`] on any config, key, device-grant, wire, or file failure.
pub fn run_enrollment(config: &EnrollmentConfig) -> Result<(), EnrollError> {
    let keystore = SoftwareKeystore::generate()?;

    // 1. Operator-MFA device grant to a cnf-bound token (DPoP over the software key).
    let idp = IdpConfig {
        host: config.idp.host.clone(),
        device_authorization_path: config.idp.device_path.clone(),
        token_path: config.idp.token_path.clone(),
        client_id: config.idp.client_id.clone(),
        scope: config.idp.scope.clone(),
        audience: config.idp.audience.clone(),
    };
    let mut transport = WebPkiPostTransport::new(443)?;
    let env = DeviceFlowEnv {
        now: &now_unix,
        sleep: &|seconds| std::thread::sleep(Duration::from_secs(seconds)),
        prompt: &|auth| {
            let uri = auth
                .verification_uri_complete
                .as_deref()
                .unwrap_or(&auth.verification_uri);
            eprintln!(
                "\n[console-enroll] Approve the Console enrollment:\n  visit: {uri}\n  code:  {}\n",
                auth.user_code
            );
        },
        max_polls: 120,
    };
    let token = run_device_grant(&keystore, &idp, &mut transport, &env)?;

    // 2. Submit the CSR over the bootstrap wire; the node binds the token's cnf to the CSR key.
    let csr_der = keystore.csr_der(&config.fqdn, std::slice::from_ref(&config.fqdn))?;
    let ca_pem = std::fs::read(&config.node.ca_path).map_err(|e| {
        EnrollError::Provision(format!("read enroll CA {}: {e}", config.node.ca_path))
    })?;
    let wire = EnrollWireConfig {
        addr: config.node.addr.clone(),
        server_name: config.node.server_name.clone(),
        ca_pem,
    };
    let attestation = software_attestation(config.fqdn.as_bytes().to_vec());
    let leaf = submit_enrollment(&wire, token, csr_der, attestation)?;

    // 3. Write the sidecar's engine identity: the leaf cert PEM + the key PEM (0600).
    std::fs::write(&config.cert_out, cert_pem_from_der(&leaf.certificate_der))
        .map_err(|e| EnrollError::Provision(format!("write {}: {e}", config.cert_out)))?;
    write_key(&config.key_out, &keystore.key_pem())?;
    eprintln!(
        "[console-enroll] enrolled: {} + {} (serial {}, notAfter {})",
        config.cert_out, config.key_out, leaf.serial, leaf.not_after
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn getter(map: HashMap<&'static str, &'static str>) -> impl Fn(&str) -> Option<String> {
        move |k| map.get(k).map(|v| (*v).to_owned())
    }

    #[test]
    fn from_env_requires_the_core_variables_and_defaults_the_paths() {
        let cfg = EnrollmentConfig::from_env(getter(HashMap::from([
            ("CONSOLE_ENROLL_IDP_HOST", "idp.example"),
            ("CONSOLE_ENROLL_IDP_CLIENT_ID", "client-123"),
            ("CONSOLE_ENROLL_NODE_ADDR", "10.0.0.5:8443"),
            ("CONSOLE_ENROLL_NODE_SERVER_NAME", "enroll.localhost"),
            ("CONSOLE_ENROLL_NODE_CA", "/etc/console-enroll/ca.pem"),
            ("CONSOLE_ENROLL_FQDN", "console-bff.node.test.crucibledb"),
            (
                "CONSOLE_ENROLL_CERT_OUT",
                "/etc/console-sidecar/engine-client.pem",
            ),
            (
                "CONSOLE_ENROLL_KEY_OUT",
                "/etc/console-sidecar/engine-client.key",
            ),
        ])))
        .unwrap();
        assert_eq!(cfg.idp.host, "idp.example");
        assert_eq!(cfg.idp.scope, "openid", "scope defaults");
        assert_eq!(
            cfg.idp.device_path, "/oauth/device/code",
            "device path defaults"
        );
        assert_eq!(cfg.idp.token_path, "/oauth/token", "token path defaults");
        assert!(cfg.idp.audience.is_none());
        assert_eq!(cfg.fqdn, "console-bff.node.test.crucibledb");
    }

    #[test]
    fn from_env_fails_closed_on_a_missing_required_variable() {
        let err = EnrollmentConfig::from_env(getter(HashMap::from([(
            "CONSOLE_ENROLL_IDP_HOST",
            "idp.example",
        )])));
        assert!(err.is_err(), "missing node/fqdn/out variables must fail");
    }

    #[test]
    fn cert_pem_wraps_der_in_a_certificate_block() {
        let pem = cert_pem_from_der(&[0x30, 0x82, 0x01, 0x00]);
        assert!(pem.starts_with("-----BEGIN CERTIFICATE-----\n"));
        assert!(pem.trim_end().ends_with("-----END CERTIFICATE-----"));
        assert!(pem.contains(&STANDARD.encode([0x30, 0x82, 0x01, 0x00])));
    }
}
