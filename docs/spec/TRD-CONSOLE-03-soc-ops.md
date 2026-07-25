# TRD-CONSOLE-03 -- SOC Operations

**Status:** DRAFT (authored 2026-07-25). Inherits `TRD-CONSOLE-00`. **Supersedes
`TRD-CONSOLE-03-dashboards.md`** (the 2026-07-07 Dashboards draft), which the 2026-07-24 operator IA
revision renamed to `SOC Ops`. Grounding: the operator-supplied `Crucible Command` dynamic demo
package (`preview/clean-layout-preview.png` + `src/`), used as the framework for layout and behavior;
the `docs/ui-examples/` design language; and the SOC Ops design brief (glass + honeycomb, realized by
the `packages/design` glass material).

---

## 0. What changed in this revision (and why)

The Dashboards draft specified a dashboard *selector* over engine aggregates -- a summarizing surface.
The prototype replaces that idea outright: SOC Ops is a **decision** surface, not a summary. Its
organizing claim is printed on the prototype itself, "Security decisions, not alert volume", and the
whole layout exists to move an operator from a ranked queue to one defensible decision.

Four operator directives are carried into this revision:

1. **Naming.** Every product-facing occurrence of "Crucible" becomes **Forge**; the prototype's
   product title `Crucible Command` becomes **Forge Central**; the `CRUCIBLE VERDICT` panel becomes
   **FORGE VERDICT**; the graph's `CRUCIBLE DECISION + RESPONSE` lane becomes **FORGE DECISION +
   RESPONSE**. **This rename applies to the surface, not to the engine**: bindings, invariants, and
   TRD cross-references still name CrucibleDB, because that is the system actually being read. A
   label an operator sees says Forge; a contract an engineer implements says what it really talks to.
2. **Palette.** The prototype's ad-hoc CSS variables are replaced by the committed
   `@forge/design` semantic tokens. They already agree: the prototype's `--teal #3FBE96`,
   `--red #E2574C`, `--amber #E8A33D`, `--blue #3B82F6`, `--purple #8B5CF6`, `--bg #0A0E17`,
   `--muted #8A93A5` are byte-identical to `brand.primary`, `status.critical`, `flow.objects`,
   `flow.users`, `flow.agents`, `surface.canvas`, `text.muted`. No new hex may be introduced by this
   surface (`INV-CONSOLE-DESIGN-SEMANTIC-COLOR`); Section 4.3 maps every prototype color to its token.
3. **The verdict narrative is generated.** The FORGE VERDICT panel keeps every field the prototype
   shows, and its headline + write-up are produced by **Gemma 4** through the governed inference
   plane rather than authored per incident. Section 5 is the contract for that, and it is deliberately
   the most constrained part of this TRD: a model writing an operator-facing security narrative is a
   place where fabrication is a safety defect, not a quality nit.
4. **Framework, not port.** The prototype's package set (React Flow, ELK, lucide) is a reference, not
   a requirement. What is binding is the **layout, information hierarchy, and behavior**; the
   implementing IP chooses libraries against `DEPENDENCY-POLICY.md`.

---

## 1. Purpose

Give a SOC operator one surface that answers, for a live environment: **what is happening, what proves
it, what has already been done about it, and what decision is waiting on a human.** Every element is a
projection of a real Crucible decision record; SOC Ops adds ranking, narrative, and an approval path,
and it invents nothing.

The surface is also a flagship: it is the screen a prospect sees first. That is a reason for craft, not
a licence to display numbers the platform cannot substantiate.

---

## 2. Model

Six regions, matching the prototype's layout exactly:

| # | Region | What it is |
|---|--------|-----------|
| 1 | **Command header** | `Forge Central` mark + tenant/shift line, posture pill (`ELEVATED`), global search, and three posture readouts (coverage, enforcement, shift lead) |
| 2 | **Focus tabs** | `Incidents` (default) · `Alerts` · `Threat Intel` · `Assets` · `Analytics` · `Automation` · `Exceptions`, with the standing tagline right-aligned |
| 3 | **KPI strip** | Five tiles: Events Analyzed · Noise Collapsed · Material Incidents · Auto-Contained · Decision Waiting |
| 4 | **Decision Queue** (left rail) | Incidents ranked by risk, evidence quality, and authority state |
| 5 | **Attack and Decision Lineage** (center) | The three-lane swimlane graph, the surface's centerpiece |
| 6 | **FORGE VERDICT** (right rail) | The generated write-up, the decision's structured facts, and the approval controls |
| 7 | **Investigation dock** (bottom) | `Evidence` · `Timeline` · `Model Reasoning` · `Raw Telemetry` · `Audit Trail`, plus the current graph scope |

