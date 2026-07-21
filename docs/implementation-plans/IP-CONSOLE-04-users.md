# IP-CONSOLE-04-USERS -- the principal directory and the human identity feed

The implementation plan for `TRD-CONSOLE-04` (Users and Identity): the operator surface that sees, adds,
edits, and governs every **principal** the engine authorizes, plus the groups they belong to and the
external IdPs they federate from. Engine substrate is crdb **TRD-35 / IP-LUG-SUBSTRATE** (the Local User
Graph), which is landed, default-on, and live-proven. Mock target: the four `Users.zip` screens
(All Users, Groups, External IDAM, Add User) -- **with every trust component removed** per the
2026-07-21 operator ruling.

**Roadmap placement.** `TRD-CONSOLE-04` sits in Phase 3 (Governance CRUD). The roadmap orders Objects
before Users; the operator has directed Users next, so this IP lands ahead of `IP-CONSOLE-10-OBJECTS`.
Each Phase-3 surface reuses the entity drawer (`IP-CONSOLE-12`, landed).

**Named invariant:** `INV-CONSOLE-USERS-REAL` -- every principal, group, and connector value derives
from a real engine record read over the wire; the table/groups are engine-paged/bounded; create/edit/
status commands commit through the engine with audit and are tier- and confirm-gated; **no trust-score
field renders or is accepted anywhere on this surface**; an IdAM-owned identity field is read-only with a
typed refusal; a connector reports its real state, never a fabricated sync.

**Named invariant (homepage):** `INV-OVERVIEW-USER-CONTAINER-HUMAN` -- the Overview Sankey `users`
source lane is fed **only** by human identities. The exclusion is enforced at the engine by LEG node
kind (`source_class`: humans -> `users`; agents/service accounts -> `agents`), never by a Console-side
filter; the lane counts real human presence (the session bridge, E2) and stays at 0 -- never a
fabricated count -- where no human session exists.

## Trust removal (operator ruling 2026-07-21)

The prototype's trust surfaces are **deleted**, matching the platform-wide removal already recorded in
`TRD-CONSOLE-04` (amendment) and `IP-CONSOLE-ENTITY-READ`:

- All Users table: the **Override** column is removed; an **Origin** column (Local / connector name)
  takes its place (TRD-35 Section 9 authoritative source).
- Add/Edit User form: the **Trust Score Threshold Override** field is removed.
- No `users.setOverride` binding exists; no trust value is read, written, typed, or rendered.

## Prerequisites

- **Phase 0** (landed): `@forge/contracts`, the design-system data table + tab strip + cards + modal,
  the BFF + `OperatorEngine` authz facade, the binding registry + `test:contract`, the live-store, the
  SPA shell + IA (`users` destination already present, rendering `SurfacePlaceholder`).
- **`IP-CONSOLE-12` (entity drawer, landed)** -- a principal row and a group click open the drawer.
- **crdb TRD-35 / IP-LUG-SUBSTRATE (landed, default-on, live-proven):** `LocalAccount`, `LocalGroup`,
  `PrivilegeGrant`, `UserSession`, `IdentitySubject`, `IdentityNamespace` are populated from the torch
  collector (`IP-TORCH-IDENTITY-INVENTORY`). This IP **reads** that graph; it never writes it.
- **Two crdb engine reads this IP depends on are NOT yet landed** (see the cross-repo prerequisites
  below). Until each lands, its Console binding ships `PENDING` with the engine work named -- never a
  stub.

## Cross-repo engine prerequisites (crdb, engine-first)

These are crdb IPs/steps that must land (or ship `PENDING`) before the Console binding is real. They
follow crdb naming and cadence, not this repo's.

