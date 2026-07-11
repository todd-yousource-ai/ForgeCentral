# IP-CONSOLE-00-SIDECAR-TPM -- the crypto sidecar presents the TPM-resident engine identity

**Status:** COMPLETE + LIVE-PROVEN (2026-07-11). See the ledger for the per-PR record. The Console's engine
identity is a **non-exportable TPM key**; the sidecar re-derives the deterministic TPM primary and signs the
engine-leg mTLS handshake in-device. This was briefly PARKED (2026-07-10) for a software-key ZTP path, then
REVIVED once the live node's enrollment policy was found to enforce `require_attestation` globally
(`cdb-enroll/broker.rs:503`; no per-group override), so a software key could not enroll without weakening the
server -- confirmed by the D.3c live run (attestation accepted, leaf issued, sidecar TPM-mTLS admitted). The
node's `require_attestation` stays enforced (zero server weakening). The shared contract + rustls signer live
in crdb's `cdb-device-identity` leaf crate (Console deps Crucible, never Torch); the concrete `tss-esapi`
backend lives in the Console's `console-tpm` crate, so the engine's hermetic offline build pulls no TPM
toolchain. Torch converges to the shared `cdb-device-identity` contract as a later follow-up.

---

**Original plan (retained for the hardening option).** A fourth implementation plan under `TRD-CONSOLE-00` (with
`IP-CONSOLE-00-FOUNDATION`, `IP-CONSOLE-00-CRYPTO-SIDECAR`, `IP-CONSOLE-00-DEPLOY`). It makes the AWS-LC
crypto sidecar present the Console's **TPM-resident** wire identity on the engine leg, so a full-TPM
enrolled Console (`IP-CONSOLE-00-DEPLOY` D.3a, device-identity = full TPM attestation) can actually connect
to the engine. Unblocks D.3a-console and the D.3c live capstone.

Read with `IP-CONSOLE-00-CRYPTO-SIDECAR` (the sidecar + the engine leg), `IP-CONSOLE-00-DEPLOY` D.3 (the ZTP
identity), and the **reference implementation**: torch `crates/torch-core/src/mtls_signer.rs` +
`keystore.rs` (a proven TPM-backed rustls signer over `tss-esapi`).

---

## 1. Why this plan exists (the wall D.3a hit)

The product-owner decisions for the Console engine identity are (a) **ZTP enrollment**, (b) **full TPM
attestation** (torch-style; `IP-CONSOLE-00-DEPLOY` D.3a). Full-TPM enrollment keeps the wire private key
**inside the TPM** and never exports it (`torch-enroll`: "the private key remains in the TPM",
`INV-TORCHD-HW-IDENTITY`); only the public leaf `device.pem` is persisted.

But the sidecar's engine leg calls `cdb_mtls::client_config(ca_pem, chain_pem, key_pem)`, whose `load_key`
does `PrivateKeyDer::from_pem_slice(key_pem)` -- it **requires the private key as a PEM file**. A
TPM-resident key is not a PEM. So the sidecar as built (`IP-CONSOLE-00-CRYPTO-SIDECAR` CS.1-5) cannot
present a full-TPM Console identity: the engine leg has no key to sign the mTLS handshake with.

**Decision (product owner, 2026-07-10): sidecar TPM signing.** The sidecar signs the engine-leg handshake
with the TPM-resident key via a custom rustls signing key, exactly as `torchd` presents its own TPM
identity. Faithful to full-TPM (the key never leaves the TPM); reuses torch's proven mechanism rather than
inventing crypto.

## 2. Objective, invariant, exit

**Objective.** The sidecar's engine leg presents the Console's enrolled leaf (`device.pem`) and signs the
`cdb-mtls` mTLS handshake to `:7878` using the **TPM-resident** private key (no key file), keeping the exact
`cdb-mtls` PQ profile (X25519MLKEM768-only, TLS 1.3, mutual auth). A dev/file-key path remains for tests.

**Named invariant -- `INV-CONSOLE-SIDECAR-TPM-KEY`.** In TPM mode the sidecar holds no exported private key:
it loads only the public leaf + a TPM key handle, and every engine-leg signature is produced inside the
TPM. A config that names a TPM identity but no usable handle fails startup (fail-closed); the file-key path
is `NODE_ENV`/dev only, never the release engine identity.