Regions 4-7 are all projections of **one selected incident**. Selecting a graph node narrows regions 6
and 7 to that node's scope without re-fetching -- the prototype's "same normalized payload drives every
panel" property, which this TRD keeps as a hard rule: **one read populates the surface**, so no two
panels can disagree about the same incident.

---

## 3. The Decision Queue

Each card carries: **score** (0-100, the ranking number), incident id + title, the entity path
(`codex-helper -> source repos -> external endpoint`), exposure, and an authority chip
(`Transfer blocked`, `Approval required`, `Identity challenged`).

Ranking is by **authority state first, then score**: an incident waiting on a human outranks a
higher-scoring one already contained. A queue that sorts purely by score buries the only card the
operator can actually act on.

---

## 4. Attack and Decision Lineage

### 4.1 Lanes and columns

Three lanes, labelled at the left edge as in the prototype:

- **ATTACK PATH** -- *what happened*
- **EVIDENCE** -- *what proves it*
- **FORGE DECISION + RESPONSE** -- *what the platform decided and did*

Six columns, labelled across the top: `ORIGIN` · `EXECUTION` · `ACCESS` · `CONTROL BYPASS` · `TARGET`
· `OUTCOME`. Columns are semantic stages, not time buckets; the Timeline tab is where time is linear.

### 4.2 Nodes and edges

Node kinds: `identity` · `agent` · `asset` · `network` · `process` · `device` · `evidence` ·
`decision` · `response`. Each node renders kind, title, subtitle, and a state chip (`Active`,
`Violation`, `Accessed`, `Blocked`, `Denied`, `Verified`, `Enforced`, `Review`).

Edge states, with the legend rendered bottom-right exactly as the prototype does:
`observed` · `inferred` · `verified/enforced` · `pending`. **An edge's state is a claim about
evidence and must be styled apart from the others** -- an inferred edge that looks observed is the
surface telling the operator something the engine did not.

### 4.3 Color mapping (the token contract)

| Prototype | Token | Used for |
|---|---|---|
| `--teal #3FBE96` | `brand.primary` | verified/enforced edges, device nodes, positive emphasis |
| `--blue #3B82F6` | `flow.users` | identity nodes, observed edges |
| `--purple #8B5CF6` | `flow.agents` | agent + decision nodes |
| `--amber #E8A33D` | `flow.objects` | asset/target nodes, inferred edges |
| `--red #E2574C` | `status.critical` | pending/denied, critical severity |
| `--bg #0A0E17` | `surface.canvas` | canvas |
| `--panel`/`--panel2` | `surface.panel` / `surface.card` + glass | the floating panels |
| `--line` | `surface.border` | hairlines |
| `--muted #8A93A5` | `text.muted` | labels |

Severity uses `status.*`; `status.quarantine` carries isolate/quarantine actions. Panels use the
committed `GlassPanel` material and the honeycomb backdrop, with its `prefers-reduced-transparency`
and no-WebGL fallbacks intact.

### 4.4 Toolbar

`Material Path` (default) · `Show Evidence` · `Full Story` progressively disclose the graph;
`SIMULATE CONTAINMENT` previews the response plan's effect. Default is **Material Path**: the
prototype's own principle is that evidence stays collapsed until requested.

---

## 5. FORGE VERDICT (the generated write-up)

### 5.1 What the panel shows

Every prototype field is retained:

- **Headline** -- one line naming what happened (`Ungoverned AI agent attempted restricted data egress`)
- **Narrative** -- a short paragraph: what was found, what was stopped, what remains open
- **Three stat cards** -- `CONSENSUS`, `CONTRADICTIONS`, `AUTHORITY`
- **Already enforced** -- what the platform did without asking
- **Business impact** -- what it meant
- **Coordinated response** -- the numbered plan
- **Approve Full Response** / **Modify Plan**

### 5.2 The headline and narrative are model-generated

Produced by **Gemma 4** (`gemma4:26b-a4b-it-qat`, the QAT 25.2B instruction model already resident on
the node) through the engine's governed inference plane (TRD-08), never by a direct call from the BFF
or the browser.

**R-SOC-1 (grounding).** The model receives *only* the selected incident's own record: its decision,
gate outcome, evidence rows, lineage nodes/edges, and enforced actions. It may summarize, order, and
explain that material. It may not introduce an actor, technique, asset, or consequence absent from it.