| Id | crdb deliverable | Backs | Note |
|----|------------------|-------|------|
| **E1 -- LUG directory read** | A wire read verb pair projecting the LUG store into a principal/group directory: `WireListPrincipals` (accounts + resolved subjects, paged/filtered, tier-redacted) and `WireListGroups` (groups + member counts), mirroring the existing `WireListAgents` (`IP-CONSOLE-ENTITY-READ` ER.1). Projects `LocalAccount`/`IdentitySubject`/`LocalGroup`/`PrivilegeGrant` into the row shape; **no trust field**. | `users.list`, `users.detail`, `groups.list`, `groups.detail` | Mirror `ListAgents` end-to-end (`cdb-wire::query` DTO -> `cdb-server::handler` -> `lug_store` projector). Humans + service accounts have a real substrate today; **AI-Agent** rows fold in from the AIG via the existing `ListAgents` (a named cross-bind, UY.2). |
| **E2 -- human session bridge** | Project each human `UserSession` (`IdentitySubject`--`OPENED_SESSION`-->`Endpoint`) into a `LegNodeKind::User`--`ConnectsTo`-->device node/edge in the connectivity graph, so `CONNECTIVITY_GRAPH` (the Overview Sankey source) counts human presence. Agents/service accounts are `AgentInstance`/`McpServer`/`Service` and are excluded by `source_class`/`is_non_human_subject` -- no Console filter. Must honor `INV-LUG-GROWTH-LINEAR`: one edge per live session, no per-scan growth. | The Overview `users` container (UY.7) | Session-bridge feed (operator ruling). Likely a small step folded into `IP-CONSOLE-CONNECTIVITY`; the users lane leaves 0 exactly when a human has a live session. |
| **E3 -- command backends** | The engine-side create/edit/status of a **locally-provisioned** principal (TRD-35 Section 6.3 "approved local enterprise record"), audited + atomic; and group create/setMembers. | `users.create/edit/setStatus`, `groups.create/edit/setMembers` | If not yet a first-class engine command, the Console binding ships `PENDING` (labelled non-live control), never a client-side write (`INV-CONSOLE-NO-2ND-DB`). |

**External IDAM** (Okta/Azure/Google connectors) needs TRD-35 **Phase 2** IdAM adapters
(`ExternalAccount`/`PersonProfile`/federation sync), which are **not landed**. Per the operator ruling,
UY.4 ships the **honest "Not Connected" shell** now (no fabricated sync data), with a **fast-follow**
that wires **Auth0** as the first live connector (the pinned `dev-6rcwumbp1tsae8me` enrollment IdP) once
the Phase-2 adapter exists.

## INV-CROSS -- the bindings and their backend

| Binding | Real today? | Backend / note |
|---------|-------------|----------------|
| `users.list` | **on E1** -- LUG directory read (humans + service accounts), paged/filtered, tier-redacted; AI-Agent rows cross-bound from `ListAgents` | crdb `WireListPrincipals` (E1) + `WireListAgents` (landed) |
| `users.detail(id)` | **on E1** -- full principal record; opens the drawer (`IP-CONSOLE-12`) | crdb LUG read (E1) |
| `groups.list` / `groups.detail(id)` | **on E1** -- groups + member counts + members | crdb `WireListGroups` (E1) |
| `idam.connectors` | **shell now** -- the three connectors render `Not Connected`; live status is Phase-2 | crdb TRD-35 Phase-2 IdAM adapter (`PENDING`; Auth0 fast-follow) |
| `users.create` / `users.edit` | **on E3** -- add/edit a locally-provisioned principal, audited, confirm-gated; IdAM-owned fields read-only with typed refusal | crdb local-principal command (E3) |
| `users.setStatus` | **on E3** -- activate/suspend/revoke, audited, confirm-gated | crdb lifecycle command (E3) |
| `groups.create` / `groups.edit` / `groups.setMembers` | **on E3** | crdb group command (E3) |
| `idam.configure` / `idam.sync` | **`PENDING`** -- labelled non-live until Phase-2 adapters | crdb TRD-35 Phase-2 (Auth0 fast-follow) |
| ~~`users.setOverride` / any trust field~~ | **DELETED** | removed platform-wide (operator ruling); never rendered or accepted |

## Roster

