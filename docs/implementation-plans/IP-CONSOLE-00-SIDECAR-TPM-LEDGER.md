# IP-CONSOLE-00-SIDECAR-TPM -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-SIDECAR-TPM.md` (the crypto sidecar presents the Console's
TPM-resident engine identity). One PR per roster row, a named slice of `INV-CONSOLE-SIDECAR-TPM-KEY`, the
full gate (+ the sidecar Rust gate) green, branch-per-PR, no-ff merge, review before merge.

Status: **OPEN. T.1 (TPM signer) next -- sidecar-local, unit-tested on the box vTPM. T.2 (cdb-mtls seam) is
the paired crdb change. T.3 composes them; T.N is the MFA-gated live capstone.**

Product-owner decisions (2026-07-10): the Console engine identity is ZTP + full TPM attestation
(`IP-CONSOLE-00-DEPLOY` D.3a); full-TPM keeps the key in the TPM, but the AWS-LC sidecar reads a PEM key,
so the sidecar must sign with the TPM key like torchd (reference: torch `torch-core/src/mtls_signer.rs`).

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| T.1 | INV-CONSOLE-SIDECAR-TPM-KEY (signer) | OPEN | -- | A rustls `SigningKey` backed by the TPM (`tss-esapi`), ported from torch-core; vendored dep; unit-tested against the box vTPM (sign -> verify) with a throwaway key. |
| T.2 | INV-CONSOLE-SIDECAR-TPM-KEY (mtls seam) | OPEN | -- | crdb `cdb-mtls` additive constructor accepting a `CertifiedKey` (keep the file path); byte-exact PQ profile preserved. Cross-repo. |
| T.3 | INV-CONSOLE-SIDECAR-TPM-KEY (engine leg) | OPEN | -- | Sidecar config TPM-identity mode; `engine.rs` builds the client config with the TPM `CertifiedKey`; fail-closed on an unusable handle; file-key path dev-only. |
| T.N | INV-CONSOLE-SIDECAR-TPM-KEY (capstone) | OPEN | -- | Enrolled Console -> sidecar signs with the TPM -> engine leg mTLS -> `/readyz` green, no exported key. MFA-gated; folds into D.3c. |
