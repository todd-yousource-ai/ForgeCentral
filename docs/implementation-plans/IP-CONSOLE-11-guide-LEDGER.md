# IP-CONSOLE-11-guide -- landing ledger

Plan: `IP-CONSOLE-11-guide.md` (`TRD-CONSOLE-11` Section 11, added 2026-09-25). Created WITH the plan
(2026-09-25) per the ledger discipline: every step's row is updated (status + commit hash) in the same
session its PR merges, and the Resume-here section is rewritten at every merge. A stale ledger is a
defect. The census it rests on is `IP-CONSOLE-11-guide-CENSUS.md`.

## Resume here (rewrite at every merge)

- **State (2026-09-25, ~16:35 UTC):** GD.E0b MERGED `93a9984` on the operator's approval ("Merge and
  continue"). NEXT = GD.2 (the ReadMe tab renders the guide source inside ForgeCentral).
- **Earlier (2026-09-25, ~16:30 UTC):** GD.E0 MERGED crucible `c31d9be4` and DEPLOYED 16:17 UTC on the
  operator's approval ("Merge and continue"), as presented: the two session lifetimes and the cognition
  connection limit are read-only in ForgeCentral (the plan's expected effect); every corrected label is
  served live (`config-describe`). GD.E0b ON BRANCH `docs/console-11-guide-true-labels` (`8e1917b`):
  the standalone guide stops correcting the engine (rule R4): Appendix A has no red corrections, 16
  editable settings (was 19), chapter 2's restart limitation replaced by a dual-control note; census
  CD-18 fixed; TRD gap G6 narrowed to its ForgeCentral half. AWAITING REVIEW. NEXT = GD.2.
- **Earlier (2026-09-25, ~07:10 UTC):** GD.1 MERGED `375b6c7` on the operator's approval ("Merge and
  continue"), with the dispatch guard kept as presented (the one runtime change the plan row had ruled
  out: an undeclared `/api` request is refused JSON 404, a declared path under another method 405). NEXT =
  GD.E0 (crdb: the registry's labels and defaults made true), then GD.2. At GD.E0's review the operator
  confirms its expected effect (the two session lifetimes and the cognition connection limit become
  read-only in ForgeCentral) or asks for them to be made truly live.
- **Earlier (2026-09-25, ~06:55 UTC):** GD.1 ON BRANCH `feat/console-11-gd1-binding-coverage` (code
  `1fb08f4`), full gate green (e2e 40/40), pushed; AWAITING REVIEW. The manifest holds 89 bindings (17
  added); `apps/bff/src/routes.ts` declares the 67 `/api` routes; the route-coverage contract test maps
  them both ways. Beyond the plan row, for the operator's review: (1) one runtime change although the
  row said none: the dispatcher refuses an undeclared `/api` request (JSON 404) and a declared path under
  another method (405); before, an unknown `/api` GET received the SPA entrypoint (200 HTML) and an
  unknown non-GET a 405; every declared route behaves as before; (2) commands the engine does not audit
  (CD-01, CD-15) now name their audit gap instead of claiming `audited: true`, and the release gate
  refuses a gap as it refuses PENDING; (3) a `console` binding surface for ForgeCentral's own state,
  reserved by test to three bindings; (4) CD-41's `authz` labels stay unread (documented as labels;
  DEF-RBAC-PERMISSION-MAP). NEXT after the merge = GD.E0 (crdb registry labels), then GD.2.
- **Earlier (2026-09-25, ~06:30 UTC):** GD.0 MERGED `3c2e3d6` and GD.S1 MERGED `7439ded` on the operator's
  go-ahead ("Agreed with the approach ... Continue to gd.1 and gd.2"). Decisions N2 (document as built,
  limitations stated) and N3 (fix the engine labels before the in-app content: GD.E0, after GD.1 and
  before GD.2) DECIDED. NEXT = GD.1 (the manifest becomes the complete, enforced index).
- **Earlier (2026-09-25):** GD.S1 ON BRANCH `docs/console-11-guide-standalone` (stacked on GD.0): the
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
| GD.0 | TRD 9-11 | MERGED `3c2e3d6` (2026-09-25; full gate green) | `08a47f2` | the plan, the census, the TRD revision |
| GD.S1 | 11.3; INV-GUIDE-FORGE-NAMING | MERGED `7439ded` (2026-09-25; full gate green, e2e 40/40) | `651d9f3` | the standalone guide: `docs/guide/` + `scripts/build-guide.mjs` -> HTML + PDF (85 pages) |
| GD.1 | 9.4; INV-BINDING-ROUTE-COVERAGE | MERGED `375b6c7` (2026-09-25; full gate green, e2e 40/40) | `1fb08f4` | 17 bindings registered (89); 67 routes declared in `routes.ts`, undeclared `/api` refused; route-coverage contract test; audit gaps named (CD-01, CD-15) |
| GD.E0 | CD-18 (crdb) | MERGED crucible `c31d9be4` (2026-09-25; full gate green); DEPLOYED 16:17 UTC | crucible `37331f30` | the registry's labels made true: sessions standard + cognition cap boot-bound, break-glass lifetime and the IdAM section pending, retention live, dual control names both planes, LUG default enabled; pinned by a drift test; the three rows are read-only in ForgeCentral |
| GD.E0b | R4 | MERGED `93a9984` (2026-09-25; full gate green, e2e 40/40) | `8e1917b` | the standalone guide states the corrected labels: Appendix A without red corrections, 16 editable settings, the chapter 2 note |
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
| N2 | How the guide treats the census defects | DECIDED 2026-09-25: document as built, each limitation stated with its workaround; fixes on their own schedule |
| N3 | Correct the registry's live-apply text (crdb, CD-18) | DECIDED 2026-09-25: fix the engine labels before the content is created in the app (GD.E0, before GD.2) |
