# TRD-CONSOLE-12 -- The entity drawer (shared detail + quick-actions pattern)

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. This TRD specifies the entity
drawer -- the right-side panel that opens when an operator clicks any entity anywhere in the Console
(a graph node, a table row, a decision card, a log line). It is a shared component, not a page; it
lands with `TRD-CONSOLE-01` (Overview) because every surface reuses it. The mock target is `shot-14`.

The drawer is the linchpin of the three-click rule: it turns any entity, from any surface, into a full
governance picture plus the actions to steer it, in one click, with the actions one click deeper.

---

## 1. Purpose

Give the operator, for any entity (a principal -- user, device, service account, or AI agent; a VTZ; or
an object), a single, consistent, drill-in view: who/what it is, its current Trust Score and trend, the
zones and policies that govern it, what it has recently done and how the engine decided, and the levers
to act (isolate, re-scope, remediate, open the full report). One component, one data contract, reused
everywhere so the operator learns it once.

## 2. When it opens, and with what

- **Trigger:** a click on any entity reference in the Console (graph node/flow, table row, decision
  card, log entry, report line). The trigger passes an **entity ref** `{ kind, id }` where `kind` is
  `principal | vtz | object`.
- **One click to open; the data is already there.** On hover of the trigger, the drawer payload is
  prefetched (`TRD-CONSOLE-00` Section 7), so the open is instantaneous and the panel is populated, not
  spinnering. Actions inside the drawer are the operator's second click; a confirm on a destructive
  action is the third (`INV-CONSOLE-3-CLICKS`).
- **Dismiss:** the close control, `Esc`, or clicking outside. The drawer never navigates away from the
  operator's current surface; it overlays it, preserving context.

## 3. The drawer contract (sections, and their real data)

The drawer is `kind`-aware: a principal, a VTZ, and an object each populate the sections that apply and
omit the rest (an object has no Trust trend but has governing policies; a VTZ has members). Every field
is a real read (`INV-CONSOLE-NO-STUB`); reads are CrucibleQL-first (`INV-CONSOLE-CRUCIBLEQL-FIRST`).

### 3.1 Header + Trust Score (principal, VTZ)
- **Identity:** display name + `kind` label (e.g. "Inventory-Bot / Agent").
- **Trust Score** (0-100) + a **trend sparkline** over the recent window. Read binding
  `entity.trustScore(ref)` -> the engine's computed score for the entity + its recent series (the same
  quantity Overview rings and Logs "Trust Delta" show; a real, computed value, not a UI heuristic).

### 3.2 Entity information
Trust State (e.g. `trusted`), Risk Score, Region (residency), Last Seen, and Tags. Read binding
`entity.info(ref)` -> the engine's entity/principal record (TRD-04 Principal model for a principal;
Forge VTZ record for a VTZ; the object registry for an object). Region reflects the residency tag
(TRD-07). Tags expand on click within the drawer (not a new click against the task budget).

### 3.3 Connected VTZs (principal, object)
The zones this entity currently traverses/belongs to. Read binding `entity.zones(ref)` -> the live
membership from the Forge VTZ model (TRD-32 v2) joined against the connectivity LOG. Each is clickable
-> navigates to that zone (`TRD-CONSOLE-02`).

### 3.4 Capabilities (AI agent principal)
For a wrapped agent, its declared/decomposed capabilities (e.g. `Retrieval`). Read binding
`entity.capabilities(ref)` -> **the agent's signed Construction Report** produced by Torch
(`torch-inspect`, the 10-surface decomposition: identity/SBOM/tools/skills/MCP/models/prompts/
capabilities/persistence/risk). This is the "know what the agent is" data; absent for non-agent
entities. `PENDING` note: the Console reads the report Torch already produces at onboard; exposing it on
the read surface may require a Crucible/Torch read binding (`INV-CROSS` -- named in the implementing IP
if the wire field is not yet exposed).

### 3.5 Effective policies (principal, object)
The policies currently in force on this entity, each labelled with its origin (an agent-specific rule
vs inherited from a VTZ). Read binding `entity.effectivePolicies(ref)` -> the engine's policy resolution
for this subject (TRD-04 precedence: explicit Deny > explicit Allow > default Deny), with the resolved
source. Each policy row is clickable -> the policy in `TRD-CONSOLE-05`.

