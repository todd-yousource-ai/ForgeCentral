# IP-CONSOLE-11-guide -- configuration census (2026-09-25)

The ground truth the in-app configuration guide is written from. `TRD-CONSOLE-11` and most surface
TRDs had drifted from the code (operator statement 2026-09-25: "The settings TRD is out of date"), so
this census reads the CODE of all three repos and records every configuration an operator can make in
ForgeCentral, what backs it in the engine, and what it does (or does not do) on an endpoint.

Internal names (crucible / cdb, torch, forgecentral / FC) are used throughout this document because it
is an engineering record. The guide itself names the platform **Forge** and never uses them (operator
ruling 2026-09-25; `IP-CONSOLE-11-guide` decision N1).

## Method and verification status

- Six parallel read-only passes, one per slice, each writing an evidence-cited file (every claim carries
  a repo-relative `path:line`). The slices are committed verbatim beside this file in
  `IP-CONSOLE-11-guide-census/`:

  | Slice | File | Size |
  |-------|------|------|
  | Console governance + entity surfaces (VTZ, Policies, Distribution, Objects, Users / Groups / IdAM, Overview, drawer, navigation) | `fc-governance.md` | 98 items |
  | Console SOC Ops, Logs, Reports, Settings (all ten tabs) | `fc-soc-logs-reports-settings.md` | 51 items |
  | Console platform configuration: binding index, BFF env + routes, crypto sidecar, installer | `fc-platform-config.md` | 72 bindings, 74 routes |
  | Engine side of every non-Settings Console operation | `crdb-console-ops.md` | 72 requests |
  | Engine settings plane: registry, knobs, profiles, sections, wire verbs, boot config | `crdb-settings-plane.md` | 56 registry rows |
  | Endpoint: what a Console configuration does on a Torch host; torchd + installer configuration | `torch-endpoint.md` | 29 torchd env vars |

- Nothing was built, run or deployed; the passes read code only. Claims marked **VERIFIED** below were
  re-read by hand against the cited lines on 2026-09-25; everything else is code-read and cited, not
  executed. Runtime-only facts are marked UNVERIFIED in the slices.

## Headline counts

| Area | Count |
|------|-------|
| Console bindings (`packages/bindings/src/manifest.ts`) | 72: 38 read, 34 command; 60 LIVE, 12 PENDING |
| BFF HTTP routes | 74 (+ the SPA fallback); **17 have no binding** (all 12 Settings routes, SOC KPIs / report / weekly, Overview members, the IdAM secret write) |
| Governance-slice configuration items | 98: 56 LIVE (19 actions + 37 form fields), 8 PENDING, 30 read-only, 4 wired with no UI |
| SOC / Logs / Reports / Settings items | 51: 22 LIVE, 3 PENDING, 20 read-only, 6 view-only |
| Engine requests the Console can encode | 72: 10 Settings-plane; of the other 62, 30 mutate and 32 read (28 mutating requests have a live consumer) |
| Engine config registry | 56 rows (31 knobs, 20 sections, 5 env); by apply: 29 Live, 15 pending a subsystem, 7 boot-bound, 5 env-bootstrap |
| Registry rows the Console can edit | 27 of 56 (25 through `SETTINGS_COMMIT`, 2 through `SOC_SETTINGS_COMMIT`) |
| Engine knob tiers | 13 Essential, 3 Standard, 15 Advanced (knobs only; 25 rows untiered; never on the wire) |
| Engine deployment profiles | 4 (Evaluation default, Enterprise, AirGapped, Federal); never on the wire |
| Console install-time configuration | 26 BFF env keys, 16 sidecar config fields, 20 `CONSOLE_*` installer knobs, 19 sidecar-provisioning knobs |
| Engine install-time configuration | ~149 `CDB_*` names authored by `cdb-mkconfig` (4 read by the running node); 86 node-installer knobs |
| Endpoint configuration | torchd 29 env vars (24 `TORCH_*`) across 10 lanes; installer 5 flags + 59 knobs |
| Authored policy dimensions that reach an endpoint | 30 total: 5 realized, 16 carried but never read, 9 never sent |

