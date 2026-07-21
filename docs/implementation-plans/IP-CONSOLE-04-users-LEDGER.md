# IP-CONSOLE-04-USERS -- landing ledger

Plan: `IP-CONSOLE-04-users.md` (TRD-CONSOLE-04, Users and Identity). Created WITH the plan (2026-07-21)
per the ledger discipline: **every step's row is updated (status + commit hash) in the same session its
PR merges, and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-21): PLAN AUTHORED, no code yet.** The plan + this ledger are the first artifacts.
  Engine substrate (crdb TRD-35 / IP-LUG-SUBSTRATE) is landed, default-on, and live-proven, but the two
  Console-facing engine **reads** this surface needs are NOT yet landed (see E1/E2 below) -- those are
  the first things to move, engine-first.
- **Operator rulings baked in:** (1) all trust components removed (Override column -> Origin column; no
  trust-override field/binding anywhere); (2) External IDAM ships the honest "Not Connected" shell now,
  with an **Auth0 fast-follow** (`dev-6rcwumbp1tsae8me`) as the first live connector once TRD-35 Phase-2
  IdAM adapters land; (3) the homepage `users` container is fed by **human identities only** via the
  session bridge (E2).
- **Sequencing decided:** Users lands ahead of Objects (operator-directed, though the roadmap orders
  Objects first). Cross-repo engine-first order: **E1 (LUG directory read)** first (unblocks UY.2/3/5),
  **E2 (human session bridge)** in parallel (unblocks UY.7, the homepage ask), **E3 (command backends)**
  before UY.6.
- **E1 LANDED (2026-07-21, crdb `2d74bc20`, ER.6 in `IP-CONSOLE-ENTITY-READ`):** `LIST_PRINCIPALS`/
  `LIST_GROUPS` wire verbs + `cdb_cyber::lug_directory` projection (current accounts w/ direct group
  chips + confirmed subject + direct privileges; current groups w/ direct member counts; NO trust
  field), operator-delegated, exposure-gated, ceiling-bounded; DTO schema export regenerated so
  `@forge/contracts` can codegen. Full 8-step crdb gate green.
- **E2 LANDED (2026-07-21, crdb `1fa00951`, CN.3 in `IP-CONSOLE-CONNECTIVITY`):** implemented as a
  READ-TIME projection, not a stored `ConnectsTo` edge (deviation from the plan sketch, recorded:
  `LegNodeKind::User` is not an allowed `ConnectsTo` source and `Endpoint` never classifies as a
  Sankey destination, and a stored edge would go stale on logout -- the read-time bridge delivers the
  approved semantics EXACTLY: `users` lane count = session-present humans, service accounts excluded
  by `account_type`, machine lanes structurally by node kind, zero growth, logout drops on next
  read). `session_present_humans` honors BOTH producer legs (snapshot `OPENED_SESSION` edge + event
  `account_ref`); the served overlay path stays scan-free (handler stamps `set_users_lane`); members
  drill-down of the users class lists the humans by username with live-session counts. The lane is
  a COUNT with no ribbon; real user->destination ribbons come later with DT.4 attribution.
- **E3 LANDED (2026-07-21, crdb `559b7aad`, LU.P in `IP-LUG-SUBSTRATE`):** two PRs. (1) TRD-35
  amendment `ddb1b8c0`: `NamespaceKind::Enterprise` + `MEMBER_OF` widened to `IdentitySubject`
  members (enterprise groups = the Groups-tab RBAC subject-sets). (2) Verbs `1e5fc976`:
  `PRINCIPAL_CREATE/EDIT/SET_STATUS` + `GROUP_CREATE/EDIT/SET_MEMBERS` -> `LugProvisioned`, audited
  atomic commits attributed to the delegated operator (VTZ pattern); membership set-diff tombstones
  removals; duplicate -> Conflict, unknown status -> Framing; provisioned subjects project as
  first-class directory rows (origin `local`) and `WirePrincipalRecord` gained
  `status`/`origin`/`email`/`org` (+ `WireGroupRecord.description`) -- the FC table's Status and
  Origin columns read straight off the DTO. Schema artifact regenerated for `@forge/contracts`.
- **THE ENGINE PHASE IS COMPLETE: E1 + E2 + E3 all landed.** Every `users.*`/`groups.*` read and
  command binding in the plan now has a real engine backend; only `idam.*` stays `PENDING` (TRD-35
  Phase 2, Auth0 fast-follow).
