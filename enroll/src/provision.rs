//! The provisioning wrapper: assemble the pieces into one run -- open the TPM and generate the
//! non-exportable device key, run the operator-MFA device grant to a federated token, attest the TPM
//! identity, learn the bound FQDN (identity pre-flight), submit the TPM-signed CSR over the bootstrap
//! wire, and write the minted `engine_cert` PEM the crypto sidecar presents on the engine leg.
//!
//! There is NO key file: the TPM primary is re-derived deterministically from the owner seed + the fixed
//! template, so the sidecar re-derives the same non-exportable key at runtime and signs the mTLS
//! handshake in-device. The `console-enroll` binary (`main.rs`) is a thin shell over [`run_enrollment`].
//!
//! The config parse + the PEM helper are pure/testable; [`run_enrollment`] itself is the live
//! orchestration (operator MFA + the real IdP/node/TPM), exercised at D.3c.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;

use crate::device_flow::IdpConfig;
use crate::error::EnrollError;

/// The provisioning configuration (from the environment).
pub struct EnrollmentConfig {
    /// The IdP host + device-grant client + endpoints.
    pub idp: IdpEnv,
    /// The node enrollment service address + pinned CA path.
    pub node: NodeEnv,
    /// The proposed `console-bff` FQDN (used on first enrollment when the node has no bound name).
    pub fqdn: String,
    /// The TPM TCTI (e.g. `device:/dev/tpmrm0`).
    pub tcti: String,
    /// Optional path to the device EK certificate PEM (a GCE Shielded VM sources it out-of-band from
    /// `getShieldedInstanceIdentity`; unset reads the TCG-standard NV index).
    pub ek_cert_path: Option<String>,
    /// The base64url attestation nonce -- MUST equal the node's configured `attestation_nonce_b64u`.
    pub attest_nonce_b64u: String,
    /// Where to write the minted leaf cert PEM (the sidecar's `engine_cert`).
    pub cert_out: String,
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
            tcti: optional_or(&get, "CONSOLE_ENROLL_TCTI", "device:/dev/tpmrm0"),
            ek_cert_path: get("CONSOLE_ENROLL_EK_CERT").filter(|v| !v.is_empty()),
            attest_nonce_b64u: required(&get, "CONSOLE_ENROLL_ATTEST_NONCE")?,
            cert_out: required(&get, "CONSOLE_ENROLL_CERT_OUT")?,
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

/// Run the full enrollment: open the TPM, MFA device grant, attest, pre-flight, submit the TPM CSR, and
/// write the leaf cert. The live orchestration (operator MFA + the real IdP/node/TPM), at D.3c.
///
/// # Errors
/// [`EnrollError`] on any config, TPM, device-grant, wire, or file failure.
#[cfg(target_os = "linux")]
pub fn run_enrollment(config: &EnrollmentConfig) -> Result<(), EnrollError> {
    use std::time::Duration;

    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    use crate::csr::{build_csr, CsrSubjectAltNames};
    use crate::device_flow::{run_device_grant, DeviceFlowEnv};
    use crate::spiffe::spiffe_provenance_uri;
    use crate::tpm::TpmBackend;
    use crate::wire_client::{request_identity_offer, submit_enrollment, EnrollWireConfig};
    use cdb_device_identity::KeystoreBackend;
    use cdb_wire::handshake::WireIdentityOffer;

    let key_err = |e: cdb_device_identity::KeystoreError| EnrollError::Keygen(e.to_string());

    // 1. Open the TPM and generate the non-exportable P-384 device key (its public backs the CSR).
    let mut tpm = TpmBackend::new(config.tcti.clone());
    if let Some(path) = &config.ek_cert_path {
        let ek_pem = std::fs::read(path)
            .map_err(|e| EnrollError::Provision(format!("read EK cert {path}: {e}")))?;
        tpm = tpm.with_ek_cert_pem(&ek_pem).map_err(key_err)?;
    }
    tpm.open().map_err(key_err)?;
    let public_der = tpm.generate_key().map_err(key_err)?.public_der;

    // 2. Operator-MFA device grant to a bare federated token (the node binds it to the attested key).
    let idp = IdpConfig {
        host: config.idp.host.clone(),
        device_authorization_path: config.idp.device_path.clone(),
        token_path: config.idp.token_path.clone(),
        client_id: config.idp.client_id.clone(),
        scope: config.idp.scope.clone(),
        audience: config.idp.audience.clone(),
    };
    let mut transport = crate::transport::WebPkiPostTransport::new(443)?;
    let env = DeviceFlowEnv {
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
    let token = run_device_grant(&idp, &mut transport, &env)?;

    // 3. Attest the TPM identity (the nonce MUST match the node's configured attestation nonce).
    let nonce = URL_SAFE_NO_PAD
        .decode(config.attest_nonce_b64u.trim())
        .map_err(|e| {
            EnrollError::Provision(format!("CONSOLE_ENROLL_ATTEST_NONCE not base64url: {e}"))
        })?;
    let attestation = tpm.attest(&nonce).map_err(key_err)?;

    let ca_pem = std::fs::read(&config.node.ca_path).map_err(|e| {
        EnrollError::Provision(format!("read enroll CA {}: {e}", config.node.ca_path))
    })?;
    let wire = EnrollWireConfig {
        addr: config.node.addr.clone(),
        server_name: config.node.server_name.clone(),
        ca_pem,
    };

    // 4. Identity pre-flight: learn the FQDN bound to this device (or propose ours on first enroll).
    let offer = request_identity_offer(&wire, token.clone(), attestation.clone())?;
    let fqdn = match offer {
        WireIdentityOffer::Offered { fqdn: Some(bound) } => bound,
        WireIdentityOffer::Offered { fqdn: None } => config.fqdn.clone(),
        WireIdentityOffer::Refused => {
            return Err(EnrollError::Provision(
                "the node refused the identity offer".to_owned(),
            ))
        }
    };

    // 5. CSR (proof of possession), signed IN the TPM: CN = FQDN, DNS SAN = FQDN, URI SAN = the operator
    //    SPIFFE provenance (byte-identical to the node's derivation so step-ca accepts the names).
    let spiffe = spiffe_provenance_uri(&token)?;
    let sans = CsrSubjectAltNames {
        dns: vec![fqdn.clone()],
        uris: vec![spiffe],
    };
    let csr_der = build_csr(&fqdn, &sans, &public_der, &mut tpm)
        .map_err(|e| EnrollError::Csr(e.to_string()))?;

    // 6. Submit + 7. write ONLY the leaf cert (no key file: the sidecar re-derives the TPM key).
    let leaf = submit_enrollment(&wire, token, csr_der, attestation)?;
    std::fs::write(&config.cert_out, cert_pem_from_der(&leaf.certificate_der))
        .map_err(|e| EnrollError::Provision(format!("write {}: {e}", config.cert_out)))?;
    eprintln!(
        "[console-enroll] enrolled: {} (fqdn {}, serial {}, notAfter {})",
        config.cert_out, fqdn, leaf.serial, leaf.not_after
    );
    Ok(())
}

/// TPM enrollment is Linux-only (the `tss-esapi`/`libtss2` backend).
#[cfg(not(target_os = "linux"))]
pub fn run_enrollment(_config: &EnrollmentConfig) -> Result<(), EnrollError> {
    Err(EnrollError::Provision(
        "TPM enrollment is supported on Linux only".to_owned(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn getter(map: HashMap<&'static str, &'static str>) -> impl Fn(&str) -> Option<String> {
        move |k| map.get(k).map(|v| (*v).to_owned())
    }

    fn base() -> HashMap<&'static str, &'static str> {
        HashMap::from([
            ("CONSOLE_ENROLL_IDP_HOST", "idp.example"),
            ("CONSOLE_ENROLL_IDP_CLIENT_ID", "client-123"),
            ("CONSOLE_ENROLL_NODE_ADDR", "10.0.0.5:7443"),
            ("CONSOLE_ENROLL_NODE_SERVER_NAME", "enroll.localhost"),
            ("CONSOLE_ENROLL_NODE_CA", "/etc/console-enroll/ca.pem"),
            ("CONSOLE_ENROLL_FQDN", "console-bff.node.test.crucibledb"),
            ("CONSOLE_ENROLL_ATTEST_NONCE", "Y2RiLXp0cC10ZXN0"),
            (
                "CONSOLE_ENROLL_CERT_OUT",
                "/etc/console-sidecar/engine-client.pem",
            ),
        ])
    }

    #[test]
    fn from_env_reads_the_tpm_config_and_defaults_the_tcti_and_paths() {
        let cfg = EnrollmentConfig::from_env(getter(base())).unwrap();
        assert_eq!(cfg.idp.scope, "openid", "scope defaults");
        assert_eq!(cfg.idp.device_path, "/oauth/device/code");
        assert_eq!(
            cfg.tcti, "device:/dev/tpmrm0",
            "TCTI defaults to the host TPM"
        );
        assert!(cfg.ek_cert_path.is_none(), "EK cert is optional");
        assert_eq!(cfg.attest_nonce_b64u, "Y2RiLXp0cC10ZXN0");
        assert_eq!(cfg.fqdn, "console-bff.node.test.crucibledb");
    }

    #[test]
    fn from_env_fails_closed_on_a_missing_required_variable() {
        // Drop the attestation nonce: enrollment cannot attest without it.
        let mut map = base();
        map.remove("CONSOLE_ENROLL_ATTEST_NONCE");
        assert!(EnrollmentConfig::from_env(getter(map)).is_err());
    }

    #[test]
    fn cert_pem_wraps_der_in_a_certificate_block() {
        let pem = cert_pem_from_der(&[0x30, 0x82, 0x01, 0x00]);
        assert!(pem.starts_with("-----BEGIN CERTIFICATE-----\n"));
        assert!(pem.trim_end().ends_with("-----END CERTIFICATE-----"));
        assert!(pem.contains(&STANDARD.encode([0x30, 0x82, 0x01, 0x00])));
    }
}
