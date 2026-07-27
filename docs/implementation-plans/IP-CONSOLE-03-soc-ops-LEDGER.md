# IP-CONSOLE-03-SOC-OPS -- landing ledger

Plan: `IP-CONSOLE-03-soc-ops.md` (TRD-CONSOLE-03, SOC Operations). Created WITH the plan (2026-07-25)
per the ledger discipline: **every step's row is updated (status + commit hash) in the same session its
PR merges, and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-26): S3.1 -> S3.8 LANDED. Next and LAST action = S3.N**, the capstone: Playwright
  journeys for every `TRD-CONSOLE-03` Section 8 task within its click budget, an edge-state
  distinctness assertion, the narrative-unavailable journey, a no-stub sweep, and the LIVE DRIVE on
  the box over the deployed BFF/SPA.
- **State: S3.1 -> S3.8c LANDED. Next and LAST action = S3.N.** S3.8c flipped every PENDING SOC
  binding LIVE: crdb IP-SOC-EVIDENCE-DEPTH closed (ED.2-ED.5 + the runner, live-proven against real
  gemma4 in 218s), so the dock's two absences and Business impact are now real panes, and **Generate
  verdict** issues `SOC_COGNITION_RUN`. The live drive must now also prove the Generate journey. The proposer (crdb SS.6) made the
  approval path real end to end, and S3.8b resolved the `Modify Plan` deferral it unblocked. Both
  controls are now live.
- **The three deferrals are CLOSED (S3.8c)** -- crdb built exactly what each PENDING binding named:
  ED.2 the leg-to-record read, ED.3 the per-incident audit index, ED.4/ED.5 the impact assessment.
  The one still-true absence is exposure in CURRENCY (no asset-value plane); the impact panel
  renders band + factors + sentence and deliberately no dollar figure.
- **What a live drive will honestly show, and must not be "fixed" into looking better:** a Candidate
  incident proposes ONE INVESTIGATIVE step (the gate did not recommend a containment, so the plan
  does not offer one), an approved containment comes back `refused` because enforcement is OFF,
  `Auto-Contained` 0, `Raw Telemetry` and `Audit Trail` as explicit not-availables, and nothing ever
  `verified` in the lineage graph. Every one is a recorded, deliberate absence -- the drive proves the
  surface tells the truth about a box in this state.
- **No SOC binding is PENDING anymore.** The release gate's pending-binding check has nothing to
  flag on this surface.
- **All five KPI bindings are LIVE**, and `TRD-CONSOLE-03` Section 7 has been corrected accordingly --
  its table was written before crdb SS.1/SS.3/SS.3a and marked three of them PENDING/PARTIAL.
- **The whole read path is seam-proven**, so S3.4 onward is pure surface work against real routes.
- **Building the contract found two engine defects**, both fixed in crdb before any view model was
  written against them: `request_id` was declared `string` on four DTOs (it is a transparent `u128`),
  and the SOC payload emitted Debug renderings so `AttackPath` crossed as `attackpath`. The second
  would have been invisible until the live drive -- the fail-closed lane narrowing would have refused
  every attack-path node and blanked the lineage graph, correctly but mysteriously. **Re-vendoring the
  schema and reading the emitted tokens is worth doing before each contract step, not after.**
- **Superseded state: the crdb engine half is COMPLETE** -- `IP-SOC-SUBSTRATE` closed at
  SS.N (`761bc542`, capstone-proven in process) and `IP-SOC-VERDICT-NARRATIVE` VN.7/VN.8 landed and
  live-proven. **Next action = S3.1**, the contract: re-vendor `wire-dto.schema.json` and regenerate
  `wire-dto.ts`. Engine-first, the Objects/Policies precedent.
- **The plan commands now exist** (crdb SS.5, `a0e5c841`): `SOC_PLAN_APPROVE` + `SOC_PLAN_MODIFY`,
  operator-delegated and audited, with `enforcement_active: false` on every reply. **S3.8 must render
  that flag rather than treating a 200 as containment** -- an approved containment step comes back
  `refused` with its reason, and a button that flashed "contained" on success would tell an analyst
  the agent was stopped while it is still running.
- **What is still missing is upstream of both: nothing in crdb PROPOSES a plan.** `propose_plan` has
  no production caller, so `SOC_INCIDENT_DETAIL` returns an empty `plan` array on a live box. **S3.6's
  `Coordinated response` list and S3.8's approve button will both render empty until a crdb proposer
  PR lands.** Build them against the real contract -- the shape is settled -- but expect the live
  drive to show nothing there, and do NOT fill the gap with a client-composed plan:
  `INV-SOC-PLAN-DURABLE` forbids exactly that.
- **Two values this surface must render honestly, each proven by the crdb capstone rather than
  assumed:** `Auto-Contained` is **0** because the counter counts EXECUTION and enforcement is OFF, and
  **no lineage edge is ever `verified`** on this deployment -- an approved-but-refused containment step
  stays `pending`. Both are `INV-SOC-NO-FABRICATED-NUMBER` / `INV-SOC-EDGE-STATE-HONEST` in practice,
  not hypotheticals.
