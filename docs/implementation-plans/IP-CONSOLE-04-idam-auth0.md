# IP-CONSOLE-04-IDAM-AUTH0 -- the External IDAM tab goes live on Auth0

The implementation plan for the **External IDAM** half of `TRD-CONSOLE-04` (Users and Identity):
turning the honest "Not Connected" shell that `IP-CONSOLE-04-users` UY.4 shipped into a real
connector surface backed by the crdb TRD-35 **Phase-2 IdAM adapter** and its first live adapter,
**Auth0**.

**This IP exists to close the last three `PENDING` bindings on the Users surface.** Everything else
on `TRD-CONSOLE-04` is landed, deployed, and operator-confirmed (`IP-CONSOLE-04-users`, COMPLETE
2026-07-21). The named deferral recorded there -- "`idam.connectors/configure/sync`: TRD-35 Phase-2
IdAM adapters; **Auth0 fast-follow** is the first live connector (operator ruling)" -- is what this
plan executes.

**Named invariant:** `INV-CONSOLE-IDAM-REAL` -- every connector value on the External IDAM tab
derives from a real engine connector record; a `last sync` timestamp renders only after a real sync
has run; `Sync Now` triggers a real, audited engine sync and reports its real result; the Configure
form never accepts a literal client secret; and an IdAM-owned identity field is read-only on the
Users surface with the typed refusal naming the connector.

## Roadmap placement

Phase 3 (Governance CRUD). `TRD-CONSOLE-04` is otherwise complete; VTZ (`02`) and Objects (`10`) are
complete; **Policies (`05`) is the remaining Phase-3 surface**. This IP is a narrow fast-follow on an
already-shipped surface and does not reorder that: it lands when its engine prerequisite does.

## Prerequisites

- **`IP-CONSOLE-04-users` (COMPLETE, deployed).** The Users contract, the All Users table, the Groups
  tab, the entity drawer branch, the six E3 commands, and the honest IDAM shell all exist. This IP
  edits that surface; it builds no new one.
- **`IP-CONSOLE-12` (entity drawer, landed).**
- **crdb `IP-LUG-IDAM-AUTH0` (PLANNED, engine-first).** The whole of this IP is `PENDING` until its
  IA.8 verbs land. Per house sequencing the engine ships first; nothing here renders ahead of a real
  operation.

## Cross-repo engine prerequisites (crdb, engine-first)

These follow crdb naming and cadence, not this repo's. All are steps of crdb
`IP-LUG-IDAM-AUTH0.md`.

| Id | crdb deliverable | Backs |
|----|------------------|-------|
| **IA.7** | `Auth0ConnectorConfig` (committed, fail-closed; the client secret held as a **reference**, never inline) + `Auth0ConnectorState` (enabled/running/last-sync/objects-synced/last-error/cursor) | the real state behind every connector card |
| **IA.8** | The three wire verbs: `IDAM_CONNECTORS` (read), `IDAM_SYNC` (audited command), `IDAM_CONFIGURE` (audited command over non-secret fields + the secret reference; a literal secret is refused) + origin `idam:auth0` on `WirePrincipalRecord` | `idam.connectors`, `idam.sync`, `idam.configure`, the Origin column |
| **IA.6** | The IdAM-owned-field edit refusal in `commit_edit_principal`, typed and naming the connector | the Edit User form's read-only fields + typed failure |
| **IA.5 / IA.N** | A real full sync against the live dev tenant | the capstone's real `last sync` and real object counts |

## INV-CROSS -- the bindings and their backend

| Binding | Today | After this IP |
|---------|-------|---------------|
| `idam.connectors` | `PENDING`; UY.4 renders the static `IDAM_CONNECTOR_SHELLS` constant (three `not-connected` cards, `lastSyncAt: null`) | **LIVE** on `IDAM_CONNECTORS`; the card list is the engine's configured-connector list; `IDAM_CONNECTOR_SHELLS` is **deleted** and its no-stub allowlist entry removed |
| `idam.sync` | `PENDING`; `Sync Now` is a labelled disabled control | **LIVE** on `IDAM_SYNC`; audited, tier-gated, confirm-gated, real result surfaced |
| `idam.configure` | `PENDING`; `Configure` is a labelled disabled control | **LIVE** on `IDAM_CONFIGURE`; non-secret fields + a secret **reference** only |
| `users.edit` (IdAM-owned fields) | LIVE, but no IdAM binding can exist yet, so the refusal path is unreachable | the refusal becomes **reachable and proven**: an IdAM-owned field renders read-only and a forced edit returns the typed error naming the connector |
| `users.list` Origin column | renders `Local` / `observed` | additionally renders the real connector origin (`Auth0`) for imported principals |

## Roster