## How configuration works in Forge today (the facts every chapter inherits)

1. **Four places hold configuration.** (a) The engine's governed configuration document: versioned,
   validated whole-document commits, the only configuration the Console edits (Settings). (b) The
   engine's boot configuration (`node.cbor`, authored by `cdb-mkconfig` from `CDB_*` variables): the
   Console shows some of it read-only; changing it needs the node installer or the admin CLI plus a
   restart. (c) The Console's own install-time configuration (`/etc/console-bff/config.env`, the
   sidecar `config.json`): role map, IdP, ports; not editable in the UI, and **re-running the Console
   installer overwrites hand edits** (`fc-platform-config.md` 4.5). (d) The endpoint's torchd
   environment, written by the endpoint installer (also overwritten on re-run).
2. **Governance, identity and SOC configurations are engine records, not config-document settings.**
   Zones, objects, policies, local users and groups, IdAM connectors, incident acts, plans,
   dispositions and containment are committed (or held) by their own engine operations
   (`crdb-console-ops.md` section 3).
3. **How a change applies.** Only three governed settings have a live-apply handler on the engine
   (maintenance cadence, retention window, workspace quota; VERIFIED, `crucible/crates/cdb-server/src/admin.rs:50-66`).
   The registry's `live_apply` text, which the Console shows verbatim, over-claims for several rows
   (`crdb-settings-plane.md` 1.4, defect CD-18). Governance records resolve at read time. **Nothing
   reaches an endpoint on a stock install** (item 7).
4. **Who may do what (as built).** The BFF checks only that a session exists, plus one `global-admin`
   check on the Console role map route. The engine checks the delegation grant, the tenant shape and
   the reserved service tenant; outside Settings it checks **no role or tier**, and every delegated
   call runs at the Console peer's User tier (Internal clearance). Settings runs at a tier the Console
   asserts for global admins only. The manifest's `authz` labels are never enforced. Recorded as
   `DEF-RBAC-PERMISSION-MAP` (crdb, deferred by operator ruling 2026-09-25) and defect CD-03.
5. **Audit (as built).** Governance edits, plan modify / approve and Settings commits are audited;
   SOC case acts and dispositions are on the incident trail only; IdAM configure / connect / sync and
   the IdAM secret write are not audited at all (CD-01, CD-15).
6. **Tenancy.** Every call runs in the session's tenant; the SPA has no tenant selector although the
   BFF honours one for global admins (CD-36). The IdAM connector and the governed configuration are
   node-wide.
