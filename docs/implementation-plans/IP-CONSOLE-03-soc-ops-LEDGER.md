# IP-CONSOLE-03-SOC-OPS -- landing ledger

Plan: `IP-CONSOLE-03-soc-ops.md` (TRD-CONSOLE-03, SOC Operations). Created WITH the plan (2026-07-25)
per the ledger discipline: **every step's row is updated (status + commit hash) in the same session its
PR merges, and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-26): S3.1 LANDED. Next action = S3.2** (the read path): `SOC_INCIDENT_LIST`/`DETAIL`
  + `SOC_NARRATIVE` over QuerySubmit, the `OperatorEngine` delegated reads, `engine/soc.ts` resolvers
  failing closed to a typed `SocUnavailableError`, and `GET /api/soc/incidents` (+`/detail`,
  `/narrative`). **Do the encode-arm check first** -- add the verbs to `@forge/wire`'s
  `encodeWireRequest` and prove it with a payload seam test; the P5.N live leg showed mocks cannot
  catch a missing encode arm, and S3.1 already found two defects of exactly that family on the engine
  side.
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
| S3.2 | A1, A2 | PLANNED | -- | the read path + the `@forge/wire` encode arms w/ a payload seam test |
| S3.3 | A10, A12 | PLANNED | -- | shell: command header, focus tabs, the five KPI tiles (unavailable state for PENDING bindings) |
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
