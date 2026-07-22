# IP-CONSOLE-10-OBJECTS -- landing ledger

Plan: `IP-CONSOLE-10-objects.md` (TRD-CONSOLE-10, Objects). Created WITH the plan (2026-07-21) per
the ledger discipline: **every step's row is updated (status + commit hash) in the same session its
PR merges, and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-21): DESIGN AUTHORED, no code yet.** The TRD-CONSOLE-10 amendment (same date)
  records the operator rulings: noun-only surface (objects never apply policy -- the Policy surface
  is the only binder); the TRD-32 v2 `ObjectKind` registry is the taxonomy (mock headings are
  layout guidance); people groups are IdAM/Users-owned, referenced by `GroupRef` name only; an
  object = a named v2 `ObjectRef` with read-time member resolution; `Selector::Cidr` makes
  IP-address objects first-class (no CIDR form existed -- the operator's directive).
- **Cross-repo prerequisite:** the crdb substrate (`crdb IP-CONSOLE-OBJECT-SUBSTRATE`, OB.1-OB.N,
  authored the same date). Engine-first: OB.1-OB.3 unblock O10.1/O10.2; OB.4 unblocks O10.3.
- **crdb SUBSTRATE COMPLETE (OB.1-OB.N + OB.5 DataStore, crdb main `51efb8e8`).** FC **O10.1 LANDED
  2026-07-22:** schema revendored + codegen'd (all object DTOs incl. DataStore); `objects.ts`
  view models + fail-closed projections; `objects.*` bindings LIVE (governingPolicies PENDING ->
  Policy epic). Declarative/honest-empty member contract encoded.
- **O10.2 LANDED (2026-07-22):** the catalog surface end to end. Wire: `ObjectList`/`ObjectDetail`
  ride the QuerySubmit opcode w/ CBOR encoders; reply parsers + client methods + delegated
  `OperatorEngine` actions. BFF: `engine/objects.ts` (whole-catalog fail-closed collapse ->
  `ObjectsUnavailableError` -> 503; declarative honest-empty detail) + `GET /api/objects`(+`/detail`).
  SPA: `ObjectsSurface` replaces the `objects` placeholder -- the catalog grouped by ObjectKind in
  registry order (the prototype's kind sections), search + kind filter narrowing the COMPLETE bounded
  catalog, the typed selector on each card (`CIDR 10.8.0.0/16`), lifecycle badge; NO posture control
  anywhere. 5 BFF resolver tests; full gate + local Playwright (20) green.
- **Next action:** **O10.3** -- Create/Edit/Delete: `OBJECT_CREATE/EDIT/DELETE` codecs + delegated
  actions + POST routes (typed 409/400/403), the Create Object form w/ kind select + kind-appropriate
  selector input (CIDR for Network, path glob for Script/DataStore, group name for Group, exact for
  Server/Service), delete confirm; NO apply/enforce control (structurally tested). Then O10.4 drawer
  (read-time members) -> O10.N capstone + box redeploy.

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| `Selector::Cidr` + TRD-32 v2 grammar amendment | PLANNED | -- |
| `NamedObjectRecord` + keyspace + audited store | PLANNED | -- |
| `OBJECT_LIST`/`OBJECT_DETAIL` read verbs + schema regen | PLANNED | -- |
| `OBJECT_CREATE/EDIT/DELETE` audited commands | PLANNED | -- |
| in-process capstone | PLANNED | -- |

## Roster (Console PRs)

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| O10.1 | `INV-CONSOLE-OBJECTS-CONTRACT` | LANDED | `85dd550` | schema revendored (OB.1-OB.5 DTOs codegen'd); `objects.ts` view models (ObjectCard/ObjectDetailView/ObjectDraft) + fail-closed projections (whole-catalog collapse; declarative honest-empty members); DataStore kind + label; 3 live reads (governingPolicies PENDING) + 3 live commands registered; 14 tier-1 tests incl. no-posture structural assertion |
| O10.2 | `INV-CONSOLE-OBJECTS-CATALOG` | LANDED | `4903657` | wire codecs (ObjectList/ObjectDetail) + delegated engine actions; `engine/objects.ts` resolvers (whole-catalog fail-closed collapse; declarative honest-empty detail) + `GET /api/objects`(+`/detail`); the `objects` surface = kind-grouped card grid (registry order, matching the prototype sections) w/ search + kind filter, typed selector rendered per card, NO posture control; `objects` destination replaces its placeholder. 5 BFF resolver tests + suites green |
| O10.3 | `INV-CONSOLE-OBJECTS-COMMAND` | PLANNED | -- | after OB.4; kind-appropriate selector inputs |
| O10.4 | `INV-CONSOLE-3-CLICKS` | PLANNED | -- | drawer + read-time members; policies panel PENDING (CONSOLE-05) |
| O10.N | `INV-CONSOLE-OBJECTS-COMPLETE` | PLANNED | -- | Playwright capstone + no-apply structural sweep + box redeploy |
