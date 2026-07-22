# IP-CONSOLE-04-IDAM-AUTH0 -- landing ledger

Plan: `IP-CONSOLE-04-idam-auth0.md` (the External IDAM tab, live on Auth0). Created WITH the plan
(2026-07-22) per the ledger discipline: **every step's row is updated (status + commit hash) in the
same session its PR merges, and the Resume-here section is rewritten at every merge.** A stale
ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-22, plan authored; no code yet).** `IP-CONSOLE-04-users` is **COMPLETE and
  deployed** -- All Users, Groups, the drawer branch, and all six E3 commands are live and
  operator-confirmed; the External IDAM tab renders the honest not-connected shell (UY.4,
  `f233284`). This IP replaces that shell with a real connector surface.
- **BLOCKED on crdb, by design (engine-first).** All three `idam.*` bindings stay `PENDING` until
  crdb `IP-LUG-IDAM-AUTH0` **IA.8** lands its wire verbs. That plan is authored
  (`crdb/docs/implementation-plans/IP-LUG-IDAM-AUTH0.md`) and its next action is IA.1.
- **Next action: none in this repo yet.** The first FC-side step (**ID.1**, the contract) becomes
  buildable the moment IA.8's schema is regenerated and revendorable. Do not start ID.1 early: the
  contract is generated from the engine DTOs, so authoring it by hand would create exactly the drift
  `@forge/contracts` exists to prevent.
- **What to check first when resuming:** the crdb ledger
  `IP-LUG-IDAM-AUTH0-LEDGER.md` Resume-here -- specifically whether IA.8 is LANDED. If it is, ID.1
  is unblocked; branch `feat/id1-idam-contract`.

**Standing constraints:** no stub ever ships (a binding without a real backing operation stays
`PENDING` with a labelled non-live control); the Console stores no connector state
(`INV-CONSOLE-NO-2ND-DB`); **no client secret is ever representable in a Console type or transmitted
by the Console** -- only a secret *reference*; `lastSyncAt` renders `Never` when null, never a
fabricated timestamp; full `scripts/ci.sh` before every push (run Playwright locally before pushing
-- `--skip-net` skips e2e); no em dashes.

## Roster

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| ID.1 | `INV-CONSOLE-IDAM-CONTRACT` | PLANNED (blocked on crdb IA.8) | -- | |
| ID.2 | `INV-CONSOLE-IDAM-CONNECTORS-REAL` | PLANNED | -- | deletes `IDAM_CONNECTOR_SHELLS` + its no-stub allowlist entry |
| ID.3 | `INV-CONSOLE-IDAM-SYNC-REAL` | PLANNED | -- | |
| ID.4 | `INV-CONSOLE-IDAM-CONFIGURE-SAFE` | PLANNED | -- | |
| ID.4a | `INV-CONSOLE-IDAM-CADENCE-EDITABLE` | PLANNED | -- | operator directive 2026-07-22; needs crdb IA.7 |
| ID.5 | `INV-CONSOLE-IDAM-OWNED-READONLY` | PLANNED | -- | needs crdb IA.6 |
| ID.N | `INV-CONSOLE-IDAM-COMPLETE` | PLANNED | -- | needs a real synced tenant (crdb IA.5/IA.N) |

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| IA.7 | `Auth0ConnectorConfig` + `Auth0ConnectorState` (committed, fail-closed, secret held by reference) + **both cadences range-bounded engine-side and applied without restart** | PLANNED | -- |
| IA.8 | `IDAM_CONNECTORS` / `IDAM_SYNC` / `IDAM_CONFIGURE` verbs + `idam:auth0` principal origin | PLANNED | -- |
| IA.6 | IdAM-owned-field edit refusal in `commit_edit_principal`, typed, naming the connector | PLANNED | -- |
| IA.5 / IA.N | A real full sync against the live dev tenant | PLANNED | -- |

## Carried from `IP-CONSOLE-04-users` (this IP closes them)

- Named deferral: `idam.connectors/configure/sync` -- TRD-35 Phase-2 IdAM adapters, **Auth0
  fast-follow** as the first live connector (operator ruling 2026-07-21). **-> ID.1-ID.4.**
- Open `TRD-CONSOLE-04` Section 6 acceptance row: *"Connector sync performs a real federation and
  reports its real result."* **-> ID.3 + ID.N.**
- Reserved-but-unreachable acceptance row: *"IdAM-owned-field edit refusal"* -- the refusal site was
  named in `commit_edit_principal` but no IdAM binding could exist. **-> ID.5.**

**Not carried (stay deferred, different gating work):** the Groups member-management UI polish;
Employee/Contractor/Partner sub-classification and the Remote/Compliance columns (no engine
substrate); real user->destination Sankey ribbons (DT.4 attribution).

## Operator directives

- **2026-07-22: the poll cadence must be operator-adjustable from the UI.** Landed as **ID.4a**
  (both cadences as bounded, unit-labelled controls on the Configure form, plus the live interval on
  the connector card) over crdb **IA.7** (engine-side range validation + no-restart application).
  The engine holds the bound, not the form: the Console's range hints are UX, and ID.4a tests that
  an out-of-range value sent straight at the BFF is still refused by the engine.

## Session log (append per session)

- 2026-07-22: Plan + this ledger authored alongside the crdb engine plan `IP-LUG-IDAM-AUTH0`.
  Confirmed against the code that the three bindings are registered `PENDING` in
  `packages/bindings/src/manifest.ts` with ops `idam_connectors_v1` / `idam_sync_v1` /
  `idam_configure_v1` and a gating task already naming TRD-35 Phase 2 with Auth0 first, and that
  `IDAM_CONNECTOR_SHELLS` in `packages/contracts/src/users.ts` is documented for deletion when the
  binding goes live -- so this IP is the pre-planned continuation, not a re-design. Scope decision
  recorded: the Console's Configure form handles a secret **reference** only; the secret itself is
  placed on the node out of band, which keeps `INV-CONSOLE-NO-2ND-DB` and the platform secrets rule
  intact without blocking the surface. Next = wait on crdb IA.8, then ID.1.
