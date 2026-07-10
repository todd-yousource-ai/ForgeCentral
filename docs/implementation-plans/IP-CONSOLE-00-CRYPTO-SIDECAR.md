# IP-CONSOLE-00-CRYPTO-SIDECAR -- the AWS-LC crypto boundary (TRD-CONSOLE-00 Sections 2 + 8)

**Status:** OPEN (authored 2026-07-10). A second implementation plan under `TRD-CONSOLE-00` (the first is
`IP-CONSOLE-00-FOUNDATION`). It re-platforms **every Console TLS boundary onto the platform's AWS-LC
(FIPS) crypto module** by terminating and originating TLS in a small Console-owned Rust sidecar
(`rustls` + `aws-lc-rs`); the Node BFF performs **no TLS**. This realizes the admin plane (`TRD-CONSOLE-00`
Section 8, the F0.7 roster row) and **revises the already-landed engine transport** (F0.3b) so the Console
is consistent with the engine, which speaks `rustls` + `aws-lc-rs` on `:7878` (crdb `cdb-mtls`).

Read with `TRD-CONSOLE-00` (authoritative: Section 2 architecture, Section 8 admin plane, Section 10
invariants), `IP-CONSOLE-00-FOUNDATION` (F0.3b transport + F0.7 admin plane, both folded in here), and the
engine profile in crdb `crates/cdb-mtls/src/lib.rs` (the interop contract).

---

## 1. Why this plan exists (the decision and its grounding)

The engine standardized its crypto on **AWS-LC**: crdb `cdb-mtls` is `rustls` + `aws-lc-rs`, TLS 1.3-only,
the **X25519MLKEM768** hybrid key exchange (ML-KEM-768, FIPS 203) preferred, mandatory client-cert
verification. The platform posture is FIPS-aligned and federal-grade, and the standards state the Console
"relies on the platform's FIPS crypto and adds none of its own."

The Console is TypeScript on Node, and **Node's TLS is bound to its bundled OpenSSL** -- a *different*
crypto module from the platform's AWS-LC. Two landed/considered legs used it: F0.3b dials `:7878` via
`node:tls`, and the F0.7 admin plane would have terminated browser TLS in `node:https` (OpenSSL 3.5, which
does carry `X25519MLKEM768`). Putting a second, non-FIPS-validated crypto stack on the *externally-facing
federal admin boundary* -- exactly where the validated module matters most -- contradicts the AWS-LC
posture.

Research finding (2026-07-10): **AWS-LC has no first-party Node/TS binding.** AWS ships only the C library
(`aws/aws-lc`) and the Rust crate (`aws-lc-rs`); the aws-lc-rs user guide is Rust-only (no Node/napi/wasm).
Building Node itself against AWS-LC is not a supported or maintainable path -- it is the same wall Node hit
with BoringSSL (Node uses OpenSSL APIs BoringSSL/AWS-LC do not implement, and AWS-LC lacks the OpenSSL 3.0
provider architecture Node 22 relies on). The sanctioned high-level path to AWS-LC TLS is **`rustls` +
`aws-lc-rs`** (the stack that gave Rustls its FIPS support), which is precisely what crdb/torch run.

**Decision (product owner, 2026-07-10):** AWS-LC everywhere in the Console, realized as a **Rust loopback
crypto sidecar**. The sidecar owns both crypto boundaries; the Node BFF speaks only plaintext loopback to
it and performs no TLS.

---

## 2. Objective, invariant, and exit criteria

**Objective.** Every Console TLS boundary is terminated or originated by the AWS-LC (`aws-lc-rs`, FIPS)
module in a Console-owned sidecar. The browser <-> Console admin leg (`node-IP:8443`) negotiates a hybrid
PQC key exchange with a CNSA-1.0 classical floor; the Console <-> engine leg (`:7878`) is the exact
`cdb-mtls` mTLS profile. The Node process holds no private key and runs no TLS handshake.

**Named invariant -- `INV-CONSOLE-CRYPTO-AWSLC`.** No Console TLS handshake runs on any module other than
`aws-lc-rs`; Node performs no TLS. Concretely: (a) the BFF makes no `node:tls`/`node:https` outbound or
inbound TLS connection in a release build; (b) the admin leg is terminated by the sidecar on `node-IP:8443`
with `X25519MLKEM768` + a P-384 CNSA-1.0 classical floor, TLS 1.3, `TLS_AES_256_GCM_SHA384`; (c) the engine
leg is originated by the sidecar with the `cdb-mtls` `client_config` (X25519MLKEM768-only, mTLS); (d) a
config that widens the admin bind beyond the node IP or drops below the floor fails the sidecar's startup
(fail-closed); (e) the two legs never merge -- no engine byte crosses 8443, no browser byte reaches `:7878`
except as an opaque tunnelled payload under the sidecar's own mTLS identity.

