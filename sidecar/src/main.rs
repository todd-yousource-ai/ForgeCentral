//! Console AWS-LC crypto sidecar -- process entrypoint (CS.1).
//!
//! Loads and validates the configuration fail-closed (the node-IP admin bind guard + the loopback-hop
//! guards), then exits. The aws-lc-rs admin terminator (CS.2) and the engine mTLS originator (CS.3) attach
//! here next; until they land, a successful run means "config accepted." A bad config exits non-zero (the
//! `Result` return prints the error and yields a non-zero status), so the process never starts
//! half-configured.

use std::env;

use console_crypto_sidecar::bind::SidecarError;
use console_crypto_sidecar::config::SidecarConfig;

fn main() -> Result<(), SidecarError> {
    let path = env::args()
        .nth(1)
        .or_else(|| env::var("SIDECAR_CONFIG").ok())
        .ok_or_else(|| {
            SidecarError::Config(
                "no config path (pass it as the first argument or set SIDECAR_CONFIG)".to_owned(),
            )
        })?;
    // Validate fail-closed. Listeners (CS.2 admin, CS.3 engine) attach to this validated config next.
    let _config = SidecarConfig::from_path(&path)?;
    Ok(())
}
