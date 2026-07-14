# IP-CONSOLE-00-CONTROL-PLANE -- Landing Ledger

Plan: [`IP-CONSOLE-00-CONTROL-PLANE.md`](./IP-CONSOLE-00-CONTROL-PLANE.md)
Master (engine) plan + ledger: crdb `docs/implementation-plans/IP-CONSOLE-CONTROL-PLANE(-LEDGER).md`.

**Decisions locked 2026-07-14:** D1 dedicated `:7879` · D2 software-P-384 (no TPM; unwinds
`IP-CONSOLE-00-SIDECAR-TPM` for the engine identity) · D3 keep BFF-trusted tenant mapping · D4 random
reserved service tenant.

## Roster (ForgeCentral)

| Step | Acceptance | Status | Commit |
|------|-----------|--------|--------|
| F1 | Console engine identity = the software-P-384 Console-CA leaf the crdb installer generates (A0 resolved: crdb owns the CA + mints the leaf, so console-enroll's ZTP engine enrollment is obsolete for the control plane -- no daily MFA for the machine identity; human-login MFA unchanged). The sidecar gains a software-key mode presenting it. PROVEN LIVE (software mTLS dial to :7879 admitted, 0 tls_accept_failed) | LANDED | `2d74749` |
| F2 | Sidecar connects to the `:7879` control plane with the software leaf (`EngineOriginator::bind` takes a prebuilt `ClientConfig` + `tpm_gated`; gate only on the TPM path); `engine_key` reinstated as the software-key selector. DEPLOY RECONCILED: `provision-sidecar.sh` defaults to :7879/control.localhost + writes `engine_key`; `install.sh [4]` copies the node installer's software Console-CA leaf from `/etc/cdb/control` into the sidecar cert dir (no MFA/ZTP), retiring the console-enroll ZTP engine path. PROVEN LIVE END-TO-END: the sidecar SERVICE (systemd) established an mTLS tunnel `console-crypto <-> :7879` (admitted, 0 tls_accept_failed) | LANDED | `2d74749` + deploy |
| F3 | Assess-with-AI cognition verb + resolver + client method land (grant already present) | PLANNED | -- |
| F4 | Global-admin tenant selector; stale tenant comments corrected | PLANNED | -- |

## Notes

- **Blocked on crdb:** F2 needs crdb C2 (`:7879` listener). A0 (Console-CA + reserved tenant) is crdb-owned;
  settle Console-CA custody there before F1.
- This IP **supersedes the TPM engine-identity direction** of `IP-CONSOLE-00-SIDECAR-TPM` (parked) per D2.