This subsumes **`INV-CONSOLE-ADMIN-PLANE`** (`TRD-CONSOLE-00` Section 10), now realized in the sidecar.

**Exit criteria:**

- The sidecar builds, gates (fmt/clippy `-D warnings`/test/audit/deny), and ships as an installer-provisioned
  binary; it is NOT an npm dependency (respects `DEPENDENCY-POLICY.md`: empty runtime deps, install-script
  lockdown).
- Live: a browser (or `openssl s_client`/a rustls client) completes the admin handshake on `node-IP:8443`
  negotiating `X25519MLKEM768`; a client offering only a sub-floor group (X25519, P-256) is refused; a
  classical-only P-384 client succeeds (the floor).
- Live: the BFF drives a real engine round-trip on `:7878` **through the sidecar** (the F0.3b proof, now
  AWS-LC end to end); `/readyz` is green against the running node with Node doing no TLS.
- The BFF holds no TLS private key and opens no TLS socket; a hygiene test asserts no `node:tls`/`node:https`
  import in `apps/bff/src` outside a clearly marked dev-only escape hatch (or none at all).

---

## 3. Architecture -- the two legs, one sidecar

```
              [ inbound admin leg ]                         [ outbound engine leg ]

 browser ==(TLS 1.3: X25519MLKEM768 / P-384 floor,      Node BFF --(plaintext loopback TCP)-->
           AES-256-GCM-SHA384; aws-lc-rs)==>              [ sidecar egress ] ==(mTLS: cdb-mtls
   [ sidecar :8443 on the node IP ]                        profile, X25519MLKEM768; aws-lc-rs)==>
        --(plaintext loopback TCP)-->                       engine :7878
   Node BFF admin http listener (127.0.0.1)

 Node performs NO TLS. Every crypto boundary is aws-lc-rs (FIPS 203). Loopback hops are 127.0.0.1 only.
```

- **Inbound (admin):** the sidecar binds `node-IP:8443` (fail-closed: a wildcard/unspecified/hostname bind
  refuses startup), terminates browser TLS with an `aws-lc-rs` `ServerConfig` (see Section 4), and
  `copy_bidirectional`s the decrypted stream to the BFF's **plaintext loopback** admin HTTP listener. The
  BFF admin listener binds `127.0.0.1` only and has **no engine client** (leg separation is structural).
- **Outbound (engine):** the sidecar listens on a **plaintext loopback** egress port, accepts the BFF's
  wire bytes, originates mTLS to `:7878` using `cdb_mtls::client_config(...)` (the exact engine profile),
  and `copy_bidirectional`s. The wire framing + reactor handshake still run in TypeScript (`@forge/wire`);
  they flow through the sidecar as an opaque byte tunnel, so byte-exactness to crdb is unchanged.
- **Node's role:** talk plaintext loopback in both directions. It never reads a key, never dials TLS, never
  terminates TLS.

---

## 4. The AWS-LC configs (reuse map + the new floor)

**Outbound engine leg -- reuse `cdb-mtls` as-is.** `cdb_mtls::client_config(ca_pem, chain_pem, key_pem)`
(crdb `cdb-mtls/src/lib.rs:145`) is TLS 1.3-only, `X25519MLKEM768`-only, root-pinned, client-auth. This is
the interop contract with the engine and is reused verbatim (git dep on crdb, pinned rev, like torch). The
dial/bounded-phase pattern is `torch-core::seam::SeamClient::connect_using` (reference only; not a dep).

**Inbound admin leg -- new `aws-lc-rs` `ServerConfig` (the CNSA-1.0 floor).** Neither `cdb-mtls`
`server_config` (mandatory client auth) nor `server_auth_config` (no P-384 floor) matches a browser-facing
listener, so this is new code built on the same `aws-lc-rs` builder:

- **Key exchange:** `kx_groups = [X25519MLKEM768, SECP384R1]` -- hybrid preferred, **P-384 as the classical
  CNSA-1.0 floor** (not X25519, which crdb uses as its *engine* fallback but is below the CNSA-1.0 classical
  bar). A client offering only X25519 or P-256 shares no group and the handshake fails: that is the floor,
  enforced by construction.
- **Cipher suite:** restrict to `TLS13_AES_256_GCM_SHA384` (CNSA-1.0: AES-256-GCM, SHA-384).
- **Protocol:** `&[&rustls::version::TLS13]` (the spec's TLS 1.2 floor is met and exceeded; TLS 1.3-only is
  stronger and matches the engine).
