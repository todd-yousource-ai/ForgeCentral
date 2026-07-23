# IP-CONSOLE-04-IDAM-AUTH0 -- landing ledger

Plan: `IP-CONSOLE-04-idam-auth0.md` (the External IDAM tab, live on Auth0). Created WITH the plan
(2026-07-22) per the ledger discipline: **every step's row is updated (status + commit hash) in the
same session its PR merges, and the Resume-here section is rewritten at every merge.** A stale
ledger is a defect.

## Resume here (rewrite at every merge)

- **UNBLOCKED as of 2026-07-23. The crdb engine half is COMPLETE**: `IP-LUG-IDAM-AUTH0` IA.1
  through IA.N are landed and the live capstone ran green against the Auth0 tenant
  (`completeness=Complete accounts=3 groups=6 memberships=9 profiles=3 affiliations=8`).
  crdb main at close of that work: `0b6ba518`.
- **Next action: ID.1** (`INV-CONSOLE-IDAM-CONTRACT`), branch `feat/id1-idam-contract`. **Start by
  regenerating `@forge/contracts` from the engine**: the committed wire schema
  `crdb/crates/cdb-wire/schema/wire-dto.schema.json` now carries the IdAM DTOs, and it is the
  source ID.1 generates from. Authoring the contract by hand would create exactly the drift
  `@forge/contracts` exists to prevent.
- **The three verbs ID.2-ID.4 bind to** (all live on the engine, `cdb-wire` names in brackets):
  - `idam.connectors` -> **`IDAM_CONNECTORS`** [`WireIdamConnectors` -> `WireIdamConnectorList`
    of `WireIdamConnectorRecord`]. Read; returns the connector card.
  - `idam.sync` -> **`IDAM_SYNC`** [`WireIdamSync` -> `WireIdamSyncStarted`]. Command; an ACK, not
    a result.
  - `idam.configure` -> **`IDAM_CONFIGURE`** [`WireIdamConfigure` -> `WireLugProvisioned`].
    Audited command, applied live.
- **Five engine behaviors the Console must render correctly** (each is a deliberate engine
  decision, not an accident to paper over):
  1. **An unfederated node returns an EMPTY connector list, not an error.** Render "no connector
     configured", never a failure state -- the engine deliberately made those distinguishable.
  2. **`lastSyncAt` is `null` when never synced**, not 0. Render `Never`. The DTO omits the field
     entirely rather than sending an epoch, which is the standing no-fabricated-timestamp rule.
  3. **`IDAM_SYNC` returns immediately.** It marks a sync DUE; the loop picks it up on its next
     tick. The Console must NOT wait for a result or show a spinner tied to sync completion --
     poll `IDAM_CONNECTORS` for `running` / `lastSyncAt` instead. A full walk is deadline-bounded
     in minutes.
  4. **`IDAM_CONFIGURE` carries ONLY `enabled` + the two cadences.** Domain, client id, and secret
     reference are absent from the DTO BY CONSTRUCTION -- a form that could re-point a connector at
     a different Auth0 tenant is a deployment surface, not a settings surface. There is no secret
     or secret reference in any Console type (`INV-CONSOLE-NO-STUB` note: the Configure form takes
     a reference only, and even that is placed out of band, not posted).
  5. **The cadence bounds are engine-enforced**: poll 60..=86400s, full sync 1..=168h. The form's
     range hints are UX; ID.4a must test that an out-of-range value sent straight at the BFF is
     still refused by the engine.
- **ID.5 (`INV-CONSOLE-IDAM-OWNED-READONLY`) is ready too.** crdb IA.6 landed the refusal: editing
  an IdAM-owned field (`email`, `org`) on a subject with a CONFIRMED IdAM binding fails with
  `LugProvisionError::IdamOwnedField`, which crosses the wire as **`WireErrorClass::Conflict`** and
  names the owning connector. Note the shape: only a CHANGE refuses (the Console posts the whole
  form, so a no-op edit must still succeed), and a mere `MAY_REPRESENT` proposal confers NO
  ownership -- a correlated guess must never lock an operator out of their own record.
- **What to check first when resuming:** that `@forge/contracts` regenerates cleanly against
  `wire-dto.schema.json` at crdb `0b6ba518` or later. If the IdAM DTOs are missing, the vendored
  schema is stale, not the plan.

**Standing constraints:** no stub ever ships (a binding without a real backing operation stays
`PENDING` with a labelled non-live control); the Console stores no connector state
(`INV-CONSOLE-NO-2ND-DB`); **no client secret is ever representable in a Console type or transmitted
by the Console** -- only a secret *reference*; `lastSyncAt` renders `Never` when null, never a
fabricated timestamp; full `scripts/ci.sh` before every push (run Playwright locally before pushing
-- `--skip-net` skips e2e); no em dashes.

## Roster

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| ID.1 | `INV-CONSOLE-IDAM-CONTRACT` | **UNBLOCKED, next** | -- | regenerate from `wire-dto.schema.json` |
| ID.2 | `INV-CONSOLE-IDAM-CONNECTORS-REAL` | PLANNED | -- | deletes `IDAM_CONNECTOR_SHELLS` + its no-stub allowlist entry |
| ID.3 | `INV-CONSOLE-IDAM-SYNC-REAL` | PLANNED | -- | |
| ID.4 | `INV-CONSOLE-IDAM-CONFIGURE-SAFE` | PLANNED | -- | |
| ID.4a | `INV-CONSOLE-IDAM-CADENCE-EDITABLE` | PLANNED | -- | operator directive 2026-07-22; needs crdb IA.7 |
| ID.5 | `INV-CONSOLE-IDAM-OWNED-READONLY` | PLANNED | -- | needs crdb IA.6 |
| ID.N | `INV-CONSOLE-IDAM-COMPLETE` | PLANNED | -- | needs a real synced tenant (crdb IA.5/IA.N) |

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| IA.7 | `Auth0ConnectorConfig` + `Auth0ConnectorState` (committed, fail-closed, secret held by reference) + **both cadences range-bounded engine-side and applied without restart** | LANDED | `cac9c1f5` |
| IA.8 | `IDAM_CONNECTORS` / `IDAM_SYNC` / `IDAM_CONFIGURE` verbs + the committed `idam_connector` runtime section | LANDED | `3bfe7dde` + `c7eb2037` |
| IA.6 | IdAM-owned-field edit refusal in `commit_edit_principal`, typed, naming the connector | LANDED | `137ace6b` |
| IA.5 / IA.N | A real full sync against the live dev tenant | LANDED, ran GREEN 2026-07-23 | `704234eb` / `bf9da415` |

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
- 2026-07-23: **UNBLOCKED.** The crdb engine half (`IP-LUG-IDAM-AUTH0`) went from IA.1 to IA.N in
  one day and its live capstone ran green against the Auth0 tenant. Every crdb prerequisite row in
  this ledger is now LANDED with its hash, and the Resume-here section above carries the exact
  starting point for ID.1 plus the five engine behaviors the Console has to render correctly. No FC
  code was written today -- this entry exists so the next session starts from fact rather than from
  re-reading the engine. Next = ID.1, and it begins by regenerating `@forge/contracts` from the
  committed wire schema rather than hand-authoring the types.