- **UY.1 LANDED (2026-07-21):** the wire schema revendored from crdb `559b7aad` and
  `wire-dto.ts` regenerated (all E1-E3 DTOs now typed); `packages/contracts/src/users.ts` = the
  `PrincipalRow`/`GroupCard`/`IdamConnector`/`PrincipalDraft`/`ProvisionReceipt` view models +
  FAIL-CLOSED projections (an unknown kind/status/origin tag collapses the whole directory, never a
  guessed identity; one malformed record kills the projection, not the row); NO trust field
  (structurally tested: no key contains trust/override/score). Bindings registered: `users.list/
  detail`, `groups.list/detail` + all six commands LIVE against the E1/E3 ops; `idam.connectors/
  configure/sync` PENDING naming TRD-35 Phase 2 (Auth0 first). The no-stub allowlist gained the
  three prefixes; `test:contract` green.
- **UY.2 LANDED (2026-07-21):** the All Users table end to end. **Wire:** `ListPrincipals`/
  `ListGroups` ride the QuerySubmit opcode (`dispatch.ts`) with byte-faithful CBOR encoders
  (`payload.ts`); reply parsers + client methods + `OperatorEngine` delegated actions. **Contract:**
  `PrincipalKind` gained `agent` + `PrincipalStatus` gained `compromised` and
  `toAgentPrincipalRow` cross-binds the AIG directory (LIST_AGENTS ER.1) so the ONE table lists
  every actor the engine authorizes. **BFF:** `engine/users.ts` -- `resolveUsersList` (concurrent
  LUG + AIG reads, merged + stably sorted; an un-narrowable record collapses the WHOLE read to
  `UsersUnavailableError` -> 503, never a silently-shorter directory) + `resolveGroupsList`;
  routes GET `/api/users` + `/api/users/groups` (session/engine/delegation-gated, VTZ error
  semantics). **SPA:** `UsersSurface` registered for the `users` destination -- the mock's tab strip
  (Groups/IDAM tabs honest placeholders until UY.3/UY.4), search + Type/Status/Origin filters, the
  design-system DataTable with the mock columns MINUS trust (Origin replaces Override;
  Remote/Compliance render `--`, no substrate yet). **Recorded deviation:** search/filters narrow
  CLIENT-side -- the ER.6 read is bounded-and-complete (the engine REFUSES rather than truncates),
  so the Console always holds the whole directory or an error; narrowing a complete dataset is not
  the unbounded-LOG case where filters must compile to the engine query. Tests: 2 agent cross-bind
  contract tests + 5 BFF resolver tests (merge, both collapse paths, empty tenant, groups).
- **Also landed on this branch:** the parked FD.7c panel revert + BundleCommit/BundleConvergence
  wire codecs (committed per the 2026-07-21 surface-placement ruling to unblock shared-file edits;
  see `IP-CONSOLE-02-FORGE-DISTRIBUTION.md`).
- **UY.3 LANDED (2026-07-21):** the Groups tab renders the real group directory as cards (name,
  member count, description, built-in badge; honest empty/error states) and ships the FIRST E3
  command end to end: `GroupCreate` wire codec (QuerySubmit opcode + CBOR encoder) -> `groupCreate`
  delegated `OperatorEngine` action -> POST `/api/users/groups` (session/engine-gated, typed
  refusal mapping: Conflict->409 duplicate, Framing->400, else 403) -> the Create Group form with
  typed failure messages; success refetches the directory so the new card is the ENGINE's record,
  never a client-side insertion. This is the exact pattern UY.6's five remaining commands reuse.
- **UY.4 LANDED (2026-07-21):** the External IDAM tab renders the honest shell -- the three
  well-known connectors (Okta / Azure AD / Google Workspace) as cards in their REAL state
  (`Not Connected`, "No sync has ever run."), with Configure and the tab-level Sync Now as
  labelled DISABLED controls whose tooltips name the gating work (TRD-35 Phase-2 IdAM adapters;
  Auth0 first). No fabricated last-sync timestamp exists anywhere (the shells' honesty is tier-1
  tested in the contract).
