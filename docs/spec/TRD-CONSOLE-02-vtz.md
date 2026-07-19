# TRD-CONSOLE-02 -- Virtual Trust Zones (VTZ)

**Status:** DRAFT (authored 2026-07-07). **AMENDED 2026-07-19 (`IP-CONSOLE-02` V2.6): Trust Score is
struck from this TRD.** Inherits `TRD-CONSOLE-00`. The VTZ surface is the operator view of the Forge
Virtual Trust Zone model (TRD-32 v2). VTZs are the middle column of the Overview graph (the zones traffic
flows through, colored by their risk band) and the grouping axis of Policies. This surface manages them.

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

Let the operator see and steer the platform's trust zones: their hierarchy, each zone's default posture
and effective (inherited) posture, its members, its boundary, and its decision-driven risk band -- and create,
re-scope, or adjust a zone safely. VTZs are the policy and containment boundary; this surface is where
that boundary is defined.

## 2. Model (TRD-32 v2)

- **Hierarchical zones with most-restrictive-wins inheritance.** Zones nest (e.g. `YouSource` ->
  `YouSource.AIAgents` -> `YouSource.AIAgents.Dev`); a child's effective posture is the most restrictive
  of its own and every ancestor's (TRD-32 v2 inheritance). The surface shows both a zone's *own* default
  posture and its *effective* posture after inheritance.
- **Per-domain default posture + risk-derived rules + a read-only catastrophic floor.** Each zone
  carries a default posture (from the `Permit < Monitor < Quarantine < Deny` lattice), risk-derived rule
  overlays, and the non-negotiable read-only floor for catastrophic domains (TRD-32 v2). The surface
  renders all three and never lets an edit drop below the floor.
- **Members + boundary.** A zone's members (the principals/objects it contains) and its boundary (what
  traffic it admits); membership is launch-independent (the cgroup/identity-derived membership Torch
  attributes, not a launch-path guess).
- **Risk band (replaces Trust Score).** The zone's health signal is the decision-LOG risk band -- `red`
  if any recent decision recommends `escalate`, else `yellow` if any recommends `candidate`, else `green`
  -- joined from the Overview connectivity read by zone id. It is derived from real detections, not a
  computed score, and a zone no decision has touched carries **no band at all** rather than a reassuring
  default. There is no numeric trust value on this surface (see the amendment above).

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `vtz.tree`** -> the zone hierarchy with each zone's own + effective per-domain posture,
  archetype, lifecycle, and real sub-zone count, from the crdb VTZ system of record. Rendered as an
  explorable grid/tree. The per-zone risk band is a JOIN over the already-live `overview.graph` read
  (`vtz.riskBand`), not a field of this binding and not a new engine op. Member counts are `PENDING`:
  crdb has no zone-membership substrate (`VtzSetMembership` deferred, `TRD-CONSOLE-12`), so the card
  renders their honest absence rather than a number.
- **Read binding `vtz.detail(id)`** -> a zone's full definition: posture (own + effective + the
  contributing ancestors), risk rules, boundary, members (paged), and its policies (link to
  `TRD-CONSOLE-05`) and recent decisions (the LOG filtered to the zone).
- **Command bindings** (real Forge operations, confirm-gated, audited):
  - `vtz.create` / `vtz.edit` -> create or re-scope a zone (name, parent, default posture, boundary,
    risk rules). Validated so an edit cannot violate the catastrophic floor or produce an inheritance
    contradiction; the engine is authoritative.
  - `vtz.setMembership(ref, zoneId)` -> move an entity's zone assignment (the same operation the drawer's
    "Modify VTZ assignment" invokes, `TRD-CONSOLE-12`).
- `PENDING` / `INV-CROSS`: where a VTZ management operation is not yet a first-class Forge/engine command
  (TRD-32 v2 is the design; some management surfaces may be planned), the binding is `PENDING` and the
  implementing IP names the Forge work; the Console never fakes a zone or an edit.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- The zone tree expands in place; click a zone -> its detail (posture, members, boundary, policies).
- **Re-scope a zone:** VTZ (1) -> a zone (2) -> edit boundary/posture + save (3, confirm-gated with the
  effective-posture diff shown).
- **See a zone's effective posture and why:** a zone (1) -> the posture panel shows own vs effective +
  the contributing ancestor (2).
- **Reach a zone from the graph:** clicking a VTZ ring on Overview lands here at that zone (still within
  budget).

The zone editor shows the **effective-posture preview** as the operator edits (most-restrictive-wins
recomputed live) so the consequence of an edit is visible before save; the floor is enforced in the form
and re-enforced by the engine.

## 5. Performance, states

`vtz.tree` is one bounded read; details load on expand; the effective-posture preview is computed client-
side for feedback but the engine re-validates on save. Loading skeletons; empty (a fresh platform with
only a root zone); unauthorized zones absent per tier; an edit that would violate the floor or an
inheritance rule is blocked in-form and, if forced, refused by the engine with the typed error.

## 6. Acceptance and failure semantics

**Acceptance:**
- The zone tree, postures (own + effective), and sub-zone counts derive from the real crdb VTZ system of
  record; no fabricated zone, posture, or count (contract test + a fixtureless render showing only the
  seeded root zone).
- **No trust score is shown anywhere.** The only zone-health signal is the posture badge plus the
  decision-LOG risk band, absent by design when no decision drives it.
- Most-restrictive-wins inheritance is shown correctly (a child never displays a laxer effective posture
  than an ancestor's floor); the catastrophic read-only floor cannot be edited away.
- Create/edit/re-scope commit through the engine with audit; confirm-gated; the effective-posture diff is
  shown before save.
- Clicking a VTZ ring on Overview lands on that zone.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- an edit violating the floor/inheritance is
refused with the typed error; engine-unreachable shows a typed state; a `PENDING` management action is a
labelled non-live control.

## 7. Six-bug-category notes

Cross-module gap: zone + posture view models typed in `@forge/contracts` against the TRD-32 v2 shape.
Missing failure path: floor-violation, inheritance-contradiction, unauthorized, `PENDING` are tested.
Schema bypass: the editor emits the typed zone definition. Dead code: every zone action maps to a real
(or explicitly `PENDING`) Forge command.