- **Most of this surface is already backed by live engine work.** `TRD-CONSOLE-03` Section 7 marks each
  element: `DETECT_SUMMARY` (FV.6, live-proven on the box 2026-07-25) carries the KPI totals, the SQ.8a
  episode working set backs the queue, LEG edges back the lineage graph, `LOG_EXPLAIN` backs the dock.
  The PENDING rows are the two crdb IPs' scope, not this one's.
- **Two lessons from the P5.N live leg are baked into the roster:** (1) S3.2 must add the encode arms in
  `@forge/wire` and prove them with a payload seam test -- the whole Policy epic was mock-only at the
  encode seam and no test caught it; (2) commands mount ABOVE the read-only 405 gate (S3.8).
- **The prototype is a framework, not a port.** Layout, hierarchy, and behavior are binding; the
  package set (React Flow, ELK, lucide) is a reference and S3.5 chooses against `DEPENDENCY-POLICY.md`.
- **Two things this surface must never do**, both encoded as invariants: upgrade an edge's state
  (`INV-SOC-EDGE-STATE-HONEST`), and fill a `PENDING` binding with a plausible number
  (`INV-SOC-NO-FABRICATED-NUMBER`). The `CONSENSUS` card is the live example -- the prototype's "5/5
  models agree" has no engine source, so Section 5.3 re-grounds it on real confidence + corroboration.

## Roster

