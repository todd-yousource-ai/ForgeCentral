# console-crypto-sidecar

The Console's AWS-LC crypto sidecar (`IP-CONSOLE-00-CRYPTO-SIDECAR`, implementing
`TRD-CONSOLE-00` Sections 2 + 8). A small, standalone Console-owned Rust process
that terminates the admin-plane TLS and originates the engine mTLS on the
platform's AWS-LC module (`rustls` + `aws-lc-rs`), so the Node BFF performs no
TLS (`INV-CONSOLE-CRYPTO-AWSLC`).

A standalone Cargo project, **not** a member of the pnpm workspace. The installer
provisions it as a binary alongside the BFF; the two communicate over plaintext
loopback only (nothing that leaves the host is unencrypted; see the plan's
local-capture threat model).

## Services

- **Fail-closed config + bind guards** (`config.rs`, `bind.rs`) -- the admin bind
  must be the node's own IP literal (never a wildcard or hostname), and every
  BFF <-> sidecar hop must be loopback. Config path via the first argument or
  `SIDECAR_CONFIG`.
- **Inbound admin terminator** (`admin.rs`, `tls.rs`) -- TLS 1.3,
  hybrid PQC `X25519MLKEM768` with a P-384 classical floor,
  `TLS_AES_256_GCM_SHA384`, server-auth; forwards to the BFF admin loopback.
- **Outbound engine originator** (`engine.rs`) -- the crdb `cdb-mtls` client
  profile (X25519MLKEM768 mTLS) to `:7878`, tunneling the BFF's wire bytes.
- **Secret-set service** (`secret_service.rs`) -- the loopback seam that carries
  an operator-entered IdAM client secret to the node's mode-protected secret
  store **without the Console ever storing it**.
- **Bundle signer** (`sign_service.rs`, `signing.rs`) -- the loopback signer for
  policy distribution (`INV-CONSOLE-FORGE-SIGNED-AT-SOURCE`): the BFF composes a
  bundle's unsigned parts; this service signs with **ML-DSA-87** (FIPS 204,
  seed-derived key) that the BFF never holds, and returns the assembled signed
  bundle.

## Build and test

Toolchain pinned to `1.96.0` (matching the engine repos, so the `cdb-mtls` git
dep builds identically).

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

These run as the `sidecar` leg of the Console gate (`scripts/ci.sh`). In-module
tests cover the fail-closed config/bind rules, TLS profile construction, the
secret-service semantics (atomic write, never logged or returned), and ML-DSA-87
signing; `tests/forge_contract_seam.rs` exercises the BFF -> signer seam
end-to-end. The live TLS proxy legs are proven by the deployed Console against
the running node, not by unit tests.