**R-SOC-2 (data is not control).** Every evidence string is external content of unknown provenance --
process command lines, file paths, destination hosts. It is passed as an untrusted, delimited content
block, declared as data to describe and never as instructions to follow
(`CRAFTED_ENGINEERING_STANDARDS` "Prompt Injection Defense"). A narrative request whose evidence
contains instruction-like content is still answered *about* that content.

**R-SOC-3 (provenance).** The narrative is stored as a **signed inference artifact** carrying its
`input_hash`, `output_hash`, `model_version`, and `policy_version`, referenced by the decision.
Regenerating the same incident under the same model and policy version returns the same artifact
(TRD-01 R4 reuse-key idempotency). The panel labels it as generated and links to the artifact; the
`Model Reasoning` dock tab shows the inputs it was given.

**R-SOC-4 (fail closed).** If inference is unavailable, refused, over budget, or returns nothing, the
panel renders **the structured fields alone** with an explicit "narrative unavailable" state. It never
falls back to a stale narrative from a different incident, a templated sentence dressed as analysis, or
an empty space that reads as "nothing to say".

**R-SOC-5 (advisory).** The narrative is never an enforcement directive and never changes a posture.
Enforcement is the policy plane's; the write-up explains a decision that was already made.

**R-SOC-6 (classification).** The artifact inherits the decision's classification and never widens it
(TRD-04 R3). A narrative composed from Confidential evidence is Confidential.

### 5.3 The three stat cards -- grounded, not borrowed

The prototype shows `CONSENSUS 94.1%` alongside "5/5 models agree". **The platform has one detection
gate, not a model panel**, so a five-model consensus is a number this surface cannot substantiate.
The cards are re-grounded on what the engine really produces:

| Card | Real source |
|---|---|
| `CONSENSUS` | the decision's `ConfidenceTier` + its corroboration count (distinct observed data components), rendered as tier + corroboration, not a fabricated percentage |
| `CONTRADICTIONS` | the gate's suppressing inputs: false-positive feedback and ratified baselines (`MuteReason::FalsePositiveFeedback` / `RatifiedBaseline`), plus overlapping benign attribution |
| `AUTHORITY` | the incident's authority state (`automatic` / `approval-required` / `review-required` / `contained`) |

If a later multi-model adjudication plane is built, `CONSENSUS` can become a true consensus number.
Until then it reports the confidence the engine actually computed.

---

## 6. Investigation dock

`Evidence` (default) lists timestamped rows -- time, category, title, detail, and an `OBSERVED` /
`VERIFIED` state chip. `Timeline` is the linear ordering. `Model Reasoning` shows the gate's inputs and
the narrative's grounding set. `Raw Telemetry` is the underlying records. `Audit Trail` is the
hash-chained audit entries for the decision and any action taken.

The right pane shows the **current graph scope**: the selected node, or the incident when none is
selected, plus the standing "progressive disclosure" note.

---

## 7. Data source and bindings (`INV-CONSOLE-NO-STUB`)

Every value binds to a real engine operation or it does not ship.

| Element | Binding | State |
|---|---|---|
| KPI: Events Analyzed | ingest/telemetry counters over the window | **PENDING** -- no bounded per-window event count is exposed today |
| KPI: Noise Collapsed | `DETECT_SUMMARY.muted_total` + `techniques_lit` (FV.5/FV.6) | **LIVE** |
| KPI: Material Incidents | `DETECT_SUMMARY.active_alerts` (FV.4) | **LIVE** |
| KPI: Auto-Contained | containment records (`IP-CONTAIN-COMMAND`) | **PARTIAL** -- `entity.isolate` exists; a per-window count does not |
| KPI: Decision Waiting | open episodes at `review-required` | **PENDING** -- authority state is not yet an episode field (Section 9) |
| Decision Queue | `LOG_QUERY` episode working set (SQ.8a), newest-first, bounded | **LIVE** |
| Queue score | the episode's confidence + posture rank | **LIVE** |
| Queue exposure / blast radius | business-context enrichment | **PENDING** (Section 9) |
| Lineage nodes/edges | the decision's attribution window + LEG edges (`Executes`, `ConnectsTo`) | **LIVE** |
| Edge state | LEG relation provenance + the gate's evidence class | **LIVE** |
| Evidence dock | `LOG_EXPLAIN` + the decision's evidence ids | **LIVE** |
| Audit Trail | the TRD-04 hash-chained audit entries | **LIVE** |
| Verdict narrative | governed inference over the incident record (Section 5) | **PENDING** -- prerequisites in Section 9 |
| Verdict: Already enforced | the decision's enforced actions + apply reports | **PARTIAL** |
| Verdict: Coordinated response | the response plan | **PENDING** -- no response-plan record exists |
| Approve Full Response | an audited command | **PENDING** -- gated on the response-plan record |
| Posture: Enforcement | the platform enforcement toggle (`AG.7`) | **LIVE** |

