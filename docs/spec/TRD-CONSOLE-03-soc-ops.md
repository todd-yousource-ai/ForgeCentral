# TRD-CONSOLE-03 -- SOC Operations

**Status:** BUILT (authored 2026-07-25; refreshed 2026-09-25 by `IP-CONSOLE-11-guide` GD.8 against
ForgeCentral `a0412f2` and crucible `c5590958`; Section 0b records the as-built surface and wins where
Sections 2 to 8 disagree). Inherits `TRD-CONSOLE-00`. **Supersedes
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

## 0b. As built (2026-09-25)

This section records the built surface. Where Sections 2 to 8 describe the 2026-07-25 design
differently, this section wins; every requirement not built is kept in Section 9.

- **Narrative model.** The headline and write-up come from the model bound at `soc_narrative.model_ref`
  (Settings > Configuration, the Narrative model form; Gemma 4 on the reference node), through the governed
  inference plane, only when an operator presses **Generate verdict**. Opening an incident never generates.
- **Model (Section 2), seven regions.** Header: the `Forge Central` mark, `SOC Operations`, a detection
  posture pill (`Detection active` / `Detection disabled` / `Posture unknown`, from `DETECT_SUMMARY`) and an
  `Enforcement off` pill (a constant string, not a read; Section 9). Seven focus tabs, of which only
  `Incidents` is built. KPI strip of six tiles: Events Analyzed, Noise Collapsed, Material Incidents,
  Auto-Contained, Decision Waiting, Rules Evaluable. The dock's six panes plus the current graph scope.
- **Decision Queue (Section 3).** Each card carries an authority chip (`Automatic`, `Approval required`,
  `Review required`, `Contained`), the finding, the entity path, the engine's recorded credibility (with a
  probability only where a calibration is committed; otherwise `Uncalibrated`), posture, confidence, the
  cited-leg count and the incident id. The queue renders the engine's order as returned (authority state
  first); the Console computes no score, and there is no exposure field. The channel strip (All / Urgent
  Review / Threat Inspection) narrows without re-sorting.
- **Lineage (Section 4).** Nodes are laid out left to right by causal depth within the three lanes; the six
  semantic columns are not drawn. Node kinds: subject, network, process, evidence, decision, response; a
  node shows a label and a sublabel, no state chips. The legend names the four edge states; `verified` is
  unreachable while enforcement is off. Toolbar: `Material path` / `Show evidence` / `Full story`.
- **FORGE VERDICT (Section 5).** Adds the `Generate verdict` control and its state note, a `Flagged for
  human review` badge, and Business impact as band + factors + sentence (no currency). The panel shows
  `modelRef` and `inputHash`. CONSENSUS is the confidence tier plus "one detection gate, corroborated by N
  cited legs"; CONTRADICTIONS is false-positive feedback plus the ratified baseline for the technique.
- **Case controls (new).** Assign (a typed principal id), Acknowledge, Close without verdict, and Record
  disposition (seven verdicts, each with its field); all confirm-gated and audited on the incident's trail.
  The three true-positive verdicts and false positive teach calibration; a false positive also down-weights
  the tenant's incidents that share the technique; a later disposition replaces the earlier one.
- **Investigation dock (Section 6).** Evidence lists the cited leg references (narrowed to a scoped node);
  Timeline shows the two instants the engine records (opened, last fired); Raw Telemetry is
  `SOC_INCIDENT_TELEMETRY` (resolved / aged out / restricted); Audit Trail is `SOC_INCIDENT_AUDIT`; Notes
  is `SOC_INCIDENT_NOTES` plus a composer. A verdict run is recorded on the engine's audit chain, not the
  incident's trail.
- **Three-click paths (Section 8).** No card is selected on load (triage is select -> read); there is no
  Open-entity path to the drawer. Generate verdict: select -> Generate. Case acts: control -> confirm.
  Record disposition: verdict -> field -> Record -> confirm. Add a note: Notes -> Save.
