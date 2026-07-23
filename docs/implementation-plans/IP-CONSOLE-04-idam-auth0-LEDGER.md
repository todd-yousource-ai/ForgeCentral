# IP-CONSOLE-04-IDAM-AUTH0 -- landing ledger

Plan: `IP-CONSOLE-04-idam-auth0.md` (the External IDAM tab, live on Auth0). Created WITH the plan
(2026-07-22) per the ledger discipline: **every step's row is updated (status + commit hash) in the
same session its PR merges, and the Resume-here section is rewritten at every merge.** A stale
ledger is a defect.

## Resume here (rewrite at every merge)

- **ID.1 LANDED 2026-07-23** (`e19e084`). Contract generated from the revendored wire schema; the
  three `idam.*` bindings LIVE; no secret representable in any Console type.
- **ID.2 LANDED 2026-07-23** (`2b2ff5b`). The External IDAM tab is LIVE on `IDAM_CONNECTORS`: wire
  encoder + dispatch, BFF `engine/idam.ts` resolver + `GET /api/idam/connectors`, SPA `useIdamConnectors`
  + real connector cards (fail-closed state, honest `Never`, honest empty). `IDAM_CONNECTOR_SHELLS` and
  its guard test DELETED. `toIdamConnectors` is total (no closed-enum tag to collapse; fail-closed lives
  at the card level). Full gate + 25/25 e2e green.
- **ID.3 LANDED 2026-07-23** (`7dd1d7b`). `Sync Now` is a real audited engine command (`IDAM_SYNC`),
  per connector, confirm-gated; in-flight is driven by the card's `running` flag polled from engine
  truth (never a client timer); a refusal renders the typed failure (409 disabled/unconfigured, 403
  tier). Full gate + 26/26 e2e green.
- **OPERATOR RULING 2026-07-23 (final), on how the customer sets up a connector from the console:**
  the console form collects the FULL connectivity, but the client SECRET is handled POSTURE-PRESERVING
  -- it does NOT transit the browser or the wire. Non-secret connectivity (domain, client id,
  audience) travels the wire to the engine; the SECRET is entered through the on-node
  crypto-sidecar/admin channel (server-side mTLS) which writes the mode-protected file and hands the
  engine a `client_secret_ref`. This keeps crdb `INV-IDAM-NO-SECRET-INGEST` intact and needs no
  at-rest-crypto subsystem. This SUPERSEDES the earlier same-day "secret transits to the engine" note
  (reconsidered once recon showed it reverses three shipped engine invariants and that at-rest
  encryption is a deferred subsystem). Rescopes ID.4; still engine-first.
- **Next action: a NEW crdb IP** (working name `IP-LUG-IDAM-CONNECT`; NOT "IA.9", which is already a
  landed step -- the delta-log leg): connectivity-over-wire (a new verb carrying domain/client_id/
  audience, NO secret) + an on-node sidecar/admin secret-set that writes the mode-protected file + a
  live connector re-spawn so a new secret/connectivity applies without restart. Once it lands, **ID.4**
  builds the setup form against it (`feat/id4-idam-configure`). ID.4a (cadences) follows ID.4; ID.5
  (IdAM-owned readonly, crdb IA.6 ready) is independent and can land any time.
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
| ID.1 | `INV-CONSOLE-IDAM-CONTRACT` | **LANDED** | `e19e084` | regenerated from `wire-dto.schema.json`; bindings live; no secret in any type |
| ID.2 | `INV-CONSOLE-IDAM-CONNECTORS-REAL` | **LANDED** | `2b2ff5b` | External IDAM tab live; `IDAM_CONNECTOR_SHELLS` + guard test deleted |
| ID.3 | `INV-CONSOLE-IDAM-SYNC-REAL` | **LANDED** | `7dd1d7b` | `Sync Now` real+audited, confirm-gated, engine-truth in-flight |
| ID.4 | `INV-CONSOLE-IDAM-CONFIGURE-SAFE` | PLANNED (RESCOPED) | -- | full connectivity over the wire + a secret entered via the on-node sidecar/admin (NOT the browser/wire); posture-preserving (operator ruling 2026-07-23 final); **needs the new crdb `IP-LUG-IDAM-CONNECT`** |
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
| `IP-LUG-IDAM-CONNECT` (new crdb IP; NOT "IA.9", which is a landed step) | **NEW (operator ruling 2026-07-23 final, posture-preserving).** Connectivity-over-wire: a new verb carrying domain/client_id/audience (**NO secret**) applied to the runtime connector; an on-node crypto-sidecar/admin secret-set that writes the mode-protected file and hands the engine a `client_secret_ref` (the secret NEVER transits the browser/wire, keeping `INV-IDAM-NO-SECRET-INGEST`); and a live connector re-spawn so a new secret/connectivity applies without restart. Backs the rescoped ID.4. | NOT STARTED | -- |

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

