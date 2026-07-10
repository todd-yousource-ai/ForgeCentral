# console-crypto-sidecar

The Console's AWS-LC crypto sidecar (`IP-CONSOLE-00-CRYPTO-SIDECAR`, implementing `TRD-CONSOLE-00`
Sections 2 + 8). A small, standalone Console-owned Rust process that terminates the admin-plane TLS and
originates the engine mTLS on the platform's AWS-LC module (`rustls` + `aws-lc-rs`), so the Node BFF
performs no TLS (`INV-CONSOLE-CRYPTO-AWSLC`).

This is a standalone Cargo project, **not** a member of the pnpm workspace. The installer provisions it as
a binary alongside the BFF; the two communicate over plaintext loopback only (nothing that leaves the host
is unencrypted; see the plan's local-capture threat model).

## Legs (built incrementally)

- **CS.1 (this PR):** the fail-closed configuration (`config.rs`) + the node-IP admin bind guard and the
  loopback-hop guard (`bind.rs`). No TLS yet; the binary loads + validates the config and exits.
- **CS.2:** the inbound admin terminator -- hybrid PQC `X25519MLKEM768` + a P-384 CNSA-1.0 classical floor,
  TLS 1.3, `TLS_AES_256_GCM_SHA384`, server-auth; forwards to the BFF admin loopback.
- **CS.3:** the outbound engine originator -- the crdb `cdb-mtls` client profile (X25519MLKEM768-only mTLS)
  to `:7878`, tunneling the BFF's wire bytes.

## Configuration

The sidecar reads a JSON config file (path as the first argument or `SIDECAR_CONFIG`). Validation is
fail-closed: the admin bind must be the node's own IP literal (never a wildcard or hostname), and the two
BFF <-> sidecar hops (`admin_upstream`, `egress_addr`) must be loopback. See `SidecarConfig` for the
fields.

## Build and test

Toolchain is pinned to `1.96.0` (matching the engine repos, so the `cdb-mtls` git dep in CS.3 builds
identically).

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

These run as the `sidecar` leg of the Console gate (`scripts/ci.sh`).