**Exit criteria.**
- The sidecar builds with the TPM signer (new vendored dep `tss-esapi`), gates (fmt/clippy `-D`/test/deny),
  and its unit tests sign + verify against the box's vTPM (`swtpm`/`/dev/tpmrm0`) with a throwaway TPM key.
- Live: the sidecar, configured with the enrolled `device.pem` + the TPM handle, completes the `cdb-mtls`
  handshake to the running node on `:7878` (the CS.3 proof, now with a TPM-backed key), and the BFF
  `/readyz` is green through it -- Node doing no TLS, the sidecar exporting no private key.
- The file-key path still works for `--skip-net` dev/tests; a release config that sets a TPM identity is
  refused if the handle is absent.

## 3. Roster

| Step | Deliverable | Repo | Notes |
|------|-------------|------|-------|
| **T.1** | **The TPM signer.** Port torch-core's `mtls_signer.rs` + `keystore.rs`: a rustls `SigningKey`/`Signer` backed by the TPM (`tss-esapi`), producing an ECDSA-P384 signature over the handshake transcript inside the TPM. Vendored `tss-esapi` (+ `-sys`), the FIPS-adjacent TPM2 crate torch already ships. Unit-tested against the box vTPM with a throwaway key (sign -> verify). | ForgeCentral (sidecar) | New vendored dep (justified: TPM signing; reuse torch's crate + pattern). |
| **T.2** | **The cdb-mtls seam.** `cdb-mtls` exposes building the client `ClientConfig` from a caller-supplied `CertifiedKey` (or the `pq_provider` + `root_store` building blocks) so the sidecar assembles the config with a TPM `CertifiedKey` while keeping the byte-exact PQ profile. Minimal, additive; the existing `client_config(...key_pem)` stays for the file path. | crdb (INV-CROSS) | A small, flagged crdb change (min-change rule). |
| **T.3** | **The sidecar engine leg in TPM mode.** `SidecarConfig` gains a TPM identity (`engine_cert` = the leaf, `engine_key_tpm` = the handle/context ref) as an alternative to `engine_key` (file). `engine.rs` builds the client config via the T.2 seam with the T.1 TPM `CertifiedKey`; fail-closed if the handle is unusable. The provisioning (`IP-CONSOLE-00-DEPLOY` D.2) points at the enrolled leaf + handle. | ForgeCentral (sidecar) | Config is an enum: file-key (dev) or TPM (release). |
| **T.N** | **Live capstone.** The enrolled Console identity (`IP-CONSOLE-00-DEPLOY` D.3a-console, MFA-gated) -> the sidecar presents `device.pem` + signs with the TPM -> the `cdb-mtls` engine leg completes -> BFF `/readyz` green, no exported key. Folds into the D.3c full stitched run. | ForgeCentral (+ live node) | MFA-gated (needs the operator); the T.1-T.3 code is provable without it. |

## 4. Dependencies + cross-repo

- **`tss-esapi` (+ `tss-esapi-sys`)** vendored into the sidecar's `Cargo.lock`/`vendor` (the sidecar is a
  standalone Cargo project). Justified by technical necessity (TPM2 signing), pinned, and the exact crate
  torch already vendors -- not a new supply-chain surface for the platform. Licenses checked (`deny.toml`).
- **crdb `cdb-mtls`** (T.2) is the one cross-repo change: an additive constructor that accepts a
  `CertifiedKey`. Reviewed with the crdb maintainer, min-change, no profile change.
- The box's TPM (`/dev/tpmrm0`, `swtpm`) is available (`[[crdb-tpm-toolchain]]`); the sidecar process needs
  access to it in release (a systemd device grant in the `IP-CONSOLE-00-DEPLOY` unit).

## 5. Cadence

One PR at a time, branch-per-PR through `scripts/ci.sh` (+ the sidecar Rust gate), no-ff merge, review before
merge. T.1 (sidecar-local, unit-tested on the vTPM) and T.2 (the crdb seam) can land in either order; T.3
composes them; T.N is the MFA-gated live proof. Each PR names its slice of `INV-CONSOLE-SIDECAR-TPM-KEY`.