One PR per row; a named slice of `INV-CONSOLE-USERS-REAL`, full `scripts/ci.sh` green, branch-per-PR,
no-ff merge, docs commits separate from code, reviewed before the next. A binding whose engine backend
(E1/E2/E3) has not landed ships `PENDING` (a labelled non-live control), never a stub.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **UY.1** | `INV-CONSOLE-USERS-CONTRACT` | The Users contract. `@forge/contracts`: the `PrincipalRow` view model (Name/ID/Email, Org, Groups chips, Type = principal kind, Status, **Origin** [Local/connector], Remote, Compliance chips) typed against the LUG/Principal DTO -- **no trust field**; the `GroupCard` + `IdamConnector` view models; the `users.list/detail`, `groups.list/detail`, `idam.connectors`, and `users.create/edit/setStatus` + `groups.*` command shapes. `@forge/bindings`: register them (E1/E3-dependent ones `PENDING`, `idam.*` `PENDING`). `test:contract`. No UI yet. |
| **UY.2** | `INV-CONSOLE-USERS-DIRECTORY` (the read substrate) | `users.list` over the LUG. BFF resolver over `OperatorEngine` -> the E1 `WireListPrincipals` read (+ `ListAgents` cross-bind for AI-Agent rows), paged/filtered/tier-redacted, projected to `PrincipalRow` (fail-closed on unknown tags). The **All Users** table (design-system data table): the mock columns with Origin replacing Override, search + structured filters compiled to the engine query (never a client filter), server paging, loading skeleton, honest empty ("no principals match", filters echoed). If E1 is not yet landed, the table ships `PENDING` against a named verb. |
| **UY.3** | `INV-CONSOLE-GROUPS-REAL` | The **Groups** tab. `groups.list` over E1 -> the group cards (name, member count, description, settings affordance) + the `Create Group` action (`groups.create`, E3, confirm-gated or `PENDING`). Bounded read; empty state ("no groups"). |
| **UY.4** | `INV-CONSOLE-IDAM-HONEST` | The **External IDAM** tab -- the honest "Not Connected" shell. The three connector cards (Okta/Azure AD/Google Workspace) render `Not Connected` with a disabled configure affordance and a `Sync Now` that is a labelled non-live control; **no fabricated last-sync timestamp**. Names the Phase-2 adapter + the Auth0 fast-follow. |
| **UY.5** | `INV-CONSOLE-3-CLICKS` | Row interaction. Click a principal row -> the **entity drawer** (`IP-CONSOLE-12`, reused) for the principal (identity, groups, recent decisions); a group card -> its members. The <=3-click canonical paths proven (see a principal's detail; filter to one org/type). |
| **UY.6** | `INV-CONSOLE-USERS-COMMAND` | Create/edit/status commands. The **Add User** modal (the mock form **without** the trust-override field) -> `users.create` (E3): a locally-provisioned principal, audited, tier-gated (Admin/SecurityAudit), confirm-gated, committed through the engine's atomic batch. `users.edit`/`users.setStatus` (suspend/revoke with confirm); an edit to an IdAM-owned field is refused with the typed error naming the connector. Optimistic-pending -> engine-confirmed. All command failure paths tested (unauthorized-create, IdAM-owned-field refusal, revoke, `PENDING`). Ships `PENDING` if E3 is not landed. |
| **UY.7** | `INV-OVERVIEW-USER-CONTAINER-HUMAN` | The homepage user container. With the E2 session bridge landed engine-side, the Overview Sankey `users` lane fills from human sessions only; this step proves it on the Console: the lane leaves 0 and shows human presence, agents/service accounts remain in the `agents` lane, and the count is never fabricated. No new Console projector code is expected (the `users` lane already anchors); the deliverable is the wiring proof + a Playwright assertion. Ships against E2; the lane stays honest-0 until E2 lands. |
| **UY.N** | `INV-CONSOLE-USERS-COMPLETE` | The capstone. Playwright E2E on real engine data: the All Users table over real LUG principals; a filter recomputes engine-side; a row opens the drawer; the Groups tab renders real groups; the External IDAM shell reads honest; Add User creates a local principal (audited) and it appears in the table; the Overview `users` lane reflects a real human session. All `TRD-CONSOLE-04` Section 6 acceptance rows green, incl. **no trust field renders anywhere**. |

## Sequencing note

UY.1 lands the contract (trust-free). UY.2 is the highest-leverage step -- it needs the E1 LUG
directory read, so E1 is the first cross-repo dependency to land engine-side; UY.2 de-risks UY.3/UY.5
(same read shape). UY.4 ships independently now (the honest shell). UY.6 needs E3. UY.7 needs E2 (the
session bridge) and is the operator's homepage ask -- it can land in parallel with the table work since
it touches the Overview surface, not the Users table. Each binding that outruns its engine backend
ships `PENDING`, labelled, never stubbed.

## Acceptance (from `TRD-CONSOLE-04` Section 6)

- Every principal, group, and connector value derives from a real engine record; no fabricated user
  (contract test + fixtureless render on an empty tenant).
- Type maps to the real Principal kind; Status/Origin/Compliance reflect the engine record; **no
  trust-score field renders anywhere** on the surface.
- Add/edit/status/group operations commit through the engine with audit, tier- and confirm-gated; an
  edit to an IdAM-owned identity field is refused with the typed error; a connector reports its real
  state (the shell reads honest-not-connected, never a fake sync).
- The Section 4 three-click tasks complete within budget.
- The Overview `users` container is fed by human identities only (`INV-OVERVIEW-USER-CONTAINER-HUMAN`):
  agents/service accounts never appear in the `users` lane; the count is real or 0, never fabricated.