- **Server auth only:** `with_no_client_auth()` + the installer-provisioned **P-384 (or RSA-3072)**
  CNSA-grade leaf. (Operator auth remains OIDC at the BFF, unchanged; the admin plane is an *additional*
  boundary, not a replacement for engine-side authorization -- `TRD-CONSOLE-00` Section 8.)
- **Fail-closed floor guard:** a startup assertion proves the assembled config carries a hybrid PQC group
  AND the P-384 floor group AND only the CNSA suite; a config that drops any of these refuses to start.

Caveat carried into CS.2: `aws-lc-rs`/`rustls` today expose `kx_groups` and `cipher_suites` selection but
not a first-class "classical-curve floor" knob; the floor is realized by the `kx_groups` list above plus
the CNSA leaf, and proven behaviorally (Section 7), not by a library flag.

---

## 5. The sidecar crate (layout, deps, config)

A **standalone Rust crate** at the repo root `sidecar/` (its own `Cargo.toml`/`Cargo.lock`, NOT in the pnpm
workspace). It mirrors torch's approach to the crdb dependency: a git dep on `cdb-mtls` pinned to a rev,
built with `git insteadOf` -> `github-crucible` and `CRUCIBLE_TOKEN` in CI.

- `sidecar/src/config.rs` -- `SidecarConfig` parsed + validated at startup (fail-closed): `admin_bind_ip`
  (node IP literal), `admin_port` (8443), `admin_upstream` (127.0.0.1:<bff-admin>), `engine_addr`
  (host:port), `engine_ca`/`engine_cert`/`engine_key` (paths), `egress_bind` (127.0.0.1:<port>),
  `admin_cert`/`admin_key` (the CNSA leaf). Bind guard: `admin_bind_ip` must be a concrete unicast IP
  literal, never wildcard/unspecified/hostname.
- `sidecar/src/admin.rs` -- the inbound terminator: the `aws-lc-rs` `ServerConfig` (Section 4) + the floor
  guard + `TlsAcceptor::accept` + `copy_bidirectional` to `admin_upstream`.
- `sidecar/src/engine.rs` -- the outbound originator: accept on `egress_bind`, `cdb_mtls::client_config` +
  `TlsConnector::connect` (bounded phases) + `copy_bidirectional`.
- `sidecar/src/bind.rs` -- the node-IP bind guard + `SidecarError`.
- `sidecar/src/main.rs` -- boot: `install_default_crypto_provider()`, validate config, spawn both
  listeners with lifecycle/shutdown, fail-closed on any bind/floor/cert error.
- Deps (pinned, minimal): `tokio` (rt/net/io-util/macros), `tokio-rustls` (default-features off,
  `aws-lc-rs`), `cdb-mtls` (git, pinned), `rustls-pki-types`, `thiserror`, `serde`+`serde_json` (config),
  `tracing`. No `rcgen` (we use provisioned certs, not on-the-fly minting).

---

## 6. Roster (one invariant per PR)

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **CS.1** | INV-SIDECAR-BIND-FAILCLOSED | Sidecar crate scaffold: standalone Cargo project, lints, README, CI wiring (git-insteadOf + token, a `sidecar` gate leg: fmt/clippy `-D warnings`/test). `SidecarConfig` + the node-IP bind guard, fail-closed, with unit tests (wildcard/hostname refused; concrete IP accepted). No TLS yet. |
| **CS.2** | INV-CONSOLE-ADMIN-PLANE | Inbound admin terminator: the `aws-lc-rs` `ServerConfig` (X25519MLKEM768 + P-384 floor, TLS 1.3, AES-256-GCM-SHA384, server-auth) + the floor guard + `TlsAcceptor` + `copy_bidirectional` to the admin loopback. Live tests: hybrid-only client OK, P-384-only OK, X25519-only + P-256-only REFUSED; widened-bind refuses startup. |
| **CS.3** | INV-CONSOLE-CRYPTO-AWSLC (engine leg) | Outbound engine originator: `cdb_mtls::client_config` + bounded dial + `copy_bidirectional` from the egress loopback. Live test: a wire round-trip through the sidecar to the running node (the F0.3b proof, now aws-lc-rs). |
| **CS.4** | INV-CONSOLE-CRYPTO-AWSLC (Node leg) | BFF integration + the F0.3b revision: `@forge/wire` gains `connectLoopback` (plaintext TCP to the egress port) returning `StreamFrameTransport`; the production connector uses it; `connectTls` is removed/quarantined (no second crypto path). The BFF admin listener becomes a plaintext `node:http` loopback server (admin routes, no engine client). Config: engine target -> egress loopback; admin -> loopback; `FC_ADMIN_TLS_*` removed from Node (moved to the sidecar). Hygiene test: no `node:tls`/`node:https` in `apps/bff/src`. |
| **CS.5** | INV-CONSOLE-SUPPLYCHAIN-HARDENED (sidecar) | Deploy + supply chain: the sidecar as an installer-provisioned binary; `DEPENDENCY-POLICY.md` note (Rust binary, its own `cargo audit`/`deny`, not an npm dep); gate builds+tests the sidecar; SBOM entry for the binary. |
| **CS.N** | INV-CONSOLE-CRYPTO-AWSLC (capstone) | Live capstone folded into the Phase 0 exit / full live run: browser -> sidecar:8443 (hybrid handshake live) AND BFF -> sidecar -> engine:7878 (live round-trip) end to end, Node doing no TLS. |

