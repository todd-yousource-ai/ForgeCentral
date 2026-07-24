# IP-CONSOLE-05-POLICIES -- landing ledger

Plan: `IP-CONSOLE-05-policies.md` (TRD-CONSOLE-05, Policies). Created WITH the plan (2026-07-24) per the
ledger discipline: **every step's row is updated (status + commit hash) in the same session its PR merges,
and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-24): P5.1..P5.6 LANDED; P5.N TEST HALF LANDED. ONLY REMAINING = the box redeploy
  LIVE LEG** (rebuild+redeploy the FC BFF/SPA + sidecar; bump the torch pinned crdb revs so torchd
  verifies the v2 rules-carrying preimage, rebuild+redeploy torchd/torch-placed; drive the whole surface
  over the live node: author -> publish -> distribute -> torchd pull -> convergence; enforcement OFF;
  `FC_SIGNER_PORT` in the running BFF env; the standing live-proof rule applies: any stitching done for
  the live drive lands in installer/production code, never manual scratchpad state).
  The P5.N test half: the remaining capstone journeys (Save-&-Publish confirm e2e w/ the BREAKING flag
  surfaced -- incl. fixing the P5.4 defect where the form closed unconditionally and hid the flag;
  engine-refusal 400 read-back; edit-mints-a-version-chip; Logging exact-three structural; the vtz.spec
  no-distribute sweep) + the acceptance-sweep table below FILLED against `TRD-CONSOLE-05 §7`.
  P5.6 (docs-only) was a grounding CORRECTION rather than a landing: `06`/`07-*.png` were already in the
  original 2026-07-05 set (their README rows now carry the substrate reconciliation), and the Create
  Policy modal mock never reached disk -- the design-session attachment was reviewed but not landed, and
  the `08-*.png` name the revision cited collides with TrustOps Rewind. TRD Section 0/3 now name Section 3
  itself as the modal's grounding (P5.4 built to it). FORGE-DISTRIBUTION's FD.7c status is closed with the
  P5.5 re-home record.
  P5.5 shipped as THREE PRs -- two crdb prerequisites and the FC half:
  (a) crdb `501ab1ea`: the `POLICY_EFFECTIVE` wire read (the PS.7 seam; producer expiry engine-side).
  (b) crdb `5be841b3` (operator decision: EXTEND THE BUNDLE): `BundleRule` + `SignedPolicyBundle.rules`;
  the preimage VERSIONED -- empty rules = the frozen byte-identical v1 (golden vector preserved, every
  stored bundle verifies unchanged), rules-carrying = the disjoint `POLICY_BUNDLE_PREIMAGE_DOMAIN_V2`
  with the rules signature-bound (strip/inject both fail).
  (c) FC (this PR): schemas re-vendored+regen; sidecar revs -> `5be841b3` w/ `BundleDraft.rules`
  passthrough (the SHARED `bundle_preimage_bytes` signs v2; seam tests green); BFF `policyEffective`
  read; `composeBundleRules` (fail-closed); `resolveDistribute` composes the zone's effective published
  policies into the signed draft + reports `carriedRules`/`carriedPolicies`; the `DistributionPanel`
  gains the confirm gate (names the endpoint set) and mounts per-zone on the POLICY surface;
  `policies.convergence` + `policies.distribute` bindings LIVE; the VTZ surface structurally asserts NO
  distribute control; a distribute e2e journey.
  **TORCH COMPAT NOTE (named): a deployed torchd pinned to an older rev decodes a rules-carrying bundle,
  drops the unknown field, derives the v1 preimage, and REJECTS it as SignatureInvalid -- fail-closed and
  visible as `rejected` in the convergence ledger until the torch rev bump (fold into
  IP-TORCH-POLICY-ENFORCE / the P5.N live leg).**
  P5.4 code `f00f650`: the authoring plane -- BFF command path (dispatch PolicyCreate/Edit/Publish/Delete;
  `CrucibleClient`/`WireCrucibleClient` + `replyToPolicyMutated`; `OperatorEngine` 4 delegated commands;
  `engine/policies.ts` resolvers; `POST /api/policies[/edit|/publish|/delete]` mounted before the 405 gate,
  refusal mapping 409/400/403, cache-drop on success; `@forge/contracts toPolicyDraftInput` fail-closed
  body parser). SPA: `usePolicyMutation` (`useSavePolicy` create/edit-then-publish + `useDeletePolicy`),
  `PolicyForm` (name/zone/Subjects+Targets over `objects.list`/cross-product ruleset/protocol chips+validated
  ports/four-action/three-logging/Restrictions+Advanced collapsibles; Save-Draft vs Save-&-Publish
  confirm-gated), `PoliciesSurface` enables Create + per-row Edit/Delete (critical confirm). Full networked
  gate (incl. e2e 31 + audit) green.
  **P5.4 deferrals (honest, gating named):** (1) absolute active-window (from/until) authoring -- the engine
  bound is an opaque HLC `u64` with no Console-facing wall-clock->HLC conversion, so a datetime control would
  emit a wrong-scale bound (a governance lie); schedule(days/hours)/geo/tags ARE authored. Gated on a
  documented Console-facing HLC conversion (crdb). (2) Applied-To authored as free-text endpoint CNs -- no
  enrollable-endpoint list read exists yet.
  The design PR merged `e0f02bd`. P5.1 code `22c5cf5`: contract. P5.2 code `d8cc202`: the BFF read path.
  P5.3 code `ce7f3f3`: the grouped read-only surface -- net-new `AccordionGroup` primitive in
  `packages/design` (first collapsible-group, `.fc-accordion*`); `usePolicies` (TanStack Query over
  `GET /api/policies`) + `PoliciesSurface` (header + search + zone filter + a present-but-DISABLED Create
  control; policies grouped by VTZ into accordions ordered by the live `vtz.tree`, each expanding to a
  `DataTable` with the `07-*.png` columns; closed-enum action/logging cells; pure cell summaries; honest
  loading/empty/error); `policies` route replaces its placeholder + added to no-stub `REAL_SURFACES`;
  read-only e2e journey. Full gate + 29 Playwright green.
  **A supply-chain CI fix landed alongside (merge `8bbf870`): postcss override to `^8.5.18` +
  a fail-closed audit-waiver for the RSC-only react-router advisory (GHSA-qwww-vcr4-c8h2, expires
  2026-10-24; the v7->v8 migration is the real fix).**
