# IP-CONSOLE-11-guide -- the in-app configuration guide (the ReadMe tab)

The ForgeCentral plan for `TRD-CONSOLE-11` Section 11 (added 2026-09-25): an instruction manual inside
the Console that explains **every configuration available in ForgeCentral**, on every surface, served
from Settings as the **ReadMe** tab for now. The same PR series brings the surface TRDs current,
because the census that grounds the guide found every one of them drifted.

Authored 2026-09-25 from the configuration census (`IP-CONSOLE-11-guide-CENSUS.md` and its six
evidence slices in `IP-CONSOLE-11-guide-census/`). Operator rulings, 2026-09-25:
1. The guide covers all the configurations available in ForgeCentral, not just Settings.
2. Forge is the platform; the repository names are internal naming only and never appear in the guide.
3. The ReadMe lives under Settings for now.
4. The engine additions and the setup wizard are part of this plan but DEFERRED.

**Named invariants** (TRD-CONSOLE-11 11.6, plus GD.1's):
- `INV-GUIDE-COVERS-EVERY-CONFIG` -- every command binding in the no-stub manifest and every registry
  row the Console can edit has a guide entry; a missing entry fails the gate (scoped per chapter,
  global at GD.N).
- `INV-GUIDE-ENGINE-VALUES-LIVE` -- engine-owned reference facts (a setting's default, bound, apply
  class, change path) render from the live engine read, never copied into the content.
- `INV-GUIDE-ONE-SOURCE` -- a Console-side constraint shown in the guide or the micro-copy is the
  validator's own exported constant.
- `INV-GUIDE-ADDRESSABLE` -- every section has a stable id and deep link, within three clicks of the
  Overview.
- `INV-GUIDE-CONTEXTUAL` -- the side panel opens at the section for the active surface and tab.
- `INV-GUIDE-DISABLED-EXPLAINED` -- every disabled or locked configuration control states why and
  links to the cause.
- `INV-GUIDE-FORGE-NAMING` -- guide prose contains no internal component or repository name.
- `INV-BINDING-ROUTE-COVERAGE` (GD.1) -- every BFF route maps to a registered binding and every LIVE
  binding to a route, so the manifest is a trustworthy index of the Console's operations (the claim
  `packages/contracts/src/binding.ts:4-7` and `TypeScript_Dev_Rules.md` Section 17 already make).
- Inherited: `INV-CONSOLE-NO-STUB`, `INV-CONSOLE-3-CLICKS`.

## Read with

`TRD-CONSOLE-11` Sections 9 to 11 (revised with this plan); `IP-CONSOLE-11-guide-CENSUS.md` (what
exists, the defect register, the TRD drift register) and its slices (the per-item evidence each
chapter is written from); `TRD-CONSOLE-00` Section 6 and `docs/ui-examples/` (the ReadMe, the side
panel and the info tips must look like they belong in that set); each surface TRD its chapter
refreshes; `TypeScript_Dev_Rules.md` Section 17 (the no-stub contract GD.1 makes real).

## What already exists (do not rebuild)

- **The Settings surface** (`SettingsSurface.tsx`) and its fixed `TabStrip`; the ReadMe is one more tab.
- **The design components** in `@forge/design`: `Drawer` (the side panel), `TabStrip`, `GlassPanel`,
  `DataTable`, `Badge`, `AccordionGroup`, `ConfirmDialog`. The side panel reuses `Drawer`; the info tip
  is the one new component (GD.12).
- **The live reference.** `SETTINGS_READ` already returns every registry row with its summary, default,
  bound, apply statement, change path and editability, and the Configuration tab renders it. The
  Settings chapter renders the same read; nothing is copied.
- **The validators** in `@forge/contracts` (for example `toSettingsCommitRequest`, `toSocSettingsPatch`,
  `toVtzSpecInput`): GD.12 exports their limits as named constants so the micro-copy and the validator
  share one source.
- **The binding manifest** (`packages/bindings/src/manifest.ts`): 72 bindings. GD.1 completes and
  enforces it; the coverage invariant keys off it.