- **UY.5 LANDED (2026-07-21):** the drawer resolves a LUG principal -- `resolveEntityDetail`'s
  fan-out gained LIST_PRINCIPALS, so a `principal` ref not in the agent directory builds
  header (username / engine-kind label / real lifecycle) + info (origin, namespace, lifecycle,
  email/org, group + privilege + identity tags -- structurally no trust field) from the directory
  row; both-directories-reachable-but-absent = honest `empty`, a failed directory = `error`;
  capabilities stay agent-only (`not-applicable`). SPA: activating a table row opens the drawer
  (hover prefetches); a group card's member count is now a button that lands on All Users narrowed
  to that group (the chips ARE the membership, engine-computed). <=3-click paths: row -> drawer
  (1); group -> members (1); filter to one org/type = one control. Full local Playwright suite run
  pre-push (16 passed; the new routine after the FD.7c e2e miss).
- **UY.6 LANDED (2026-07-21):** the command surface. **Wire:** the five remaining E3 codecs
  (`PrincipalCreate`/`PrincipalEdit`/`PrincipalSetStatus`/`GroupEdit`/`GroupSetMembers`) --
  byte-ordered CBOR (spec optionals OMITTED when absent), QuerySubmit opcode. **BFF:** five
  delegated `OperatorEngine` actions + five resolvers + the one command route family (POST
  `/api/users` create, `/edit`, `/status`, `/groups` create, `/groups/edit`, `/groups/members`),
  typed refusal mapping (Conflict->409/Framing->400/else 403), body validation fail-closed.
  **SPA:** the "+ Add" button -> the Add/Edit User form (username/type/email/org -- the mock form
  MINUS the trust-override field; username read-only on edit); per-row lifecycle actions rendered
  ONLY for `origin=local` rows (the engine refuses non-local subjects; observed accounts stay
  honest `--`) -- Suspend/Activate + Revoke behind a ConfirmDialog (revoke = critical tone,
  "history preserved, never deleted"); success invalidates the directory reads so every row is
  the ENGINE's record. 3-click paths: Add (1) -> form (2) -> Create (3); suspend = row action (1)
  -> confirm (2). Tests: 3 new resolver tests (create + duplicate refusal, setStatus, the
  set-members no-change commit-0) + suites green; full local Playwright run pre-push (16 passed).
  **Deferral recorded:** groups.edit / groups.setMembers have full engine+BFF backing but no
  dedicated UI yet (member management UX); noted for UY.N polish, not a stub (no dead control
  ships).
- **Next action:** UY.7 (homepage lane proof) + UY.N (Playwright capstone + the box rebuild so
  the live node serves E1-E3 and the surface renders real data end to end).

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| E1 | LUG directory read (`WireListPrincipals`/`WireListGroups`, projects `lug_store`, no trust field) | LANDED | crdb `2d74bc20` (code `7bd21def`, ER.6) |
| E2 | Human session bridge feeding the Overview `users` lane (humans only, growth-free) | LANDED | crdb `1fa00951` (code `a0934e17`, CN.3) |
| E3 | Local-principal + group command backends (create/edit/status/setMembers, audited, atomic) | LANDED | crdb `559b7aad` (amendment `ddb1b8c0`, verbs `1e5fc976`, LU.P) |

