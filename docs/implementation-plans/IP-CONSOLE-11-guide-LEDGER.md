# IP-CONSOLE-11-guide -- landing ledger

Plan: `IP-CONSOLE-11-guide.md` (`TRD-CONSOLE-11` Section 11, added 2026-09-25). Created WITH the plan
(2026-09-25) per the ledger discipline: every step's row is updated (status + commit hash) in the same
session its PR merges, and the Resume-here section is rewritten at every merge. A stale ledger is a
defect. The census it rests on is `IP-CONSOLE-11-guide-CENSUS.md`.

## Resume here (rewrite at every merge)

- **State (2026-09-25):** GD.N ON BRANCH `feat/console-11-gdn-capstone`, awaiting review. Coverage is
  global (all 89 manifest bindings have a declaring section; the per-surface scope list is gone);
  three Playwright journeys added (the filter narrows to a hit that opens its section and says so on no
  match; Help follows the active Settings tab; the tier refusal's link opens `cfg-who`), beside the
  GD.2/GD.11 ones (three clicks, reload, Help panel). LIVE: Console installed on the box from main
  `5e25720` at 20:26 UTC (`deploy/install.sh`, validate ALL PASSED); the served bundle carries the
  GD.11-GD.13 code (reason lines, guide links, `data-const` markers, the filter); `/api/settings`
  unauthenticated = 401. LIVE WALK 20:31 UTC (operator approved the device code; headless Chromium on the
  box, read-only): PASS Help on SOC and Changes, the SOC tier hint and info tip, filter -> section ->
  reload, `data-const` renders 64, the read-only why link -> `#cfg-apply`, the VTZ name rule and reason,
  the policy byte counts and save reason. Two findings: CD-65 (one slow Overview read fails every queued
  engine read on the shared connection; a 502 at 20:31:14; not fixed, outside this plan) and CD-66 (a
  disabled primary button kept its fill; FIXED here with an e2e check). The settings-reference check was
  a script bug (counted rows before the read landed); re-run owed after this merges and is installed,
  together with the CD-66 fix. Merging GD.N closes the plan's PR rows; GD.E1-E3 and GD.D1 stay DEFERRED
  by ruling.
- **Earlier (2026-09-25):** GD.13 MERGED `047726e` (operator: "Approve and continue").
- **Earlier (2026-09-25):** GD.13 ON BRANCH `feat/console-11-gd13-disabled-explained`.
  `DisabledReason` in `@forge/design` and `GuideLink` in the Console; every one of the 33 controls
  disabled for a reason other than an in-flight request names its reason with `aria-describedby`
  (missing fields listed, limits, dual control, no bundle, no plan, a run in flight, the list not yet
  loaded); the locks that remove a control link to their cause (tier refusal -> `cfg-who` via
  `TierRequired`, read-only settings -> `cfg-apply` or `setc-sections`, not-yet-available features ->
  the posture section, enforcement off -> `cfg-endpoints`). INV-GUIDE-DISABLED-EXPLAINED contract test
  scans the source: an unexplained `disabled={...}` or a link to a missing section fails the gate.
  NEXT after review = GD.N (capstone).
- **Earlier (2026-09-25):** GD.12b MERGED `3e0aa13` (operator: "Approve and continue").
- **Earlier (2026-09-25):** GD.12b ON BRANCH `feat/console-11-gd12b-field-help`: the
  VTZ editor (name rule checked as typed via `vtzNameProblem`, description counted in UTF-8 bytes,
  session duration bounded), the policy form (name and description byte limits, the port range as
  `POLICY_PORT_MIN`/`POLICY_PORT_MAX`), the risk-acceptance date (the engine's 365-day bound, which
  the form did not check before), the IdAM cadences (range now disables Save connector), a format
  hint on the Objects value; engine bounds mirrored in `@forge/contracts` with their crdb source
  named; chapters 7, 9, 11, 13 and 14 carry `data-const` markers (`data-format="grouped"` for
  86,400-style numbers). Users has no field with a limit, so it gets none. NEXT after review = GD.13.
- **Earlier (2026-09-25):** GD.12a MERGED `709efc0` (operator: "Merge and continue").
- **Earlier (2026-09-25):** GD.12a ON BRANCH `feat/console-11-gd12-infotips`. GD.12 is
  split: 12a = `InfoTip` + `FieldHint` in `@forge/design`, the Settings limits as named constants
  (`MAX_SETTING_VALUE_CHARS`, `MAX_SECTION_TEXT_CHARS`, `MAX_EGRESS_ID_CHARS`, `SOC_TIER_MILLI_MAX`,
  `LUG_THRESHOLD_PERMILLE_MAX`) shown under the Settings fields and enforced before the confirm to
  the engine's rules, and the guide's `data-const` markers rendered from the code
  (INV-GUIDE-ONE-SOURCE contract test). 12b = the other surfaces' forms. NEXT after review = GD.12b.
- **Earlier (2026-09-25):** GD.11 MERGED `86835eb` (operator: "Approve and continue").
- **Earlier (2026-09-25):** GD.11 ON BRANCH `feat/console-11-gd11-side-panel`: a Help control in the
  top bar opens the shared Drawer at the guide section for the active destination (on Settings, the active
  tab), with links to the full chapter and the section in the ReadMe; closing returns focus to the control.
  Every destination and every Settings tab is mapped (not only Settings); a contract test proves each map
  entry names a section the guide contains (INV-GUIDE-CONTEXTUAL). The Settings tab list moved to
  `surfaces/settingsTabs.ts` so the surface and the map share it.
- **Earlier (2026-09-25):** GD.10 MERGED `5b5da46` (operator: "Approve and continue"); every chapter is now
  verified against the code. NEXT = GD.11 (the contextual side panel).
- **Earlier (2026-09-25):** GD.10 ON BRANCH `docs/console-11-gd10-overview-nav`: `TRD-CONSOLE-01`
  and `-12` refreshed (as-built sections, known gaps), `TRD-CONSOLE-00` Sections 5 and 12 amended (nine
  destinations, the real click paths with the two over-budget tasks, the built tab strips and freshness, the
  surface catalog), `SUITE.md` statuses and terminology; chapters 3 and 16 re-verified (click counts, what
  refreshes, which actions confirm, the Settings tabs, session lifetime, states; demo rings, destination
  lists, capabilities, recent decisions always empty, the pending notes); fixed: the Isolate result line
  now renders inside the drawer with true text and per-status failures (CD-64, CD-46); new defect CD-63
  (recent decisions); coverage gate widened to `overview.*` and `entity.*`, so every manifest binding is in
  scope ahead of GD.N.
- **Earlier (2026-09-25):** GD.9 MERGED `6cc2980` (operator: "Approve and continue"). NEXT = GD.10 (TRD-CONSOLE-01,
  -12 and the TRD-CONSOLE-00 navigation and surface catalog; the Navigating and Overview chapters).
- **Earlier (2026-09-25):** GD.9 ON BRANCH `docs/console-11-gd9-logs-reports`: `TRD-CONSOLE-09`
  and `TRD-CONSOLE-08` refreshed (an as-built section each, unmet acceptance marked, known gaps kept);
  chapters 14 and 15 re-verified (episode rows, the time range has no end bound, export semantics and
  messages, row click, Candidate; the per-section report sources and the refused-narrative template);
  fixed: the gateway dropped `offset` so the Logs background pager fetched page 0 for every page (CD-13),
  the Logs export failure line (no longer "nothing recorded" after an engine fault), the weekly-refusal
  title; new defects CD-61, CD-62; coverage gate widened to `logs.*`.
- **Earlier (2026-09-25):** GD.8 MERGED `73999e6` (operator: "Approve and continue"). NEXT = GD.9 (TRD-CONSOLE-09 and
  -08 refresh; the Logs and Reports chapters re-verified).
- **Earlier (2026-09-25):** GD.8 ON BRANCH `docs/console-11-gd8-soc`: `TRD-CONSOLE-03` refreshed (a
  Section 0b as built, the binding table replaced, resolved deferrals marked, known gaps added, A11 marked
  unmet); the IP-CONSOLE-03 ledger corrected (hashes, S3.9b, the wire fix, S3.14 NOT BUILT, prerequisites,
  a new Resume-here); chapter 13 re-verified (calibration only from true / false positives, a false
  positive is technique-scoped and reversible, a verdict run is not on the incident trail, the 365-day
  lapse limit, messages); fixed: the SOC copy (CD-60, CD-33); new defect CD-59; coverage gate widened to
  every `soc.*` binding (the Reports chapter declares `soc.report` / `soc.weekly`; verified in GD.9).
- **Earlier (2026-09-25):** GD.7 MERGED `fae079b` (operator: "Approve and continue"). NEXT = GD.8 (TRD-CONSOLE-03
  refresh and the IP-CONSOLE-03 ledger; the SOC Operations chapter re-verified). The GD.6 / GD.7 Console
  fixes (policy Delete, connector state, form messages) need a Console install on the box to be live.
- **Earlier (2026-09-25):** GD.7 ON BRANCH `docs/console-11-gd7-identity`: `TRD-CONSOLE-04`
  refreshed (kinds and statuses as built, one node-wide Auth0 connector and its three-step save, bounded
  read, audit and tier facts, a new Section 7 of known gaps); chapters 7 and 8 re-verified (onboarding is
  Configure on a Disabled card, the delta poll reads logs, the nil-tenant limitation, credential checks,
  Sync Now semantics, Edit conflict meaning, the group member-count search); fixed: the connector read a
  live loop as permanently Syncing and disabled Sync Now (CD-56), the Users / group forms' session, outage
  and Edit-conflict lines (CD-55), the Sync and Revoke confirm copy; new defects CD-57 (nil tenant, engine)
  and CD-58; coverage gate widened to `users.*`, `groups.*`, `idam.*`.
- **Earlier (2026-09-25):** GD.6 MERGED `19db9a4` (operator: "Approve and continue"). NEXT = GD.7 (TRD-CONSOLE-04
  refresh; the identity-provider and users chapters re-verified). The policy Delete fix (CD-52) needs a
  Console install on the box to be live.
- **Earlier (2026-09-25):** GD.6 ON BRANCH `docs/console-11-gd6-policies`: `TRD-CONSOLE-05`
  refreshed (inline form, LIVE bindings, Applied To stored but unused, active window engine-only, unmet
  acceptance lines marked with their census ids, known gaps added to Section 8); chapters 11 and 12
  re-verified (bundle contents, role rules, byte limits, messages, breaking semantics, Applied meaning,
  looser-bundle refusal, signing key ownership); fixed: every policy Delete reported a failure (CD-52), the
  Policies form's session / outage copy, the publish confirm's Applied-To claim, three "until separately
  engaged" strings; new defects CD-53, CD-54; coverage gate widened to `policies.*`.
- **Earlier (2026-09-25):** GD.5 MERGED `7b7676f` (operator: "Approve and continue"). NEXT = GD.6 (TRD-CONSOLE-05
  refresh; the Policies and distribution chapters re-verified).
- **Earlier (2026-09-25):** GD.5 ON BRANCH `docs/console-11-gd5-objects`: `TRD-CONSOLE-10`
  refreshed (Kernel is not operator-authored; four kinds have no members; complete bounded catalog; delete
  is live; a new Section 8 keeps 20 unbuilt requirements); chapter 10 re-verified (41 claims confirmed;
  corrected: kind:name case, message meanings, members for four kinds and the 500 cap, drawer tags); the
  Objects form now names an expired session and an unreachable engine instead of "refused" (CD-51, fixed);
  new defects CD-48 to CD-50; coverage gate widened to `objects.*`.
- **Earlier (2026-09-25):** GD.4 MERGED `72306ab` (operator: "Continue"). NEXT = GD.5 (TRD-CONSOLE-10 refresh;
  the Objects chapter re-verified).
- **Earlier (2026-09-25):** GD.4 ON BRANCH `docs/console-11-gd4-vtz`: `TRD-CONSOLE-02` refreshed
  to the built surface (posture is two-valued per domain and not authored here; zone settings, the four
  commands, the card grid, refusal classes) with a new Section 8 recording 15 unbuilt requirements with their
  census ids; chapter 9 re-verified (about 60 claims confirmed; corrected: the move/rename limitation can
  overwrite another zone's settings, refusal causes, byte limits, the create result, "explicitly denies",
  the risk badge documented); the zone card's stale policy tooltip fixed; coverage gate widened to `vtz.*`.
- **Earlier (2026-09-25):** GD.3 MERGED `9e95522` (operator: "Approve and continue"). NEXT = GD.4 (TRD-CONSOLE-02
  refresh; the Virtual Trust Zones chapter re-verified).
- **Earlier (2026-09-25):** GD.3 ON BRANCH `docs/console-11-gd3-settings-chapters`: the three
  Settings chapters re-verified against the code (rule R3; a read-only agent checked ~115 claims, 12 were
  wrong and are corrected: version numbering, history limit, principal ids, refusal meanings and texts,
  stale proposals, button labels, tier scope, SIEM token refresh needs a restart, p_high = 1000, the
  Security tab's connections, FIPS wording); new defect CD-47 (the version line shows the store's latest
  version); INV-GUIDE-COVERS-EVERY-CONFIG scoped to Settings (sections declare `data-covers`; a contract
  test fails an undocumented `settings.*` / `soc.settings.*` binding).
- **Earlier (2026-09-25, ~17:20 UTC):** GD.2 MERGED `08b6496` on the operator's approval ("Merge and
  continue"): the ReadMe tab (build-time conversion). NEXT = GD.3 (the Settings chapters in the ReadMe
  with live values).
