# TRD-CONSOLE-07 -- AIOps: the command center

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. AIOps (the mock's "TrustOps
Command", retermed per `TRD-CONSOLE-00` Section 3) is the operational heart of the Console: where the
operator governs autonomous decisions, oversees and corrects the machine, contains threats, replays
history, and simulates change. Mock target: `shot-08`. Tagline: **"Govern autonomous operations. Guide
machine decisions. Observe, correct, evolve."**

AIOps is a tabbed surface over the same decision/audit stream as Logs (`TRD-CONSOLE-09`), lifted from a
row-level record into an operational command center. It shares that stream plumbing.

---

## 1. Purpose

One surface to run the autonomous platform: see the reflex actions the system is taking, review what it
escalates to a human, work incidents, watch the live decision stream, oversee governed agents, contain
threats, drive remediation workflows, replay any window of history, and simulate a change before making
it. Every panel is real engine state; every action is a real, authorized, audited command.

## 2. Tabs (same-surface, do not spend the entity click budget)

`Reflex` · `Operator Oversight` · `Incidents` · `Decision Stream` · `AI Governance` · `Containment` ·
`Workflows` · `Rewind` · `Simulations`. A time-range control scopes the time-scoped tabs; live tabs
stream (`LIVE`).

### 2.1 Reflex
The automated detection-to-response the platform is performing: the live feed of reflex actions and the
posture that drove each (Auto Isolate, Re-Auth, Block, Limit Scope, Allow-With-Monitor -- the TRD-32 v2
action lattice `Permit < Monitor < Quarantine < Deny` plus attested re-auth). Read binding
`aiops.reflex` -> a CrucibleQL query over the DecisionObject stream for decisions that triggered an
automated action, with the acting entity, category, and the posture/rationale. Each entry -> the drawer
or EXPLAIN. This is the "system acting on its own" view; it is observe-and-understand, and any operator
override is a confirm-gated command.

### 2.2 Operator Oversight
The human-in-the-loop queue: decisions/actions the engine escalated for operator review or approval
(AI Quality Guide Section 13, the authorization matrix -- irreversible/high-risk actions await a human).
Read binding `aiops.oversightQueue` -> the escalated-and-pending decisions. Command bindings
`aiops.approve(id)` / `aiops.reject(id)` -> the real approve/reject engine operation, authorized,
audited, confirm-gated. `PENDING` (`INV-CROSS`): if the escalation/approval workflow is not yet a first-
class engine surface, the implementing IP names the Crucible/Torch/Forge work to expose it.

### 2.3 Incidents
High-severity detections grouped into incidents (correlated by entity/tactic/time), with severity, the
contributing decisions, and status. Read binding `aiops.incidents` -> the escalated DecisionObjects
grouped (the DT.* attributed decisions; escalation is the conservative `Escalate` posture, TRD-04
`INV-FP-DEFAULT`). Command bindings for triage: assign, acknowledge, resolve (audited). An incident -> its
contributing decisions -> the entities. `PENDING` where incident-grouping is not yet an engine primitive
(the Console may group client-side over real decisions as an interim, clearly labelled, never fabricated).

### 2.4 Decision Stream
The live, operational stream of all decisions (the Logs substrate as a running feed, filtered for the
command context). Read/stream bindings reuse `logs.query` / `logs.tail` (`TRD-CONSOLE-09`). Distinct from
Logs by framing (operational monitoring vs forensic search), not by data source.

### 2.5 AI Governance
The governed agents under Torch's govern/observability lane: each wrapped agent, its signed Construction
Report (the 10-surface decomposition), its GCI, and its verified governed-activity stream
(`obs.batch_verified` -- device-signed, hash-chained batches the node verified). Read binding
`aiops.governedAgents` -> the govern-lane state (the agents onboarded + their obs-verify status, AG.6).
An agent -> the drawer (capabilities from its report) + its governed activity. This is the "detect what
the agent is and does" surface; it reads the Torch govern lane, never re-implements it.

### 2.6 Containment
Active containments/quarantines and the control to apply/lift them: entities currently isolated or
scope-limited, and the levers (isolate, quarantine, lift). Read binding `aiops.containments` -> the
current containment state (Forge VTZ quarantine posture / Torch containment). Command bindings
`aiops.contain(ref)` / `aiops.release(ref)` -> the real containment operation, confirm-gated, audited.
`PENDING` / `INV-CROSS`: live kernel-level enforcement (the Torch VTZ-egress / BPF-LSM enforcer, AG.7) is
deliberately OFF at the platform today; until it is engaged, Containment surfaces the observe-and-quarantine
posture actions the engine supports and marks any not-yet-live enforcement action `PENDING` with the
gating Torch/Forge work named. It never presents an enforcement control that does nothing.

### 2.7 Workflows
Remediation and response workflows: definitions and runs (e.g. a remediation playbook for a risk class).
Read binding `aiops.workflows` -> the workflow definitions + run history; command bindings to run/advance
a workflow, audited. `PENDING` / `INV-CROSS`: where a workflow engine is not yet an engine primitive, the
implementing IP names the work; the Console does not fake a run.

### 2.8 Rewind (time-travel replay)
Replay any window of decisions using Crucible time-travel (`AS OF`, TRD-02 Section 5). Matching the mock:
a **timeline scrubber** (e.g. 2 hours ago -> Now) with Play/Reset, **event markers** for anomalies in the
window, and a **decision feed** that shows the decisions as of the scrubbed instant with their scores +
severity (Info/Warning/Critical). Read binding `aiops.rewind(asOf)` -> a CrucibleQL `AS OF <t>` query over
the decision stream; scrubbing re-issues the query at the new instant (bounded, engine-side). This is real
time-travel over real committed history -- not a client animation of cached rows. A replayed decision ->
its EXPLAIN as of that time.

### 2.9 Simulations
What-if / dry-run: evaluate a proposed change (a policy edit, a VTZ boundary change, a trust threshold)
against real history/state before committing it. Read/command binding `aiops.simulate(change)` -> an
engine dry-run (a planned, non-committing evaluation -- the same planner path as a real decision, run in
simulate mode, TRD-03/TRD-05 dry-run semantics), returning the projected effect (what would be permitted/
denied/isolated). `PENDING` / `INV-CROSS`: where a first-class simulate/dry-run surface is not yet exposed
by the engine, the implementing IP names it; the Console never shows a fabricated simulation result.

## 3. Cross-cutting for all tabs

- Every entity reference -> the drawer (`TRD-CONSOLE-12`); every decision -> EXPLAIN.
- Every command (approve, contain, release, run workflow, apply a simulated change) is authorized engine-
  side, audited, and destructive ones are confirm-gated with the effect shown (`TRD-CONSOLE-00` Section 9).
- Reads are CrucibleQL-first over the decision/audit stream; live tabs stream deltas in place.

## 4. Three-click paths (INV-CONSOLE-3-CLICKS)

| Task | Clicks |
|------|--------|
| See why the system auto-isolated an entity | Reflex row (1) -> EXPLAIN (2) |
| Approve a pending escalated action | Oversight item (1) -> Approve (2) -> confirm (3) |
| Replay the last hour and inspect an anomaly | Rewind tab (1) -> scrub (interaction) -> a marker/decision (2) |
| Contain a threatening entity | Containment/entity (1) -> Contain/Isolate (2) -> confirm (3) |
| Simulate a policy change's effect | Simulations (1) -> pick the change (2) -> run (3) |
| Inspect a governed agent's activity | AI Governance (1) -> an agent (2) -> drawer |

(Tabs are same-surface and do not count against the entity budget; the first click above is the in-tab
action, not the tab switch, when arriving from a linked context.)

## 5. Performance

Live tabs stream (Reflex, Decision Stream, Containment, AI Governance) with < 2 s freshness; Rewind
re-queries `AS OF` on scrub (debounced, bounded, < 300 ms per instant on warm data); all lists are
server-paged/virtualized. The decision-stream subscription is shared across the live tabs (one
subscription, fanned to panels), not one per tab.

## 6. States

Per `TRD-CONSOLE-00` Section 9: loading skeletons; explicit empty states per tab (e.g. "no active
containments", "no pending approvals"); stale markers on stream lag with resync-from-engine; unauthorized
tabs/actions absent per tier; and -- distinctively for this surface -- a **`PENDING` capability banner**
on any tab whose live action is gated on engine work not yet landed, naming what is coming (never a dead
control, never a fake result).

## 7. Acceptance and failure semantics

**Acceptance:**
- Every panel reflects real engine state via a real read/stream; no fabricated decision, incident,
  containment, or simulation (contract test + fixtureless render).
- Reflex/Decision Stream update within 2 s of an engine commit; Rewind returns real `AS OF` history and
  its EXPLAIN as of that instant.
- Every command (approve/reject, contain/release, run workflow, apply simulation) invokes its real
  operation, is authorized engine-side, commits through the audit chain, and is confirm-gated when
  destructive; a `PENDING` action is a labelled non-live control, not a fake.
- Each Section 4 task completes within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11. Additionally, an action whose engine
operation is `PENDING` is never invocable in a release build (the contract test forbids shipping it live);
Rewind beyond the retention horizon returns the engine's `OutOfRetention`/`AsOfError` state, not a blank.

## 8. Six-bug-category notes

Cross-module gap: every tab's view models + command payloads are typed in `@forge/contracts`. Parallel
execution: the multi-panel fan-out and the shared stream fan-out are tolerant (one panel's failure does
not blank the surface). Missing failure path: empty, stale, unauthorized, `PENDING`, and out-of-retention
(Rewind) are each tested. Schema bypass: governed-agent capabilities + decisions come from the typed
Construction Report / DecisionObject shapes.