7. **Endpoints.** The only Console configuration with an endpoint path is policy distribution
   (a pull by torchd's policy lane). On a stock install that lane is not provisioned; if provisioned,
   every Console bundle is refused (`StaleLease`, CD-05); if a bundle were applied it would attach a
   host-wide firewall rule (CD-02). Of 30 authored policy dimensions, only
   `allow_ordinary_internet` has any host effect (CD-09). Isolate, plan approval, zone membership and
   remediation are recorded by the engine only. **Enforcement is OFF and there is no switch** that
   engages it (`torch-endpoint.md` section 4).

## Configuration inventory by ForgeCentral surface (what the guide must cover)

Item IDs are the slices' own; the guide chapter each lands in is the `IP-CONSOLE-11-guide` roster step.

| Surface | Live configurations (actions; fields) | Pending | Read-only displays | Chapter (step) | Slice |
|---------|----------------------------------------|---------|--------------------|----------------|-------|
| Settings (10 tabs) | SOC tiers, SIEM write-back; knob edits (19 knobs); six section forms (dual control, egress destinations, LUG exposure, decoder families, source-format map, narrative model); propose / approve; rollback; IdAM onboard / configure / sync (Federation) | KeyLock rotation, Observability exporter, HA cluster controls | model ref, registry list, version + source + apply labels, RBAC (engine admins, Console roles), SSO map, history, Security / KeyLock / Observability / HA / FIPS reports, session key exchange | Settings (GD.3) | `fc-soc-logs-reports-settings.md` Part 4 |
| Virtual Trust Zones | create, save, move / rename (broken: CD-10), delete; name, type, parent, description, session duration, telemetry mode, micro-segmentation, lifecycle | members, policy count, live refresh | zone grid + risk band, KPIs, posture matrix (read, not rendered) | VTZ (GD.4) | `fc-governance.md` C |
| Objects | create, edit, delete; name, kind, selector, value, description | governing policies | catalog, lifecycle / tags / attributes, drawer detail | Objects (GD.5) | `fc-governance.md` F |
| Policies + distribution | create, edit, Save & Publish, delete; name, zone, subjects / targets, protocol, ports, action, logging, schedule, geo, tags, Applied To, max classification, description; Commit & re-distribute | first distribution (not built), runtime enforcement of schedule / geo / ports | list + filters, active window, breaking-publish flag, convergence ledger | Policies (GD.6) | `fc-governance.md` D, E |
| Users, groups, IdAM | add, edit, suspend / activate / revoke users; create group; onboard / configure Auth0 (domain, client id, audience, secret, delta cadence, full-sync cadence); Sync Now | -- | users + groups tables and filters, connector cards | Identity (GD.7) | `fc-governance.md` G |
| SOC Ops | Generate verdict; approve full response; modify plan; assign; acknowledge; close; record disposition; record note | -- | posture pills, KPI strip, model ref, plan state, audit acts | SOC (GD.8) | `fc-soc-logs-reports-settings.md` Part 1 |
| Logs + Reports | Export (audited) | live tail (polls) | filters, rationale, weekly volume + coverage, incident report download | Logs + Reports (GD.9) | Parts 2, 3 |
| Overview, entity drawer, navigation | Isolate from network | reassign zone, remediation, full report, live stream | status, zone pager, hover filter, container members, drawer sections | Overview + drawer (GD.10) | `fc-governance.md` A, B, H |

Install-time configuration (Console env, sidecar, installers, torchd) is out of the in-app chapters'
scope except where a surface shows it read-only; it is the deferred setup wizard's subject
(`IP-CONSOLE-11-guide` GD.W1-GD.W5).

## Defect register

Found by the census, not fixed by it. Severity: **S1** security or safety; **S2** a configuration does
not do what the Console says; **S3** honesty or UX (the Console says or shows something untrue, or
omits a safeguard); **S4** documentation drift. Owner is the repo whose code must change. Fixing is
NOT part of `IP-CONSOLE-11-guide`; each fix is its own PR when the operator schedules it, and a fix PR
updates the guide entry it affects (`IP-CONSOLE-11-guide` rule R4).

| ID | Sev | Owner | Defect | Evidence | Status |
|----|-----|-------|--------|----------|--------|
| CD-01 | S1 | FC | `POST /api/idam/secret` needs only a session: any role can overwrite the node's Auth0 connector secret; no engine authorization, no audit record | `forgecentral/apps/bff/src/server.ts:2399-2444` | VERIFIED |
| CD-02 | S1 | torch | Applying a bundle attaches an nft / iptables egress ruleset in torchd's own network namespace (the host's, on the stock unit with `CAP_NET_ADMIN`) although enforcement is described as OFF; a zone whose ordinary network is not `permit-deny-risky` drops all new host egress; the table is never removed; the applied policy is memory-only. Latent today: the policy lane is off on a stock install (CD-08) and every bundle is refused (CD-05) | `torch/crates/torch-edge/src/bin/torchd.rs:1013-1017`; `torch/crates/torch-forge/src/realize.rs:325-341`; `torch/crates/torch-vtz/src/egress.rs:86-102`; `torch/deploy/torch-install/installer/phases/50-systemd.sh:63-64` | VERIFIED (code path; dev-box lane disabled) |
| CD-03 | S1 | crdb + FC | No per-operator role or tier check on any non-Settings command; the Console peer's configured clearance is dropped (every delegated call runs at Internal); Settings runs at a Console-asserted tier, uncapped | `crdb-console-ops.md` F1-F2; `crdb-settings-plane.md` 7.1 item 2; crdb `DEF-RBAC-PERMISSION-MAP` | code-read; deferred by ruling 2026-09-25 |
| CD-04 | S1 | FC | The sidecar's loopback services (sign, secret, session) trust any local process; no timeouts, connection caps or logging | `fc-platform-config.md` 3.9, 6.10 | code-read |
| CD-05 | S2 | FC + torch | Lease units: the Console stamps the bundle lease in unix milliseconds, torchd compares it with unix nanoseconds, so every Console bundle is refused `StaleLease` | `forgecentral/apps/bff/src/engine/distribute.ts:27-34, 95`; `torch/crates/torch-edge/src/bin/torchd.rs:335-342, 1042-1048, 1723-1725`; `torch/crates/torch-forge/src/apply.rs:192-195` | VERIFIED |
| CD-06 | S2 | crdb | `BUNDLE_CONVERGENCE` carries no delegation, reads the reserved service tenant and always answers "no bundle" | `crdb-console-ops.md` F3 | code-read |
| CD-07 | S2 | FC | A first distribution cannot be started from the UI; Applied To is ignored; re-distribute targets only the endpoints already in the stored bundle | `fc-governance.md` DIST-02, DIST-03 | code-read |
| CD-08 | S2 | torch | The endpoint installer never provisions the policy lane (`TORCH_POLICY_ANCHOR`, `TORCH_POLICY_ENDPOINT_CN`) and rewrites `torchd.env` on every run | `torch-endpoint.md` 0.1 item 1; dev-box journal `policy lane disabled (TORCH_POLICY_ANCHOR unset)` | VERIFIED (dev box) |
| CD-09 | S2 | torch | Of 30 authored policy dimensions only `allow_ordinary_internet` has a host effect; rules (objects, actions, protocols, ports, logging) are verified but never read; schedule, geo, tags and the active window are never sent | `torch-endpoint.md` 0.1 item 4, 3.10 | code-read |
| CD-10 | S2 | FC | Moving or renaming a zone always fails: the settings edit is sent under the NEW name, the engine derives the zone id from the name and refuses; the move never runs; the editor test stubs every call as success | `forgecentral/apps/console/src/surfaces/useVtzMutation.ts:113-122`; `forgecentral/apps/bff/src/server.ts:913-916`; `crucible/crates/cdb-types/src/forge_v2.rs:1894-1896`; `crucible/crates/cdb-cyber/src/vtz_store.rs:313-315` | VERIFIED |
| CD-11 | S2 | FC + crdb | Policy ids are minted from `request_id`; the BFF's counter restarts at 2 on every BFF restart, so a create can be refused Conflict after a restart; ids are small predictable integers | `forgecentral/apps/bff/src/engine/policies.ts:41-45`; `crdb-console-ops.md` F4 | VERIFIED (BFF side) |
| CD-12 | S2 | FC + crdb | Every engine call, mutations included, is retried once after a transport failure (the comment claims every verb is an idempotent read) and the engine has no request dedupe: duplicate notes, acts, plan revisions, IdAM connects | `forgecentral/apps/bff/src/engine/wire-client.ts:585-608, 1135-1144` | VERIFIED |
| CD-13 | S2 | FC | `GET /api/logs` ignores `offset`; the background pager receives page 0 repeatedly | `forgecentral/apps/bff/src/server.ts:429-464`; `forgecentral/apps/console/src/surfaces/useLogs.ts:28, 93` | VERIFIED |
| CD-14 | S2 | FC | Logs Export sends the 100-row page limit, not the filtered set, and is registered as a read binding (escaping the audited-command rule) | `fc-soc-logs-reports-settings.md` LOG-01, X-01 | code-read |
| CD-15 | S2 | crdb + FC | IdAM configure / connect / sync change in-memory state only (revert on node restart), are unaudited and untiered, and act on the one node-wide connector from any tenant; the committed `idam_connector` section has no consumer; Configure re-requires the id and secret, resets cadences to 300 s / 24 h and forces enabled | `crdb-console-ops.md` F5; `fc-governance.md` IDM-02; `crdb-settings-plane.md` 7.2 | code-read |
| CD-16 | S2 | crdb | Settings commits are blind whole-document writes: concurrent edits (Console or admin CLI) are last-writer-wins; no base version travels (contradicts TRD-CONSOLE-11 9.5) | `crdb-settings-plane.md` 4.4 | code-read |
| CD-17 | S2 | crdb + FC | Under dual control the SOC tiers and SIEM write-back cannot be proposed anywhere in the Console; proposals are memory-only and lost on restart; no reject verb; wire dual control keys only on `tenant-config`, which no profile includes | `crdb-settings-plane.md` 7.1 item 3; `fc-soc-logs-reports-settings.md` SET-SOC-02 | code-read |
| CD-18 | S2 | crdb | Registry text the Console shows verbatim is wrong for editable rows: `sessions.*` and `cognition.max_connections` say Live but bind at start; `governance.dual_control` is live for the wire only; `idam.connector` has no consumer; `detection_retention` says Pending but is live; `lug.exposure`'s default says disabled | `crucible/crates/cdb-server/src/admin.rs:50-66, 2250-2258`; `crdb-settings-plane.md` 1.4 | VERIFIED (sessions) |
| CD-19 | S2 | crdb | The Overview's zone grouping is a hard-coded demo configuration (three `Demo.*` zones; entity-id substring rules for "claude" / "codex"), not operator configuration | `crucible/crates/cdb-cyber/src/connectivity.rs:657-690` | VERIFIED |
| CD-20 | S2 | crdb | `DETECT_SUMMARY` aggregates every tenant on the node | `crdb-console-ops.md` F11 | code-read |
| CD-21 | S2 | crdb | The catastrophic floor is enforced for zones only; a policy's default postures may carry `permit-deny-risky` on floor domains | `crdb-console-ops.md` F9 | code-read |
| CD-22 | S2 | crdb | No cascades: deleting or renaming a zone leaves its policies and stored bundle; deleting a policy does not withdraw a distributed bundle; editing an object never changes a policy | `crdb-console-ops.md` F10 | code-read |
| CD-23 | S2 | FC | Policy edit traps: a zone change fails; widening classification reports "name already exists"; the active window is dropped; rules whose object no longer matches are silently dropped; Save & Publish is two writes | `fc-governance.md` POL-04, POL-05 | code-read |
| CD-24 | S2 | FC | Object and user traps: editing an object clears its attributes; objects are always drafts and tags cannot be authored; the drawer shows "Enrolled 1970-01-01"; a revoked user can be re-activated | `fc-governance.md` OBJ-04, OBJ-06, USR-05 | code-read |
| CD-25 | S2 | crdb | `CONTAIN`: every failure is Denied; a `command_id` replay with a different payload returns the original; no un-contain verb; not linked to an incident | `crdb-console-ops.md` F7 | code-read |
| CD-26 | S2 | FC | Console installer step [4b] pins the Console certificate into `wire.peers`, which the `:7879` control plane does not read, yet restarts cdb when it changes; no `cdb-mkconfig` version check | `fc-platform-config.md` 6.3 | code-read |
| CD-27 | S2 | FC | Re-running the Console installer rewrites the RBAC map (one global-admin subject; group grants cannot be expressed), the OIDC settings and ports; the sidecar config is fully rewritten; port and secret-path coupling is unguarded | `fc-platform-config.md` 6.4, 6.5 | code-read |
| CD-28 | S2 | crdb | SIEM write-back needs a hand-authored boot `connectors.siem.secret_ref`; no installer or `cdb-mkconfig` knob | `crdb-settings-plane.md` 7.1 item 6 | code-read |
| CD-29 | S3 | crdb | Turning `query_surface.enabled` off locks the Console out of almost every read (Settings stays reachable) | `crdb-settings-plane.md` 7.1 item 7 | code-read |
| CD-30 | S3 | FC | Missing confirm steps: Modify plan (TRD-CONSOLE-03 A11), Generate, Logs Export, Save connector | `fc-soc-logs-reports-settings.md` X-02 | code-read |
| CD-31 | S3 | FC | Silent failures: policy delete, object delete and user suspend / activate / revoke show no message; an invalid zone name shows a misleading message | `fc-governance.md` POL-06, OBJ-05, USR-05 (not shown); VTZ-05, VTZ-F1 (misleading) | code-read |
| CD-32 | S3 | FC | After Generate verdict the panels do not refresh: `RUN_POLL_INTERVAL_MS` is defined and never used | `forgecentral/apps/console/src/surfaces/useCognitionRun.ts:42` | VERIFIED |
| CD-33 | S3 | FC | Stale UI copy: the empty plan says "nothing proposes one yet"; the Security tab says key issuing is edited on Configuration (it is pending; no form) | `fc-soc-logs-reports-settings.md` L-03 item 2, D-11 item 4 | code-read |
| CD-34 | S3 | FC | Isolate is offered on every drawer (objects, network destinations); the posture is always quarantine and the success copy is fixed | `fc-governance.md` DRW-03 | code-read |
| CD-35 | S3 | FC | No tenant selector (the SPA never sends `x-active-tenant`); `/auth/me` returns no role or tenant; sessions are memory-only (1 h) and every Console install logs everyone out | `fc-platform-config.md` 6.8, 6.9 | code-read |
| CD-36 | S3 | FC | "Retry" after a failed Settings commit clears the message instead of resending | `fc-soc-logs-reports-settings.md` X-04 | code-read |
| CD-37 | S3 | crdb | Displayed values differ from what the node runs: the server report shows the boot maintenance cadence; the embedder row is empty on installer-built nodes | `crdb-settings-plane.md` 7.1 item 6 | code-read |
| CD-38 | S3 | crdb | Settings history carries changed keys only (no values), no diff verb, a 7-day horizon; calibration-map changes are invisible | `crdb-settings-plane.md` 7.1 item 5 | code-read |
| CD-39 | S3 | torch | Endpoint installer: default-on lanes still commented "opt-in"; discovery seeded enabled while logging DISABLED; an arm64 default install fails; no certificate renewal; torchd needs a manual restart after re-enroll; govern-attest can skip quietly; `torch-agent@` runs agents as root | `torch-endpoint.md` 0.1 items 9-10, 7.8 | code-read |
| CD-40 | S3 | FC | Sidecar lifecycle: the admin certificate is a self-signed 365-day leaf with no renewal; uninstall deletes the signing seed, so a reinstall needs a new anchor on every endpoint | `fc-platform-config.md` 6.11 | code-read |
| CD-41 | S4 | FC | The binding manifest is not enforced: the only contract test covers the empty shell; no test maps routes to bindings although `binding.ts:4-7` says one does; 17 routes are unregistered; `logs.export` is a read; header comments contradict entries; `authz` labels are never read | `forgecentral/apps/console/src/test/contract/no-stub.test.tsx:31-45`; `fc-platform-config.md` 6.1 | VERIFIED |
| CD-42 | S4 | FC | Console docs drift: `deploy/README.md` documents a retired enrollment flow and omits `CONSOLE_PEER_TENANT`; `:7878` vs `:7879`; `config.example.env` defaults differ from the code; `tier.ts` claims a configurable role-to-tier map; the OpenAPI documents a few paths only | `fc-platform-config.md` 6.12 | code-read |
| CD-43 | S4 | crdb | The Configuration Guide is count-gated only: three nonexistent env vars, a wrong memtable default, a 14-row validation table against 40 real errors; the PDF is two months older than the HTML. Not a safe source for the in-app guide | `crdb-settings-plane.md` section 6 | code-read |
| CD-44 | S4 | FC | Surface TRD drift (register below) and ledger drift in `IP-CONSOLE-11-settings` and `IP-CONSOLE-03-soc-ops` | `fc-soc-logs-reports-settings.md` Part 6; `fc-governance.md` J | code-read |

