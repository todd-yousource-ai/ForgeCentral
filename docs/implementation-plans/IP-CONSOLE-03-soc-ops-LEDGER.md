# IP-CONSOLE-03-SOC-OPS -- landing ledger

Plan: `IP-CONSOLE-03-soc-ops.md` (TRD-CONSOLE-03, SOC Operations). Created WITH the plan (2026-07-25)
per the ledger discipline: **every step's row is updated (status + commit hash) in the same session its
PR merges, and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-26): S3.1 + S3.2 + S3.3 LANDED. Next action = S3.4**, the Decision Queue: ranked
  cards (id + title, entity path, authority chip -- **no score, the engine records none**), the
  engine's ordering rendered as returned with NO client re-sort, selection driving the rest of the
  surface, and honest empty/error/loading states. `GET /api/soc/incidents` is live and the
  `useSocIncidents` hook already exists (S3.3 added it for the Decision Waiting tile).
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
| S3.4 | A3, A12 | PLANNED | -- | the Decision Queue, authority-first ordering as returned (no client re-sort) |
| S3.5 | A3, A4 | PLANNED | -- | the three-lane lineage graph + four distinct edge states + progressive disclosure |
| S3.6 | A5-A9, A2 | PLANNED | -- | the FORGE VERDICT panel incl. the labelled narrative and its refusal state |
| S3.7 | A3 | PLANNED | -- | the investigation dock; `Model Reasoning` shows the grounding set + skeptic adjudications |
| S3.8 | A11 | PLANNED | -- | approve/modify over crdb SS.5 (`SOC_PLAN_APPROVE`/`SOC_PLAN_MODIFY`), above the 405 gate, confirm-gated. Must render `enforcement_active: false` + the per-step `refused` reason, never success-as-containment. Renders empty until a crdb plan PROPOSER lands |
| S3.N | A1-A12 | PLANNED | -- | Playwright journeys + the live drive on the box (real incident, real gemma4 narrative) |

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
