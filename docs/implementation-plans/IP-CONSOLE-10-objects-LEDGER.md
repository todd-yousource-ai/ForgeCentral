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
- **Next action:** crdb **OB.1** (the `Selector::Cidr` shared-type + TRD-32 v2 Section 18
  amendment), then the OB roster; FC O10.1 starts after OB.3's schema regen.

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| OB.1 | `Selector::Cidr` + TRD-32 v2 grammar amendment | PLANNED | -- |
| OB.2 | `NamedObjectRecord` + keyspace + audited store | PLANNED | -- |
| OB.3 | `OBJECT_LIST`/`OBJECT_DETAIL` read verbs + schema regen | PLANNED | -- |
| OB.4 | `OBJECT_CREATE/EDIT/DELETE` audited commands | PLANNED | -- |
| OB.N | in-process capstone | PLANNED | -- |

## Roster (Console PRs)

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| O10.1 | `INV-CONSOLE-OBJECTS-CONTRACT` | PLANNED | -- | after OB.3 schema regen |
| O10.2 | `INV-CONSOLE-OBJECTS-CATALOG` | PLANNED | -- | kind-grouped card grid |
| O10.3 | `INV-CONSOLE-OBJECTS-COMMAND` | PLANNED | -- | after OB.4; kind-appropriate selector inputs |
| O10.4 | `INV-CONSOLE-3-CLICKS` | PLANNED | -- | drawer + read-time members; policies panel PENDING (CONSOLE-05) |
| O10.N | `INV-CONSOLE-OBJECTS-COMPLETE` | PLANNED | -- | Playwright capstone + no-apply structural sweep + box redeploy |
