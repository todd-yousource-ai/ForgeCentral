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
- **Next action:** confirm/scope **E1** in crdb -- a `WireListPrincipals`/`WireListGroups` read pair
  mirroring the landed `WireListAgents` (`IP-CONSOLE-ENTITY-READ` ER.1), projecting the `lug_store`.
  Then FC **UY.1** (the trust-free contract), which has no engine dependency and can land first on the
  Console side.

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| E1 | LUG directory read (`WireListPrincipals`/`WireListGroups`, projects `lug_store`, no trust field) | PLANNED | -- |
| E2 | Human session bridge (`UserSession` -> `LegNodeKind::User` `ConnectsTo`, feeds Overview `users` lane; growth-linear; humans only) | PLANNED | -- |
| E3 | Local-principal + group command backends (create/edit/status/setMembers, audited, atomic) | PLANNED | -- |

## Roster (Console PRs)

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| UY.1 | `INV-CONSOLE-USERS-CONTRACT` | PLANNED | -- | trust-free contract; no engine dep; land first FC-side |
| UY.2 | `INV-CONSOLE-USERS-DIRECTORY` | PLANNED | -- | needs E1; the All Users table (Origin replaces Override) |
| UY.3 | `INV-CONSOLE-GROUPS-REAL` | PLANNED | -- | needs E1; Groups cards |
| UY.4 | `INV-CONSOLE-IDAM-HONEST` | PLANNED | -- | honest "Not Connected" shell; Auth0 fast-follow named |
| UY.5 | `INV-CONSOLE-3-CLICKS` | PLANNED | -- | reuse entity drawer (IP-CONSOLE-12) |
| UY.6 | `INV-CONSOLE-USERS-COMMAND` | PLANNED | -- | needs E3; Add User modal minus trust field |
| UY.7 | `INV-OVERVIEW-USER-CONTAINER-HUMAN` | PLANNED | -- | needs E2; homepage user container, humans only |
| UY.N | `INV-CONSOLE-USERS-COMPLETE` | PLANNED | -- | Playwright capstone; proves no trust field anywhere |

## Notes / decisions log

- 2026-07-21: Plan + ledger authored from the `Users.zip` prototype (4 screens) and TRD-CONSOLE-04.
  Confirmed two engine gaps by reading crdb: no LUG directory read verb (only `WireListAgents` for the
  AIG), and no bridge from human `UserSession` into `LegNodeKind::User` connectivity nodes. The
  human/machine split for the homepage lane is already enforced by crdb `source_class` /
  `is_non_human_subject` -- so "humans only" needs no Console-side filter, only the E2 bridge.