- **Cross-repo prerequisite SATISFIED:** the crdb substrate (`crdb IP-CONSOLE-POLICY-SUBSTRATE`) is
  COMPLETE IN CODE -- PS.1..PS.N all landed 2026-07-24 (PS.N capstone merge crdb `69b0057a`; full gate +
  ueba suite green; PS.3..PS.N awaiting operator review). The policy DTOs regen into
  **`wire-dto.schema.json`** (not forge-dto; the artifact `@forge/contracts` vendors -- deviation flagged
  in the crdb ledger). The deferred-live :7878 drive folds into P5.N.
- **Inherited unfinished work absorbed:** `IP-CONSOLE-02-FORGE-DISTRIBUTION` FD.7c -- the `DistributionPanel`
  + `useDistribution` + `apps/bff/src/engine/distribute.ts` exist and the convergence read is proven live,
  but the panel was reverted off the VTZ surface (wrong placement, 2026-07-21) and awaits re-homing. P5.5 is
  that re-home. The `packages/wire` `BundleCommit`/`BundleConvergence` CBOR codecs (fixed 2026-07-21) land
  with P5.5. `FC_SIGNER_PORT` must be in the running BFF env.
- **Reused live surfaces:** `vtz.tree` (grouping axis + VTZ dropdown), `objects.list` (subject/target
  pickers). Both COMPLETE. `policies.ts` reuses `ObjectKind`/`SelectorKind` from the Objects contract.
- **Next action:** P5.N -- the capstone. Much of the planned `policies.spec.ts` journey coverage already
  landed incrementally (grouped accordion + expand-to-table, Create w/ closed-enum controls + audited
  draft, delete confirm, distribute confirm + 3-state ledger, honest empty tenant); the REMAINING work:
  (1) the missing journey pieces -- Save-&-Publish confirm-gated end to end, a malformed-port 400 read
  back on the form, edit-of-published minting a new version chip; (2) the structural sweeps as named
  capstone assertions (four actions + three logging levels on the CONTROLS, no distribute on VTZ --
  partly present, consolidate); (3) fill the acceptance-sweep table below against `TRD-CONSOLE-05 §7`;
  (4) the box redeploy LIVE leg (the crdb node serves the whole surface + compose->sign->torchd-pull
  convergence, enforcement OFF; includes the torchd rev bump for the v2 rules-carrying preimage;
  `FC_SIGNER_PORT` must be in the running BFF env). `REAL_SURFACES` already carries `policies`.
