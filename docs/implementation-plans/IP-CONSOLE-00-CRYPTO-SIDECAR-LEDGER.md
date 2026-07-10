# IP-CONSOLE-00-CRYPTO-SIDECAR -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-CRYPTO-SIDECAR.md` (the AWS-LC crypto boundary of
`TRD-CONSOLE-00`). One PR per roster row, a named invariant proven by its test tier(s), the full
`scripts/ci.sh` green before merge (plus the sidecar's Rust gate), branch-per-PR off local `main`, no-ff
merge, push to `origin`, scoped commits (code separate from docs), no em dashes. Reviewed with the
maintainer before each merge.

Status: **CS.1 + CS.2 + CS.3 LANDED (CS.3 LIVE-PROVEN); CS.4..CS.N open.** Supersedes the Node/OpenSSL
F0.7 admin plane (discarded, never merged) and revises F0.3b (engine transport moves behind the sidecar).

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| CS.1 | INV-SIDECAR-BIND-FAILCLOSED | LANDED (review) | 3da2c8a | Standalone `console-crypto-sidecar` crate (toolchain 1.96.0, workspace lints inlined) + the `[11]` sidecar gate leg. `bind.rs` (`assert_node_ip_bind` rejects wildcard/unspecified/hostname, accepts a concrete node IP incl. loopback; `assert_loopback_addr` forces the BFF<->sidecar hops loopback) + `config.rs` (`SidecarConfig`, `deny_unknown_fields`, fail-closed) + `main.rs` (load+validate, non-zero on bad config). 13 unit tests; binary fail-closed verified (good->0, `0.0.0.0`->1, no-config->1). |
| CS.2 | INV-CONSOLE-ADMIN-PLANE | LANDED (review) | 0aba812 | Inbound admin terminator on aws-lc-rs: `tls.rs` provider (kx_groups `[X25519MLKEM768, SECP384R1]`, cipher `TLS_AES_256_GCM_SHA384`, TLS 1.3, server-auth) + `assert_admin_tls_floor` (fail-closed: hybrid + P-384 + CNSA-suite present); `admin.rs` `AdminTerminator` (fail-closed node-IP bind, `TlsAcceptor` + `copy_bidirectional` to the BFF admin loopback, no engine client). Live floor proof (rcgen P-384 leaf, real terminator): hybrid X25519MLKEM768 admitted, classical P-384 admitted, X25519-only + P-256-only REFUSED, decrypted tunnel echoes; widened bind refused. 19 tests. Listener wiring into `main` lands with the engine leg (CS.3/CS.4). |
| CS.3 | INV-CONSOLE-CRYPTO-AWSLC (engine leg) | LANDED + LIVE-PROVEN | 9ab7ef8 | Outbound engine originator (`engine.rs` `EngineOriginator`): loopback egress (fail-closed loopback), `cdb_mtls::client_config` (TLS 1.3, X25519MLKEM768-only, mutual auth, byte-identical to the engine) + bounded dial + `copy_bidirectional`. `cdb-mtls` pinned git dep (rev `7f45921`) + `.cargo/config` `git-fetch-with-cli`. `config.engine_servername`; `main` async runs both legs with SIGINT/SIGTERM shutdown. **LIVE-PROVEN:** `dials_the_live_engine_over_mtls` completed a full mTLS handshake to the running node on `127.0.0.1:7878` (SNI `wire.localhost`) with the wire client identity. Live test `#[ignore]`d in the gate (offline-safe); 21 gated tests. The full wire round-trip through the egress tunnel lands with the BFF (CS.4) + the CS.N capstone. |
| CS.4 | INV-CONSOLE-CRYPTO-AWSLC (Node leg) | OPEN | -- | BFF integration + F0.3b revision: `@forge/wire` `connectLoopback`; `connectTls` removed/quarantined; plaintext `node:http` admin loopback listener; config migrated; no-`node:tls` hygiene test. |
| CS.5 | INV-CONSOLE-SUPPLYCHAIN-HARDENED (sidecar) | OPEN | -- | Installer-provisioned binary; DEPENDENCY-POLICY note; gate builds+tests the sidecar; SBOM entry. |
| CS.N | INV-CONSOLE-CRYPTO-AWSLC (capstone) | OPEN | -- | Live capstone (folded into Phase 0 exit / full live run): browser->sidecar:8443 hybrid + BFF->sidecar->engine:7878, Node doing no TLS. |
