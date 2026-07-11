# IP-CONSOLE-00-SIDECAR-TPM -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-SIDECAR-TPM.md` (the Console enrolls a TPM-resident engine
identity and the crypto sidecar presents it). One PR per roster row, a named slice of
`INV-CONSOLE-SIDECAR-TPM-KEY`, the full gate green, branch-per-PR, no-ff merge, review before merge.

Status: **COMPLETE + LIVE-PROVEN (2026-07-11).** The TPM revival landed and was validated end to end
against the live node. History: the plan was briefly PARKED (2026-07-10) for a software-key ZTP path, then
REVIVED when the live node's enrollment policy was found to enforce `require_attestation` globally (crdb
`cdb-enroll/broker.rs:503`; no per-group override), so a software key could not enroll without weakening the
server. The Console's identity is a non-exportable TPM key; the node's `require_attestation` stays enforced
(zero server weakening). The concrete `tss-esapi`/`libtss2` backend lives in a Console crate, not the
engine's hermetic `cdb-device-identity` leaf crate, so the offline engine build pulls no TPM toolchain.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| T.1 | shared contract + TPM rustls signer | LANDED | crdb `b51236b0` | PR1: new crdb leaf crate `cdb-device-identity` -- the `KeystoreBackend` trait + key types + `KeystoreSigningKey` (signs the TLS 1.3 `CertificateVerify` in the keystore over aws-lc-rs) + `tpm_signing_gate`; `cdb-mtls` gained `client_config_with_resolver` (the hybrid profile, credential via a resolver not a file key). No new external dep; hermetic-safe. Consumed by BOTH the Console and (later) the Torch edge so their signing cannot drift. |
| T.2 | TPM backend (shared) | LANDED + HW-PROVEN | FC `1c363da`, `0030216` | PR2a ported the proven torch-core `TpmBackend` (tss-esapi: non-exportable P-384 device key, in-TPM SHA-384 sign, real `DeviceAttestation` = EK cert + RSA AK + PCR quote); PR3a extracted it into the shared standalone `console-tpm` crate (rustls-pki-types; own tooling; in the ci.sh Rust loop). Live `#[ignore]`d round-trip on `/dev/tpmrm0` passes (open -> generate_key -> sign). |
| T.3 | sidecar engine leg | LANDED | FC `fa77d82` | PR3b: `engine.rs bind` presents `cert_chain_der` + a `SharedKeystore` via `tpm_mtls_client_config`; each handshake acquires `tpm_signing_gate` (rustls signs synchronously in-TPM -> serialize to 1, no pool starvation). `main.rs` re-derives the deterministic TPM key + parses the leaf PEM->DER. `config.rs` drops `engine_key`, adds `tcti`. systemd: `PrivateDevices=false` + `DeviceAllow=/dev/tpmrm0` + `SupplementaryGroups=tss`. |
| T.N | live capstone | PROVEN (2026-07-11) | -- | D.3c: operator MFA -> `console-enroll` attested-enrolled against the live node (attestation ACCEPTED, CSR minted by step-ca, leaf issued) -> the sidecar re-derived the TPM key + dialed `:7878`, signing the handshake in-device -> **node admitted the TPM-mTLS connection**. Enrolled under torch's TOFU identity (shared vTPM on this dev box); a distinct `console-bff` identity + live delegation is a production/separate-box run (the code is fully proven). Bug the live run caught + fixed: enroll HTTP codec now de-chunks the (chunked) IdP token response (FC `2fdc7d2`). |
