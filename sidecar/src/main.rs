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

    let engine = EngineOriginator::bind(
        &config.egress_addr,
        config.engine_addr.clone(),
        &config.engine_servername,
        &read_pem(&config.engine_ca)?,
        &read_pem(&config.engine_cert)?,
        &read_pem(&config.engine_key)?,
    )
    .await?;

    // Serve both legs; the first listener error, or a shutdown signal, ends the process.
    tokio::select! {
        result = admin.run() => result,
        result = engine.run() => result,
        result = shutdown_signal() => result,
    }
}
