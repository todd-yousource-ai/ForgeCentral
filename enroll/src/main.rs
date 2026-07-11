//! `console-enroll` -- the Console's ZTP enrollment binary (`IP-CONSOLE-00-DEPLOY` D.3a-console.3).
//!
//! Run once at provisioning: reads its config from `CONSOLE_ENROLL_*` env, runs the operator-MFA device
//! grant to a `cnf`-bound token, submits the CSR to the node's enrollment service over the bootstrap wire,
//! and writes the minted `engine_cert` + `engine_key` PEMs the crypto sidecar presents on the engine leg.
//! The operator approves a device code (MFA) when prompted; all crypto is AWS-LC, the key is software.

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