A `PENDING` binding renders its element in an explicit unavailable state. It is never filled with a
plausible number.

---

## 8. Interaction and three-click paths (`INV-CONSOLE-3-CLICKS`)

| Task | Path |
|---|---|
| Triage the top decision | SOC Ops (1) -- the queue's first card is selected on load |
| Inspect what proves a step | click a graph node (1) -- dock and verdict scope to it |
| Read the full story | `Full Story` (1) |
| Approve the response | `Approve Full Response` (1) -> confirm (2) |
| Reach the entity | click a node (1) -> `Open entity` (2) -> drawer (`TRD-CONSOLE-12`) |

---

## 9. Named deferrals (honest, gating work named)

1. **Authority state on the episode record** -- the queue's ordering rule, the `Decision Waiting` KPI,
   and the `AUTHORITY` card all need it. Gating owner: a crdb episode-record field.
2. **Business context (exposure, blast radius)** -- currency figures and blast counts have no engine
   source. They require an asset-value/criticality plane. Until it exists these fields are omitted
   entirely rather than estimated: a fabricated dollar figure on a security surface is worse than a
   missing one.
3. **The response plan as a record** -- "Coordinated response" and `Approve Full Response` need a
   durable, audited plan object. Gating owner: `IP-CONTAIN-COMMAND` Workstream B + a plan record.
4. **Governed Gemma 4 serving** -- the model is resident (ollama, `127.0.0.1:11434`) but the node's
   `served_models` registry is **empty**, so no reservation can be issued and TRD-08 refuses the call.
   Prerequisite: register it (`cdb-actl model-register`) with capability, ceiling, and region, then
   bind the SOC narrative capability to it.
5. **`SIMULATE CONTAINMENT`** -- a dry-run of the response plan. No simulation surface exists.
6. **Events-analyzed counter** -- needs a bounded per-window ingest count.
7. **Multi-model consensus** -- see Section 5.3; deferred rather than faked.

---

## 10. Acceptance and failure semantics

| # | Criterion |
|---|---|
| A1 | Every displayed value traces to a real engine read; no mock provider ships (`pnpm test:contract`) |
| A2 | A `PENDING` binding renders an explicit unavailable state, never a placeholder value |
| A3 | Selecting a node re-scopes verdict + dock without a second fetch; no panel disagrees with another |
| A4 | Edge states are visually distinct; an inferred edge never renders as observed |
| A5 | The narrative introduces no entity absent from the incident record (grounding test over a fixture set) |
| A6 | Evidence containing instruction-like text produces a narrative *about* it, never one that follows it |
| A7 | Inference unavailable -> structured fields render + explicit unavailable state; no stale or templated narrative |
| A8 | The narrative's artifact carries `input_hash`/`output_hash`/`model_version`; regeneration is idempotent |
| A9 | A narrative never renders above the operator's clearance |
| A10 | Only `@forge/design` tokens are used; no literal hex in surface code |
| A11 | Approve/Modify are confirm-gated and audited; refusal maps to a typed error, never a silent no-op |
| A12 | Every task in Section 8 completes within its click budget |

**Failure semantics.** Engine unavailable -> the surface renders its shell with an explicit
unavailable state per region and no cached numbers. A malformed incident record is refused and logged,
never partially rendered. An over-budget or refused inference is `A7`. An expired session re-auths
without losing the selected incident.

---

## 11. Six-bug-category notes

1. **Dead code** -- every KPI and card must move when its binding moves; a tile that cannot change is a
   tile that is not bound.
2. **Async/sync boundary** -- the narrative call is async with a timeout and never blocks graph render.
3. **Cross-module integration gaps** -- node kinds, edge states, and authority states are shared
   `@forge/contracts` types generated from the engine schema, defined once.
4. **Schema/type bypass** -- incident payloads are parsed fail-closed into typed view models; unknown
   enum tags are refused, not coerced.
5. **Parallel execution** -- a failed narrative or evidence fetch must not cancel the others; each
   region degrades independently.
6. **Missing failure paths** -- inference refusal, over-clearance, malformed records, and empty
   windows each have a rendered state and a test.