- **Built under this IP, specified elsewhere.** The Reports tab's incident report and weekly panel
  (S3.16 / S3.17, `TRD-CONSOLE-08` scope) and the Settings SOC tab (S3.18, `TRD-CONSOLE-11`).

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
| KPI strip (six tiles) | `soc.kpis` (`DETECT_SUMMARY` + the queue counts) | **LIVE** |
| KPI: Auto-Contained | `DETECT_SUMMARY.auto_contained` | **LIVE**; reads 0 while enforcement is off |
| KPI: Rules Evaluable | `DETECT_SUMMARY.coverage` | **LIVE** |
| Decision Queue | `soc.incidents` -> `SOC_INCIDENT_LIST` (engine order, authority state first) | **LIVE** |
| Incident detail | `soc.incident.detail` -> `SOC_INCIDENT_DETAIL` | **LIVE** |
| Response plan | `soc.plan.propose` (rides the detail; the crdb proposer, SS.6) | **LIVE** |
| Verdict narrative | `soc.narrative` | **LIVE** |
| Business impact | `soc.impact` | **LIVE** |
| Evidence and Raw Telemetry | the detail's leg references + `soc.telemetry.raw` | **LIVE** |
| Audit Trail | `soc.audit.trail` -> `SOC_INCIDENT_AUDIT` | **LIVE** |
| Notes | `soc.notes` | **LIVE** |
| Generate verdict | `soc.cognition.run` | **LIVE** |
| Approve / Modify plan | `soc.plan.approve` / `soc.plan.modify` | **LIVE** (Modify is not confirm-gated, CD-30) |
| Case acts | `soc.case.assign` / `soc.case.ack` / `soc.case.note` / `soc.case.close` (`SOC_INCIDENT_ACT`) | **LIVE** |
| Disposition | `soc.disposition` | **LIVE** |
| Posture: Enforcement | a constant string on the surface | **NOT BOUND** (Section 9) |
| Queue exposure / blast radius | business-context enrichment | **PENDING** (Section 9) |
| UEBA per incident | `SOC_INCIDENT_UEBA` (engine op exists) | **no Console consumer** |

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
4. **Governed Gemma 4 serving** -- CORRECTED after checking the live node: the inference plane is
   already `enabled`, pointed at ollama (`127.0.0.1:11434`) at clearance `Secret`, and
   `gemma4:26b-a4b-it-qat` is already an approved egress destination at ceiling `Secret`. What is
   missing is narrower than first written: the `served_models` registry is **empty**, so no model is
   registered for the narrative capability. Prerequisite: `cdb-actl model-register` with capability,
   ceiling, and region. Owner: `IP-SOC-VERDICT-NARRATIVE` VN.1.
5. **`SIMULATE CONTAINMENT`** -- a dry-run of the response plan. No simulation surface exists.
6. **Events-analyzed counter** -- needs a bounded per-window ingest count.
7. **Multi-model consensus** -- see Section 5.3; deferred rather than faked.

Resolved since authoring: items 1 (authority state, crdb SS.1), 3 (the response plan record and its
proposer, crdb SS.2 / SS.5 / SS.6), 4 (governed serving; the model is configurable) and 6 (the events
counter, SS.3 / SS.3a). **Known gaps recorded 2026-09-25 (kept as requirements):**
- The header's tenant / shift line, `ELEVATED`, search, and the coverage and shift-lead readouts (D-03).
- Six of the seven focus tabs render `Not yet built` (SOC-10).
- No first-card auto-select and no Open-entity path to the drawer (D-03).
- R-SOC-3's `output_hash`, `model_version` and `policy_version` are not shown; CONTRADICTIONS lacks the
  overlapping benign attribution (D-03).
- Confirm steps are missing on Modify plan and Generate (CD-30).
- The `Enforcement off` pill, the Auto-Contained badge and the "Already enforced" copy are constants, not
  reads, and will be wrong on an enforcement-on node.
- The plan-step reversibility / rollback display (S3.14) is not built, although the wire field exists.
- No assignee picker: a principal id must be typed.
- The S3.N capstone (Playwright journeys per Section 8 and the live drive) has not run.

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
| A11 | Approve/Modify are confirm-gated and audited; refusal maps to a typed error, never a silent no-op (NOT MET: Modify has no confirm, CD-30) |
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