## TRD drift register

Every Console TRD the census touched has drifted. `IP-CONSOLE-11-guide` refreshes each one in the PR
that writes its chapter (GD.0 for TRD-CONSOLE-11); the detail is in the cited slice section.

| TRD | Drift (summary) | Slice |
|-----|-----------------|-------|
| 00 platform | 11 nav destinations vs 9; RBAC "enforced by the engine" vs no per-operator check; errors "with a request id" not shown; destructive actions "display the exact effect" vs fixed copy; the surface catalog lists controls that do not exist | `fc-governance.md` J |
| 01 overview | never amended for the Trust Score removal; top tabs, saved views, time range and push stream absent; paging, hover filter and container list exist unspecified; zone grouping is demo data (CD-19) | `fc-governance.md` J |
| 02 vtz | posture authoring, effective-posture preview, members, boundary, risk rules, `vtz.setMembership` specified but absent; delete, archetype, description, session duration, telemetry, micro-segmentation, lifecycle exist unspecified; re-scope broken (CD-10) | `fc-governance.md` J |
| 03 soc-ops | header, KPI strip (six tiles), dock (six tabs), card fields, lineage node kinds, model binding (configurable, not fixed), Section 7 binding table and A11 confirm all differ | `fc-soc-logs-reports-settings.md` D-03 |
| 04 users | type sub-classes, Pending status, export, group settings, group edit / membership UI, non-Auth0 connectors, confirm / tier gating specified but absent; connect + secret write exist unspecified | `fc-governance.md` J |
| 05 policies | active-window authoring, Applied-To-driven and first distribution, detail / version view, live convergence, priority, principal subjects specified but absent; max classification, filters and the inline form differ | `fc-governance.md` J |
| 08 reports | seven report tabs, trust distribution, reflex summary, attestation report, time range, share and audited export all absent; one page (weekly panel + incident report) built under IP-CONSOLE-03 | `fc-soc-logs-reports-settings.md` D-08 |
| 09 logs | columns, row colours, cursor paging, virtualization, filters, URL state and the audited export shape all differ; live tail polls | `fc-soc-logs-reports-settings.md` D-09 |
| 10 objects | confirm-gated create / edit, tags and classification editing, governing policies, reach and paging specified but absent; delete exists unspecified | `fc-governance.md` J |
| 11 settings | tab set (code has Changes; lacks Policy and Failover & DR); none of the `settings.*` bindings exist; five tabs still marked PENDING are live; row contents, 9.3 (binding-driven strip), 9.4 / 9.5 (propose everywhere, base version) and Sections 2, 6, 9.1 counts differ. **Revised in GD.0.** | `fc-soc-logs-reports-settings.md` D-11 |
| 12 entity drawer | Trust Score, sparkline, trust-era fields, EXPLAIN click-through, VTZ entity, live subscription, per-section retry and three quick actions specified but absent; Connections and Back-to-list exist unspecified | `fc-governance.md` J |