---

## 7. Test + live-proof plan

- **Bind (CS.1, tier 1):** the node-IP guard refuses `0.0.0.0`/`::`/hostname, accepts a concrete literal
  (incl. loopback, a stricter bind).
- **Floor (CS.2, tier 2, live in-process):** stand the terminator on `127.0.0.1:0` with the CNSA leaf and
  probe with rustls clients restricted to a single group -- `X25519MLKEM768` only -> OK (hybrid negotiated),
  `SECP384R1` only -> OK (classical floor), `X25519` only + `P-256` only -> handshake failure (floor
  enforced). This is the behavioral proof the floor holds without a library flag.
- **Engine (CS.3, tier 2/live):** a wire round-trip through the egress tunnel to the running node.
- **Node (CS.4, tier 1/2 + hygiene):** the BFF connects to the egress loopback and completes the reactor
  handshake byte-exactly; a grep-based hygiene test asserts no `node:tls`/`node:https` import in the BFF.
- **Capstone (CS.N, live):** end-to-end both legs, on the prod validation node, Node holding no key.

---

## 8. What this supersedes / revises

- **F0.7 (admin plane)** in `IP-CONSOLE-00-FOUNDATION`: the Node/OpenSSL `node:https` realization is
  discarded (never merged). The admin plane is realized here (CS.2 + CS.4). The FOUNDATION ledger's F0.7 row
  is repointed to this IP.
- **F0.3b (engine transport)** in `IP-CONSOLE-00-FOUNDATION`: the landed `@forge/wire` `node:tls`
  `connectTls` is revised (CS.4) to a plaintext-loopback transport behind the sidecar. The wire
  frame/CBOR/handshake stack (F0.3b-1/2/3a/3b) is unchanged and still byte-exact to crdb; only the transport
  dial changes. The FOUNDATION ledger notes the revision.
- **F0.5c live end-to-end** (batched into the full live run) now flows through the sidecar; no change to the
  delegation contract, only the transport underneath.

---

## 9. Risks and open questions

- **cdb-mtls git dep + token in CI:** the FC gate does not build Rust today; CS.1 adds a `sidecar` leg that
  needs the crdb checkout/token. Mitigation: mirror torch's `git insteadOf github-crucible` + `CRUCIBLE_TOKEN`;
  the leg is skippable offline (`--skip-net`) like the audit step, with the sidecar prebuilt binary as the
  gate artifact.
- **Two-process deployment:** the Console is now BFF + sidecar. The installer provisions the sidecar binary,
  its config, the CNSA admin leaf, and the loopback wiring. Documented as a deploy concern (matches the
  spec's "installer provisions the admin plane").
- **Local capture on the cleartext hops (decision: TCP loopback accepted).** Terminating TLS in a separate
  process necessarily hands cleartext across the BFF <-> sidecar boundary; that is inherent to any
  TLS-terminating proxy (encrypting the hop would require the BFF to decrypt it, i.e. Node doing TLS again on
  OpenSSL, defeating `INV-CONSOLE-CRYPTO-AWSLC`). Bounded as follows: the hops are `127.0.0.1` only, never a
  routable interface, so there is **no off-host exposure** -- everything that leaves the host is
  aws-lc-rs-encrypted. On-host, sniffing loopback requires `root`/`CAP_NET_RAW`, and an adversary at that
  level already owns the BFF/sidecar process memory (same cleartext) and the sidecar's TLS private keys, so
  the hop does not widen the trust boundary beyond "root on the node." A Unix-domain-socket variant (0600 +
  a dedicated service user, closing the passive `tcpdump` vector) was considered and **declined for v1** in
  favor of TCP loopback (product-owner decision 2026-07-10); it remains available as future hardening,
  alongside a loopback authenticator. Noted, not stubbed.
- **CNSA classical floor has no library flag:** realized via `kx_groups` + the CNSA leaf and proven
  behaviorally (Section 7). If a future `rustls`/`aws-lc-rs` exposes an explicit floor knob, adopt it.
