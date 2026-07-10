//! The admin-plane TLS policy on AWS-LC (CS.2, INV-CONSOLE-ADMIN-PLANE).
//!
//! The browser -> Console admin leg (`node-IP:8443`) is terminated on `rustls` + `aws-lc-rs`, negotiating a
//! HYBRID post-quantum key exchange (`X25519MLKEM768`, ML-KEM-768 / FIPS 203) with a strong classical
//! **P-384 CNSA-1.0 floor**, TLS 1.3 only, `TLS_AES_256_GCM_SHA384`, server-auth. A browser that can do the
//! hybrid group gets PQC; a classical-only browser meets the P-384 floor; a browser offering only a
//! sub-floor group (X25519, P-256) shares no group and is refused. The floor is enforced by construction
//! (the group + suite lists) and guarded fail-closed at startup ([`assert_admin_tls_floor`]).

use std::path::Path;
use std::sync::Arc;

use tokio_rustls::rustls::crypto::{aws_lc_rs, CryptoProvider};
use tokio_rustls::rustls::pki_types::pem::PemObject;
use tokio_rustls::rustls::pki_types::{CertificateDer, PrivateKeyDer};
use tokio_rustls::rustls::{version, ServerConfig};

use crate::bind::SidecarError;

/// The admin-plane crypto provider: hybrid PQC preferred, P-384 classical CNSA-1.0 floor, the CNSA
/// AES-256-GCM / SHA-384 suite only.
fn admin_provider() -> Arc<CryptoProvider> {
    let base = aws_lc_rs::default_provider();
    Arc::new(CryptoProvider {
        kx_groups: vec![
            aws_lc_rs::kx_group::X25519MLKEM768,
            aws_lc_rs::kx_group::SECP384R1,
        ],
        cipher_suites: vec![aws_lc_rs::cipher_suite::TLS13_AES_256_GCM_SHA384],
        ..base
    })
}

/// Prove the provider meets the admin-plane floor, or return an error (fail-closed, before the listener
/// binds): a hybrid PQC group is offered, the P-384 classical floor group is offered, and every cipher
/// suite is the CNSA-1.0 `TLS_AES_256_GCM_SHA384`.
///
/// # Errors
/// [`SidecarError::Config`] when any of the three conditions does not hold.
pub fn assert_admin_tls_floor(provider: &CryptoProvider) -> Result<(), SidecarError> {
    let hybrid = aws_lc_rs::kx_group::X25519MLKEM768.name();
    let floor = aws_lc_rs::kx_group::SECP384R1.name();
    let cnsa_suite = aws_lc_rs::cipher_suite::TLS13_AES_256_GCM_SHA384.suite();

    if !provider.kx_groups.iter().any(|g| g.name() == hybrid) {
        return Err(SidecarError::Config(
            "admin TLS offers no hybrid PQC key-exchange group".to_owned(),
        ));
    }
    if !provider.kx_groups.iter().any(|g| g.name() == floor) {
        return Err(SidecarError::Config(
            "admin TLS offers no CNSA-1.0 classical floor group (P-384)".to_owned(),
        ));
    }
    if provider.cipher_suites.is_empty()
        || !provider
            .cipher_suites
            .iter()
            .all(|s| s.suite() == cnsa_suite)
    {
        return Err(SidecarError::Config(
            "admin TLS cipher suites are not the CNSA-1.0 AES-256-GCM / SHA-384 suite".to_owned(),
        ));
    }
    Ok(())
}

/// Assemble the floor-guarded admin `ServerConfig` from an already-parsed chain + key.
fn build_admin_config(
    chain: Vec<CertificateDer<'static>>,
    key: PrivateKeyDer<'static>,
) -> Result<ServerConfig, SidecarError> {
    let provider = admin_provider();
    assert_admin_tls_floor(&provider)?;
    ServerConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&version::TLS13])
        .map_err(|e| SidecarError::Config(format!("admin tls versions: {e}")))?
        .with_no_client_auth()
        .with_single_cert(chain, key)
        .map_err(|e| SidecarError::Config(format!("admin tls server cert: {e}")))
}

/// Build the admin-plane `ServerConfig` from PEM bytes (the leaf chain + private key), floor-guarded.
///
/// # Errors
/// [`SidecarError::Config`] when the floor guard fails or the PEM cannot be parsed/assembled.
pub fn admin_server_config_from_pem(
    cert_pem: &[u8],
    key_pem: &[u8],
) -> Result<ServerConfig, SidecarError> {
    let chain: Vec<CertificateDer<'static>> = CertificateDer::pem_slice_iter(cert_pem)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| SidecarError::Config(format!("admin cert pem: {e}")))?;
    let key = PrivateKeyDer::from_pem_slice(key_pem)
        .map_err(|e| SidecarError::Config(format!("admin key pem: {e}")))?;
    build_admin_config(chain, key)
}

/// Build the admin-plane `ServerConfig` from the provisioned CNSA leaf files, floor-guarded.
///
/// # Errors
/// [`SidecarError::Config`] when the floor guard fails or the certificate/key cannot be loaded/assembled.
pub fn admin_server_config(
    cert_path: &Path,
    key_path: &Path,
) -> Result<ServerConfig, SidecarError> {
    let chain: Vec<CertificateDer<'static>> = CertificateDer::pem_file_iter(cert_path)
        .map_err(|e| SidecarError::Config(format!("admin cert {}: {e}", cert_path.display())))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| SidecarError::Config(format!("admin cert {}: {e}", cert_path.display())))?;
    let key = PrivateKeyDer::from_pem_file(key_path)
        .map_err(|e| SidecarError::Config(format!("admin key {}: {e}", key_path.display())))?;
    build_admin_config(chain, key)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio_rustls::rustls::crypto::{aws_lc_rs, CryptoProvider};

    use super::{admin_provider, assert_admin_tls_floor};

    #[test]
    fn the_admin_provider_meets_the_floor() {
        assert!(assert_admin_tls_floor(&admin_provider()).is_ok());
    }

    #[test]
    fn a_provider_missing_the_hybrid_group_is_rejected() {
        let base = aws_lc_rs::default_provider();
        let weak = Arc::new(CryptoProvider {
            kx_groups: vec![aws_lc_rs::kx_group::SECP384R1],
            cipher_suites: vec![aws_lc_rs::cipher_suite::TLS13_AES_256_GCM_SHA384],
            ..base
        });
        assert!(assert_admin_tls_floor(&weak).is_err());
    }

    #[test]
    fn a_provider_missing_the_p384_floor_is_rejected() {
        let base = aws_lc_rs::default_provider();
        let weak = Arc::new(CryptoProvider {
            kx_groups: vec![aws_lc_rs::kx_group::X25519MLKEM768],
            cipher_suites: vec![aws_lc_rs::cipher_suite::TLS13_AES_256_GCM_SHA384],
            ..base
        });
        assert!(assert_admin_tls_floor(&weak).is_err());
    }

    #[test]
    fn a_provider_with_a_sub_cnsa_suite_is_rejected() {
        let base = aws_lc_rs::default_provider();
        let weak = Arc::new(CryptoProvider {
            kx_groups: vec![
                aws_lc_rs::kx_group::X25519MLKEM768,
                aws_lc_rs::kx_group::SECP384R1,
            ],
            cipher_suites: vec![aws_lc_rs::cipher_suite::TLS13_AES_128_GCM_SHA256],
            ..base
        });
        assert!(assert_admin_tls_floor(&weak).is_err());
    }
}
