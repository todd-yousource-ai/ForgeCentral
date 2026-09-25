# TRD-CONSOLE-10 -- Objects (protected resources)

**Status:** DRAFT (authored 2026-07-07; amended 2026-07-21). **AMENDED 2026-09-25 (`IP-CONSOLE-11-guide`
GD.5): refreshed to the built surface against the configuration census. Governing policies, reach,
recent decisions, confirm on create / edit, and tag, lifecycle and classification authoring are recorded
as known gaps (Section 8), not removed.** Inherits `TRD-CONSOLE-00`. The Objects
surface manages the **resources** the platform protects -- the objects policies grant or deny access
to, and the destination side of the Overview graph. Mock target: `shot-11`.

**Amendment 2026-07-21 (operator rulings).**
1. **Objects never apply policy.** An object is a NOUN -- a reusable source or destination a policy
   references -- and this surface is the noun catalog only. Policy is composed, bound, and pushed
   exclusively from the Policy surface (`TRD-CONSOLE-05`); no apply/enforce/posture control exists
   here (the same surface-placement rule as the VTZ distribution ruling).
2. **The taxonomy is the TRD-32 v2 object registry, not the mock's section headings.** Objects group
   by the shared `ObjectKind` registry (`cdb-types::forge_v2`: User, Group, Agent, Service, Server,
   Application, Uri, Network, RegistryKey, Certificate, Script, DataStore); `Kernel` objects are not
   operator-authored: the engine refuses the tag on create and the catalog never shows one. People groups are NOT catalog-owned: group membership arrives from
   IdAM (and the Users surface's local records), and a policy references a group via the v2
   `GroupRef` selector resolved and signed at 1Source (R-FRG-87) -- the endpoint never queries a
   directory, and the Objects catalog never duplicates membership.
3. **An object IS a named v2 `ObjectRef`.** The engine record is the TRD-32 v2 Section 18 grammar
   `ObjectRef = { ObjectKind, Selector, [attributes] }` plus catalog identity (name, description,
   classification tags). Members are resolved from the selector at read time, never stored.
   **`Selector` gains a `Cidr` form** (TRD-32 v2 amendment, same date) so real IP-address/subnet
   objects are expressible (`Network` + `Cidr(10.8.0.0/16)`); a glob over IP strings is not a
   subnet match.
4. **Objects are DECLARATIVE -- no active LEG entity is required to register one** (clarification
   2026-07-22). Creating an object is authoring intent, not observing presence: the engine performs
   no entity lookup on create, so `Server: prod-*`, a data store, or `Network: 10.8.0.0/16` can be
   catalogued before anything by that name is ever seen. `objects.detail` resolves the selector
   against whatever is observed AT READ TIME and returns an honest empty member list until a match
   exists -- the object is the declared noun, resolution is the current reality.
5. **Storage is `DataStore`, not `Uri`** (amendment 2026-07-22). Data at rest -- a database, bucket,
   file share, or file/folder path -- is the `DataStore` kind (the policy peer of the Overview
   `data-stores` class), NOT `Uri` (a network endpoint you connect to). File vs folder is selector
   granularity: an `Exact` path is a file, a path `Glob` (`/data/phi/**`) a folder tree, an `Exact`
   locator a bucket/share/DB. Live member resolution for `DataStore` is a named deferral (storage
   entities are reached by read/write observation, not the network connectivity scan), so its member
   list is honest-empty until that substrate lands -- the object still governs policy meanwhile. The
   same honest-empty holds for `Application`, `Certificate` and `Script`, which have no observed entity
   source yet.

---

## 1. Purpose

Let the operator see and curate the tenant's catalog of named objects -- the reusable nouns a policy
names as a source or destination -- grouped by kind, and see what each object's selector matches right
now. Objects are the second half of the access contract (subject -> object); this surface defines the
object side and grants or denies nothing itself. Which policies govern an object and who reaches it are
known gaps (Section 8).

## 2. Model

| Kind | Selector forms | Members resolved from |
|---|---|---|
| User, Agent, Service, Server, URI, Registry Key | exact, glob | observed connectivity entities of the mapped kind |
| Network | cidr, exact, glob | observed network destinations (the address half matched by real CIDR arithmetic) |
| Group | group_ref (a group name) | the local user directory's principals carrying that group |
| Application, Certificate, Script, Data Store | exact, glob | none yet (honest empty) |

A selector form that does not fit its kind is refused by the engine (`cidr` only on Network; `group_ref`
only on, and required for, Group). Each object is a card: name (opens the drawer), lifecycle badge
(draft / published), selector, description, tags, Edit and Delete. Kinds show in registry order, and a
kind with no objects is hidden. Search (name, value, description, tags) and a Kind filter narrow the
catalog.

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `objects.list`** (LIVE, `object_list_v1`) -> the tenant's complete named-object
  catalog, clearance-filtered and bounded: over the per-tenant result limit the engine refuses rather
  than truncating, so search and the kind filter narrow a complete set client-side. A record with a tag
  the Console cannot narrow withholds the whole catalog (fail-closed). Refused while `query_surface` is
  off.
- **Read binding `objects.detail`** (LIVE, `object_detail_v1`) -> one object's record plus its members
  resolved at read time (at most 500; empty until something matches). Clicking an object opens the
  entity drawer (`TRD-CONSOLE-12`). **Read binding `objects.governingPolicies`** is `PENDING` (Section 8).
- **Command bindings** (LIVE, audited, attributed to the delegated operator; authz label
  `operator:objects.manage`): `objects.create` registers a draft object (name, kind, selector, value,
  description); a duplicate name is refused. `objects.edit` replaces the definition (the name is fixed).
  `objects.delete` tombstones the object (history preserved) behind a confirm. Tags and lifecycle are
  carried on the wire but not authored from the Console (Section 8).

An object's tags are free-text labels (e.g. PHI, PII), displayed and searchable. Every object record is
stored at Internal classification; no engine path reads an object's tags or lifecycle to restrict or
redact (Section 8). A policy rule copies an object's selector when authored, so editing or deleting an
object changes no stored policy.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Click an object's name -> the drawer (selector, lifecycle, tags, attributes, current members).
- **Register an object:** Create Object (1) -> form (2) -> Create Object (3).
- **Edit:** Edit (1) -> form (2) -> Save (3). **Delete:** Delete (1) -> confirm (2).

## 5. Performance, states

The complete catalog loads once and re-reads after every object command (not polled); search and the
kind filter apply immediately. States: loading; a typed load failure with retry; empty ("No objects have
been registered yet.", or "No object matches <filters>."). A command shows "Committing..." and the card
changes only when the engine re-read returns it.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every card derives from a real engine record; no fabricated object (contract test + fixtureless
  render).
- Create, edit and delete commit through the engine with audit; delete is confirm-gated.
- The engine refuses an empty name, a malformed selector and a selector form that does not fit the kind.
- A member list is the engine's resolution at read time, never a stored list.

**Failure semantics:** every refusal commits nothing and shows one typed line: duplicate name (409),
malformed or mismatched selector (400), expired session (401), any other engine refusal (403), engine
unreachable (502 / 503). A `PENDING` read is a labelled non-live section.

## 7. Six-bug-category notes

Cross-module gap: object view models typed in `@forge/contracts` against the object DTO. Schema bypass:
the create / edit form emits the typed object shape. Missing failure path: every command status maps to
its own line (tested). Dead code: every action maps to a real (or `PENDING`) command binding (known gap:
`GET /api/objects/detail` and `fetchObjectDetail` have no caller; the drawer reads through the entity
route).

## 8. Known gaps (specified, not built)

Recorded from the configuration census (`IP-CONSOLE-11-guide-CENSUS.md`); each stays a requirement until
built or re-decided, and the configuration guide states each one to operators.

1. **Governing policies** for an object are `PENDING`, so "which policies protect this object" is not a
   three-click path (OBJ-07).
2. **Who reaches an object, and recent decisions on it**, are not rendered (OBJ-07).
3. **Confirm on create and edit:** neither has a confirm step (OBJ-03, OBJ-04).
4. **Tag and classification authoring:** no input exists; new objects get no tags (OBJ-06, CD-24).
5. **Lifecycle:** every Console object is a draft and no publish action exists, although the engine
   accepts draft -> published on edit (OBJ-06, CD-24).
6. **Classification has no effect:** records are stored at Internal and no engine path reads an object's
   tags or lifecycle (OBJ-06).
7. **Edit clears attributes** carried by the record (OBJ-04, CD-24).
8. **The drawer shows an enrollment date of 1970-01-01 and an "unknown" status** for every object
   (OBJ-07, CD-24).
9. **A failed delete is silent** (OBJ-05, CD-31).
10. **Editing an object deleted meanwhile** reads "An object with that name already exists." (OBJ-04).
11. **Server paging:** the catalog is complete and bounded, so over the limit the whole catalog is
    refused (OBJ-01).
12. **Overview destination class -> scoped objects** is not built.
13. **No role or tier check** on `operator:objects.manage` (CD-03).
14. **Mutations are retried once** after a transport failure with no engine dedupe, so a create can come
    back as a spurious 409 (CD-12).
15. **No cascade:** editing or deleting an object changes no policy; a rule keeps its copied selector
    (CD-22).
16. **Isolate is offered on an object's drawer** (DRW-03, CD-34).
17. **Drafts are offered as policy targets;** nothing enforces "a draft is not policy-referenceable"
    (OBJ-06).
18. **Four kinds never have members:** Application, Certificate, Script and Data Store (CD-48).
19. **Two objects with the same selector value collapse into one** in the policy form's pickers (CD-49).
20. **The pending governing-policies section in the drawer shows an internal plan id** in its reason
    (CD-50).