## Roster (Console PRs)

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| UY.1 | `INV-CONSOLE-USERS-CONTRACT` | LANDED | `c8372db` | trust-free contract: schema revendored (E1-E3 DTOs codegen'd), `users.ts` view models + fail-closed projections, 13 live + 3 PENDING bindings registered, 10 tier-1 tests incl. the structural no-trust-key assertion |
| UY.2 | `INV-CONSOLE-USERS-DIRECTORY` | LANDED | `410c226` | the All Users table over the real merge (LUG principals + AIG agent cross-bind); Origin replaces Override; whole-read fail-closed collapse; honest -- Remote/Compliance columns |
| UY.3 | `INV-CONSOLE-GROUPS-REAL` | LANDED | `c6d1277` | Groups cards over `groups.list` + the REAL `groups.create` command (the first E3 command through the FC stack: wire codec -> delegated engine action -> POST route w/ typed 409/400/403 -> form w/ typed failure) |
| UY.4 | `INV-CONSOLE-IDAM-HONEST` | LANDED | `f233284` | the honest not-connected shell: three connector cards from `IDAM_CONNECTOR_SHELLS`, Configure + Sync Now = labelled disabled controls naming the Phase-2 gate, no fabricated sync anywhere |
| UY.5 | `INV-CONSOLE-3-CLICKS` | LANDED | `3a612cc` | row -> the entity drawer (LUG identity branch joined the detail fan-out); hover prefetch; group card member-count -> All Users narrowed to that group (1 click) |
| UY.6 | `INV-CONSOLE-USERS-COMMAND` | LANDED | `9633d03` | all five remaining E3 commands wired end to end; the Add/Edit User form (NO trust field); row lifecycle actions (local records only) w/ ConfirmDialog; groups.edit/setMembers BFF-complete (UI = a UY.N polish note) |
| UY.7 | `INV-OVERVIEW-USER-CONTAINER-HUMAN` | LANDED (live-proven) | crdb CN.3 + operator confirm | engine feed live on the box (CN.3 session bridge; operator-confirmed 2026-07-21 post-redeploy); FC lane rendering e2e-proven in overview.spec (users lane fixture); no FC code was needed (the lane anchors) |
| UY.N | `INV-CONSOLE-USERS-COMPLETE` | LANDED | `a51cf91` | 4-test Playwright capstone (users.spec.ts) + the box redeploy (cdb `559b7aad` + console UY.1-UY.6) operator-confirmed live |


## IP COMPLETE (2026-07-21)

**Every roster row is LANDED; the surface is deployed and operator-confirmed on the live node.**
Deployed stack: cdb from crdb main `559b7aad` (E1 directory reads + E2 session bridge + E3
provisioning + CN.3), console-bff + SPA from FC main (UY.1-UY.6); LUG lanes verified post-redeploy
(snapshot growth no-op, events applying); `/api/users` live behind the session gate.

### Acceptance sweep (TRD-CONSOLE-04 Section 6)

| Acceptance row | Proven by |
|---|---|
| Every principal/group/connector value derives from a real engine record; no fabricated user | contract fail-closed projections (whole-directory collapse) + BFF resolver tests + capstone empty-tenant test + fixtureless placeholder discipline |
| Type maps to the real Principal kind; Status/Origin/Compliance reflect the engine record | ER.6/LU.P DTOs carry kind/status/origin engine-side; capstone asserts the three families + Origin column; Compliance renders honest `--` (no substrate; recorded) |
| **No trust-score field renders anywhere** | structural contract test (no row key contains trust/override/score) + capstone column-header sweep + the E3 engine shape has no such field |
| Add/edit/status/group ops commit through the engine with audit, tier- + confirm-gated | E3 audited atomic batches (crdb LU.P tests) + delegated OperatorEngine actions + ConfirmDialog gates + capstone Add-User/suspend journeys asserting the exact POST bodies |
| IdAM-owned-field edit refusal | Phase-2 hook recorded in `commit_edit_principal` (no IdAM binding can exist yet -- the refusal site is named, not stubbed) |
| Connector sync performs a real federation and reports its real result | `idam.*` PENDING (TRD-35 Phase 2; Auth0 first); UY.4 ships the honest not-connected shell -- capstone asserts disabled controls + no fabricated sync |
| Section 4 three-click tasks within budget | capstone: row->drawer (1); Add(1)->form(2)->Create(3); suspend row-action(1)->confirm(2); group->members (1) |
| Overview users container = humans only, real or 0 | crdb CN.3 (session bridge; humans by account_type, machines excluded by node kind; count-no-ribbon) + live operator confirm + overview.spec lane fixture |

### Named deferrals (honest, gating work named)
- `idam.connectors/configure/sync`: TRD-35 Phase-2 IdAM adapters; **Auth0 fast-follow** is the
  first live connector (operator ruling).
- Groups member-management UI: `groups.edit`/`groups.setMembers` are engine+BFF complete and
  tested; the dedicated UX ships as polish (no dead control ships meanwhile).
- Employee/Contractor/Partner sub-classification + Remote/Compliance columns: no engine substrate;
  rendered honest `--` until an enterprise-record attribute lands.
- Real user->destination Sankey ribbons: DT.4 attribution (the lane is a count-no-ribbon today).

## Notes / decisions log

- 2026-07-21: Plan + ledger authored from the `Users.zip` prototype (4 screens) and TRD-CONSOLE-04.
  Confirmed two engine gaps by reading crdb: no LUG directory read verb (only `WireListAgents` for the
  AIG), and no bridge from human `UserSession` into `LegNodeKind::User` connectivity nodes. The
  human/machine split for the homepage lane is already enforced by crdb `source_class` /
  `is_non_human_subject` -- so "humans only" needs no Console-side filter, only the E2 bridge.