| Step | Acceptance | Status | Commit | Note |
|------|-----------|--------|--------|------|
| S3.1 | A1 | LANDED | `7add663` | `soc.ts` view models + FAIL-CLOSED narrowers for authority/posture/confidence/lane/kind/edge-state/step-state/withheld-ruling; schema re-vendored + `wire-dto.ts` regenerated; 6 `soc.*` bindings (5 LIVE, `soc.plan.propose` PENDING on crdb). NO score field, and a test keeps it that way. 21 tier-1 tests. **Found 2 engine defects and fixed them in crdb FIRST**: `request_id` declared `string` on 4 DTOs (transparent u128 -- the generated client would have sent an undecodable type) and Debug-rendered SOC tokens (`AttackPath` -> `attackpath`, which this file's lane narrowing would have refused, blanking the graph). Gate green, Playwright 36/36 |
| S3.2 | A1, A2 | LANDED | `ff382d6` | encode arms + QuerySubmit dispatch for all 3 verbs, proven on the REAL encoder (incl. a request_id-is-a-number assertion, the S3.1 defect caught from this side); `replyToSoc*`; `CrucibleClient` + `WireCrucibleClient` + `OperatorEngine` delegated reads; `engine/soc.ts` fail-closed to `SocUnavailableError`; `GET /api/soc/{incidents,incident,narrative}` with 200/400/401/404/503, tenant-scoped cache, and the 404 deliberately NOT cached. **Refused queue -> 503, never []**; unknown/foreign/over-clearance -> ONE 404; cannot-see vs cannot-draw kept distinct. 18 tests |
| S3.3 | A10, A12 | LANDED | `f2cf1c6` | command header + posture pills + focus tabs + the five KPI tiles, all LIVE. **Added the DETECT_SUMMARY read path** (it had no BFF plumbing; the plan's "already live" meant the engine read) + `GET /api/soc/kpis`. `SocOpsPreview` deleted, its CSS with it. **Auto-Contained renders 0 as a FACT with its reason, never unavailable**; **Noise Collapsed states its denominator** (share of FIRINGS, not of events analyzed) and says "no firings in the window" rather than claiming 100% for 0/0. Decision Waiting derives from the queue's authority field so the two cannot disagree. 8 surface tests + e2e |
| S3.4 | A3, A12 | LANDED | `2b84d8a` | ranked cards (authority chip + finding + entity path + posture/confidence/legs + id), the ENGINE's order rendered as returned with a test that bites (a contained-but-higher-posture row stays second), **no score anywhere** (the roster line said "score" but the engine records none), authority chip colored by what it costs to leave the incident alone, honest empty vs error states, and selection lifted to the surface so S3.5-S3.7 add panels not plumbing. 8 tests |
| S3.5 | A3, A4 | LANDED | `7278250` | three lanes laid out by causal depth, **NO graph library** (DEPENDENCY-POLICY: bounded 64-node DAG in fixed lanes = one BFS + arithmetic; React Flow + ELK would also be untestable in jsdom), four edge states distinct by STROKE not just color + all four named in the legend incl. the unreachable `verified`, NOT the prototype's six-column chain (test asserts those names appear nowhere), 3-level disclosure that adds genuinely different things, and **neither disclosure nor node scoping refetches** (2 tests assert the fetch count). Node scope drops when the incident changes. 10 tests |
| S3.6 | A5-A9, A2 | LANDED | `a082599` | three narrative states rendered DISTINCTLY (absent / refused-with-reason / published), prose always labelled Generated + artifact-linked, **no model-consensus percentage** (test asserts no `%` and no "models agree"), CONTRADICTIONS technique-scoped and says so, **Unavailable != 0** for an unread summary, Business impact an explicit absence naming the missing asset-value plane, unproposed response explains WHY it is empty, controls present + disabled. Contract gained `SocSuppressingInputs` on the KPI payload (no extra read; lookup tolerates a payload without it). 11 tests |
| S3.7 | A3 | LANDED | `71b92e0` | 5 panes + the scope line, all over ONE payload (tab switches cost no read; the narrative shares the verdict's query key). **Bindings checked first: 2 of 5 have no per-incident read** -- Raw Telemetry (nothing maps legs to records; LOG_EXPLAIN keys on a decision id) and Audit Trail (entries are live-stream only), both explicit not-availables + PENDING bindings. Audit copy states acts ARE audited engine-side so an empty pane cannot read as unaudited. Timeline shows the 2 real instants and refuses to interpolate. Evidence narrows to the scoped node and shows NOTHING when the scope matches no leg. 10 tests |
| S3.8 | A11 | LANDED | `b4d9199` | Approve over SS.5, confirm-gated, audited. **Mounted ABOVE the 405 gate with a dispatch-level regression test** (unauthenticated POST must 401, never 405 -- the P5.4 defect). **`enforcement_active` survives the whole chain and the success copy never says "contained"** (asserted). The shown revision is submitted; a missing one is 400, never defaulted to 0. Approve is disabled with a reason when there is no plan or it is already approved. Typed refusals 409/400/403, cache dropped on success. `toResponseStepDrafts` reads title+action ONLY (seam test asserts the submitted map has exactly those keys). **Modify stays disabled**: its whole path is built + tested, but with no proposer there is nothing to edit. 11 tests |
| S3.8b | A11 | LANDED | `484eba8` | the `Modify Plan` editor, resolving the S3.8 deferral that crdb SS.6 unblocked. Title + action only (test asserts the posted map has exactly those keys); action is a SELECT over the containment rungs + Investigate, so no free-text action can be mistyped; a blank title disables Save with its reason rather than costing a round trip; **a refusal keeps the operator's edits on screen**; never offered on an approved plan. Synthetic row keys (positional rows with editable titles). 5 tests |
| S3.8c | A5, A3 | LANDED | -- | the evidence-depth flip, unblocked by crdb IP-SOC-EVIDENCE-DEPTH closing + the runner landing. Contract re-vendored (SOC_INCIDENT_TELEMETRY / SOC_INCIDENT_AUDIT / SOC_INCIDENT_IMPACT / SOC_COGNITION_RUN); all four wired client -> operator-engine -> resolver -> route. **The three honest absences became live panes**: Raw Telemetry (aged_out/restricted reported WITH references), Audit Trail (the ED.3 index, never stream-assembled), Business impact (band + checkable factors + the sentence in its 3 states; still NO currency figure). `soc.telemetry.raw` + `soc.audit.trail` flipped LIVE; `soc.impact` read + `soc.cognition.run` command registered LIVE -- the command's `audited: true` is TRUE because crdb `INV-SOC-RUN-AUDITED` landed first. **Generate verdict** is the one control that spends model time; its note says what a run costs, and its reply is what the engine DID. Narrowers fail closed (a `published` sentence with no words is refused). Contract + resolver + surface tests |
| S3.N | A1-A12 | PLANNED | -- | Playwright journeys + the live drive on the box (real incident, real gemma4 narrative, now incl. Generate -> recorded -> served) |

## Prerequisites (tracked)

| Prerequisite | Owner | Status |
|---|---|---|
| `SOC_INCIDENT_LIST` / `SOC_INCIDENT_DETAIL` + schema regen | crdb `IP-SOC-SUBSTRATE` SS.4a/SS.4b | **LANDED** (`7599cc12`, `16bb616f`) |
| `SOC_NARRATIVE` artifact read | crdb `IP-SOC-VERDICT-NARRATIVE` VN.7 | **LANDED + live-proven** |
| Authority state on the episode | crdb SS.1 | **LANDED** (`37599938`) |
| Response-plan record + approve/modify | crdb SS.2 + SS.N `commit_plan` + SS.5 wire | **LANDED** (`a0e5c841`) |
| A plan PROPOSER so a plan exists to render/approve | crdb, next PR | **NOT BUILT** -- S3.6 + S3.8 render empty until it lands |
| `events_analyzed` / `auto_contained` counters | crdb SS.3 + SS.3a producer | **LANDED** (`24bcb9ef`, `524df639`) |
| Whole crdb engine half | crdb `IP-SOC-SUBSTRATE` SS.N capstone | **COMPLETE** (`761bc542`) |
| `DETECT_SUMMARY` KPI totals | crdb FV.6 | **LANDED + live-proven** |
| Glass material + honeycomb backdrop | FC `packages/design` | LANDED |
