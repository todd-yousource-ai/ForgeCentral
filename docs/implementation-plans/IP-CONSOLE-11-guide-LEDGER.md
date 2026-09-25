# IP-CONSOLE-11-guide -- landing ledger

Plan: `IP-CONSOLE-11-guide.md` (`TRD-CONSOLE-11` Section 11, added 2026-09-25). Created WITH the plan
(2026-09-25) per the ledger discipline: every step's row is updated (status + commit hash) in the same
session its PR merges, and the Resume-here section is rewritten at every merge. A stale ledger is a
defect. The census it rests on is `IP-CONSOLE-11-guide-CENSUS.md`.

## Resume here (rewrite at every merge)

- **State (2026-09-25, later):** GD.S1 ON BRANCH `docs/console-11-guide-standalone` (stacked on GD.0): the
  standalone guide (Cisco configuration-guide format, Forge brand) built by `scripts/build-guide.mjs`
  from `docs/guide/` to an 86-page HTML + PDF, 16 chapters, 3 appendices, 16 figures; AWAITING REVIEW.
  Operator decision N1 (naming) DECIDED. Census updated: CD-06 verified; CD-45, CD-46 added.
- **Earlier (2026-09-25):** GD.0 ON BRANCH `docs/console-11-guide-plan` (docs only: the census and its
  six slices, `TRD-CONSOLE-11` revised, this plan and ledger, the `IP-CONSOLE-11-settings` ledger
  corrected), AWAITING REVIEW. Operator decisions N1 (naming glossary), N2 (defect handling) and N3
  (registry text before the Settings chapter) are OPEN. NEXT after the merge = GD.1 (the manifest
  becomes the complete, enforced index).

## Roster

| Step | Acceptance | Status | Commit | Notes |
|------|-----------|--------|--------|-------|
| GD.0 | TRD 9-11 | ON BRANCH | | the plan, the census, the TRD revision |
| GD.S1 | 11.3; INV-GUIDE-FORGE-NAMING | ON BRANCH | | the standalone guide: `docs/guide/` + `scripts/build-guide.mjs` -> HTML + PDF |
| GD.1 | 9.4; INV-BINDING-ROUTE-COVERAGE | PLANNED | | 17 routes registered; the route-to-binding contract test |
| GD.2 | 11.2 (1), 11.5 | PLANNED | | post the guide into ForgeCentral: the ReadMe tab renders the GD.S1 source |
| GD.3 | 11.6 | PLANNED (needs N2, N3) | | Settings chapters in the ReadMe with live values |
| GD.4 | 11.6 | PLANNED | | TRD-CONSOLE-02 refresh; chapter re-verified |
| GD.5 | 11.6 | PLANNED | | TRD-CONSOLE-10 refresh; chapter re-verified |
| GD.6 | 11.6 | PLANNED | | TRD-CONSOLE-05 refresh; chapters re-verified |
| GD.7 | 11.6 | PLANNED | | TRD-CONSOLE-04 refresh; chapters re-verified |
| GD.8 | 11.6 | PLANNED | | TRD-CONSOLE-03 refresh + the IP-CONSOLE-03 ledger; chapter re-verified |
| GD.9 | 11.6 | PLANNED | | TRD-CONSOLE-09, -08 refresh; chapters re-verified |
| GD.10 | 11.6 | PLANNED | | TRD-CONSOLE-01, -12, -00 refresh; chapters re-verified |
| GD.11 | 11.2 (2) | PLANNED | | the contextual side panel |
| GD.12 | 11.2 (3) | PLANNED | | inline micro-copy and info tips |
| GD.13 | INV-GUIDE-DISABLED-EXPLAINED | PLANNED | | state-aware explanations |
| GD.N | 11.6 | PLANNED | | capstone: global coverage, Playwright journeys, live drive |
| GD.E1 | -- | DEFERRED (ruling 2026-09-25) | | crdb: setting tier on the wire |
| GD.E2 | -- | DEFERRED (ruling 2026-09-25) | | crdb: deployment profiles on the wire |
| GD.E3 | -- | DEFERRED (ruling 2026-09-25) | | crdb: detection report + enrolled-endpoint read |
| GD.D1 | -- | DEFERRED (waits GD.E1) | | Advanced settings disclosure |
| GD.D2 | -- | DEFERRED (waits GD.E2) | | one-click profile templates |
| GD.W1 | -- | DEFERRED (ruling 2026-09-25) | | wizard: engine connection + admin-plane crypto |
| GD.W2 | -- | DEFERRED (ruling 2026-09-25) | | wizard: identity provider |
| GD.W3 | -- | DEFERRED (waits GD.E3) | | wizard: endpoints enrolled and reporting |
| GD.W4 | -- | DEFERRED (waits GD.E3) | | wizard: detection content served |
| GD.W5 | -- | DEFERRED (waits CD-05..CD-08 fixes) | | wizard: governance converges |

## Decisions

| Id | Question | Status |
|----|----------|--------|
| N1 | The naming glossary for guide prose | DECIDED 2026-09-25: Forge, ForgeCentral, the Forge engine, the Forge endpoint agent; commands in code |
| N2 | How the guide treats the census defects (recommended: document as built with known limitations; fix separately) | OPEN |
| N3 | Correct the registry's live-apply text (crdb, CD-18) before the Settings chapter | OPEN |