- **2026-07-23 (FINAL, posture-preserving): the console sets up connectivity; the secret does NOT
  transit the browser/wire.** The customer enters the full connectivity in the console Configure form;
  domain/client id/audience travel the wire to the engine, but the **client secret** is entered through
  the on-node crypto-sidecar/admin channel (server-side mTLS), which writes the mode-protected secret
  file and hands the engine a `client_secret_ref`. Safeguards: the secret is never persisted
  Console-side (`INV-CONSOLE-NO-2ND-DB`), never in a Console type, never logged; a configured connector
  reports "secret set", never returns the secret; crdb `INV-IDAM-NO-SECRET-INGEST` stays intact.
  Engine-first on the new crdb `IP-LUG-IDAM-CONNECT`. Rescopes **ID.4**.
- **2026-07-23 (SUPERSEDED, same day): "the client secret transits to the engine, stored server-side."**
  Withdrawn after recon showed it reverses three shipped crdb engine invariants
  (`INV-IDAM-NO-SECRET-INGEST`, the IA.8 no-secret contract, the plan's out-of-scope secret-storage
  line) and that at-rest encryption is a deferred subsystem (`CQH-GOV-01`), not available. Replaced by
  the posture-preserving directive above. Kept here for the audit trail.
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
- 2026-07-23: **ID.3 LANDED (`7dd1d7b`).** `Sync Now` is a real audited `IDAM_SYNC` command, per
  connector, confirm-gated. `packages/wire` IdamSync encoder + dispatch, BFF `idamSync` seam +
  `resolveIdamSync` + `POST /api/idam/sync` (refusal mapped by class: Conflict->409, Framing->400,
  else 403), SPA `useIdamSync` + per-card Sync Now with the running-flag poll (engine truth, no client
  timer) and typed failure. Followed the REAL engine taxonomy: there is no "already running" refusal
  (the engine marks a sync due idempotently), so no 409-already-running path was invented. Full gate +
  26/26 e2e. **Also this session: the secret-path directive was finalized POSTURE-PRESERVING** (secret
  via on-node sidecar/admin, not the browser/wire) after recon; the crdb prerequisite is the new
  `IP-LUG-IDAM-CONNECT`, not "IA.9" (taken). Next = that crdb IP (engine-first for ID.4); ID.5 is
  independent and ready.
- 2026-07-23: **ID.2 LANDED (`2b2ff5b`).** The External IDAM tab renders live over `IDAM_CONNECTORS`:
  `packages/wire` encoder + dispatch arm, BFF `idamConnectors` seam + `engine/idam.ts` resolver +
  `GET /api/idam/connectors`, SPA `useIdam.ts` + the `IdamTab` rewrite (real cards, fail-closed state,
  honest `Never`, honest "No IdAM connector configured"). Deleted `IDAM_CONNECTOR_SHELLS` + its guard
  test. Design note recorded: `toIdamConnectors` is TOTAL -- an IdAM connector record has no closed-enum
  tag, so there is no partial-directory lie to collapse (the Objects/Users collapse does not transfer);
  fail-closed lives at the card level (ID.1). Full `scripts/ci.sh --skip-net` green + 25/25 Playwright
  e2e (live Auth0 card + honest empty). Next per operator ruling = crdb `IA.9`, then ID.4; ID.3 is
  independent.
- 2026-07-23: **ID.1 LANDED (`e19e084`).** Revendored `wire-dto.schema.json` (only the six IdAM DTOs
  added; no existing def changed) and regenerated `src/generated/wire-dto.ts`. Extended `IdamConnector`
  to the real `WireIdamConnectorRecord` shape with a fail-closed derived state (an unrecognized
  `last_completeness` yields `unknown`, never `healthy`), added `IdamConnectorDraft` / `SyncReceipt` and
  the projections, and flipped the three `idam.*` bindings live. Confirmed against the landed engine
  that `WireIdamConfigure` carries only `enabled` + the two cadences, so NO secret or secret reference
  is representable in any Console type (a structural test asserts it) -- strictly stronger than the
  roster prose, which had guessed a `clientSecretRef`. Full `scripts/ci.sh --skip-net` green + 24/24
  Playwright e2e. **Operator ruling this session reverses the secret posture** (see Operator
  directives + IA.9): the console will set up full connectivity and the secret will transit to the
  engine, stored server-side. That rescopes ID.4 and is engine-first. Next = ID.2 (connectors-read
  UI), which is unaffected.
