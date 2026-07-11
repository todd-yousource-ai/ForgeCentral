//! `console-enroll` -- the Console's ZTP enrollment binary (`IP-CONSOLE-00-SIDECAR-TPM`).
//!
//! Run once at provisioning: reads its config from `CONSOLE_ENROLL_*` env, opens the TPM and generates
//! the non-exportable device key, runs the operator-MFA device grant to a federated token, attests the
//! TPM identity, submits the TPM-signed CSR to the node's enrollment service over the bootstrap wire,
//! and writes the minted `engine_cert` PEM the crypto sidecar presents on the engine leg. There is no
//! key file -- the sidecar re-derives the same non-exportable TPM key at runtime. The operator approves
//! a device code (MFA) when prompted.

use std::process::ExitCode;

use console_enroll::provision::{run_enrollment, EnrollmentConfig};

fn main() -> ExitCode {
    let config = match EnrollmentConfig::from_env(|key| std::env::var(key).ok()) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("[console-enroll] configuration error: {error}");
            return ExitCode::FAILURE;
        }
    };
    match run_enrollment(&config) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[console-enroll] enrollment failed: {error}");
            ExitCode::FAILURE
        }
    }
}
