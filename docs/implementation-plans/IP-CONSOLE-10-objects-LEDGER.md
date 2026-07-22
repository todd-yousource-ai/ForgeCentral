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
- **Next action:** **O10.2** -- the catalog read + kind-grouped card grid (wire codecs + delegated
  engine actions for the two reads, `GET /api/objects` + `/api/objects/detail`, the surface grouped
  by ObjectKind with search + kind filter). Then O10.3 commands -> O10.4 drawer -> O10.N capstone.

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
| O10.2 | `INV-CONSOLE-OBJECTS-CATALOG` | PLANNED | -- | kind-grouped card grid |
| O10.3 | `INV-CONSOLE-OBJECTS-COMMAND` | PLANNED | -- | after OB.4; kind-appropriate selector inputs |
| O10.4 | `INV-CONSOLE-3-CLICKS` | PLANNED | -- | drawer + read-time members; policies panel PENDING (CONSOLE-05) |
| O10.N | `INV-CONSOLE-OBJECTS-COMPLETE` | PLANNED | -- | Playwright capstone + no-apply structural sweep + box redeploy |
