# IP-CONSOLE-10-OBJECTS -- the noun catalog (policy sources and destinations)

The implementation plan for `TRD-CONSOLE-10` (Objects): the catalog of the tenant's **named
objects** -- the reusable sources and destinations the Policy surface (`TRD-CONSOLE-05`) binds.
Engine substrate is the crdb named-object registry (`crdb IP-CONSOLE-OBJECT-SUBSTRATE`, authored
the same date, engine-first). Mock target: the `/objects` prototype screen (2026-07-21) -- layout
guidance only; the taxonomy and semantics follow the amended TRD.

**Named invariant:** `INV-CONSOLE-OBJECTS-NOUN-ONLY` -- every card is a real engine
`NamedObjectRecord` (a TRD-32 v2 `ObjectRef` + catalog identity); the surface offers NO
apply/enforce/posture control of any kind (the operator ruling: an object never applies policy;
the Policy surface is the only binder); members shown are the engine's READ-TIME selector
resolution, never a stored or fabricated list; grouping is by the shared `ObjectKind` registry,
never an ad-hoc heading.

## Operator rulings baked in (2026-07-21)

1. **Noun-only surface.** No policy is composed, bound, applied, or pushed here -- the same
   surface-placement rule that moved distribution off the VTZ surface. The drawer's "governing
   policies" panel ships `PENDING` naming `TRD-CONSOLE-05`.
2. **The v2 registry is the taxonomy.** Sections = `ObjectKind` tags (Server, Application,
   Service, Network, Uri, RegistryKey, Certificate, Script, Group, ...); the mock's headings are
   layout guidance. People groups: a `Group` object is a `GroupRef` NAME only -- membership comes
   from IdAM / the Users surface and is resolved + signed at 1Source (R-FRG-87), never here.
3. **IP-address objects are first-class**: `Network` + the new `Selector::Cidr` (crdb OB.1).

## Prerequisites

- **crdb OB.1-OB.3 landed** (types + store + read verbs + schema regen) before O10.1's codegen;
  OB.4 before O10.3's commands. Until each lands, the binding ships `PENDING`, never a stub.
- Phase 0 + the entity drawer (landed); the Users surface established the exact patterns this
  surface reuses (wire codecs, delegated engine actions, typed-refusal command routes, DataTable/
  card grid, capstone).

## INV-CROSS -- the bindings and their backend

| Binding | Real when | Backend |
|---------|-----------|---------|
| `objects.list` | OB.3 | `OBJECT_LIST` (bounded catalog, kind-grouped client-side) |
| `objects.detail(id)` | OB.3 | `OBJECT_DETAIL` (record + read-time resolved members) |
| `objects.create` / `objects.edit` / `objects.delete` | OB.4 | `OBJECT_CREATE/EDIT/DELETE`, audited, confirm-gated; duplicate -> 409, malformed selector -> 400 |
| the drawer's governing-policies panel | `PENDING` | `TRD-CONSOLE-05` (the Policy epic; named, non-live) |
| observed-object suggestions | `PENDING` | a later LEG enrichment (named in the crdb plan) |

## Roster

One PR per row; a named slice of `INV-CONSOLE-OBJECTS-NOUN-ONLY`, full `scripts/ci.sh` green +
the full local Playwright suite before every push, branch-per-PR, no-ff merge, docs separate,
reviewed before the next.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **O10.1** | `INV-CONSOLE-OBJECTS-CONTRACT` | The contract. Schema re-vendor + codegen (OB.3 DTOs); `@forge/contracts` `objects.ts`: the `ObjectCard` view model (name, kind tag, selector rendered read-only in its typed form, attributes, description, classification tags, lifecycle) + `ObjectDraft` (the Create form shape) + fail-closed projections (an unknown kind/selector/attribute tag collapses the catalog, never a guessed object); bindings registered (OB.4-gated ones `PENDING` until it lands). `test:contract`. No UI. |
| **O10.2** | `INV-CONSOLE-OBJECTS-CATALOG` | The catalog read. Wire codecs + delegated engine actions for the two reads; BFF resolver + `GET /api/objects` (+ `/api/objects/detail`); the surface: the card grid grouped by `ObjectKind` section (registry order), search + kind filter narrowing the COMPLETE bounded catalog, honest loading/error/empty states. The `objects` destination replaces its placeholder. |
| **O10.3** | `INV-CONSOLE-OBJECTS-COMMAND` | Create/edit/delete. The Create Object form: kind select (the registry), name, the kind-appropriate selector input (CIDR for Network, glob/path for Script/RegistryKey/Uri, exact for Server/Application/Service, group NAME for Group -- with the "membership comes from IdAM/Users" note), description, classification tags. Audited commands via the UY.3/UY.6 pattern (typed 409/400/403); delete behind a critical ConfirmDialog; success refetches (the card is the ENGINE's record). NO apply/enforce control exists anywhere (structurally tested). |
| **O10.4** | `INV-CONSOLE-3-CLICKS` | Drawer + members. A card opens the entity drawer for the object: identity + the selector + the READ-TIME resolved members (`OBJECT_DETAIL`); the governing-policies panel `PENDING` naming `TRD-CONSOLE-05`; the Overview destination-class -> objects scoping path recorded (wired when Overview gains the join). |
| **O10.N** | `INV-CONSOLE-OBJECTS-COMPLETE` | The Playwright capstone: the kind-grouped catalog over the mocked BFF; search + filter; Create Object (a `Network`+CIDR IP object) posts the typed draft and appears as the engine's card; a malformed CIDR reads back the 400; delete confirm; the drawer's members are the detail read's; NO apply/enforce/posture control exists (a structural sweep); the empty tenant is honest. Acceptance sweep against `TRD-CONSOLE-10` Section 6 in the ledger. Live leg: the box redeploy + operator confirm (the Users precedent). |

## Sequencing note

Engine-first: crdb OB.1 -> OB.3 unblock O10.1/O10.2; OB.4 unblocks O10.3. The FC steps then land
in roster order. The Policy surface (`TRD-CONSOLE-05`) is the NEXT epic after this one and
consumes the catalog (subject -> verb -> object pickers over real nouns) -- Objects-before-Policy
is exactly the Phase-3 "nouns before the policy that binds them" sequencing.
