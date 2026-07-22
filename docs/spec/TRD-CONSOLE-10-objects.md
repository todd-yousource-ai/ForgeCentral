# TRD-CONSOLE-10 -- Objects (protected resources)

**Status:** DRAFT (authored 2026-07-07; amended 2026-07-21). Inherits `TRD-CONSOLE-00`. The Objects
surface manages the **resources** the platform protects -- the objects policies grant or deny access
to, and the destination side of the Overview graph. Mock target: `shot-11`.

**Amendment 2026-07-21 (operator rulings).**
1. **Objects never apply policy.** An object is a NOUN -- a reusable source or destination a policy
   references -- and this surface is the noun catalog only. Policy is composed, bound, and pushed
   exclusively from the Policy surface (`TRD-CONSOLE-05`); no apply/enforce/posture control exists
   here (the same surface-placement rule as the VTZ distribution ruling).
2. **The taxonomy is the TRD-32 v2 object registry, not the mock's section headings.** Objects group
   by the shared `ObjectKind` registry (`cdb-types::forge_v2`: User, Group, Agent, Service, Server,
   Application, Uri, Network, RegistryKey, Certificate, Script, Kernel(...)); the Section 2 mock
   table is layout guidance only. People groups are NOT catalog-owned: group membership arrives from
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
   list is honest-empty until that substrate lands -- the object still governs policy meanwhile.

---

## 1. Purpose

Let the operator see and curate every protected resource -- grouped by type -- and understand which
policies govern it and which principals reach it. Objects are the second half of the access contract
(subject -> object); this surface defines the object side.

## 2. Model

Objects are grouped by **type** (matching the mock), each type mapping to the platform's object taxonomy
(TRD-32 v2 object + kernel taxonomy, and the Overview destination classes):

| Type group | Examples (mock) | Maps to |
|------------|-----------------|---------|
| Group | Clinicians, Nurses, Admins, Windows Workstations, MacOS Laptops, Medical Devices | resource groups / device classes |
| Application | EHR System, Patient Portal | application resources |
| Service | Finance DB, HR DB, Web Services | service/data-store resources (Overview "Data Stores"/"SaaS Apps") |
| Server | Production Servers, Development Servers | server resources (Overview "Servers") |
| Network | VPN Gateway | network resources |
| Registry Key | `HKLM\Software\Corp`, `HKCU\Control Panel` | the TRD-32 `RegistryKey` object type |
| Certificate | SSL Certificate, Code Signing Cert | certificate resources |
| Script | `backup-script.ps1`, `deploy.sh`, `health-check.py` | script/executable resources (the TRD-32 `FilePath` family) |

Each object is a card with name + description + type; Create Object + search + filter.

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `objects.list`** -> a CrucibleQL query over the resource/object registry grouped by
  type, server-paged, tier-redacted.
- **Read binding `objects.detail(id)`** -> an object's full record, the **governing policies** (the
  policies whose scope targets it, resolved via TRD-04), and the principals/zones that reach it (the LOG
  filtered to the object). Clicking an object opens the entity drawer (`TRD-CONSOLE-12`) for an object.
- **Command bindings** (real, audited, confirm-gated where they change protection):
  - `objects.create` / `objects.edit` -> register/edit a protected resource (type, identity, tags,
    classification).
- `PENDING` / `INV-CROSS`: where the object registry does not yet expose a management operation the
  surface needs, the binding is `PENDING` and the implementing IP names the Crucible/Forge work.

An object's classification/tags (PHI, PII, ...) are the engine's, and they drive policy restrictions and
redaction; the Console displays and edits the registration, the engine enforces the classification.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Click an object -> the drawer (its governing policies, who reaches it, recent decisions on it).
- **See which policies protect an object:** an object (1) -> governing policies in the drawer (2) -> a
  policy (`TRD-CONSOLE-05`).
- **Register an object:** Create Object (1) -> form (2) -> save (3).
- From Overview: clicking a destination class node scopes to those objects.

## 5. Performance, states

Server-paged card grid grouped by type; detail loads on open. Loading skeletons; empty ("no objects of
this type"); unauthorized objects absent per tier; a create/edit shows optimistic-pending then engine-
confirmed.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every object + its type/classification derives from a real engine resource record; no fabricated object
  (contract test + fixtureless render).
- The governing-policies panel is the engine's real policy resolution for that object.
- Create/edit commits through the engine with audit and is confirm-gated; classification is the engine's.
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- unauthorized create/edit refused with the
typed error; engine-unreachable shows a typed state; a `PENDING` action is a labelled non-live control.

## 7. Six-bug-category notes

Cross-module gap: object view models typed in `@forge/contracts` against the resource/object DTO. Schema
bypass: the create/edit form emits the typed object shape. Missing failure path: unauthorized, empty,
`PENDING` tested. Dead code: every action maps to a real (or `PENDING`) command binding.
