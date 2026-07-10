# IP-CONSOLE-00-CRYPTO-SIDECAR -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-CRYPTO-SIDECAR.md` (the AWS-LC crypto boundary of
`TRD-CONSOLE-00`). One PR per roster row, a named invariant proven by its test tier(s), the full
`scripts/ci.sh` green before merge (plus the sidecar's Rust gate), branch-per-PR off local `main`, no-ff
merge, push to `origin`, scoped commits (code separate from docs), no em dashes. Reviewed with the
maintainer before each merge.

Status: **CS.1 LANDED; CS.2..CS.N open.** Supersedes the Node/OpenSSL F0.7 admin plane (discarded, never
merged) and revises F0.3b (engine transport moves behind the sidecar).

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| CS.1 | INV-SIDECAR-BIND-FAILCLOSED | LANDED (review) | 3da2c8a | Standalone `console-crypto-sidecar` crate (toolchain 1.96.0, workspace lints inlined) + the `[11]` sidecar gate leg. `bind.rs` (`assert_node_ip_bind` rejects wildcard/unspecified/hostname, accepts a concrete node IP incl. loopback; `assert_loopback_addr` forces the BFF<->sidecar hops loopback) + `config.rs` (`SidecarConfig`, `deny_unknown_fields`, fail-closed) + `main.rs` (load+validate, non-zero on bad config). 13 unit tests; binary fail-closed verified (good->0, `0.0.0.0`->1, no-config->1). |
| CS.2 | INV-CONSOLE-ADMIN-PLANE | OPEN | -- | Inbound admin terminator: aws-lc-rs `ServerConfig` (X25519MLKEM768 + P-384 floor, TLS 1.3, AES-256-GCM-SHA384, server-auth) + floor guard + `copy_bidirectional`; live floor proof (hybrid/P-384 OK, X25519/P-256 refused); widened bind refuses startup. |
| CS.3 | INV-CONSOLE-CRYPTO-AWSLC (engine leg) | OPEN | -- | Outbound engine originator: `cdb_mtls::client_config` + bounded dial + `copy_bidirectional`; live wire round-trip through the sidecar. |
| CS.4 | INV-CONSOLE-CRYPTO-AWSLC (Node leg) | OPEN | -- | BFF integration + F0.3b revision: `@forge/wire` `connectLoopback`; `connectTls` removed/quarantined; plaintext `node:http` admin loopback listener; config migrated; no-`node:tls` hygiene test. |
| CS.5 | INV-CONSOLE-SUPPLYCHAIN-HARDENED (sidecar) | OPEN | -- | Installer-provisioned binary; DEPENDENCY-POLICY note; gate builds+tests the sidecar; SBOM entry. |
| CS.N | INV-CONSOLE-CRYPTO-AWSLC (capstone) | OPEN | -- | Live capstone (folded into Phase 0 exit / full live run): browser->sidecar:8443 hybrid + BFF->sidecar->engine:7878, Node doing no TLS. |