### 3.6 Recent events / decisions
The entity's most recent governed decisions (e.g. "External DB Access -- Denied", "Agent
authentication -- Success", "VTZ boundary check -- Pass", "Trust evaluation -- Pass"), each with its
outcome badge + time. Read binding `entity.recentDecisions(ref)` -> a CrucibleQL query over the LOG /
DecisionObject stream filtered to this entity (the same substrate as `TRD-CONSOLE-09` Logs, row-level).
Each event is clickable -> the decision's full rationale (EXPLAIN) inline or in Logs.

### 3.7 Quick actions
The command bindings -- each a real Crucible/Torch/Forge operation, each authorized engine-side, each
audited, destructive ones confirm-gated (`TRD-CONSOLE-00` Section 9):

| Action | Command binding -> real operation | Notes |
|--------|-----------------------------------|-------|
| **Isolate from network** | `entity.isolate(ref)` -> a Forge/Torch containment action moving the entity to a quarantine posture (the TRD-32 v2 lattice `Quarantine`/`Deny`; Torch containment for a wrapped agent) | Destructive: confirm-gated, shows the exact effect; the third click. `PENDING` where the live containment command is not yet exposed (`INV-CROSS`). |
| **Modify VTZ assignment** | `entity.reassignZone(ref, zoneId)` -> a Forge VTZ membership change | Confirm-gated; re-scopes the entity's boundary. |
| **View Remediation** | `entity.remediation(ref)` -> the remediation workflow/guidance for the entity's current risk (AIOps Workflows, `TRD-CONSOLE-07`) | Navigates to the remediation surface. |
| **Open full report** | `entity.fullReport(ref)` -> the entity's full report view (`TRD-CONSOLE-08`) | Navigation, not a mutation. |

A quick action with no real backing operation is not rendered as a live button; if the operation is
planned but not yet built, it is a `PENDING` binding (tracked in the implementing IP), not a dead
control.

## 4. Three-click paths (INV-CONSOLE-3-CLICKS)

The drawer is what makes the budget hold across the whole Console:

| Task | Clicks |
|------|--------|
| See any entity's full governance picture | click entity (1) -> drawer (populated) |
| Isolate an entity | click entity (1) -> Isolate (2) -> confirm (3) |
| Re-scope an entity's VTZ | click entity (1) -> Modify VTZ assignment (2) -> confirm (3) |
| See why a recent decision went as it did | click entity (1) -> a recent event (2) -> EXPLAIN inline |
| Jump to a governing policy | click entity (1) -> an effective policy (2) |

## 5. Performance

The whole drawer payload is one aggregated read (`entity.detail(ref)`, fanning out the section reads
server-side with tolerant parallelism -- a failed section degrades that section, not the drawer), warmed
by hover prefetch so the open is < 100 ms. The Trust sparkline and recent decisions stream if the
entity is actively changing (the drawer subscribes to the entity's decision deltas while open, `LIVE`).

## 6. States

- **Loading (rare, no prefetch hit):** section skeletons; identity/header first.
- **Section-level degradation:** a section whose read failed shows an inline retry, the rest render
  (tolerant parallelism).
- **Empty section:** explicit "none" (e.g. an entity with no recent decisions), never fabricated rows.
- **Unauthorized:** sections/actions above the operator's tier are absent (not disabled placeholders);
  an attempted action beyond tier returns the engine's sanitized refusal (`ENGINE-AUTHZ`).
- **Entity vanished:** if the entity no longer exists at open time, a typed "entity not found" state.

## 7. Acceptance and failure semantics

**Acceptance:**
- Opening the drawer on any entity, from any surface, populates every applicable section from a real
  engine read; no fabricated field (contract test + fixtureless render).
- Trust Score, effective policies, capabilities (for an agent), and recent decisions match the engine's
  values for that entity at that instant.
- Each quick action invokes its real command, is authorized engine-side, commits through the audit
  chain, and (destructive) is confirm-gated with the effect shown; a `PENDING` action is not a live
  button.
- The five canonical tasks in Section 4 complete within budget (interaction/E2E test).

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- engine-unreachable degrades the affected
section (not the whole drawer); an unauthorized action returns the sanitized error; a mutating action is
idempotent (carries the engine command id) so a retried confirm does not double-apply.

## 8. Six-bug-category notes

Cross-module gap: the entity ref + each section's view model are typed in `@forge/contracts`; a drifted
field fails compilation. Parallel execution: the section fan-out uses tolerant parallelism (one failed
section does not fail the drawer). Missing failure path: empty-section, unauthorized, vanished-entity,
and each action's denial path are tested. Schema bypass: capabilities come from the typed Construction
Report shape, never an ad-hoc parse.
