# TRD-CONSOLE-02 -- Virtual Trust Zones (VTZ)

**Status:** DRAFT (authored 2026-07-07). **AMENDED 2026-07-19 (`IP-CONSOLE-02` V2.6): Trust Score is
struck from this TRD.** **AMENDED 2026-09-25 (`IP-CONSOLE-11-guide` GD.4): refreshed to the built
surface against the configuration census. A VTZ is the policy edge: this surface authors a zone's
identity, nesting and operational settings, and authors no posture. Posture authoring, members, boundary
and risk rules are recorded as known gaps (Section 8), not removed.** Inherits `TRD-CONSOLE-00`. The VTZ
surface is the operator view of the Forge Virtual Trust Zone model (TRD-32 v2). VTZs are the middle
column of the Overview graph (the zones traffic flows through, colored by their risk band) and the
grouping axis of Policies. This surface manages them.

> **AMENDMENT (2026-07-19) -- Trust Score is removed from this surface.** This TRD was authored before the
> engine had a VTZ system of record. The one we built (crdb `IP-CONSOLE-VTZ-SUBSTRATE`, VZ.1-VZ.N) carries
> **no score**: `WireVtzTreeNode` has no score field, and there is no computed per-zone trust value
> anywhere in the engine. A zone's health is therefore its **posture** (own + effective, per domain) plus
> the **decision-LOG risk band** (green / yellow / red) joined from the Overview substrate by zone id --
> absent by design when no decision drives it, never a defaulted value. This mirrors the same removal made
> in the entity drawer (`IP-CONSOLE-12` DR.1) and the Overview redesign (`IP-CONSOLE-01`). Every clause
> below that referenced a Trust Score has been struck or restated; the `docs/ui-examples/` VTZ mockups
> (15-20) still show the old score rings and are superseded on this point.

---

## 1. Purpose

Let the operator see and manage the platform's trust zones: their hierarchy, each zone's type,
lifecycle and operational settings, and its decision-driven risk band -- and create, move, rename, edit
or delete a zone through audited engine commands. A VTZ is the policy edge: a named target that policies
are authored against on the Policies surface (`TRD-CONSOLE-05`). This surface grants and denies nothing
itself.

## 2. Model (TRD-32 v2)

- **Hierarchical zones with most-restrictive-wins inheritance.** Zones nest by their dotted name (e.g.
  `YouSource` -> `YouSource.AIAgents` -> `YouSource.AIAgents.Dev`); a child's effective posture is the
  most restrictive of its own and every ancestor's (TRD-32 v2 inheritance).
- **Per-domain default posture + a read-only catastrophic floor.** Each zone carries, per object domain
  (eleven domains), a default posture of `deny` or `permit-deny-risky`; a domain the zone does not author
  resolves to `deny` (fail-closed). `governed-egress` and `execution` are the read-only catastrophic
  floor, which the engine refuses to relax; children compose tighten-only. The four-step
  `Permit < Monitor < Quarantine < Deny` lattice is a policy's Action (`TRD-CONSOLE-05`), not a zone
  posture. The zone reads carry own and effective posture per domain with the floor flag; this surface
  does not render or author them (Section 8, item 1).
- **Zone settings.** A zone carries a dotted name (its identity and place in the hierarchy), a
  description (at most 1024 bytes), a type (`standard`, `quarantine`, `isolation`, `public`,
  `observability`) that declares which kind of policy it is meant to receive and grants nothing itself,
  micro-segmentation (on / off), telemetry mode (`full`, `sampled`, `off`), session duration (the
  re-authentication interval, 1 to 24 hours) and a lifecycle (`draft`, `published`).
- **Members + boundary (design intent; not built, Section 8 items 3 and 4).** A zone's members (the
  principals and objects it contains) and its boundary (what traffic it admits); membership is
  launch-independent (the cgroup / identity-derived membership Torch attributes, not a launch-path
  guess).
- **Risk band (replaces Trust Score).** The zone's health signal is the decision-LOG risk band -- `red`
  if any recent decision recommends `escalate`, else `yellow` if any recommends `candidate`, else `green`
  -- joined from the Overview connectivity read by zone id. It is derived from real detections, not a
  computed score, and a zone no decision has touched carries **no band at all** rather than a reassuring
  default. There is no numeric trust value on this surface (see the amendment above).

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `vtz.tree`** -> the zone hierarchy with each zone's own + effective per-domain posture,
  archetype, lifecycle, and real sub-zone count, from the crdb VTZ system of record. Rendered as a flat
  card grid with client-side name search and two KPI tiles (Total VTZs; High-sensitivity zones = zones
  whose effective posture denies a non-floor domain). The BFF bounds the read (default 200, maximum 500)
  and withholds the whole tree, fail-closed, if any zone carries a tag the Console does not know. The
  per-zone risk band is a JOIN over the already-live `overview.graph` read (`vtz.riskBand`), not a field
  of this binding and not a new engine op. Member counts are `PENDING` (no zone-membership substrate);
  the per-zone policy count is `PENDING` (derivable from `POLICY_LIST_BY_ZONE`, not wired).
- **Read binding `vtz.detail(id)`** -> one zone's tree node plus its contributing ancestors and the store
  commit version; it feeds the Configure editor. It carries no risk rules, boundary, members, policies,
  decisions or stored description (Section 8, item 5).