- **Earlier (2026-09-25):** GD.2 ON BRANCH `feat/console-11-gd2-readme`. Crucible CI was red on `main` (SET.5 assumed version 1
  holds no configuration; on GitHub CI the configuration is the first commit): fixed `c5590958` (rollback
  to version 0), pushed. FC GitHub CI needs the `CRUCIBLE_TOKEN` repository secret for the sidecar gate
  (operator action; the Copilot branch that skips the gate is not merged).
- **Earlier (2026-09-25, ~16:35 UTC):** GD.E0b MERGED `93a9984` on the operator's approval ("Merge and
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
| GD.2 | 11.2 (1), 11.5 | MERGED `08b6496` (2026-09-25; full gate green, e2e 41/41) | `844fb63` | the ReadMe tab: generated typed tree of the GD.S1 chapters (build-time sanitized), contents, filter, reload-safe deep links, live Settings reference |
| GD.3 | 11.6 | MERGED `9e95522` (2026-09-25; full gate green, e2e 41/41) | | Settings chapters re-verified (12 corrections, CD-47); live values delivered by GD.2; Settings-scoped coverage gate |
| GD.4 | 11.6 | MERGED `72306ab` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-02 refreshed (Section 8 known gaps); chapter 9 re-verified; coverage gate `vtz.*` |
| GD.5 | 11.6 | MERGED `7b7676f` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-10 refreshed (Section 8); chapter 10 re-verified; objects failure copy fixed; coverage `objects.*` |
| GD.6 | 11.6 | MERGED `19db9a4` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-05 refreshed; chapters 11-12 re-verified; policy Delete fixed (CD-52); coverage `policies.*` |
| GD.7 | 11.6 | MERGED `fae079b` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-04 refreshed; chapters 7-8 re-verified; connector Syncing (CD-56) and users copy (CD-55) fixed; coverage users/groups/idam |
| GD.8 | 11.6 | MERGED `73999e6` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-03 refreshed; IP-CONSOLE-03 ledger corrected; chapter 13 re-verified; SOC copy fixed (CD-60); coverage `soc.*` |
| GD.9 | 11.6 | MERGED `6cc2980` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-09 and -08 refreshed; chapters 14-15 re-verified; Logs offset (CD-13) and export copy fixed; coverage `logs.*` |
| GD.10 | 11.6 | MERGED `5b5da46` (2026-09-25; full gate green, e2e 41/41) | | TRD-CONSOLE-01, -12 refreshed, -00 Sections 5 and 12, SUITE; chapters 3 and 16 re-verified; Isolate result fixed (CD-64); coverage overview/entity |
| GD.11 | 11.2 (2) | MERGED `86835eb` (2026-09-25; full gate green, e2e 42/42) | | Help control -> Drawer at the section for the destination and Settings tab; every destination mapped; INV-GUIDE-CONTEXTUAL contract test |
| GD.12a | 11.2 (3) | MERGED `709efc0` (2026-09-25; full gate green, e2e 42/42) | | InfoTip + FieldHint; Settings forms show and enforce the engine limits from named constants; guide `data-const` markers rendered live; INV-GUIDE-ONE-SOURCE contract test |
| GD.12b | 11.2 (3) | MERGED `3e0aa13` (2026-09-25; full gate green, e2e 42/42) | | the same for VTZ, Objects, Policies, Users/groups, IdAM, SOC case controls, Logs |
| GD.13 | INV-GUIDE-DISABLED-EXPLAINED | MERGED `047726e` (2026-09-25; full gate green, e2e 42/42) | | DisabledReason + GuideLink; 33 disabled controls state why; hidden locks link to their cause; source-scanning contract test |
| GD.N | 11.6; INV-GUIDE-COVERS-EVERY-CONFIG | ON BRANCH `feat/console-11-gdn-capstone` | | capstone: global coverage (89/89), Playwright journeys, Console installed live + bundle verified; logged-in walk owed to the operator |
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
