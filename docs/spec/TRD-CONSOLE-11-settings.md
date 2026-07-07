# TRD-CONSOLE-11 -- Settings (administration)

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. Settings is the platform
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
