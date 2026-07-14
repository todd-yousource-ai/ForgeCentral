//! Console AWS-LC crypto sidecar -- process entrypoint (CS.3).
//!
//! Loads and validates the configuration fail-closed, installs the aws-lc-rs crypto provider, binds both
//! legs -- the inbound admin terminator (hybrid PQC + P-384 floor) and the outbound engine originator (the
//! `cdb-mtls` mTLS profile) -- and serves them until a shutdown signal. A bad config or a failed bind
//! exits non-zero (the `Result` return prints the error), so the process never starts half-configured. The
//! Node BFF speaks plaintext loopback to both legs; the sidecar owns every TLS handshake.

use std::env;
use std::sync::{Arc, Mutex};

use cdb_device_identity::{KeystoreBackend as _, SharedKeystore};
use console_crypto_sidecar::admin::AdminTerminator;
use console_crypto_sidecar::bind::SidecarError;
use console_crypto_sidecar::config::SidecarConfig;
use console_crypto_sidecar::engine::EngineOriginator;
use console_crypto_sidecar::tls::admin_server_config;
use console_tpm::TpmBackend;
use tokio_rustls::rustls::pki_types::pem::PemObject as _;
use tokio_rustls::rustls::pki_types::CertificateDer;

fn read_pem(path: &std::path::Path) -> Result<Vec<u8>, SidecarError> {
    std::fs::read(path).map_err(|e| SidecarError::Config(format!("read {}: {e}", path.display())))
}

/// Open the TPM and re-derive the non-exportable engine-identity key (the same deterministic primary
/// `console-enroll` enrolled), returning it as a shared keystore that signs the mTLS handshake in-device.
fn open_engine_keystore(tcti: &str) -> Result<SharedKeystore, SidecarError> {
    let mut tpm = TpmBackend::new(tcti.to_owned());
    tpm.open()
        .map_err(|e| SidecarError::Config(format!("open TPM {tcti}: {e}")))?;
    tpm.generate_key()
        .map_err(|e| SidecarError::Config(format!("re-derive engine key: {e}")))?;
    Ok(Arc::new(Mutex::new(tpm)))
}

/// Parse the enrolled leaf certificate PEM into a DER chain (the sidecar presents it; the key is in
/// the TPM). Fail-closed if the file carries no certificate.
fn read_cert_chain_der(path: &std::path::Path) -> Result<Vec<Vec<u8>>, SidecarError> {
    let pem = read_pem(path)?;
    let chain: Vec<Vec<u8>> = CertificateDer::pem_slice_iter(&pem)
        .filter_map(Result::ok)
        .map(|cert| cert.as_ref().to_vec())
        .collect();
    if chain.is_empty() {
        return Err(SidecarError::Config(format!(
            "engine cert {} had no certificates",
            path.display()
        )));
    }
    Ok(chain)
}

/// Resolve when the process should drain: a SIGINT (Ctrl-C) or SIGTERM (the installer/orchestrator).
async fn shutdown_signal() -> Result<(), SidecarError> {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = signal(SignalKind::terminate())
            .map_err(|e| SidecarError::Listen(format!("sigterm handler: {e}")))?;
        tokio::select! {
            r = tokio::signal::ctrl_c() => r.map_err(|e| SidecarError::Listen(format!("sigint handler: {e}"))),
            _ = term.recv() => Ok(()),
        }
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c()
            .await
            .map_err(|e| SidecarError::Listen(format!("sigint handler: {e}")))
    }
}

#[tokio::main]
async fn main() -> Result<(), SidecarError> {
    let path = env::args()
        .nth(1)
        .or_else(|| env::var("SIDECAR_CONFIG").ok())
        .ok_or_else(|| {
            SidecarError::Config(
                "no config path (pass it as the first argument or set SIDECAR_CONFIG)".to_owned(),
            )
        })?;
    let config = SidecarConfig::from_path(&path)?;

    // Install aws-lc-rs as the process-default rustls provider (idempotent) before building any config.
    cdb_mtls::install_default_crypto_provider();

    let admin_config = admin_server_config(&config.admin_cert, &config.admin_key)?;
    let admin = AdminTerminator::bind(
        &config.admin_bind_ip,
        config.admin_port,
        config.admin_upstream.clone(),
        admin_config,
    )
    .await?;

    // Build the engine mTLS client config. When engine_key is set, present a SOFTWARE key -- the
    // long-lived Console-CA leaf the node installer generates for the dedicated control plane (:7879,
    // IP-CONSOLE-CONTROL-PLANE D2), signing in-process (no TPM). Otherwise re-derive the TPM-resident key
    // in the device and present the enrolled leaf (the legacy wire-seam path).
    let ca_pem = read_pem(&config.engine_ca)?;
    let (client_config, tpm_gated) = if let Some(key_path) = &config.engine_key {
        let cert_pem = read_pem(&config.engine_cert)?;
        let key_pem = read_pem(key_path)?;
        let cc = cdb_mtls::client_config(&ca_pem, &cert_pem, &key_pem)
            .map_err(|e| SidecarError::Config(format!("engine software mtls config: {e}")))?;
        (cc, false)
    } else {
        let keystore = open_engine_keystore(&config.tcti)?;
        let cert_chain_der = read_cert_chain_der(&config.engine_cert)?;
        let cc = cdb_device_identity::tpm_mtls_client_config(&ca_pem, cert_chain_der, keystore)
            .map_err(|e| SidecarError::Config(format!("engine tpm mtls config: {e}")))?;
        (cc, true)
    };
    let engine = EngineOriginator::bind(
        &config.egress_addr,
        config.engine_addr.clone(),
        &config.engine_servername,
        client_config,
        tpm_gated,
    )
    .await?;

    // Serve both legs; the first listener error, or a shutdown signal, ends the process.
    tokio::select! {
        result = admin.run() => result,
        result = engine.run() => result,
        result = shutdown_signal() => result,
    }
}
