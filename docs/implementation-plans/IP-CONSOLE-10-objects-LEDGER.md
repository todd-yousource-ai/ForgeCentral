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
- **O10.3 LANDED (2026-07-22):** the command surface. Wire: `ObjectCreate/Edit/Delete` codecs (spec
  optionals omitted). BFF: three delegated actions + resolvers + the POST route family
  (`/api/objects` create, `/edit`, `/delete`) w/ typed refusal mapping + fail-closed draft parse.
  SPA: "+ Create Object" -> the Create/Edit form (name/kind/selector/value/description -- NO posture
  field); the KIND drives the selector input (Network->CIDR, Group->group name, Script/DataStore->
  path glob, Server/Service->exact/glob) w/ per-kind hints; per-card Edit + Delete behind a critical
  ConfirmDialog ("changes no enforcement; re-author on the Policy tab"). Success refetches. 2 command
  resolver tests; full gate + local Playwright (20) green.
- **O10.4 LANDED (2026-07-22):** the drawer. `resolveEntityDetail` gained an `object` branch (the
  route already built the ref) over `objects.detail`: header (name + kind label), info (selector,
  lifecycle, tags, and each read-time member as a tag -- empty when nothing matches, declarative),
  governing-policies section PENDING (Policy epic), and zones/capabilities/decisions not-applicable
  (an object is a noun). The card name is a drawer-opening button (hover prefetch). 3-click: card ->
  drawer (1). 2 drawer tests; full gate + local Playwright (20) green.
- **Next action:** **O10.N** -- the Playwright capstone (kind-grouped catalog over a mocked BFF;
  Create a Network+CIDR + a DataStore; malformed-selector 400; edit; delete confirm; the card ->
  drawer with read-time members; a structural no-apply/no-posture sweep; the empty tenant honest)
  + acceptance sweep + the box redeploy so the live node serves the whole Objects surface.

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
| O10.3 | `INV-CONSOLE-OBJECTS-COMMAND` | LANDED | `8f5f95e` | the three OBJECT commands end to end (codecs + delegated actions + POST routes w/ typed 409/400/403 + fail-closed draft parse); Create/Edit Object form w/ kind select -> kind-appropriate selector input (Network->CIDR, Group->group name, Script/DataStore->path glob, Server/Service->exact/glob) + per-card Edit + Delete-behind-critical-ConfirmDialog; NO apply/enforce control anywhere; success refetches (the card is the engine record). 2 command resolver tests |
| O10.4 | `INV-CONSOLE-3-CLICKS` | LANDED | `15d41ff` | a card's name opens the entity drawer for the object (`resolveEntityDetail` gained an object branch over `objects.detail`): header = name + kind label; info = selector + lifecycle + tags + the READ-TIME resolved members (each a tag); governing-policies (effectivePolicies) PENDING naming CONSOLE-05; zones/capabilities/decisions not-applicable (a noun); hover prefetch. 2 drawer tests |
| O10.N | `INV-CONSOLE-OBJECTS-COMPLETE` | PLANNED | -- | Playwright capstone + no-apply structural sweep + box redeploy |
