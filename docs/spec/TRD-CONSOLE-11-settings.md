# TRD-CONSOLE-11 -- Settings (administration)

**Status:** DRAFT (authored 2026-07-07; amended 2026-09-24, Section 9, against the engine's shipped admin surface; REVISED 2026-09-25 against the configuration census `IP-CONSOLE-11-guide-CENSUS.md`: Section 9 now describes the shipped surface, Section 10 lists the known gaps, Section 11 specifies the in-app configuration guide). Inherits `TRD-CONSOLE-00`. Settings is the platform
administration surface -- the operator config for HA/DR, keys, federation, security posture, FIPS, RBAC,
observability, and policy defaults. It is the primary consumer of the **admin access plane**
(`TRD-CONSOLE-00` Section 8.5). Mock target: `shot-12`.

---

## 1. Purpose

Give administrators the levers to configure and operate the platform itself: cluster topology and
leadership, disaster recovery, the key hierarchy and rotation, identity federation, the security and FIPS
posture, operator RBAC, observability, and policy defaults -- each a real engine admin operation, each
audited, each gated to the Admin/SecurityAudit tier, and all served over the hardened admin plane.

## 2. The admin access plane (inherited, restated for this surface)

All of Settings, and any privileged action anywhere in the Console that mutates platform posture (key
rotation, DR, FIPS, RBAC, federation), is served on the admin plane (`TRD-CONSOLE-00` Section 8.5):

- **Direct-user leg:** bound to the installed node's own IP, on **TCP 8443**, with a **hybrid post-
  quantum key exchange and a strong classical CNSA-1.0 fallback** for browsers without the hybrid group
  (never a downgrade below CNSA 1.0).
- **Engine leg:** every admin command still reaches Crucible/Torch/Forge over the **mTLS `:7878`** seam;
  8443 never carries an engine call. Serving admin on 8443 is an additional user-leg boundary, not a
  replacement for engine-side authorization.

The admin plane's bind (node IP), port (8443), hybrid+fallback TLS, and certificate are installer-
provisioned, operator-visible config; a config that would widen the bind or weaken the crypto floor fails
startup (fail-closed). This surface *displays and configures* that posture; it does not soften it.

## 3. Tabs and their real backends

> **Superseded by Section 9** (the shipped tab set). This table is the original mock-derived design,
> kept for its intent; where it disagrees with Section 9, Section 9 wins.

| Tab | Content (mock) | Real backend |
|-----|----------------|--------------|
| **HA & Topology** | Controller cluster nodes (leader + per-node lag), Rotate Leadership, Test Quorum Loss | Crucible TRD-07 distributed cluster (Raft) |
| **Failover & DR** | DR targets (RPO/RTO, readiness, last check), test failover | Crucible TRD-07 DR + region residency |
| **RBAC** | Console operator roles + grants | the engine RBAC (operator Principals + roles) |
| **Federation** | External IdP connectors (shared with `Users -> External IDAM`) | the enrollment/federation edge |
| **Security** | the security posture (mTLS, admin-plane crypto incl. the 8443 hybrid+CNSA-1.0 fallback, cert profile) | the platform security config |
| **KeyLock** (mock "TrustLock") | the key hierarchy + rotation status/history | Crucible TRD-04 key hierarchy + SignatureEnvelope rotation |
| **Policy** | policy defaults + global posture | the engine policy defaults (links to `TRD-CONSOLE-05`) |
| **Observability** | telemetry config (exporters, sampling, retention) | the platform observability/telemetry config |
| **FIPS Mode** | FIPS 140-3 mode status + toggle | the platform FIPS posture (AWS-LC FIPS module) |

## 4. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

> **Superseded by Section 9.1** (the engine operations Settings actually uses). None of the
> `settings.*` binding ids below exists; the registered ids are added by `IP-CONSOLE-11-guide` GD.1.

- **Read bindings** per tab -> the engine's real config/status: `settings.cluster` (node lag + leader),
  `settings.dr` (targets, RPO/RTO, readiness), `settings.rbac`, `settings.federation`,
  `settings.security` (incl. the admin-plane crypto posture), `settings.keylock` (rotation status/
  history), `settings.policyDefaults`, `settings.observability`, `settings.fips`.
- **Command bindings** (real, audited, **confirm-gated**, Admin/SecurityAudit-tier only):
  `settings.rotateLeadership`, `settings.testQuorumLoss`, `settings.testFailover`, `settings.rotateKey`,
  `settings.setRbac`, `settings.configureFederation` / `settings.syncFederation`, `settings.setFips`,
  `settings.setObservability`, `settings.setPolicyDefaults`.
- Each command shows the exact effect before executing (a leadership rotation, a quorum-loss test, a key
  rotation, a FIPS toggle are all high-impact and get the third-click confirm with the consequence
  stated). Destructive/operationally-risky tests (quorum loss, failover) are labelled as tests and scoped.
- `PENDING` / `INV-CROSS`: where an admin operation is not yet a first-class engine command, the binding
  is `PENDING` and the implementing IP names the Crucible/Torch/Forge admin work (the engine already
  exposes an admin surface -- e.g. the crdb admin plane / config knobs -- which these bind to over
  `:7878`).

## 5. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Switch tab (in place). Every admin action: tab (1) -> the action (2) -> confirm with the stated effect
  (3). E.g. Rotate Leadership, Test DR, Rotate a key, Toggle FIPS, edit an RBAC grant.
- Cluster/DR status is read-at-a-glance; the risky actions are always confirm-gated.

## 6. Performance, states

Status reads are small + can stream (cluster lag, DR readiness) with `LIVE` freshness. Loading
skeletons; unauthorized tabs/actions absent for a non-admin operator (the whole surface is Admin/
SecurityAudit-tier); a command in flight shows pending -> engine-confirmed; a test (quorum/failover)
streams its progress + real result. The admin-plane crypto posture panel shows the negotiated group
(hybrid or the CNSA-1.0 fallback) for the current session.

## 7. Acceptance and failure semantics

**Acceptance:**
- Every status value (cluster lag, leader, DR RPO/RTO, key rotation, FIPS state, admin-plane crypto)
  derives from a real engine read; no fabricated status (contract test + fixtureless render).
- Every admin command invokes its real engine operation over `:7878`, is Admin/SecurityAudit-tier gated,
  commits through the audit chain, and is confirm-gated with the effect stated.
- The surface is served only on the 8443 node-IP admin plane with the hybrid+CNSA-1.0-fallback crypto;
  reaching it over a non-admin path is refused.
- The Section 5 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- an unauthorized admin action is refused with
the typed error; a failed test (quorum/failover) reports its real result, not a fake pass; a `PENDING`
admin action is a labelled non-live control; the admin plane refuses a browser offering sub-CNSA-1.0
crypto rather than downgrading.

## 8. Six-bug-category notes

Cross-module gap: admin status/command view models typed in `@forge/contracts`. Missing failure path:
unauthorized-admin, failed-test, sub-CNSA-1.0-refusal, `PENDING` tested. Security: the whole surface is
tier-gated + served on the hardened admin plane; commands are audited; no admin secret reaches the
browser. Dead code: every admin action maps to a real (or `PENDING`) command binding.

## 9. The shipped surface (amended 2026-09-24; revised 2026-09-25 against the census)

Sections 3 and 4 were authored against the mock before the engine's administration surface existed.
The 2026-09-24 amendment corrected them against the engine; the 2026-09-25 revision corrects the
amendment against the code, from the configuration census (`IP-CONSOLE-11-guide-CENSUS.md`, slices
`fc-soc-logs-reports-settings.md` Part 4 and `crdb-settings-plane.md`). Where this section disagrees
with Sections 3 or 4, this section wins. Where the code falls short of this section, Section 10 names
the gap.

### 9.1 What the engine exposes (the binding truth)

- **The governed configuration document** is the platform's one administration lever. The engine's
  config registry (`REGISTRY`) describes 56 settings: 31 knobs, 20 committed sections and 5
  environment-bootstrap rows; by how a change applies, 29 live, 15 pending a subsystem, 7 boot-bound
  and 5 environment. Each row carries its key, type, default, bound, live-apply statement, the verb
  that changes it, its Console binding (`console:settings/<surface>/...`) and a summary. Commits are
  validated whole-document writes (`ConfigDocument::validate`, fail-closed), versioned in the MVCC
  history (history and rollback by version). Dual control applies to Console writes when the committed
  `governance.dual_control` set names `tenant-config` (no deployment profile includes it by default).
- **What the Console can edit: 27 of the 56 rows.** 19 scalar knobs and the dual-control set through
  `SETTINGS_COMMIT`; five sections through typed patches (egress destinations, LUG exposure, disabled
  decoder families, source-format map, narrative model ref); the SOC response tiers and SIEM write-back
  through `SOC_SETTINGS_COMMIT`. Every other row is shown read-only with its source and apply class.
- **Ten wire operations serve Settings**, each carrying the operator delegation and, for a global
  admin, the operator's settings tier (`OperatorDelegation.settings_tier`, honoured by these ten only):
  `SETTINGS_READ`, `SETTINGS_REPORTS`, `SETTINGS_COMMIT`, `SETTINGS_PROPOSE`, `SETTINGS_APPROVALS`,
  `SETTINGS_APPROVE`, `SETTINGS_HISTORY`, `SETTINGS_ROLLBACK`, `SOC_SETTINGS_READ`,
  `SOC_SETTINGS_COMMIT`. The Federation tab additionally uses the IdAM operations (`IDAM_CONNECTORS`,
  `IDAM_CONNECT`, `IDAM_CONFIGURE`, `IDAM_SYNC`, without the settings tier) and the sidecar's secret
  store.
- **Six status reports reach the Console**: server, connectivity, security, telemetry, key issuing,
  egress (`SETTINGS_REPORTS`).
- **Not exposed** (each stays `PENDING` with its owning engine work, crdb `IP-CONSOLE-SETTINGS-WIRE`
  SET.6): a cluster view with leader and lag, leadership rotation and quorum tests; DR targets and
  failover tests; a signing-key rotation verb; an observability exporter configuration; a FIPS runtime
  toggle (FIPS 140-3 is a BUILD posture and cannot be toggled). Also not on the wire today: the
  engine's setting tiers (Essential / Standard / Advanced, on knobs only) and its four deployment
  profiles (Evaluation, Enterprise, AirGapped, Federal).
- **Path.** The Console reaches the engine only through the crypto sidecar's mTLS leg to the engine's
  control plane (`:7879` as installed by the Console installer; Section 2's `:7878` predates
  IP-CONSOLE-CONTROL-PLANE). The engine's own admin plane (`:7440`, `cdb-actl`) is not reachable from
  the Console; every Settings operation is a wire operation routed through the same validation, store,
  dual-control policy and audit the admin plane uses.

### 9.2 The tab set, as built (in order)

| Tab | Content | Engine operations | Editable here | State |
|-----|---------|-------------------|---------------|-------|
| **SOC** | response tiers (`p_low` / `p_high`, milli), SIEM enrichment write-back (enabled, vendor, host, stream, case URL base, classification ceiling), the narrative model line (read-only here), the setting definitions | `SOC_SETTINGS_READ`, `SOC_SETTINGS_COMMIT` | tiers and write-back (locked under dual control: Section 10 G4) | LIVE |
| **Configuration** | every registry row by surface with value, source, apply class and definition; knob edits staged and committed (or proposed) as one batch; six section forms: dual control, egress destinations, LUG exposure, disabled decoder families, source-format overrides, narrative model | `SETTINGS_READ`, `SETTINGS_COMMIT`, `SETTINGS_PROPOSE` | 19 knobs, 6 sections | LIVE |
| **RBAC** | the engine admin assignments (identity, roles, clearance; boot-bound); the Console operator roles (installer configuration) | `SETTINGS_READ`; the BFF role map (global admins only) | none | read-only |
| **Federation** | the IdAM connector panel (onboard / configure Auth0, Sync Now, connector cards; the same component the Users surface mounts); the SSO group to admin role map (boot-bound) | `IDAM_*`, the sidecar secret store, `SETTINGS_READ` | the connector | LIVE (connector); read-only (map) |
| **Changes** | pending approvals with Approve (a different Admin); configuration history (version, principal, time, changed sections); roll back to a version | `SETTINGS_APPROVALS`, `SETTINGS_APPROVE`, `SETTINGS_HISTORY`, `SETTINGS_ROLLBACK` | approve, roll back | LIVE |
| **Security** | the admin endpoint (connectivity report), server security (security report), registered egress destinations (egress report), and this browser session's negotiated key exchange (sidecar session lookup: hybrid `X25519MLKEM768` or the P-384 floor) | `SETTINGS_REPORTS`; the sidecar session service | none | read-only |
| **KeyLock** | agent key issuing (key-issuing report) | `SETTINGS_REPORTS` | none; rotation `PENDING` (crdb SET.6) | read-only |
| **Observability** | telemetry ingest (telemetry report); the observability settings rows | `SETTINGS_REPORTS`, `SETTINGS_READ` | none here (the knobs edit on Configuration); exporter configuration `PENDING` (crdb SET.6) | read-only |
| **HA & Topology** | this node (server report: shards, serving, durable, maintenance, version) | `SETTINGS_REPORTS` | none; cluster leader / lag, Rotate Leadership, Test Quorum Loss and regions `PENDING` (crdb SET.6) | read-only |
| **FIPS Mode** | the crypto build posture | `SETTINGS_REPORTS` | none, by construction | read-only |
| **ReadMe** | the in-app configuration guide (Section 11) | static content; `SETTINGS_READ` for the live reference | none | PLANNED (`IP-CONSOLE-11-guide`) |

Two tabs of the 2026-09-24 table are not built, by design:
- **Policy** is folded in: its editable content (the narrative model ref) is a Configuration section
  form, its read-only content (detection posture, detection retention, served models, credibility
  weights) is Configuration rows, and the response tiers live on the SOC tab. A separate tab would
  duplicate them (`IP-CONSOLE-11-settings` ST.7 superseded).
- **Failover & DR** stays absent until the engine serves regions or DR state (crdb SET.6).

### 9.3 Scope

`IP-CONSOLE-11-settings` built the ten tabs (ST.1 to ST.N; ST.11 waits on crdb SET.6).
`IP-CONSOLE-11-guide` adds the ReadMe tab and registers the Settings operations in the no-stub
binding manifest (GD.1). The tab strip is a fixed list; a tab ships only when its engine operations
are live, and a tab is never a placeholder (`INV-CONSOLE-NO-STUB`).

### 9.4 Acceptance (amends Section 7)

- Every value on every tab is the engine's committed document, a report it served, or boot or
  installer configuration, each labelled with its source and, for a committed value, its version. No
  fabricated status; no derived number the engine did not return.
- Every Settings operation is a registered binding in the no-stub manifest, and the contract test
  maps every Settings route to its binding (`IP-CONSOLE-11-guide` GD.1).
- A commit refused by the engine's validation shows the engine's own violations verbatim.
- Under dual control the Console offers Propose (and shows pending proposals) and Approve (by a
  distinct principal) for every setting it can edit; it never commits directly and never fakes an
  approval. A self-approval is refused and the refusal shown.
- A boot-bound or pending setting is shown with that label and no edit control; the Console never
  offers a change that cannot apply. The engine enforces the same rule (`boot_bound` /
  `pending_subsystem` refusals).
- The FIPS tab shows the build posture and offers no toggle. HA, DR and KeyLock offer no Rotate /
  Test / Rotate-key control until the engine verb exists; the absence is stated, not filled.
- The Security tab shows the key exchange negotiated for the current session as the sidecar reports
  it; it never infers it.
- An operator without the settings tier sees each tab's tier-refusal state ("Admin or SecurityAudit
  tier required"); nothing is fabricated in its place. (This replaces Section 6's "unauthorized tabs
  absent": the tabs render, the engine refuses, and the refusal is shown.)

### 9.5 Failure semantics (amends Section 7)

- `dual_control_required`: every commit control becomes Propose, labelled as such; the reason is
  stated.
- A proposal approved by its proposer: the engine refuses (`SelfApproval`); shown as such. A proposal
  whose base moved: discarded (`Stale`); shown with "propose again".
- A stale edit (the committed version moved under the operator): the commit carries the version it
  was read at and a moved base is refused and shown, never silently overwritten.
- A failed commit's Retry resends the same request.

## 10. Known gaps against this TRD (census 2026-09-25)

The code falls short of Section 9 as follows. Each gap names its census defect (the register in
`IP-CONSOLE-11-guide-CENSUS.md`) and owning repo; fixing them is scheduled separately, and the
in-app guide states each one plainly until it is fixed.

| Gap | Requirement | As built | Defect | Owner |
|-----|-------------|----------|--------|-------|
| G1 | Settings operations registered; routes mapped by the contract test (9.4) | CLOSED by GD.1: every Settings operation is a registered binding, every `/api` route is declared in `apps/bff/src/routes.ts`, and the route-coverage contract test maps each route to its bindings | CD-41 | FC (`IP-CONSOLE-11-guide` GD.1) |
| G2 | Served only on the 8443 admin plane (Sections 2, 7) | the BFF serves `/api/settings*` to any authenticated session; whether a path around the terminator exists in deployment is UNVERIFIED | -- | FC |
| G3 | The operator's tier governs Settings (9.1) | the tier is asserted by the Console for global admins and accepted uncapped by the engine; recorded stopgap | CD-03 | crdb (`DEF-RBAC-PERMISSION-MAP`) |
| G4 | Propose and approve for every editable setting under dual control (9.4, 9.5) | the SOC tiers and SIEM write-back cannot be proposed anywhere in the Console; section-form buttons still read Commit under dual control; proposals are memory-only | CD-17 | crdb + FC |
| G5 | A moved base is refused, never overwritten (9.5) | commits carry no base version; last writer wins | CD-16 | crdb + FC |
| G6 | Source and apply labels are true (9.4) | the registry's labels were made true by GD.E0 (crdb `c31d9be4`); still open: the SOC tab fields and the Observability mirror carry no source label | CD-18 | FC |
| G7 | A failed commit's Retry resends (9.5) | Retry only clears the message | CD-36 | FC |
| G8 | Copy is true | the Security tab says key issuing is edited on Configuration (it is pending, no form) | CD-33 | FC |
| G9 | Every Console mutation is authorized and audited by the engine (TRD-CONSOLE-00) | the IdAM connector operations are unaudited, untiered and memory-only; the IdAM secret write needs only a session | CD-15, CD-01 | crdb + FC |
| G10 | Values are what the node runs (9.4) | the server report shows the boot maintenance cadence; the embedder row is empty on installer-built nodes | CD-37 | crdb |
| G11 | History supports diff and rollback by version (9.1) | history lists changed keys only, has no diff, and ages out at the 7-day time-travel horizon | CD-38 | crdb |

## 11. The in-app configuration guide (the ReadMe tab)

Added 2026-09-25 (operator request). Implementing plan: `IP-CONSOLE-11-guide`.

### 11.1 Purpose

An instruction manual inside ForgeCentral that explains **every configuration available in
ForgeCentral**, on every surface and not only Settings, so an operator can set up and configure Forge
without leaving the Console. It lives under Settings as the **ReadMe** tab for now (operator ruling
2026-09-25); its content model does not depend on where it is mounted, so it can move.

### 11.2 Structure: three tiers, progressive disclosure

1. **The ReadMe tab** -- the full manual: a table of contents, a "How configuration works in Forge"
   chapter, one chapter per surface, a filter box that narrows the sections, and a stable deep link
   for every section.
2. **The contextual side panel** -- opened in place from a surface (starting with the Settings tabs),
   it shows the ReadMe section for the active surface and tab: the rules, limits and trade-offs of the
   settings in view, with links to the full chapter and back to the control.
3. **Inline micro-copy and info tips** -- beside configuration fields: one sentence, the default and
   the format. A validation constraint is always visible under its field, never only on hover.

Deferred by operator ruling (2026-09-25), each with its dependency named in the plan: the **setup
wizard** (a linear first-run flow with a real validation at each step); the **Advanced settings**
disclosure (needs the engine's setting tier on the wire); **one-click profile templates** (needs the
engine's deployment profiles on the wire, applied through the normal validated and audited commit).

### 11.3 Content rules

- **Names.** The platform is Forge and the console is ForgeCentral. Internal component and repository
  names never appear in guide prose (operator ruling 2026-09-25); the glossary is the plan's decision
  N1.
- **Voice.** Short, active, command-oriented instructions ("Open Settings > Configuration", "Stage the
  change, then Commit"), paired with the control they describe.
- **Every configuration entry states:** what it changes; how to do it; its constraints (formats,
  bounds); when it takes effect; who can do it (what the platform checks today); what is audited;
  what can go wrong and what each refusal means; related settings; and any known limitation.
- **Engine-owned facts render live.** A setting's default, bound, apply class and change path come
  from the engine's read at view time, never copied into the content.
- **Console-owned constraints have one source.** A limit the Console enforces is shown from the same
  constant its validator uses.
- **Honest by construction.** An entry never claims an effect the platform does not have (for
  example, that a distributed policy is enforced on an endpoint). A known limitation is stated plainly
  with its workaround, and the PR that fixes the limitation updates the entry.
- No em dashes (the gate's hygiene step); no fabricated values; examples are labelled as examples.

### 11.4 Data and bindings

The ReadMe renders static content plus the live `SETTINGS_READ` rows for the Settings reference. It
adds no engine operation. The side panel and the micro-copy add none. A refused or failed live read
shows the tier-refusal or error state in place of the reference table; the static content still
renders (`INV-CONSOLE-NO-STUB`: nothing is fabricated in its place).

### 11.5 Interaction and three-click paths

Overview -> Settings (1) -> ReadMe (2) -> a section (3). A deep link opens a section directly and
survives a reload. The side panel opens in place from a surface with one click and closes without
navigating away.

### 11.6 Acceptance

- `INV-GUIDE-COVERS-EVERY-CONFIG`: every command binding in the no-stub manifest and every registry
  row the Console can edit has a guide entry; a missing entry fails the gate.
- `INV-GUIDE-ENGINE-VALUES-LIVE`: engine-owned reference facts render from the live read; a test
  proves a changed engine value changes the rendered guide.
- `INV-GUIDE-ONE-SOURCE`: a Console-side constraint shown in the guide or the micro-copy is the
  validator's own constant; a test proves changing the constant changes both.
- `INV-GUIDE-ADDRESSABLE`: every section has a stable id and deep link, reachable within three clicks
  of the Overview (end-to-end test).
- `INV-GUIDE-CONTEXTUAL`: the side panel opens at the section for the active surface and tab.
- `INV-GUIDE-DISABLED-EXPLAINED`: every disabled or locked configuration control states why and links
  to the cause.
- `INV-GUIDE-FORGE-NAMING`: guide prose contains no internal component or repository name (a content
  lint test).

### 11.7 Failure semantics

- The live reference read is refused: the reference table shows the tier-refusal state; the rest of
  the chapter renders.
- The live read fails: the reference table shows the error state with a Retry that re-reads.
- A deep link names a section that does not exist: the ReadMe opens at its contents with a notice.
- The filter matches nothing: an explicit empty state, never an empty page.