One PR per row; a named slice of `INV-CONSOLE-IDAM-REAL`, full `scripts/ci.sh` green, branch-per-PR,
no-ff merge, docs commits separate from code, reviewed before the next. A binding whose engine
backend has not landed stays `PENDING` (a labelled non-live control), never a stub.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **ID.1** | `INV-CONSOLE-IDAM-CONTRACT` | The contract. Revendor the engine schema (IA.8 DTOs codegen'd). `@forge/contracts`: extend `IdamConnector` to the real shape (`connectorId`, `displayName`, `providerDomain`, `state`, `lastSyncAt`, `lastSyncOutcome`, `objectsSynced`, `lastError`, `enabled`) with **fail-closed projections** (an unknown state tag collapses the card to a typed unknown, never a green "connected"); add the `IdamConnectorDraft` (configure) and `SyncReceipt` (sync) command shapes -- the draft carries `clientSecretRef`, **never** a secret value, and the type makes a secret field unrepresentable. `@forge/bindings`: flip the three `idam.*` bindings to live against `idam_connectors_v1` / `idam_sync_v1` / `idam_configure_v1`. `test:contract`. Tier-1 tests incl. a structural assertion that no contract key matches `/secret|password|token/` except `clientSecretRef`. No UI change yet. |
| **ID.2** | `INV-CONSOLE-IDAM-CONNECTORS-REAL` | The real connector list. BFF: the `IDAM_CONNECTORS` wire codec + delegated `OperatorEngine` action + `engine/idam.ts` resolver (whole-list fail-closed collapse, the Objects/Users pattern) + `GET /api/idam/connectors`. SPA: the External IDAM tab renders the engine's connector cards -- real state, real `lastSyncAt` (or an honest `Never` when null), real object counts, real last error. **Delete `IDAM_CONNECTOR_SHELLS`** and its no-stub allowlist entry. Honest empty: a deployment with no configured connector shows "no IdAM connector configured", not three phantom cards. |
| **ID.3** | `INV-CONSOLE-IDAM-SYNC-REAL` | `Sync Now` becomes real. BFF: the `IDAM_SYNC` codec + delegated action + `POST /api/idam/sync` with typed 409 (already running) / 400 (disabled connector) / 403 (tier). SPA: the button leaves its disabled state, is **confirm-gated**, shows an in-flight state driven by the engine's `running` flag (not a client timer), and on completion surfaces the **real** outcome -- objects synced, completeness, or the real error string. A failed sync renders the failure; it never silently succeeds. Failure-path tests for all three typed errors. |
| **ID.4** | `INV-CONSOLE-IDAM-CONFIGURE-SAFE` | `Configure` becomes real. BFF: the `IDAM_CONFIGURE` codec + delegated action + `POST /api/idam/configure`, fail-closed draft parse. SPA: the Configure form collects **domain, client id, audience, secret reference, poll interval, full-sync cadence, enabled** -- with the secret-reference field labelled as *a path to a secret already placed on the node*, and inline copy stating the Console never transmits the secret itself. Tier-gated (Admin/SecurityAudit) and confirm-gated. A submission that would carry a literal secret is impossible by type and additionally refused by the engine (proven by a test asserting the exact POST body shape). |
| **ID.5** | `INV-CONSOLE-IDAM-OWNED-READONLY` | The Users-surface consequences. The All Users **Origin** column renders the real connector origin (`Auth0`) for imported principals beside `Local` / `observed`. In the Edit User form, fields owned by the connector for an IdAM-bound principal render **read-only** with the connector named; a forced edit surfaces the typed refusal from IA.6. The entity drawer's identity branch shows the binding (provider, method, confirmed/proposed) -- a **proposed** binding is rendered as proposed, never as confirmed. |
| **ID.N** | `INV-CONSOLE-IDAM-COMPLETE` | The capstone. Playwright E2E against a real engine: the External IDAM tab renders the real Auth0 connector; `Sync Now` runs a real audited sync and the card's `lastSyncAt` + object count update from engine truth; a disabled-connector sync returns the typed 400; a non-Admin operator is refused; the Configure form round-trips non-secret fields and structurally cannot carry a secret; an imported principal shows Origin `Auth0` and its IdAM-owned field is read-only; **no fabricated sync timestamp exists anywhere** (the structural sweep UY.4 established, re-run against live data). Acceptance sweep of the `TRD-CONSOLE-04` Section 6 connector row + the box redeploy. |

## Sequencing note

ID.1 lands the contract and can land as soon as the IA.8 schema exists. ID.2 is the highest-leverage
step and is what makes the tab honest-live. ID.3 and ID.4 are independent of each other and both
need ID.2's resolver. ID.5 needs IA.6 engine-side. ID.N needs everything plus a real synced tenant.

If IA.8 lands but IA.5 has not run a real sync yet, ID.2 still ships: the card renders the configured
connector with `lastSyncAt: null` -> `Never`, which is honest and is exactly the shape the contract
already models.

## Acceptance

The `TRD-CONSOLE-04` Section 6 row still open after `IP-CONSOLE-04-users` --

> *Connector sync performs a real federation and reports its real result*

-- is green, together with the previously-unreachable IdAM-owned-field refusal row. Every value on
the tab traces to an engine record; `INV-CONSOLE-NO-STUB` holds with the shells deleted rather than
merely bypassed; `INV-CONSOLE-NO-2ND-DB` holds (the Console stores no connector state); the
`<=3-click` budget holds (External IDAM tab -> Sync Now -> confirm).

## Risks

- **A green "Connected" card that is not.** The failure mode operators would trust most. Mitigation:
  ID.1's fail-closed projection -- an unknown or unparseable state collapses to a typed unknown, and
  `lastSyncAt` renders `Never` rather than a fabricated time, which is the discipline UY.4 already
  established and tested.
- **A client secret transiting the Console.** Mitigation: the contract type has no secret field
  (ID.1 structural test), the form collects a reference, and the engine refuses a literal secret
  independently (IA.8) -- three layers, none of which relies on the UI behaving.
- **A proposed binding rendering as a confirmed identity.** This would undo `INV-LUG-FAIL-UNMERGED`
  at the presentation layer, which is the one place the operator actually sees it. Mitigation: ID.5
  renders binding status explicitly and the capstone asserts the proposed case.
- **Shipping ahead of the engine.** Mitigation: bindings stay `PENDING` until IA.8; the contract test
  is what enforces this, not discipline.