## Decisions for the operator (open)

- **N1 -- the naming glossary for guide prose.** Proposed: "Forge" (the platform), "ForgeCentral" (the
  console), "the Forge engine" (the data and detection engine), "the Forge endpoint agent" (the host
  agent). A command or path an operator must type appears verbatim only inside a copyable code block.
  Needed before GD.2 (chapter 1 uses it).
- **N2 -- how the guide treats the census defects.** (a) RECOMMENDED: document the product as it
  behaves, state each broken or missing behaviour as a known limitation with its workaround, and fix
  the defects on their own schedule (each fix updates its entry, rule R4); (b) fix the S1 and S2
  defects first and write the affected chapters after; (c) leave broken configurations out until
  fixed. Needed before GD.3.
- **N3 -- the registry's live-apply text (CD-18).** The Settings chapter renders the engine registry's
  text live, and several rows over-claim ("Live" for settings that bind at start). RECOMMENDED: a
  small crdb correction of those rows before GD.3 (a defect fix, not an engine addition); otherwise
  GD.3 shows the rows with a caveat.

## Rules

- **R1** One PR per step; branch per PR; the FULL `scripts/ci.sh` (no flags) on the box before every
  push; no-ff merge; docs commits separate from code commits; each PR reviewed before the next.
- **R2** Each chapter PR refreshes its surface TRD against the census (a docs commit) and writes the
  chapter with its scoped coverage test (a code commit).
- **R3** Chapter content comes from the census slices, re-verified against the code in the chapter's
  PR (the census is dated 2026-09-25; the code moves).
- **R4** A PR that fixes a census defect updates the guide entry the defect touches.
- **R5** Guide prose follows `TRD-CONSOLE-11` 11.3: Forge naming, active voice, no copied engine
  values, honest about limitations, no em dashes.

## Roster

| Step | Acceptance | Deliverable |
|------|-----------|-------------|
| **GD.0** | TRD 9-11 | **The plan (this PR, docs only):** the census and its six slices; `TRD-CONSOLE-11` revised (Section 9 as built, Section 10 the known gaps, Section 11 the guide); this plan and its ledger; the `IP-CONSOLE-11-settings` ledger corrected (ST.7 superseded, the ST.9 note). |
| **GD.1** | 9.4; `INV-BINDING-ROUTE-COVERAGE` | **The manifest becomes the complete, enforced index.** Register the 17 unbound routes (the ten Settings operations plus `console-rbac` and `security-session`, the SOC KPI / report / weekly reads, Overview members, the IdAM secret write); `logs.export` becomes an audited command; correct the stale header comments; add the contract test that maps every BFF route to a registered binding and every LIVE binding to a route. No runtime behaviour change. |
| **GD.2** | 11.2 (1), 11.5; `INV-GUIDE-ADDRESSABLE`, `INV-GUIDE-FORGE-NAMING` | **The ReadMe tab and the content model.** `apps/console/src/guide/`: typed content (sections with stable ids; entries keyed to binding ids and registry keys), rendered by React (no Markdown library, no raw HTML); the contents, the filter, deep links that survive a reload; the naming lint; chapter 1, "How configuration works in Forge" (where configuration lives, how a change applies, who can do what today, what is audited, tenancy, what reaches an endpoint). Needs N1. |
| **GD.3** | 11.6; `INV-GUIDE-ENGINE-VALUES-LIVE` | **Chapter: Settings** (all ten tabs; the Configuration reference rendered live from `SETTINGS_READ`). The TRD is already current (GD.0). Needs N2, N3. |
| **GD.4** | 11.6 | **Chapter: Virtual Trust Zones** + `TRD-CONSOLE-02` refresh. |
| **GD.5** | 11.6 | **Chapter: Objects** + `TRD-CONSOLE-10` refresh. |
| **GD.6** | 11.6 | **Chapter: Policies and distribution** + `TRD-CONSOLE-05` refresh. States plainly what reaches an endpoint today (census fact 7). |
| **GD.7** | 11.6 | **Chapter: Users, groups and identity providers** + `TRD-CONSOLE-04` refresh. |
| **GD.8** | 11.6 | **Chapter: SOC operations** + `TRD-CONSOLE-03` refresh + the `IP-CONSOLE-03-soc-ops` ledger corrections (census L-03). |
| **GD.9** | 11.6 | **Chapter: Logs and reports** + `TRD-CONSOLE-09` and `TRD-CONSOLE-08` refresh. |
| **GD.10** | 11.6 | **Chapter: Overview, the entity drawer and navigation** + `TRD-CONSOLE-01`, `TRD-CONSOLE-12` and the `TRD-CONSOLE-00` navigation and surface catalog refresh. |
| **GD.11** | 11.2 (2); `INV-GUIDE-CONTEXTUAL` | **The contextual side panel.** A help control opens the shared `Drawer` at the section for the active surface and tab (a route-to-section map in the content model), with links to the full chapter and back to the control. Starts on the Settings tabs, then every surface. |
| **GD.12** | 11.2 (3); `INV-GUIDE-ONE-SOURCE` | **Inline micro-copy and info tips.** An accessible `InfoTip` in `@forge/design`; each configuration field gets its one-line help, default and format; validation constraints visible under the field; the Console's limits exported from the `@forge/contracts` validators as named constants and rendered from them. |
| **GD.13** | `INV-GUIDE-DISABLED-EXPLAINED` | **State-aware explanations.** Every disabled or locked configuration control states why (dual control, boot-bound, pending subsystem, tier refusal, signer or secret plane not provisioned, enforcement off) and links to the cause (the setting, the tab or the guide section). |
| **GD.N** | 11.6; `INV-GUIDE-COVERS-EVERY-CONFIG` | **Capstone.** The global coverage test; Playwright journeys (Overview -> Settings -> ReadMe -> a section in three clicks; the filter; a deep link across a reload; the side panel matching the tab); the full gate; the live drive on the box; the ledger closed. |

