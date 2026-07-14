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
| F3 | Assess-with-AI cognition verb + resolver + client method. DEFERRED (2026-07-14): scoping found cognition is a stateful TUNNEL (WG.4b), NOT a request/reply verb -- needs a NEW `@forge/wire` cognition-tunnel transport (frame adapter wrapping CognitionRequest/Response 0x0026/0x0027 + a nested inner cdb-wire HELLO handshake + inner AgentRequest/AgentResponse CBOR); the cognition DTOs live in `cdb-agent` (not the wire-dto schema) so a new crdb `cognition-dto.schema.json` export is needed; two round-trips (AssembleContext->Infer); extra gate (cognition-*enrolled* cert, not just the Cognition grant) + CognitionConfig frontier wiring; the BFF stream-0 single-in-flight+PING model conflicts with a long-lived tunnel. Facade/resolver/route are a clean copy; the transport is the real work. Take whole in a fresh session | DEFERRED | -- |
| F4 | Global-admin tenant selector + stale tenant comments corrected. `principalFromSession(session, activeTenantOverride?)` honors an `x-active-tenant` override ONLY for a `global-admin` (a global admin spans all tenants but the wire names exactly one per read) and IGNORES it for a tenant-scoped operator (fail-closed -- a tenant-user can never switch tenants); `server.ts` threads `activeTenantOverride(req)` (trimmed header helper) into all 5 broker call sites. Stale "TENANT not carried yet / F0.5c cross-repo" comments in `principal.ts` + `operator-engine.ts` corrected to reflect D3 (tenant IS carried via `OperatorDelegation`, engine narrows via the `Delegation` grant, C4 refuses the reserved service tenant, per-user mapping BFF-owned). Tests: global-admin override honored + blank falls back; tenant-admin override discarded | LANDED | -- |

## Notes

- **Blocked on crdb:** F2 needs crdb C2 (`:7879` listener). A0 (Console-CA + reserved tenant) is crdb-owned;
  settle Console-CA custody there before F1.
- This IP **supersedes the TPM engine-identity direction** of `IP-CONSOLE-00-SIDECAR-TPM` (parked) per D2.
