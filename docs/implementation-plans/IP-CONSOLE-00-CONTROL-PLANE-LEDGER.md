# IP-CONSOLE-00-CONTROL-PLANE -- Landing Ledger

Plan: [`IP-CONSOLE-00-CONTROL-PLANE.md`](./IP-CONSOLE-00-CONTROL-PLANE.md)
Master (engine) plan + ledger: crdb `docs/implementation-plans/IP-CONSOLE-CONTROL-PLANE(-LEDGER).md`.

**Decisions locked 2026-07-14:** D1 dedicated `:7879` · D2 software-P-384 (no TPM; unwinds
`IP-CONSOLE-00-SIDECAR-TPM` for the engine identity) · D3 keep BFF-trusted tenant mapping · D4 random
reserved service tenant.

## Roster (ForgeCentral)

| Step | Acceptance | Status | Commit |
|------|-----------|--------|--------|
| F1 | `console-enroll` issues a long-lived software-P-384 Console-CA leaf; no daily operator-MFA for the machine identity; human-login MFA unchanged | PLANNED | -- |
| F2 | Sidecar presents the software key + long-lived leaf and connects to the `:7879` control plane; stale `engine_key`/TPM config reconciled | PLANNED | -- |
| F3 | Assess-with-AI cognition verb + resolver + client method land (grant already present) | PLANNED | -- |
| F4 | Global-admin tenant selector; stale tenant comments corrected | PLANNED | -- |

## Notes

- **Blocked on crdb:** F2 needs crdb C2 (`:7879` listener). A0 (Console-CA + reserved tenant) is crdb-owned;
  settle Console-CA custody there before F1.
- This IP **supersedes the TPM engine-identity direction** of `IP-CONSOLE-00-SIDECAR-TPM` (parked) per D2.
