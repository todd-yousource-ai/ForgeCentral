# console-enroll

The Console-owned **service-key ZTP enrollment client** (`IP-CONSOLE-00-DEPLOY` D.3a-console). A small,
standalone Rust project (like `sidecar/`, **not** in the pnpm workspace) that enrolls the Console's engine
identity with the platform and yields the cert + key PEM the AWS-LC crypto sidecar presents on the engine
leg (`:7878`).

## Why it exists

The Console needs a **ZTP-enrolled** engine identity: permissions key off the engine's Agent Identity
Graph (AIG) enrollment record (the enrolled-role grant `IP-CONSOLE-00-DEPLOY` D.3b reads), not a static
`node.cbor` peer. `torch-enroll` is TPM-only and refuses a software key for a production identity, so the
Console owns this client. The product owner chose **service-key ZTP**: full enrollment (operator MFA +
step-ca mint + AIG registration) with a **software** P-384 key the sidecar can read as a PEM -- no TPM, so
the AWS-LC posture is unchanged. The TPM-resident variant is the parked `IP-CONSOLE-00-SIDECAR-TPM`.

## Status (incremental)

- **D.3a-console.1 (this):** the software keystore (`src/keystore.rs`) -- P-384 keygen + PKCS#10 CSR + PEM
  export, on the AWS-LC module (`rcgen` forced onto its `aws_lc_rs` backend; rcgen defaults to `ring`).
- **D.3a-console.2:** the enroll protocol client (device-code MFA + token-to-key binding + CSR submit +
  cert receive over the bootstrap TLS, attestation-less).
- **D.3a-console.3:** the provisioning wrapper -- writes `engine_cert`/`engine_key` for the sidecar; folds
  into the deploy provisioning (`IP-CONSOLE-00-DEPLOY` D.2).
- **D.3c:** the MFA-gated live capstone.

## Build and test

Toolchain pinned to `1.96.0` (matching the sidecar + the engine repos). Runs as the `enroll` leg of the
Console gate (`scripts/ci.sh` step 11, alongside the sidecar).

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```
