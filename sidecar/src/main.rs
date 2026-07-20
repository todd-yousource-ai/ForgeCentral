//! Console AWS-LC crypto sidecar -- process entrypoint (CS.3).
//!
//! Loads and validates the configuration fail-closed, installs the aws-lc-rs crypto provider, binds both
//! legs -- the inbound admin terminator (hybrid PQC + P-384 floor) and the outbound engine originator (the
//! `cdb-mtls` mTLS profile) -- and serves them until a shutdown signal. A bad config or a failed bind
//! exits non-zero (the `Result` return prints the error), so the process never starts half-configured. The
//! Node BFF speaks plaintext loopback to both legs; the sidecar owns every TLS handshake.

use std::env;

use console_crypto_sidecar::admin::AdminTerminator;
use console_crypto_sidecar::bind::SidecarError;
use console_crypto_sidecar::config::SidecarConfig;
use console_crypto_sidecar::engine::EngineOriginator;
use console_crypto_sidecar::sign_service::SignService;
use console_crypto_sidecar::signing::BundleSigner;
use console_crypto_sidecar::tls::admin_server_config;

fn read_pem(path: &std::path::Path) -> Result<Vec<u8>, SidecarError> {
    std::fs::read(path).map_err(|e| SidecarError::Config(format!("read {}: {e}", path.display())))
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

    // Build the engine mTLS client config from the software Console-CA leaf the node installer generates
    // for the dedicated control plane (:7879, IP-CONSOLE-CONTROL-PLANE D2), signing in-process. This is the
    // only engine-identity path; the retired ZTP/TPM `console-enroll` path is gone.
    let ca_pem = read_pem(&config.engine_ca)?;
    let cert_pem = read_pem(&config.engine_cert)?;
    let key_pem = read_pem(&config.engine_key)?;
    let client_config = cdb_mtls::client_config(&ca_pem, &cert_pem, &key_pem)
        .map_err(|e| SidecarError::Config(format!("engine software mtls config: {e}")))?;
    let engine = EngineOriginator::bind(
        &config.egress_addr,
        config.engine_addr.clone(),
        &config.engine_servername,
        client_config,
    )
    .await?;

    // The Forge bundle-signing service (FD.2), only when FD.5 has provisioned the pair. A missing
    // seed at a configured path refuses startup (never silently re-minted: a re-minted key orphans
    // every provisioned anchor); an unprovisioned sidecar simply runs without the signing plane.
    let sign = match (&config.sign_addr, &config.sign_seed) {
        (Some(addr), Some(seed_path)) => {
            let signer = BundleSigner::load(seed_path)
                .map_err(|e| SidecarError::Config(format!("bundle signer: {e}")))?;
            Some(SignService::bind(addr, std::sync::Arc::new(signer)).await?)
        }
        _ => None,
    };

    // Serve every configured leg; the first listener error, or a shutdown signal, ends the process.
    match sign {
        Some(sign) => tokio::select! {
            result = admin.run() => result,
            result = engine.run() => result,
            result = sign.run() => result,
            result = shutdown_signal() => result,
        },
        None => tokio::select! {
            result = admin.run() => result,
            result = engine.run() => result,
            result = shutdown_signal() => result,
        },
    }
}