## Open questions for the operator

Technical questions the census could not settle from code. Each is also listed in the slice it came
from; the plan's decisions (naming, defect handling) are in `IP-CONSOLE-11-guide`.

1. Distribution: which lease unit is canonical (milliseconds or nanoseconds)? Is a host-wide egress
   attach on apply intended while enforcement is OFF? Should the endpoint installer provision the
   policy lane? Is "an endpoint in two zones converges on one" intended? (CD-02, CD-05, CD-08)
2. Identity: should IdAM configure / connect / sync persist (the `idam_connector` section), be audited
   and be tier-gated? Is revoking a user meant to be final? (CD-15, CD-24)
3. Governance: is per-operator role gating intended for governance commands (the manifest's `authz`
   labels suggest yes)? What should happen to a deleted zone's policies? What do a zone's session
   duration, telemetry mode, micro-segmentation and type drive (today the engine only stores them)?
   (CD-03, CD-22)
4. Settings: should the SOC tiers and SIEM write-back be proposable under dual control? Is the Settings
   `version` meant to be the store's latest version (it moves with any write)? (CD-17)
5. SOC: where does an operator find a principal id to assign an incident to?

## Verification log (2026-09-25)

Re-read by hand against the cited lines: CD-01, CD-02 (code path; the dev box's lane is disabled and
its host has no `torch_vtz` table), CD-05, CD-08 (dev box), CD-10, CD-11 (BFF side), CD-12, CD-13,
CD-18 (sessions), CD-19, CD-32, CD-41. The torch gate's egress tests attach the same default-deny
ruleset to whatever network namespace runs them; the operator's gate recipe already runs them in a
private namespace (`unshare -n`), so a gate run cannot black-hole the dev box.