- **P5.5 scope note (honest):** the distribute targets the CONVERGENCE members (the endpoints holding
  the prior bundle) as FD.7c always did -- an Applied-To-derived first-distribution target picker needs
  an enrolled-endpoint list read (the same deferral as the P5.4 Applied-To picker). The COMPOSED CONTENT
  is now the real authored policies; the target-set UX upgrade folds into that deferral.
- **P5.3 deviations (honest):** the mock's per-group "updated date" is omitted -- the wire record carries no
  updated timestamp (fabrication); the count badge stands in.
- Enforcement stays AG.7-OFF: a published + distributed bundle realizes nothing until enforcement is engaged.
- **Note:** the repo GitHub remote is `origin` (URL uses the `github-forgecentral` SSH host alias), not a
  remote literally named `github-forgecentral` (CLAUDE.md's naming is loose). Push `git push origin main`.

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| PS.1 | `Protocol`/`PortSpec`/`NetworkMatch` + TRD-32 v2 grammar amendment | LANDED | crdb `c2d4a3ce` (merge `dbbf1d49`) |
| PS.2 | `Schedule`/`ActiveWindow`/`PolicyRestrictions`/`PolicyLogging`/`DistributionScope` | LANDED | crdb `ebc801ea` (merge `44e390ec`) |
| PS.3 | `Policy` extended additively (name/network_match/restrictions/logging/applied_to/lifecycle) | LANDED | crdb `1b19ea7c` (merge `80938212`) |
| PS.4 | `Keyspace::Policy` + `policy_store` audited CRUD + published-version immutability + store-minted SemVer (breaking -> major) | LANDED | crdb `db8b007c` (merge `2b9a9fdd`) |
| PS.5 | `POLICY_LIST_BY_ZONE`/`POLICY_DETAIL` + `wire-dto.schema.json` regen (+359) | LANDED | crdb `0ec15ee4` (merge `713e98f0`) |
| PS.6 | `POLICY_CREATE/EDIT/PUBLISH/DELETE` audited commands + typed refusals + publish-only breaking flag | LANDED | crdb `88b54ba8` (merge `8b5ee9b4`) |
| PS.7 | `effective_published_policies` (composer seam; producer expiry) | LANDED | crdb `c41c5697` (merge `38f7060f`) |
| PS.N | live-node capstone (`policy_capstone.rs`); live :7878 drive deferred to P5.N | LANDED | crdb `975a0c32` (merge `69b0057a`) |
| P5.5-crdb-a | `POLICY_EFFECTIVE` wire read (the PS.7 composer seam over the wire: `WirePolicyEffectiveQuery`/`WirePolicyEffective` + handler w/ engine-side producer expiry at `Hlc(now_ms())`; INV-WIRE-POLICY-EFFECTIVE) | LANDED | crdb `4496fd63` (merge `501ab1ea`) |
| P5.5-crdb-b | the signed bundle carries the authored rulesets (operator decision): `BundleRule` + `SignedPolicyBundle.rules` (serde-default; stored bundles decode unchanged); VERSIONED preimage -- empty rules = frozen byte-identical v1 (golden vector preserved), non-empty = disjoint `POLICY_BUNDLE_PREIMAGE_DOMAIN_V2` w/ rules signature-bound (strip/inject both fail); forge-dto schema + x-fieldOrder regen | LANDED | crdb `698efee6` (merge `5be841b3`) |

## Roster (Console PRs)

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| P5.1 | `INV-CONSOLE-POLICIES-CONTRACT` | LANDED | `22c5cf5` | schema re-vendor (PS.5 DTOs, +683) + `policies.ts` view models (`PolicyRow`/`PolicyDetailView`/`PolicyDraft`) + fail-closed closed-enum projections (four actions, three logging levels, + protocol/selector/kind/lifecycle/day/classification); `policies.*` bindings registered (byZone/detail + create/edit/publish/delete LIVE over PS.5/PS.6; enforcement-runtime PENDING -> torch). Reuses `ObjectKind`/`SelectorKind` from Objects |
| P5.2 | `INV-CONSOLE-POLICIES-BROKERED` | LANDED | `d8cc202` | dispatch `PolicyListByZone`/`PolicyDetail` on QuerySubmit; `CrucibleClient`+`WireCrucibleClient` methods + `replyToPolicyList`/`replyToPolicyDetail`; `OperatorEngine` delegated reads (operator+tenant injected, delegation recorded); `engine/policies.ts` fail-closed -> `PoliciesUnavailableError`; `GET /api/policies`(+`/detail?vtz=&id=`) 401/503/400/503; tenant-scoped `policies-v1` cache; resolver+route+delegation tests |
| P5.3 | `INV-CONSOLE-POLICIES-GROUPED` | LANDED | `ce7f3f3` | net-new `AccordionGroup` primitive (`packages/design`, `.fc-accordion*`) + `usePolicies` + `PoliciesSurface`: header/search/zone-filter/disabled-Create; per-VTZ accordions (count badge, ordered by live `vtz.tree`) -> `DataTable` w/ the 07 columns (closed-enum action/logging cells, pure summaries); honest states; `policies` route replaces placeholder + no-stub `REAL_SURFACES`; read-only e2e |
| P5.4 | `INV-CONSOLE-POLICIES-AUTHOR` | LANDED | `f00f650` | BFF command path (dispatch + `CrucibleClient`/`WireCrucibleClient` + `OperatorEngine` 4 delegated cmds + `engine/policies.ts` resolvers + `POST /api/policies[/edit|/publish|/delete]` before the 405 gate, 409/400/403 mapping, cache-drop; `@forge/contracts toPolicyDraftInput` fail-closed parser); SPA `usePolicyMutation` (`useSavePolicy` create/edit-then-publish + `useDeletePolicy`) + `PolicyForm` (08 modal: name/zone/subjects/targets cross-product/protocol chips+validated ports/action(4)/logging(3) + Restrictions[days+hours+geo+tags] + Advanced[Applied-To+classification+description]; Save-Draft vs Save-&-Publish confirm-gated) + surface Create/Edit/Delete. **Deferred: absolute active-window authoring (opaque HLC); Applied-To = endpoint CNs.** |
| P5.5 | `INV-CONSOLE-POLICIES-DISTRIBUTED` | LANDED | `28bbfc4` | the FD.7c re-home + the REAL policy carriage: schemas re-vendored + regen (`WirePolicyEffective*`, `BundleRule`, `rules` in `FORGE_FIELD_ORDER`); sidecar revs bumped to crdb `5be841b3` + `BundleDraft.rules` passthrough (the shared `bundle_preimage_bytes` signs v2 when rules carried; seam tests green); BFF `policyEffective` read (dispatch/client/wire-client/operator-engine); `contracts composeBundleRules` (fail-closed; contributors from SemVer); `resolveDistribute` composes POLICY_EFFECTIVE -> rules+contributors into the signed draft (`DistributeCompositionError` -> 503; nothing half-composed reaches the signer); `DistributionPanel` gains the P5.5 confirm gate (names the endpoint set) and mounts per-zone on `PoliciesSurface`; `policies.convergence`+`policies.distribute` bindings LIVE; VTZ structural no-distribute assert; distribute e2e journey |
| P5.6 | `INV-CONSOLE-POLICIES-GROUNDED` | LANDED | `16614e2` | grounding CORRECTED, not landed-anew: `06`/`07` were already in the 2026-07-05 set (README rows now carry the substrate reconciliation: logging 3-not-mock's, action 4-not-3, no updated-date, distribution lives here); the Create Policy modal mock NEVER landed (design-session attachment; the cited `08-*.png` collides with TrustOps Rewind) -- TRD Section 0/3 fixed to name Section 3 as the modal's grounding; FORGE-DISTRIBUTION FD.7c status closed w/ the P5.5 re-home record |
| P5.N | `INV-CONSOLE-POLICIES-COMPLETE` | TEST HALF LANDED (live leg pending) | `6e6b309` | the remaining capstone journeys: Save-&-Publish confirm-gated e2e w/ the BREAKING flag surfaced (fixed a P5.4 defect: the form closed unconditionally on success, making the breaking note unreachable -- it now stays open on a breaking ack); engine-refusal 400 read back as the typed failure line; edit mints a new version chip (stateful mock, the row is the engine record); Logging control exact-three structural (Action exact-four was already asserted); vtz.spec e2e no-distribute sweep; acceptance-sweep table FILLED against `TRD-CONSOLE-05 §7`. **Pending: the box redeploy live leg** (node serves the surface; compose->sign->torchd-pull w/ the v2 rules bundle; needs the torchd rev bump; enforcement OFF) |

## Acceptance sweep (TRD-CONSOLE-05 Section 7) -- FILLED at P5.N (test half)

| Acceptance row | Proven by |
|---|---|
| Every policy row/field is a real engine record; no fabricated policy | contracts `policies.test.ts` (fail-closed projections; one malformed record collapses the list) + bff `policies.test.ts` (`PoliciesUnavailableError`) + e2e "an empty tenant renders the honest empty state" |
| Grouping is by real `Policy.vtz` over live `vtz.tree` | surface test "renders one collapsible group per zone" (tree-ordered groups) + e2e "VTZ-grouped accordions expand to the real policy table" |
| Action control = exactly four; logging = exactly three; no unstorable value | contracts closed enums (`POLICY_ACTIONS`/`POLICY_LOGGING` + fail-closed narrowers + `toPolicyDraftInput` refusals) + e2e structural asserts on BOTH controls (`allTextContents` exact) |
| Source/destination real `ObjectRef`; IP/subnet = `Selector::Cidr`; ports/protocol typed; malformed reads back typed | Subjects/Targets options are the real `objects.list` catalog (surface test "authors a draft ... cross-product"); `portsValid` unit tests + `toPolicyDraftInput` network refusals; e2e "an engine refusal on the draft reads back as the typed failure line" (Framing -> 400) |
| Applied-To authors a real `IdentityScope`; distribute targets only the named endpoints | contracts `toWirePolicySpec` (applied_to -> `WireScopeMember[]`, empty omitted = distributes nowhere) + panel test "re-distributes to exactly the current scope" + e2e distribute dialog names the endpoint set |
| Draft never mutates published; publish atomic+audited+confirm-gated; breaking flagged | store-side: crdb PS.4 (edit never touches a Published key); FC: `useSavePolicy` publishes the MINTED version; e2e "Save & Publish is confirm-gated ... BREAKING publish is flagged" + surface test "a BREAKING publish keeps the form open" |
| Active-window `until` past excludes from composed bundle (producer expiry) | crdb `policy_effective_serves_only_published_and_active_policies` (INV-WIRE-POLICY-EFFECTIVE; expiry at the server clock) + bff distribute test (composition is exactly the POLICY_EFFECTIVE result) |
| Compose->sign->push signs in the sidecar; convergence shows 3 states; no VTZ distribute control | sidecar seam tests (key never in TS; shared preimage signs v2 for carried rules) + e2e "Distribute lives on the Policy tab" (3 states + confirm) + vtz.spec "P5.N structural sweep" + vtz-surface unit structural assert |
| Section 5 three-click tasks within budget | e2e journeys: view a zone's policies = 2 clicks (nav -> expand); author = 3 (Create -> fill -> Save); distribute = 3 (expand -> Distribute -> confirm) |

**LIVE LEG (pending -- the box redeploy):** the crdb node serving the whole surface over :7878 +
compose->sign->torchd-pull convergence with the v2 rules-carrying bundle (requires the torchd rev bump;
enforcement OFF; `FC_SIGNER_PORT` in the running BFF env).

## Named deferrals (honest, gating work named)

- Runtime enforcement of schedule/geo/ports: `torch IP-TORCH-POLICY-ENFORCE` (enforcement AG.7-OFF).
- Absolute active-window (from/until) AUTHORING: gated on a documented Console-facing HLC<->wall-clock
  conversion (crdb). The engine bound is an opaque `Hlc(u64)`; authoring a datetime would emit a wrong-scale
  value (a governance lie), so P5.4 authors schedule/geo/tags only and leaves the absolute window unset.
- Applied-To picker over enrolled endpoints: gated on an enrollable-endpoint list read. P5.4 authors
  Applied-To as free-text endpoint CNs.
- Zone-membership-defaulted Applied-To: crdb `VtzSetMembership` (deferred, TRD-CONSOLE-12).
- Simulate / dry-run: TRD-CONSOLE-07 (AIOps).
- EXPLAIN over a composed effective policy: later, once torch-forge compose is wired end to end.
- Live `:7878`/`:7879` drive: the box redeploy (P5.N's remaining item, the Objects/VTZ precedent).
