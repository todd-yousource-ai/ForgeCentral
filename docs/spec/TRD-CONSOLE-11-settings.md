# TRD-CONSOLE-11 -- Settings (administration)

**Status:** DRAFT (authored 2026-07-07; amended 2026-09-24, Section 9, against the engine's shipped admin surface). Inherits `TRD-CONSOLE-00`. Settings is the platform
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

## 9. Amendment 2026-09-24: the engine's real admin surface, the Step 1 slice, and the two missing tabs

Sections 3 and 4 were authored against the mock before the engine's administration surface existed.
This section corrects them against what Crucible ships today (IP-ADMIN-SPINE / CONFIG / AUTHORITY /
KNOB-COVERAGE / RUNTIME-CLI, IP-CONSOLE-CONTROL-PLANE, IP-AISOC-STEP1 C.9c). Where a row below
disagrees with Section 3, this section wins; the implementing plan is `IP-CONSOLE-11-settings`.

### 9.1 What the engine actually exposes (the binding truth)

- **The governed configuration document** is the platform's one administration lever: 20 committed
  sections (`sso_group_roles`, `admins`, `egress_destinations`, `api_exposure`, `aig_exposure`,
  `lug_exposure`, `idam_connector`, `key_issuing`, `disabled_decoder_families`, `source_format_map`,
  `searchable_attributes`, `build_search`, `embedder`, `served_models`, `detection_posture`,
  `soc_narrative`, `detection_retention`, `credibility_weights`, `soc`, `siem_writeback`) plus 27
  scalar knobs (admin endpoint classification and payload, dual control, session lifetimes,
  maintenance cadence, retention windows, leases, quotas, query and graph budgets, workers, cognition
  admission, result chunking), every one described by the config registry (`REGISTRY`, 56 settings:
  key, type, default, bound, live-apply, verb, Console binding `console:settings/<surface>/...`,
  summary). Commits are validated (`ConfigDocument::validate`, fail-closed), versioned in the MVCC
  history (diff and rollback by version), and, when the committed `dual_control` set names
  `tenant-config`, two-person (propose by one principal, approve by a distinct one).
- **Status reports** the admin plane serves: node-status, server, connectivity (listener, mutual TLS,
  identities bound, post-quantum key exchange), security (classification, audit head and chain
  verification, artifact spot checks, retention), telemetry (OTLP and flow planes), egress,
  key-issuing, api-exposure, aig, inference, content-pack, read-surface, detection, storage.
- **Operations**: server drain, maintenance run, storage gc, egress register / revoke / ceiling,
  model register / revoke, normalization family and format, build pin / cadence, search enablement,
  ingest reconfigure, legal hold, agent-grant provision, connector enable / disable.
- **What the engine does NOT expose today** (each is `PENDING` with its owning work named in the
  plan): a Raft cluster view with leader and per-node lag (single-node nodes; TRD-07 cluster
  status is not an admin report yet), any DR target, failover or quorum-loss test, a key-hierarchy
  rotation command (TRD-04 SignatureEnvelope rotation is not an admin verb), a FIPS runtime toggle
  (FIPS 140-3 is a BUILD posture: `scripts/enable-fips.sh` selects the AWS-LC FIPS module at build
  time; a running node is or is not FIPS and cannot be toggled), and an observability exporter
  configuration (telemetry is a boot stanza plus a report; `detection_trace` is the one runtime
  observability knob).
- **The Console reaches all of it over `:7878` only** (Section 2). The engine's admin plane
  (`:7440`, loopback mTLS, the `cdb-actl` client) is NOT reachable from the Console sidecar, so every
  Settings binding is a wire operation on `:7878`, tier-gated engine-side (Admin / SecurityAudit),
  routed through the SAME validation, store, dual-control policy and audit the admin plane uses.
  `SOC_SETTINGS_READ` / `SOC_SETTINGS_COMMIT` (crdb C.9c) are the first two; the plan generalizes
  them (crdb `IP-CONSOLE-SETTINGS-WIRE`).

### 9.2 The tab set, corrected

Two tabs the mock did not have are REQUIRED, because they are where the engine's real levers live;
two of the mock's tabs are read-only status until named engine work lands; one of the mock's actions
is removed as impossible by construction.

| Tab | Content | Real backend (today) | State |
|-----|---------|----------------------|-------|
| **SOC** (new) | response tiers, SIEM write-back, narrative model ref | `SOC_SETTINGS_READ` / `SOC_SETTINGS_COMMIT` | LIVE (S3.18) |
| **Configuration** (new) | every committed section and knob by surface, with the registry's definition beside each value; edit and commit per section; version history, diff and rollback; propose / approve under dual control | the governed document over the wire (crdb `IP-CONSOLE-SETTINGS-WIRE`) | PENDING engine, then LIVE |
| **RBAC** | the engine's admin assignments (`admins`: identity, roles, clearance) and the SSO group-to-role map (`sso_group_roles`), READ-ONLY: both are boot-bound (the admin plane reads them at start), so they change through `cdb-actl` plus a restart and the tab says so; the Console's own operator roles (`global-admin` / `tenant-admin` / `tenant-user`, BFF `rbac.ts`) shown read-only with their source | `SETTINGS_READ` (crdb SET.1); the BFF RBAC map is installer config | read-only (engine read LIVE) |
| **Federation** | the IdAM connectors (Auth0 today; shared with `Users -> External IDAM`), the `sso_group_roles` enrollment map (read-only: boot-bound) | `IDAM_CONNECTORS` / `IDAM_CONFIGURE` / `IDAM_CONNECT` / `IDAM_SYNC` (LIVE); the map via `SETTINGS_READ` | LIVE for connectors; map read-only |
| **Security** | the connectivity report (listener, mutual TLS, identities, post-quantum key exchange), the security report (classification, audit chain verified, artifact spot checks, retention), `key_issuing` and `egress_destinations`, the admin endpoint knobs, and the admin-plane crypto posture (the negotiated group for THIS session: hybrid or the P-384 floor) | reports over the wire (PENDING engine); the sidecar must surface the negotiated group to the BFF (PENDING Console) | PENDING, then LIVE |
| **KeyLock** | the key-issuing report and section (enabled, dual control, validity), the signing key ids the audit chain names | key-issuing report over the wire (PENDING engine) | read-only; **rotation is PENDING** (TRD-04 rotation as an admin verb, owning repo crdb) |
| **Policy** | the narrative model ref (editable), and read-only: the detection watermark bounds and detection retention (both pending in the engine: no live consumer), served models (pending), and the credibility weights (versioned and replay-pinned); the tiers link to the SOC tab | `SETTINGS_READ` / `SETTINGS_COMMIT` (crdb SET.1, SET.2b) | LIVE for the model ref; the rest read-only |
| **Observability** | the telemetry report (OTLP / flow planes, bound tenants, datagram counts) and the two observability knobs | telemetry report over the wire (PENDING engine); knobs via Configuration | PENDING, then LIVE |
| **HA & Topology** | this node: shards, serving, durable, maintenance cadence, version (node-status / server report); the configured regions and shard placement | node-status over the wire (PENDING engine) | read-only; **cluster leader / lag, Rotate Leadership, Test Quorum Loss are PENDING** (TRD-07 cluster status and leadership as admin verbs, owning repo crdb) |
| **Failover & DR** | the configured regions and residency tags | boot config, read-only | **DR targets, RPO / RTO, Test Failover are PENDING** (TRD-07 DR as admin verbs, owning repo crdb) |
| **FIPS Mode** | the build posture: FIPS module present or not, the crypto provider, the enable procedure | security / connectivity reports over the wire | read-only by construction; **the toggle in Section 3 is REMOVED** (a FIPS build is selected at build time, never at runtime) |

### 9.3 Step 1 scope

Step 1 (IP-AISOC-STEP1 C.9) ships the SOC tab. The full build-out is `IP-CONSOLE-11-settings`
(this TRD's implementing plan), engine-first: the crdb rows land the wire operations, then each
Console tab binds them. A tab whose engine binding has not landed is ABSENT from the strip, never
a placeholder (`INV-CONSOLE-NO-STUB`); the plan names the row that adds it.

### 9.4 Additional acceptance (amends Section 7)

- Every value on every tab is the engine's committed document, a report it served, or the
  installer's boot configuration, each labelled with its source and, for a committed value, its
  version. No fabricated status; no derived number the engine did not return.
- A commit is refused by the engine's validation with the engine's own violations shown verbatim.
- Under dual control the Console offers PROPOSE (and shows the pending proposals) and APPROVE (by a
  distinct principal); it never commits directly and never fakes an approval. A self-approval is
  refused and the refusal shown.
- A boot-bound setting (the registry says `boot-bound`) and a pending one (`pending`) are shown with
  that label and no edit control; the Console never offers a change that cannot apply. The engine
  enforces the same rule: the wire has no field for a boot-bound or pending section, and a knob
  edit to one is refused (`boot_bound` / `pending_subsystem`).
- The FIPS tab shows the build posture and offers no toggle. HA, DR and KeyLock offer no
  Rotate / Test / Rotate-key control until the engine verb exists; the absence is stated, not filled.
- The admin-plane crypto panel shows the group negotiated for the current session as the sidecar
  reports it; it never infers it.

### 9.5 Failure semantics (amends Section 7)

- `dual_control_required`: the commit control is replaced by Propose; the reason is stated.
- A proposal approved by its proposer: the engine refuses (`SelfApproval`); shown as such.
- A stale edit (the committed version moved under the operator): the engine's validation still
  governs, but the Console re-reads on every commit and shows the version it read; a conflicting
  concurrent commit is surfaced by the version change, never silently overwritten.
