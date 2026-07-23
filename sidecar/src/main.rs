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
use console_crypto_sidecar::secret_service::SecretService;
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

/// The `DistributionAnchor` JSON for `signer`: the `{key_id: hex}` map an endpoint's anchor loader
/// (`torch-edge` `policy::load_anchor`) consumes. The seed never leaves; only the derived key id and
/// the public verifying key appear here.
///
/// A single-key anchor -- the one signing identity this sidecar holds. Hand-formed (both the key id
/// and the value are hex, so no escaping is needed) rather than pulling `serde_json` in for one object.
fn anchor_json(signer: &BundleSigner) -> String {
    use std::fmt::Write as _;
    let hex = signer
        .verifying_key()
        .iter()
        .fold(String::new(), |mut acc, byte| {
            let _ = write!(acc, "{byte:02x}");
            acc
        });
    format!("{{\"{}\":\"{hex}\"}}", signer.key_id().0)
}

/// The provisioning subcommands (FD.5). `seed-init` generates the seed ONCE (refusing to overwrite an
/// existing one), `seed-anchor` reads an existing seed; both print the anchor the installer publishes
/// to endpoints. Generation lives here, in the sidecar, so the seed is never in installer memory.
fn run_seed_subcommand(verb: &str, seed_path: &str) -> Result<(), SidecarError> {
    let path = std::path::Path::new(seed_path);
    let signer = match verb {
        "seed-init" => BundleSigner::generate(path)
            .map_err(|e| SidecarError::Config(format!("seed generate: {e}")))?,
        "seed-anchor" => {
            BundleSigner::load(path).map_err(|e| SidecarError::Config(format!("seed load: {e}")))?
        }
        other => {
            return Err(SidecarError::Config(format!("unknown subcommand: {other}")));
        }
    };
    // CLI stdout is the interface (the installer captures it); build tooling, not linted src.
    #[allow(clippy::print_stdout)]
    {
        println!("{}", anchor_json(&signer));
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), SidecarError> {
    let first = env::args().nth(1);
    // Provisioning subcommands take a seed path and exit; they never bind a listener.
    if let Some(verb @ ("seed-init" | "seed-anchor")) = first.as_deref() {
        let seed_path = env::args().nth(2).ok_or_else(|| {
            SidecarError::Config(format!("{verb} needs a seed path: {verb} <seed-path>"))
        })?;
        return run_seed_subcommand(verb, &seed_path);
    }

    let path = first
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

    // The IdAM secret-set service (ID.4 part 3), only when its pair is provisioned. Writes an operator's
    // connector secret to the node's mode-protected store so it never crosses the engine wire.
    let secret = match (&config.secret_addr, &config.secret_path) {
        (Some(addr), Some(path)) => Some(SecretService::bind(addr, path.clone()).await?),
        _ => None,
    };

    // Serve every configured leg; the first listener error, or a shutdown signal, ends the process.
    match (sign, secret) {
        (Some(sign), Some(secret)) => tokio::select! {
            result = admin.run() => result,
            result = engine.run() => result,
            result = sign.run() => result,
            result = secret.run() => result,
            result = shutdown_signal() => result,
        },
        (Some(sign), None) => tokio::select! {
            result = admin.run() => result,
            result = engine.run() => result,
            result = sign.run() => result,
            result = shutdown_signal() => result,
        },
        (None, Some(secret)) => tokio::select! {
            result = admin.run() => result,
            result = engine.run() => result,
            result = secret.run() => result,
            result = shutdown_signal() => result,
        },
        (None, None) => tokio::select! {
            result = admin.run() => result,
            result = engine.run() => result,
            result = shutdown_signal() => result,
        },
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
    use super::anchor_json;
    use console_crypto_sidecar::signing::BundleSigner;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("fc-anchor-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_anchor_names_the_signer_and_carries_its_public_key() {
        // FD.5: the provisioned anchor is exactly the {key_id: hex} map the endpoint loader consumes,
        // and it names THIS signer -- the same key_id a bundle this sidecar signs will carry.
        let signer = BundleSigner::generate(&scratch("names").join("seed")).unwrap();
        let json = anchor_json(&signer);

        let anchor: std::collections::BTreeMap<String, String> =
            serde_json::from_str(&json).expect("the anchor is valid JSON");
        assert_eq!(anchor.len(), 1, "one signing identity");
        let (key_id, hex) = anchor.iter().next().unwrap();
        assert_eq!(key_id, &signer.key_id().0);
        // The value is the hex of the exact verifying-key bytes -- what verify checks the signature against.
        let expected: String = signer
            .verifying_key()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(hex, &expected);
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn a_reloaded_seed_produces_the_identical_anchor() {
        // The provisioning idempotency guarantee at the unit level: re-reading a seed never changes the
        // published key, so a re-run cannot orphan endpoints already holding the anchor.
        let path = scratch("reload").join("seed");
        let first = anchor_json(&BundleSigner::generate(&path).unwrap());
        let second = anchor_json(&BundleSigner::load(&path).unwrap());
        assert_eq!(first, second);
    }
}