### Deferred (operator ruling 2026-09-25: part of this plan, not scheduled)

| Step | What it lands | Waits on |
|------|---------------|----------|
| **GD.E1** | crdb: the setting tier on the wire (`WireSettingRow` gains the tier; the registry assigns a tier to its section and environment rows, which have none today) | a crdb plan when scheduled |
| **GD.E2** | crdb: the deployment profiles on the wire (each profile's document and its difference from the committed one) | a crdb plan when scheduled |
| **GD.E3** | crdb: the detection report on the wire (`SETTINGS_REPORTS` gains `detection`), and an enrolled-endpoint read | a crdb plan when scheduled |
| **GD.D1** | The Advanced settings disclosure on Configuration and in the guide (Essential shown, Advanced collapsed), driven by the engine's tier | GD.E1 |
| **GD.D2** | One-click profile templates: pick a profile, see the difference, commit it through the normal validated and audited path (propose under dual control) | GD.E2 |
| **GD.W1** | Setup wizard step 1: the engine connection and the admin-plane crypto (validate with the server and connectivity reports and the session's key exchange) | GD.2 |
| **GD.W2** | Wizard step 2: the identity provider (validate with the connector state and a sync) | CD-15 fixed (recommended) |
| **GD.W3** | Wizard step 3: endpoints enrolled and reporting (validate with an enrolled-endpoint read) | GD.E3 |
| **GD.W4** | Wizard step 4: detection content served (validate with the detection report) | GD.E3 |
| **GD.W5** | Wizard step 5: governance (a zone, a policy, a distribution that converges; validate with convergence) | CD-05, CD-06, CD-07, CD-08 fixed |

## Cross-repo notes

The scheduled steps change ForgeCentral only. The deferred engine rows (GD.E1 to GD.E3) become a crdb
plan when the operator schedules them. The census defects (`IP-CONSOLE-11-guide-CENSUS.md`, CD-01 to
CD-44) span all three repos and are scheduled separately; the S1 items are the operator's first call
(the IdAM secret write, the host-wide egress attach on bundle apply, the missing operator
authorization, the sidecar's loopback trust).