- **Command bindings** (real engine operations, confirm-gated, audited, operator-attributed; authz label
  `operator:vtz.author`):
  - `vtz.create` / `vtz.edit` -> author or replace a zone's settings (Section 2). Edit replaces the whole
    stored record and identifies the zone by its name.
  - `vtz.rescope(id, newName)` -> move or rename a zone. The dotted name is the hierarchy, so a move is a
    rename. Refused while the zone has sub-zones.
  - `vtz.delete(id)` -> tombstone plus audit entry. Refused while the zone has sub-zones.
  - `vtz.setMembership(ref, zoneId)` -> move an entity's zone assignment (the operation the drawer's
    "Modify VTZ assignment" would invoke, `TRD-CONSOLE-12`): `PENDING` (crdb, zone-membership
    substrate).
- `PENDING` / `INV-CROSS`: where a VTZ management operation is not yet a first-class engine command, the
  binding is `PENDING` and names the owning work; the Console never fakes a zone or an edit.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Two tabs: **Active** (the card grid) and **Configure** (the editor). A card, or `?zone=<id>`, opens
  that zone in Configure.
- **Edit a zone:** VTZ (1) -> a zone (2) -> edit + Save changes (3, confirm-gated). Changing the parent
  or the name on Save commits the settings and then the move as two audited writes; the confirm dialog
  names the move.
- **Create:** New zone -> fill in -> Create zone (confirm-gated).
- **Delete:** a zone -> Delete zone (confirm-gated).
- **Reach a zone from the graph:** clicking a VTZ ring on Overview lands here at that zone.

## 5. Performance, states

`vtz.tree` is one bounded read, cached per tenant in the BFF and dropped on any zone write; the detail
loads when a zone is selected. States: loading; empty (no zone for this tenant); partial tree (the engine
ceiling reached); zone no longer exists; typed load failure with retry.

## 6. Acceptance and failure semantics

**Acceptance:**
- The zone grid, lifecycles, types and sub-zone counts derive from the real crdb VTZ system of record; no
  fabricated zone, posture or count (contract test + a fixtureless render shows the empty state).
- **No trust score is shown anywhere.** The only zone-health signal is the decision-LOG risk band,
  absent by design when no decision drives it.
- Create, edit, move and delete commit through the engine with audit, confirm-gated.
- A zone with sub-zones cannot be moved or deleted.
- Clicking a VTZ ring on Overview lands on that zone.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11. Every refusal commits nothing and shows one
typed line: a malformed definition (400); a state conflict -- exists, gone, or has sub-zones (409); a
floor or inheritance violation (403); engine unreachable (502 / 503). No auto-retry. A `PENDING`
management action is a labelled non-live control.

## 7. Six-bug-category notes

Cross-module gap: zone view models typed in `@forge/contracts` against the TRD-32 v2 shape. Missing
failure path: the 400 / 409 / 403 / unreachable refusals, the fail-closed unknown-tag read and `PENDING`
controls are tested (known gap: the move path's UI test stubs every call as a success, census CD-10).
Schema bypass: the editor emits the typed zone definition. Dead code: every zone action maps to a real
(or explicitly `PENDING`) engine command.

## 8. Known gaps (specified, not built)

Recorded from the configuration census (`IP-CONSOLE-11-guide-CENSUS.md`); each stays a requirement until
built or re-decided, and the configuration guide states each one to operators.

1. **Posture display and authoring** (the own / effective matrix, locked floor rows, the contributing
   ancestor): the data is read but not rendered, and the editor sends no posture (census VTZ-11, CD-44).
2. **Effective-posture live preview and the diff before save:** removed 2026-07-19 with posture
   authoring (VTZ-05, VTZ-07).
3. **Members and `vtz.setMembership`**, including the drawer's "Modify VTZ assignment": `PENDING` in
   crdb, no membership substrate (VTZ-09, DRW-04).
4. **Boundary and risk-derived rules** on a zone: no engine field (VTZ-05).
5. **Detail extras** (policies, recent decisions, paged members): not in `WireVtzDetail` (VTZ-04).
6. **Per-zone policy count:** `PENDING`, derivable but not wired; the card's tooltip copy is stale
   (VTZ-10).
7. **A tree that expands in place:** not built; the surface is a flat grid (VTZ-01).
8. **A move or rename always fails:** the settings write is sent under the new name before the move
   (CD-10, S2).
9. **Misleading refusal copy:** an engine refusal of an invalid name is shown as the floor / inheritance
   line (CD-31).
10. **No role or tier check** on `operator:vtz.author` (CD-03, S1).
11. **No cascade** when a zone is deleted or renamed: its policies and stored bundle remain (CD-22).
12. **The Overview's zone grouping is demo data**, so the ring-to-zone path and the risk-band join rest
    on it (CD-19).
13. **The stored description is not returned**, so every Save overwrites it (census VTZ-F4).
14. **Published -> Draft is accepted**, and distribution ignores a zone's lifecycle (census VTZ-F8).
15. **Nothing is known to consume** type, telemetry, micro-segmentation or session duration (census
    K.2, UNVERIFIED).
