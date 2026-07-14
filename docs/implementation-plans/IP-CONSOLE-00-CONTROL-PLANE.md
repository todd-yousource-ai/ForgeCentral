# IP-CONSOLE-00-CONTROL-PLANE -- Console tier on the permanent Control plane

**Implements:** TRD-CONSOLE-00 (platform architecture + auth).
**Status:** DRAFT for review · ForgeCentral side of a **cross-repo** effort.
**Master plan (engine side):** crdb `docs/implementation-plans/IP-CONSOLE-CONTROL-PLANE.md` (+ ledger) --
read it first; this doc covers only the ForgeCentral changes and references the crdb roster (A0, C1-C4).

## Why

Today the console tier authenticates to CrucibleDB as a **24h ZTP-enrolled edge device** sharing the
`:7878` wire seam **and the box TPM** with Torch. That produces daily cert expiry, fingerprint churn, a
shared-TPM identity collision with Torch, and grant collapse (see the master plan §1). We move the console
tier to a **permanent, first-party service identity on a dedicated CDB control-plane port (`:7879`)**, with
a **long-lived software-P-384 cert** pinned as a static all-planes wire peer, keeping **per-user tenant
scoping owned by the BFF** (already built).

## Locked decisions (2026-07-14)

- **D1** -- dedicated `:7879` control-plane port (Torch stays alone on `:7878`).
- **D2** -- **software P-384** console key (no TPM) → **unwinds the `IP-CONSOLE-00-SIDECAR-TPM` direction for
  the engine identity**; a software key prevents any device-identity collision with the TPM-resident Torch.
- **D3** -- keep the BFF-trusted `OperatorDelegation{principal,tenant}` mapping; no engine-verified assertion.
- **D4** -- the console peer binds a **random, permanently reserved** service `TenantId` (engine-enforced in
  crdb C4); it always delegates to a *user* tenant per request.

## ForgeCentral roster

| Step | Scope | Touches | Status |
|------|-------|---------|--------|
| **F1** | `console-enroll` → **software-P-384 keygen + CSR → long-lived Console-CA leaf** (out-of-band; no ZTP broker, no 7-day ceiling, **no daily operator-MFA for the machine identity**). Keep human-login MFA untouched. | `enroll/src/provision.rs`, `device_flow.rs`/`device_grant.rs` (drop for engine id), `csr.rs`, `enroll/src/keystore.rs` (software key), `lib.rs` | PLANNED |
| **F2** | **Sidecar → `:7879` + software key.** Read the software key + long-lived leaf; point `engine_addr`/`engine_servername`/`engine_ca` at the control plane + its trust anchor; reconcile the stale `engine_key` vs TPM-only config. | `sidecar/src/config.rs`, `sidecar/src/engine.rs`, `sidecar/deploy/config.example.json`, `deploy/install.sh`, `sidecar/deploy/console-crypto-sidecar.service` | PLANNED |
| **F3** | **Assess-with-AI (cognition)** wire verb + resolver + client method (the `cognition` plane grant already exists; the BFF surface does not). | `apps/bff/src/engine/client.ts`, `operator-engine.ts`, a new resolver, `packages/contracts` | PLANNED (independent) |
| **F4** | Tenant-scoping tidy-up: **global-admin tenant selector** (`activeTenant`) + fix the stale "tenant not carried yet" comments (the code already carries it, per D3). | `apps/bff/src/auth/rbac.ts`, `auth/session.ts`, `engine/principal.ts`, `engine/operator-engine.ts`, `server.ts` | PLANNED (small) |

## Dependencies

- **A0 (crdb-owned):** the Console-CA + the pinned console leaf + the reserved service tenant are provisioned
  by the crdb node installer (deterministic on rebuild). F1 either consumes that CA to mint the leaf, or
  provides its leaf/fingerprint for the installer to pin -- **coordinate the Console-CA ownership at A0.**
- **F2 depends on crdb C2** (the `:7879` plane existing).
- **F3 / F4** are independent of the plane work.

## Invariants preserved

- `INV-CONSOLE-CRYPTO-AWSLC` -- the BFF (Node) still does no TLS; the Rust sidecar owns all crypto. Software
  P-384 stays on the AWS-LC module.
- `INV-CONSOLE-NO-2ND-DB` -- the console persists no durable domain data; the reserved service tenant holds
  none (it always delegates to a user tenant).
- Human-login MFA is unchanged; only the **machine** (sidecar↔engine) identity drops MFA/ZTP.
