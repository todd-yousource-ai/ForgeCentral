# IP-CONSOLE-11-defect-remediation -- fixing the defects the configuration census found

The plan for every defect the `IP-CONSOLE-11-guide` work found and did not fix: 54 of the 66 rows in
the census defect register (`IP-CONSOLE-11-guide-CENSUS.md`, CD-01 to CD-66). The other 12 were fixed
during the guide work (CD-13, 18, 33, 41, 46, 51, 52, 55, 56, 60, 64, 66) and are not repeated here.

It is numbered under `TRD-CONSOLE-11` because the census that found these defects is that TRD's
Section 11 work. Each fix also answers to the surface TRD it touches; the "Known gaps" section each
surface TRD gained in the guide work (GD.4 to GD.10) names the rows below, and a fix PR strikes its
row from that section. Rows owned by the engine (crucible) or the endpoint agent (torch) are listed here
so the whole picture is in one place; when one is scheduled it gets its PR (and, for a multi-PR fix, its
own plan) in that repo, following that repo's naming, and this plan's ledger records the merge.

**Evidence baseline.** Every open row was re-verified against the code on 2026-09-25, after the guide
work merged: ForgeCentral `17650f1`, crucible `c5590958`, torch `d8f03ca`. Four read-only passes read
each row's code again and recorded current file:line evidence, the fix and a proving test; the result
is in Section 5. Line numbers are as of those commits. CD-65 was also observed live on the dev box
(Section 5, CD-65).

**Severity** (as in the census): **S1** security or safety; **S2** a configuration does not do what the
Console says; **S3** honesty or UX (the Console says or shows something untrue, or omits a safeguard);
**S4** documentation drift.

**Counts.** 54 open: 4 S1, 25 S2, 20 S3, 5 S4. Owners: ForgeCentral 26, crucible 15, torch 4, shared
9 (crucible + ForgeCentral 8, ForgeCentral + torch 1). Status at the baseline: 49 still open, 5 partly fixed
(CD-14, CD-31, CD-34, CD-44 partly; CD-03 open by ruling).

## 1. Named invariants this plan establishes

- `INV-DEFECT-FIXED-WITH-TEST` -- every row is closed by a PR that carries the proving test named in
  Section 5 (a failing test first where the defect is behavioral), and the census row flips to FIXED
  with the merge hash.
- `INV-GUIDE-TRACKS-FIX` -- a fix PR updates the guide entry and the surface TRD "Known gaps" row it
  affects (guide rule R4); the guide never documents a defect that is fixed, or omits one that is not.
- `INV-NO-LATENT-ENFORCEMENT` -- nothing that makes the policy lane reachable (CD-05, CD-06, CD-08) ships
  before the host-namespace hazard (CD-02) is closed.
- Inherited: `INV-CONSOLE-NO-STUB`, `INV-CONSOLE-NO-2ND-DB`, `INV-GUIDE-FORGE-NAMING`,
  `INV-GUIDE-DISABLED-EXPLAINED`.

## 2. Decisions for the operator (open)

Each of these changes what a PR does; none is decided here.

- **D1 (CD-03, deferred by ruling 2026-09-25).** When does the per-operator permission map (DEF-RBAC-
  PERMISSION-MAP) come off deferral? CD-01's clean fix and CD-15's tier check depend on it; RM.1 ships
  the interim guard without it.
- **D2 (CD-35).** Sessions are memory-only (every Console install signs everyone out). Accept and
  document, or design restart-surviving sessions without a second database (a sidecar-signed stateless
  token)?
- **D3 (CD-29).** Should the Console's delegated reads depend on `query_surface.enabled` (the external
  CrucibleQL exposure switch)? Either the engine decouples them, or the Console refuses to edit that key.
- **D4 (CD-17).** Should deployment profiles put `tenant-config` under dual control by default?
- **D5 (CD-34).** Which entity kinds can be isolated, and is `deny` a posture the operator may choose?
- **D6 (CD-39).** Discovery: seed it enabled (as today) or disabled (as the log line claims)?
- **D7 (CD-12, CD-11).** Engine-side request deduplication for mutating verbs: build it in crucible
  (the durable fix), or rely on the Console never retrying a mutation (the interim fix in RM.2)?

## 3. Order of work (one PR at a time, operator-approved merges)

Workstreams are in priority order. Within one, PRs run in the order listed. A PR number is assigned when
it is scheduled. Repo in brackets.

| Stream | Rows | Why this order |
|--------|------|----------------|
| **RM.1 Security** | CD-01 [FC], CD-04 [FC sidecar], CD-02 [torch], CD-03 [crdb+FC, D1] | S1 rows first. CD-02 is latent today and must close before RM.3 makes the lane reachable. |
| **RM.2 Engine connection** | CD-65, CD-12, CD-11 [FC; crdb for D7] | Seen live (CD-65); a retried mutation can double-apply (CD-12); creates can collide after a restart (CD-11). Small FC changes with high reach. |
| **RM.3 Policy distribution** | CD-05 [FC+torch], CD-06 [crdb+FC], CD-07 [FC], CD-08 [torch], CD-54 [crdb], CD-21 [crdb], CD-22 [crdb], CD-09 [torch] | Distribution is broken end to end today. Strict order: CD-02 (RM.1) then CD-05, CD-06, CD-07, CD-08; CD-09 is the enforcement epic and comes last. |
| **RM.4 Authoring forms** | CD-10, CD-23, CD-49, CD-53, CD-31, CD-24 [FC; crdb for CD-23's 409 cause and CD-24's revoke guard] | Zone move always fails (S2); policy and object edits lose data silently. |
| **RM.5 Settings governance** | CD-47, CD-16, CD-17, CD-37, CD-38, CD-29 [crdb then FC] | Version shown is wrong (CD-47, small); no base-version check (CD-16); dual control incomplete (CD-17). |
| **RM.6 Identity providers** | CD-57, CD-15, CD-58 [crdb then FC] | A UI-onboarded connector can sync into the nil tenant (CD-57); connector changes are lost on restart (CD-15). |
| **RM.7 SOC, Logs, drawer** | CD-30, CD-32, CD-62, CD-14, CD-61, CD-63, CD-59, CD-25, CD-34, CD-20, CD-19, CD-48 | Mostly FC; CD-61, CD-25, CD-20, CD-19, CD-48 are crdb; CD-63 and CD-59 need a crdb field first. |
| **RM.8 Console shell and copy** | CD-45, CD-50, CD-36, CD-35 (D2) [FC] | Internal names shown to operators; Retry that does not retry; tenant switching. |
| **RM.9 Installers and lifecycle** | CD-26, CD-27, CD-40 [FC]; CD-28 [crdb]; CD-39 [torch] | Re-runs that rewrite operator config or restart the engine; certificates without renewal. |
| **RM.10 Documentation** | CD-42 [FC], CD-43 [crdb], CD-44 [FC] | Docs drift; last, and folded into neighbouring PRs where they touch the same files. |

**Dependency chain (must hold):** CD-02 before CD-05, CD-06, CD-08 (`INV-NO-LATENT-ENFORCEMENT`).
CD-06 before CD-07 (the panel never sees a bundle until convergence is delegated). CD-05, CD-06, CD-08
before CD-09. CD-03 (D1) before CD-01's engine-authorized form and CD-15's tier check. The crdb field
for enforcement posture before CD-59's FC half; the crdb principal-to-subject mapping before CD-63's FC
half; the crdb refusal cause before CD-23's split 409.

## 4. Summary register

Status is at the evidence baseline. "Partial" means part of the row was fixed by the guide work; the
remainder is what this plan fixes.

| ID | Sev | Owner | Stream | Status | Defect (short) |
|----|-----|-------|--------|--------|----------------|
| CD-01 | S1 | FC | RM.1 | Open | Any signed-in role can overwrite the Auth0 connector secret; no audit |
| CD-02 | S1 | torch | RM.1 | Open (latent) | Applying a bundle attaches an egress ruleset in torchd's own (host) namespace |
| CD-03 | S1 | crdb+FC | RM.1 | Open, deferred (D1) | No per-operator role check outside Settings; peer clearance dropped |
| CD-04 | S1 | FC | RM.1 | Open | Sidecar loopback services trust any local process; no timeouts, caps or logs |
| CD-05 | S2 | FC+torch | RM.3 | Open | Lease stamped in ms, checked in ns: every Console bundle refused StaleLease |
| CD-06 | S2 | FC+crdb | RM.3 | Open | Convergence read carries no delegation; reads the service tenant |
| CD-07 | S2 | FC | RM.3 | Open | No first distribution; Applied To ignored |
| CD-08 | S2 | torch | RM.3 | Open | Installer never provisions the policy lane; rewrites torchd.env |
| CD-09 | S2 | torch | RM.3 | Open | Only allow_ordinary_internet has a host effect; rules never read |
| CD-10 | S2 | FC | RM.4 | Open | Moving or renaming a zone always fails |
| CD-11 | S2 | FC+crdb | RM.2 | Open | Policy ids minted from a request counter that restarts |
| CD-12 | S2 | FC+crdb | RM.2 | Open | Mutations retried after a transport failure or timeout |
| CD-14 | S2 | FC | RM.7 | Partial | Export sends the 100-row page limit, not the filtered set |
| CD-15 | S2 | crdb+FC | RM.6 | Open | IdAM configure/connect/sync in memory only, unaudited, untiered |
| CD-16 | S2 | crdb+FC | RM.5 | Open | Settings commits are last-writer-wins; no base version |
| CD-17 | S2 | crdb+FC | RM.5 | Open | SOC settings cannot be proposed under dual control; proposals memory-only |
| CD-19 | S2 | crdb | RM.7 | Open | Overview zone grouping is a hard-coded demo |
| CD-20 | S2 | crdb | RM.7 | Open | DETECT_SUMMARY aggregates every tenant |
| CD-21 | S2 | crdb | RM.3 | Open | Floor enforced for zones only, not policies |
| CD-22 | S2 | crdb | RM.3 | Open | No cascades on zone/policy delete, zone rename, object edit |
| CD-23 | S2 | FC | RM.4 | Open | Policy edit traps (zone change, 409 cause, window dropped, rules dropped) |
| CD-24 | S2 | FC | RM.4 | Open | Object/user traps (attributes cleared, draft only, 1970 date, revoked re-activation) |
| CD-25 | S2 | crdb | RM.7 | Open | CONTAIN: all failures Denied; replay returns original; no release verb |
| CD-26 | S2 | FC | RM.9 | Open | Installer [4b] pins a peer the control plane does not read, restarts cdb |
| CD-27 | S2 | FC | RM.9 | Open | Installer re-run rewrites RBAC, OIDC, ports and sidecar config |
| CD-28 | S2 | crdb | RM.9 | Open | SIEM write-back needs a hand-authored boot secret_ref |
| CD-29 | S3 | crdb | RM.5 | Open (D3) | Turning query_surface.enabled off locks the Console out |
| CD-30 | S3 | FC | RM.7 | Open | No confirm on Modify plan, Generate, Export, Save connector |
| CD-31 | S3 | FC | RM.4 | Partial | Silent delete/status failures; zone refusal copy misleading |
| CD-32 | S3 | FC | RM.7 | Open | Verdict panels do not refresh after Generate |
| CD-34 | S3 | FC | RM.7 | Partial (D5) | Isolate offered on every drawer; posture fixed |
| CD-35 | S3 | FC | RM.8 | Open (D2) | No tenant selector; /auth/me lacks role and tenant; memory-only sessions |
| CD-36 | S3 | FC | RM.8 | Open | Retry after a failed commit clears instead of resending |
| CD-37 | S3 | crdb | RM.5 | Open | Server report shows the boot cadence; embedder row empty |
| CD-38 | S3 | crdb | RM.5 | Open | History has keys only; no diff; 7-day horizon; calibration invisible |
| CD-39 | S3 | torch | RM.9 | Open (D6) | Endpoint installer hazards (comments, arm64, no renewal, root agents) |
| CD-40 | S3 | FC | RM.9 | Open | Sidecar admin cert has no renewal; uninstall deletes the signing seed |
| CD-42 | S4 | FC | RM.10 | Open | Console docs drift |
| CD-43 | S4 | crdb | RM.10 | Open | Engine Configuration Guide drift, count-gated only |
| CD-44 | S4 | FC | RM.10 | Partial | Ledger drift (TRDs fixed by the guide work) |
| CD-45 | S3 | FC | RM.8 | Open | Operator copy exposes internal names and plan ids |
| CD-47 | S3 | crdb+FC | RM.5 | Open | Settings version shows the store's latest version, not the config's |
| CD-48 | S3 | crdb | RM.7 | Open | Four object kinds never resolve members |
| CD-49 | S3 | FC | RM.4 | Open | Policy pickers key objects by selector value |
| CD-50 | S4 | FC | RM.8 | Open | Pending drawer sections show internal plan ids |
| CD-53 | S3 | FC | RM.4 | Open | Pickers offer object kinds the engine refuses in that role |
| CD-54 | S3 | crdb | RM.3 | Open | Convergence "Applied" does not mean "in force" |
| CD-57 | S2 | crdb | RM.6 | Open | UI-onboarded connector syncs into the nil tenant |
| CD-58 | S4 | FC | RM.6 | Open | Onboard Auth0 empty state unreachable |
| CD-59 | S3 | FC | RM.7 | Open | Enforcement pill, badge and copy are constants |
| CD-61 | S3 | crdb | RM.7 | Open | LOG_EXPORT and LOG_QUERY read different pools in episode mode |
| CD-62 | S3 | FC | RM.7 | Open | Logs time range has no end bound; `since` goes stale |
| CD-63 | S2 | FC+crdb | RM.7 | Open | Drawer Recent decisions always empty |
| CD-65 | S2 | FC | RM.2 | Open (seen live) | One slow engine read fails every read queued behind it |

## 5. Defects: evidence, fix, proving test

Paths are relative to the repo named first (`forgecentral/`, `crucible/`, `torch/`). "Test" names the
tier and the assertion that proves the fix; it is written first and fails on the code at the baseline.

### RM.1 Security

**CD-01 (S1, FC). Any signed-in role can overwrite the Auth0 connector secret; no audit.**
Evidence: `forgecentral/apps/bff/src/server.ts:2396-2447` (`handleIdamSecret`) checks only for a
session (401 at :2405) then calls `setConnectorSecret` (:2430); there is no `session.role` check, unlike
`handleConsoleRbac` at :2119 (`session.role !== 'global-admin'` gives 403). No engine call, so no
delegation and no audit record; the only log is a failure warn at :2443. The sidecar does not
authenticate the caller either (`sidecar/src/secret_service.rs:108-120, 150`).
Fix: refuse any role but `global-admin` with 403 before reading the body (as at :2119), and write a
non-secret audit line. The durable form routes the rotation through a delegated, audited engine verb
(an `IDAM_CONNECT` field recording "secret rotated by X"), which waits on D1.
Test: contract (`apps/bff/test/server.test.ts`): a non-admin session gets 403 and the sidecar stub is
never dialed; a global-admin gets 200. Live: an operator-role login is refused.

**CD-04 (S1, FC). The sidecar's loopback services trust any local process.**
Evidence: `forgecentral/sidecar/src/secret_service.rs:108-120`, `sign_service.rs:108-120`,
`session_service.rs:150-161` accept and spawn with the peer ignored (`let (stream, _peer)`); no uid
check (TCP loopback has no `SO_PEERCRED`), no `tokio::time::timeout`, no connection cap, no request
logging (the only output in `sidecar/src` is one `println!` at `main.rs:81`). The only bound is
`MAX_REQUEST_BYTES`.
Fix: move the three legs to Unix sockets owned by the BFF user (0600) and check `SO_PEERCRED`, or add a
per-install shared token; per-read and idle timeouts; a `Semaphore` connection cap; a log line per
request with its outcome (never the secret).
Test: unit per service: an idle connection closes after the timeout; the N+1th connection is refused; a
wrong uid or token is refused. Live: a non-BFF local user cannot set the secret.

**CD-02 (S1, torch, latent). Applying a bundle attaches an egress ruleset in torchd's own namespace.**
Evidence: `torch/crates/torch-edge/src/bin/torchd.rs:1006-1017` builds `TorchVtzRealization` in-process
when the policy lane is set (its own comment, :1004-1005, says an applied bundle realizes nothing);
`torch-forge/src/realize.rs:323-377` realizes through `EgressScaffold::attach_policy`, which runs `nft`
or `iptables-restore` in the current namespace (`torch-vtz/src/egress.rs:170-184`); the ruleset is
`policy drop` with the final accept only when `allow_ordinary_internet` (:374-392); nothing deletes the
`torch_vtz` table; the posture is memory-only (`torch-forge/src/apply.rs:56-61`); the unit grants
`CAP_NET_ADMIN` with no `PrivateNetwork` (`deploy/torch-install/installer/phases/50-systemd.sh:63-64`).
Latent because CD-05 and CD-08 keep the lane unreachable; fixing either first makes this live.
Fix: gate realization on an explicit enforcement knob, off by default (record tiers only while off);
attach only inside a zone namespace (`setns`), never torchd's; tear the table down on shutdown and on a
superseding policy; persist last-known-good or state that a restart applies nothing.
Test: unit with a fake egress backend: realize with enforcement off never attaches. Privileged e2e in a
netns sandbox: a bundle with `allow_ordinary_internet=false` leaves host egress working; teardown test.

**CD-03 (S1, crdb+FC, deferred by ruling 2026-09-25, D1). No per-operator role check outside Settings.**
Evidence: `crucible/crates/cdb-server/src/transport.rs:130-132` maps `peer_acting` to
`ExplainTier::User`; `peer_map` keeps only `(tenant, grant)`, dropping the peer clearance (:394-402);
`handler.rs:4214-4225` `settings_tier` honors a Console-asserted `"Admin"` with no cap by the peer's
tier (used at :4236, :4338, :4704, :4820, :4900); the deferral is `crucible/docs/DEFERRED_LEDGER.md:
1206-1217` (DEF-RBAC-PERMISSION-MAP).
Fix: crdb: a per-operation permission check on `OperatorDelegation` (role or group claim), carry the
configured peer clearance through `peer_map` into the session, cap `settings_tier` at the peer grant's
ceiling. FC: send the role in the delegation (`auth/rbac.ts`, `auth/tier.ts`).
Test: crdb handler: a User-role delegation is refused on a mutating verb; an `Admin` settings tier from
a peer without that ceiling is capped. Live: two Console roles, one refused.

### RM.2 Engine connection

**CD-65 (S2, FC, seen live). One slow engine read fails every read queued behind it.**
Live evidence: `console-bff` journal, 2026-09-25 20:31:14.937 UTC, during the GD.N walk: the Overview
`connectivityGraph` read (delegated 20:31:04.9) and four Settings reads (`socSettingsRead` 20:31:05.4,
`settingsApprovals` and `settingsHistory` 20:31:06.5, `socSettingsRead` 20:31:06.9) all logged failure
at the same millisecond (`overview read failed`, `soc settings failed` x2, `settings governance
failed` x2); the browser saw a 502 and the header showed Not live. 1 of 2 Overview reads failed in that
hour, 5 in the day before.
Code evidence (`forgecentral/apps/bff/src/engine/wire-client.ts`): `serialize` (:518-526) chains every
op on one `opChain` (one frame in flight on stream 0 of one connection); `call` (:592-609) takes the
transport (:598) before queueing (:600), so a queued call holds the transport current at enqueue time;
`withTimeout` (:490-502; 5 s default, `config.ts:53`) rejects a slow op and `invalidate` (:547-552)
closes its transport. Sequence: the graph read times out on T1 (about 5 s) and T1 closes; the four
queued reads fail at once on the closed T1 (attempt 1 spent); the graph read's retry and their second
attempts queue on T2; the graph read times out again (about 10 s after it began) and closes T2; the four
fail in the same tick.
Fix: resolve the transport inside the serialized op, so a queued call runs on the current connection,
and do not count a failure on an already-invalidated transport as an attempt; bound queue wait
separately from the call; give heavy reads (the Overview graph) a longer per-verb timeout or their own
connection so they cannot block Settings, SOC or health reads. Longer term: a small pool or multiplexed
streams (check engine support for stream ids other than 0).
Test: unit with a fake `EngineConnector`: op 1 hangs past the timeout with ops 2 to 5 queued; op 1
rejects, ops 2 to 5 resolve on the reconnected transport, at most two dials; the variant where op 1
times out twice still lets ops 2 to 5 succeed. Live: repeat the Overview plus Settings burst; no
same-millisecond failure clusters in the journal.

**CD-12 (S2, FC+crdb). Mutations are retried after a transport failure or timeout.**
Evidence: `wire-client.ts:584-607`: the doc comment says every verb is an idempotent read, but `call`
retries once on any non-refusal error, including a `withTimeout` rejection (:490), and every mutation
uses it: `GroupCreate` :678, `PrincipalCreate` :689, `IdamConnect` :774, `ObjectCreate` :807,
`SettingsCommit` :934, `SocSettingsCommit` :1032, `SocPlanApprove`/`Modify` :1054/:1065,
`SocIncidentAct` :1076, `PolicyCreate` :1141, `BundleCommit` :1300, `VtzCreate` :1310. crdb dedupes only
the CQL write paths (`handler.rs:432, 1623-1628`).
Fix: FC: an `idempotent` flag on `call`; a mutation retries only when its frame was never written
(connect or handshake failure), never after a write or a timeout; correct the comment. crdb (D7): a
per-peer `request_id` dedupe for mutating verbs, which needs unique request ids (`distribute.ts` sends 0).
Test: unit with a fake transport failing after the write or timing out: `socIncidentAct` is dispatched
once and rejects; a read is retried. crdb handler test once dedupe exists.

**CD-11 (S2, FC+crdb). Policy ids are minted from a request counter that restarts.**
Evidence: `forgecentral/apps/bff/src/engine/policies.ts:43-47`: a module-level counter (first value 2
after every restart, shared with reads at :55, :72); `crucible/crates/cdb-server/src/handler.rs:
6282-6287` mints `PolicyId::from_uuid(Uuid::from_u128(req.request_id))`; `cdb-cyber/src/policy_store.rs:
466` refuses a repeat as `AlreadyExists` (Conflict). With CD-12 a retried create also turns a success
into a Conflict.
Fix: FC now: a crypto-random 64-bit request id for creates. crdb (durable): mint the id server-side (a
random UUID, or a hash of tenant, principal, request id and a session nonce) and keep replay dedupe
separate.
Test: unit: two fresh module loads produce different create ids. crdb: creates across a simulated
restart do not collide. Live: a create after a BFF restart succeeds.

### RM.3 Policy distribution

Order: CD-02 (RM.1) first, then CD-05, CD-06, CD-07, CD-08; CD-54, CD-21, CD-22 in any order after;
CD-09 last.

**CD-05 (S2, FC+torch). Lease stamped in milliseconds, checked in nanoseconds.**
Evidence: `forgecentral/apps/bff/src/engine/distribute.ts:27-34` (`LEASE_WINDOW_MS`, "the unix-ms Hlc
convention"), :95 (`issued_at: nowMs, not_after: nowMs + LEASE_WINDOW_MS`), :148 (`Date.now()`);
`torch/crates/torch-edge/src/bin/torchd.rs:1723-1725` (`Hlc(now_nanos())`, :335-343);
`torch-forge/src/apply.rs:193-195` refuses `now >= not_after` as `StaleLease`, which nanoseconds always
exceed; `crucible/crates/cdb-types/src/primitives.rs:151-159` documents `Hlc` as opaque with no unit.
Fix: pin the unit in crdb (document it on the lease or add a typed nanosecond lease); stamp nanoseconds
in FC (`BigInt(Date.now()) * 1_000_000n`, `LEASE_WINDOW_NS`), the smaller change and consistent with
torch.
Test: cross-repo golden bundle: FC's lease is accepted by `verify_and_apply` with `torch_core_hlc()` and
refused after the window. Live: a distribute reads `applied` in convergence.

**CD-06 (S2, FC+crdb). The convergence read carries no delegation.**
Evidence: `forgecentral/apps/bff/src/engine/operator-engine.ts:1018-1022` says the operator is injected
but calls `client.bundleConvergence(request, opts)` without it (compare `vtzDetail` :1005-1008);
`crucible/crates/cdb-wire/src/query.rs:3890-3895` has no `operator` field; `cdb-server/src/handler.rs:
6938-6954` projects over `session.tenant` (the peer's reserved tenant) and returns `has_bundle: false`.
Fix: crdb: add `operator: Option<Box<OperatorDelegation>>` to the query and resolve the tenant through
`provision_admission`. FC: regenerate `wire-dto.ts` and inject the operator.
Test: crdb handler: a bundle committed under a delegated tenant is seen by a delegated convergence read;
an undelegated read is refused or empty. FC contract: the adapter sends the operator. Live:
distribute then read `hasBundle: true`.

**CD-07 (S2, FC). No first distribution; Applied To ignored.**
Evidence: `forgecentral/apps/console/src/surfaces/DistributionPanel.tsx:71-75` (the empty-state hint
says a first distribution is impossible); :45 scopes re-distribution to the stored members;
`apps/bff/src/engine/distribute.ts:143-149` takes members from the request only; Applied To
(`PolicyForm.tsx`, stored as `applied_to`, `packages/contracts/src/policies.ts:469-470`) is read by
neither `composeBundleRules` (`forge.ts:216`) nor `distribute.ts`.
Fix: derive the target set from the union of the effective policies' Applied To (in `resolveDistribute`)
or add an enrolled-endpoint picker; offer a first distribute when there is no bundle. Needs CD-06.
Test: unit: `resolveDistribute` members equal the Applied To union; RTL: the first-distribute control
renders without a bundle; e2e distribute then convergence.

**CD-08 (S2, torch). The endpoint installer never provisions the policy lane.**
Evidence: `torch/deploy/torch-install/installer/phases/40-config.sh:14-44` writes the whole `torchd.env`
with no `TORCH_POLICY_*` line and overwrites it on every run (:15, :47); no `TORCH_POLICY` anywhere in
`deploy/`; `torchd.rs:199-205` reads the knobs and logs `policy lane disabled` (:1054).
Fix: a policy-lane phase that installs the distribution anchor (the sidecar's `anchor_json`), writes
`TORCH_POLICY_ANCHOR` and `TORCH_POLICY_ENDPOINT_CN` (the bound CN from 30-enroll) and forwards
`TORCH_POLICY_FETCH_SECS`; preserve operator lines (or use a drop-in env file). Not before CD-02.
Test: installer shell test: 40-config with the anchor set writes both keys and a re-run keeps them.
Live: the journal shows `policy lane enabled`.

**CD-54 (S3, crdb). Convergence "Applied" does not mean "in force".**
Evidence: `crucible/crates/cdb-cyber/src/apply_report_store.rs:50-56` keys reports per `(tenant, vtz,
endpoint)` with newest-wins only within a zone (:86-97); :205-208 reads Applied when `version >= target`
and not rejected; nothing records that the endpoint later applied another zone's bundle; no timestamp.
Fix: a per-endpoint in-force record (latest zone and version across zones) written in
`commit_apply_report`; report Applied only when it matches, else a new `Superseded` state (wire change;
the FC panel renders it).
Test: crdb unit: Applied(v1) in zone A, then Applied in zone B from the same endpoint; zone A no longer
reads Applied for it. Live readout after moving an endpoint between zones.

**CD-21 (S2, crdb). The catastrophic floor is enforced for zones only.**
Evidence: `crucible/crates/cdb-types/src/forge_v2.rs:1875-1879` enforces it on zones;
`PolicyRecord::validate` (:1661-1690) has no floor check; `compose_effective` (:1503-1515) keeps a
policy's loosening on a floor domain no zone authored. Torch refuses it at compose
(`torch/crates/torch-forge/src/compose.rs:289-297`, `FloorLoosening`), so crdb accepts and distributes a
bundle the endpoint will refuse.
Fix: a `FloorViolation` check in `PolicyRecord::validate` mirroring the zone check, with a clear refusal.
Test: unit: a policy with `GovernedEgress => PermitDenyRisky` fails validate; handler: `POLICY_CREATE`
refused.

**CD-22 (S2, crdb). No cascades.**
Evidence: `crucible/crates/cdb-cyber/src/vtz_store.rs:378-399` refuses zone delete only for child zones
and tombstones the zone alone; `commit_rescope_zone` (:334-370) moves the zone record only;
`policy_store.rs:605-630` tombstones policy versions only; `object_store.rs:186` edits the object only
(policy rules hold copied selectors).
Fix: zone delete refused while policies or a bundle exist (or cascaded in one audited batch); rename
moves the policies; policy delete marks the zone's bundle stale; object edit reports referencing
policies.
Test: unit: deleting a zone with a policy is refused or cascades; deleting a policy marks the bundle
stale in `BUNDLE_CONVERGENCE`.

**CD-09 (S2, torch). Only `allow_ordinary_internet` has a host effect.**
Evidence: `torch/crates/torch-forge/src/apply.rs:218-234` realizes and stores only `bundle.policy`;
`bundle.rules` is never read; `realize.rs:233-242` uses three fields; `evaluate_effective` and
`object_realize` (`torch-forge/src/lib.rs:40, 60`) are called only from tests;
`forgecentral/packages/contracts/src/forge.ts:212-214` does not carry schedule, geo or tags.
Fix: the enforcement epic: build the effective ruleset from `bundle.rules`, realize objects and actions
through `object_realize`, store it in `AppliedPolicySet`; carry schedule, geo and tags (FC
`composeBundleRules` plus the crdb bundle type). After CD-02, CD-05, CD-08.
Test: unit: a bundle with a deny rule makes `evaluate_effective` return Deny for that destination;
cross-repo golden bundle with schedule and window round-trips.

### RM.4 Authoring forms

**CD-10 (S2, FC). Moving or renaming a zone always fails.**
Evidence: `forgecentral/apps/console/src/surfaces/VtzEditor.tsx:201` computes `moveTo`, and
`specFromForm()` (:203-205) sets `name` to the new composed name; `useVtzMutation.ts:117` sends the PUT
first, then `/rescope` (:122); the BFF drops the path id (`apps/bff/src/server.ts:917-920`); the engine
derives the id from the name (`crucible/crates/cdb-types/src/forge_v2.rs:1894-1896`) and refuses the
unknown new id (`cdb-cyber/src/vtz_store.rs:313-314`). The tests stub both calls as successes
(`apps/console/src/test/vtz-surface.test.tsx:429`, `e2e/vtz.spec.ts:137, 320`).
Fix: send the settings edit under the old name, then rescope (or rescope first, then edit under the new
name); correct the reasoning comment at `useVtzMutation.ts:104-107`; the BFF refuses a PUT whose
`spec.name` differs from the path id.
Test: integration against the real handler chain (no stubs): edit-and-move leaves the zone under the new
name with the new settings; contract: a mismatched PUT is 400.

**CD-23 (S2, FC). Policy edit traps.**
Evidence (`forgecentral/apps/console/src/surfaces/PolicyForm.tsx`): the Zone select stays editable on
edit (:272-281) and the engine looks the policy up under the new zone; the 409 copy (:78-79, "name
already exists") is also what a classification widening shows; `buildDraft` (:186-192) silently drops
subjects and targets whose object no longer matches; `activeFrom`/`activeUntil` are sent as null
(:209-210); Save and Publish is two posts and invalidates only on success (`usePolicyMutation.ts:56-70`).
Fix: disable Zone on edit; split the 409 by cause (needs crdb to return a distinct class or detail for
classification widening); carry the active window; list unmatched rules before save; on a publish
failure after authoring, refetch and switch to edit mode.
Test: RTL on edit mode: Zone disabled; the window round-trips; dropped rules are listed; the list is
refetched after a publish failure.

**CD-49 (S3, FC). Policy pickers key objects by selector value.**
Evidence: `PolicyForm.tsx:159-163` builds the lookup keyed by `selectorValue` (last one wins); options at
:294-298 and :310-314 use `value={c.selectorValue}`; edit seeds from selector values (:130-135), so an
edited policy can switch to the other object's kind.
Fix: key options, state and lookup by the object's identity (name or id, else the kind, selector kind and
value tuple); seed edits from the rule endpoint's full tuple.
Test: RTL: two objects of different kinds with the same value; selecting the second yields its kind in
the draft; both are separately selectable.

**CD-53 (S3, FC). Pickers offer object kinds the engine refuses in that role.**
Evidence: both selects render the whole catalog (`PolicyForm.tsx:294, 310`); FC has no role matrix; the
engine's is `crucible/crates/cdb-types/src/forge_v2.rs:352-368` (User, Group, Agent source-only; URI,
Network, Registry Key, Data Store, Kernel destination-only), enforced only at save (:1672-1680).
Fix: a role table beside `OBJECT_KINDS` (`packages/contracts/src/objects.ts:34-49`) mirroring the engine
matrix; filter Subjects to source-capable and Targets to destination-capable kinds.
Test: unit: Subjects has no destination-only kinds and Targets no source-only kinds; contract: the FC
table equals the engine matrix for all twelve kinds.

**CD-31 (S3, FC, partly fixed). Silent failures; misleading zone refusal.**
Fixed by GD.12b: an engine-invalid zone name is caught before Save (`VtzEditor.tsx:187, 193-198`).
Still open: policy delete (`PoliciesSurface.tsx:151, 247`), object delete (`ObjectsSurface.tsx:215,
281`) and user status (`UsersSurface.tsx:222, 448`) render no error; the BFF sends any unclassified
engine refusal (for example Framing) as 403 (`apps/bff/src/server.ts:1084-1085`), which
`useVtzMutation.ts:59` shows as "contradicts a rule the platform enforces" (`VtzEditor.tsx:77-78`); the
BFF narrower checks only that the name is not blank (`packages/contracts/src/vtz.ts:451`).
Fix: render the mutation error on the three surfaces (status-specific copy, as `isolateFailure`); map
Framing to 400 on the VTZ route (as :1212, :1373); optionally call `vtzNameProblem` in the BFF.
Test: RTL per surface: a 403 or 503 on delete or status shows an alert; contract: Framing on
`POST /api/vtz` is 400.

**CD-24 (S2, FC; crdb guard). Object and user traps.**
Evidence: `ObjectDraft` has no attributes (`packages/contracts/src/objects.ts:95-103`) and
`toWireObjectSpec` omits them (:177-187), so an edit clears them (the engine builds them from the spec,
`crucible/crates/cdb-server/src/handler.rs:5990-6015`); objects are always drafts and tags cannot be authored
(`ObjectsSurface.tsx:107-108`); the drawer shows "Enrolled 1970-01-01" (`apps/bff/src/engine/
entity-detail.ts:274`, rendered at `packages/design/src/components/EntityDrawer.tsx:215-216`); a revoked
user shows Activate (`UsersSurface.tsx:311-331`) and the engine allows it (`crucible/crates/cdb-cyber/
src/lug_provision.rs:318-339`).
Fix: carry attributes; add tag and publish controls; make `enrolledAt` nullable and render n/a; hide
Activate on revoked rows; crdb refuses revoked to active.
Test: contract: attributes round-trip; drawer unit: no Enrolled value for an object; crdb unit: revoked
to active refused; RTL: no Activate on a revoked row.

### RM.5 Settings governance

**CD-47 (S3, crdb+FC). The Settings version is the store's latest version, not the configuration's.**
Evidence: `crucible/crates/cdb-server/src/handler.rs:4262-4263` returns
`engine.store_for_test().latest_version()` with the document; `SOC_SETTINGS_READ` does the same at
:5215-5216 with a comment claiming it is correct; the right value is `observed_version(&config_key())`
(`config_store.rs:191`, as `history()` uses). FC shows it as "committed at version"
(`SettingsSurface.tsx:126`); live on the box the Federation tab showed version 1689603.
Fix: `ConfigStore::current_config_with_version()` returning the observed version; use it in both
handlers. No FC change.
Test: crdb: commit (version N), write unrelated data, `SETTINGS_READ.version == N == history[0]`. Live:
the version is stable under ingest.

**CD-16 (S2, crdb+FC). Settings commits are last-writer-wins.**
Evidence: `crucible/crates/cdb-wire/src/query.rs:2524-2536` (`WireSettingsCommit`) has no base version;
`handler.rs:4695-4769` applies the edits to `current_config()` (:4722) and commits through
`commit_governed` (`bootstrap.rs:5784-5822`), a blind MVCC put (`config_store.rs:124`).
`SocSettingsCommit` (`handler.rs:5232`) has the same shape. Edits to different keys survive; the same
key or section, or an admin-plane whole-document commit, silently overwrites.
Fix: crdb: a `base_version` on both commits, refused as stale when the latest differs, checked and
written atomically. FC: send the version read and render "changed since you loaded it; reload".
Test: crdb unit: two commits on the same base, the second refused; FC contract: the body carries it.

**CD-17 (S2, crdb+FC, D4). SOC settings cannot be proposed under dual control; proposals are memory-only.**
Evidence: `handler.rs:5258-5270` refuses a SOC commit under `TenantConfig` dual control;
`WireSectionPatch` (`query.rs:2501-2520`) has no SOC or SIEM field; `PendingApprovals` is an in-memory
mutex (`cdb-admin/src/dual_control.rs:150-160`, created `bootstrap.rs:713`) with no reject; only
`TenantConfig` gates the wire (`handler.rs:4138, 4285, 4728, 5146, 5260`). FC section submits still read
"Commit" under dual control (`SettingsSectionForms.tsx:155`).
Fix: crdb: SOC tiers and SIEM write-back in the section patch (or a propose verb); persist proposals in
a config-store keyspace; a reject or withdraw verb. FC: a propose path on the SOC tab and a
propose-aware label.
Test: crdb live: a proposal survives a restart; proposing SOC tiers under dual control succeeds. RTL:
the SOC tab offers Propose when dual control is on.

**CD-37 (S3, crdb). Displayed values differ from what the node runs.**
Evidence: `crucible/crates/cdb-server/src/admin.rs:265, 693` copies the boot maintenance cadence once
and `server_report` (:1019) reports it; a live change goes to `set_cadence_secs` and is never re-read
(a getter exists, `cdb-maintain/src/thread.rs:199`); the installer writes `CDB_EMBED_TEI` only into
`cdb.env` (`deploy/cdb-install/installer/phases/50-config.sh:99`) and `seed_document`
(`config_bringup.rs:33-66`) never seeds `embedder`.
Fix: read `trigger.cadence_secs()` when building the report; pass the embedder env to `cdb-mkconfig`
(it reads them, `cdb-mkconfig.rs:1282-1290`) and seed `embedder`, or commit it at install.
Test: unit: after `set_cadence_secs(45)` the report shows 45; live: a fresh install shows the embedder
row.

**CD-38 (S3, crdb). History has keys only; no diff; 7-day horizon; calibration invisible.**
Evidence: `WireSettingsVersion` (`crucible/crates/cdb-wire/src/query.rs:2602-2618`) carries changed
keys, no values; `WireSettingsQuery` (:2340-2349) has no as-of; config history lives in the MVCC data
keyspace reclaimed by the time-travel window (`config_store.rs:10-12, 181-222`); `render_weight_set`
(`config_document.rs:2381-2437`) omits `calibration` (:936), so a same-version re-fit changes no key.
Fix: render calibration (or its digest); an as-of read or a `SETTINGS_DIFF` verb; keep config versions
out of the GC or state the horizon on the wire. FC Changes renders old and new values.
Test: crdb: a calibration change produces a changed key; diff returns the prior value; FC e2e shows
old to new.

**CD-29 (S3, crdb, D3). Turning `query_surface.enabled` off locks the Console out.**
Evidence: the registry marks it Live and Console-editable (`crucible/crates/cdb-admin/src/
config_registry.rs:508-519`); delegated reads refuse when it is off (`handler.rs:2442` and 14
`db_query_enabled` checks); no guard in `apply_setting_edit`, no special confirm in the SPA; only the
guide warns.
Fix (by D3): decouple the Console's delegated reads from the external exposure switch, or have the
Console refuse (or specially confirm) the edit.
Test: crdb capstone with the switch off, per the ruling; RTL: the edit shows the lockout warning.

### RM.6 Identity providers

**CD-57 (S2, crdb). A UI-onboarded connector syncs into the nil tenant.**
Evidence (code read; live readout owed): `crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:918-926`
returns a default connector (nil tenant) without `CDB_AUTH0_DOMAIN`, and `CDB_AUTH0_TENANT` is read only
inside that branch (no installer sets it); the nil check applies only when enabled at boot
(`config.rs:1812-1816`); `reconnect_config` copies the base tenant (`bootstrap.rs:5967-5985`) and
`apply_pending_auth0_connectivity` (:5996-6040) never checks it; the connector passes it to the sinks.
Fix: refuse onboarding as Conflict when the tenant is nil (fail closed); mkconfig always writes the
node's operator tenant, and the installer sets it; FC maps the refusal to plain copy.
Test: unit: default section plus pending connectivity returns Conflict (then, after the real fix,
spawns under the configured tenant); mkconfig writes a non-nil tenant. Live: onboard on a node installed
without a domain; synced users appear on All Users.

**CD-15 (S2, crdb+FC). IdAM configure, connect and sync are memory-only, unaudited and untiered.**
Evidence: `crucible/crates/cdb-server/src/handler.rs:2632-2657` (sync), 2667-2690 (configure), 2725-2755
(connect): only `provision_admission`, no `settings_tier`, no audit, `commit_version: 0`, all change the
one node-wide in-memory state with no tenant check; the committed `idam_connector` section
(`cdb-admin/src/config_document.rs:445`) has no reader (pinned by `tests/config_surface_drift.rs:
371-376`). FC: the Configure form seeds only the domain (`IdamConnectorsPanel.tsx:98-103`) and always
sends `enabled: true` (`useIdam.ts:141-147`).
Fix: crdb: persist configure and connect into the committed section through `commit_governed`, boot
reads it, audit it, require the Admin tier and scope it to its tenant. FC: pre-fill the form from the
connector read; the secret optional on edit; send the current enabled state.
Test: crdb live: configure, restart, the cadences persist; a non-Admin is denied; audit-chain unit. RTL:
the Configure form pre-fills.

**CD-58 (S4, FC). The Onboard Auth0 empty state is unreachable.**
Evidence: the engine always returns one record (`crucible/crates/cdb-server/src/bootstrap.rs:1141-1162,
6046-6050`; `handler.rs:2602-2621`, whose comment at :2591-2593 says an empty list); FC renders
Onboard Auth0 only when the list is empty (`IdamConnectorsPanel.tsx:277-290`). Seen live on the box: a
card reading "Disabled, No tenant configured" with Sync Now.
Fix: treat an empty-domain, disabled record as not configured and render the empty state with Onboard
Auth0; correct the engine comment.
Test: RTL: that record shows Onboard Auth0 and no Sync Now.

### RM.7 SOC, Logs and the entity drawer

**CD-30 (S3, FC). Missing confirm steps.**
Evidence: Generate (`forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:356-364`) mutates on
click; Modify plan's Save (`SocPlanEditor.tsx:73, 146`, `SocVerdictPanel.tsx:459-469`) likewise; Logs
Export (`LogsSurface.tsx:196-206`) exports on click; Save connector (`IdamConnectorsPanel.tsx:125-139`)
has no confirm (the panel's only one is for Sync, :355).
Fix: a `ConfirmDialog` on each naming its effect (plan revision N+1; an audited cognition run; an
audited export of up to N rows; replacing the stored secret and restarting the connector).
Test: RTL per control: the click opens the dialog, nothing is sent until Confirm, Cancel sends nothing.

**CD-32 (S3, FC). The verdict panels do not refresh after Generate.**
Evidence: `RUN_POLL_INTERVAL_MS` (`apps/console/src/surfaces/useCognitionRun.ts:46`) has no other
reference; `useSocNarrative` and `useSocImpact` (`useSoc.ts:116-122, 199-205`) set no refetch interval;
`onSuccess` (:73-76) invalidates once, and its comment describes polling that does not exist.
Fix: a `refetchInterval` returning the poll interval while a run is in flight (as `useIdam.ts:39`),
stopping when the narrative lands or after a bound.
Test: RTL with fake timers: the run starts, the second narrative read is published, and it renders
after 5 s with no manual refetch.

**CD-62 (S3, FC). The Logs time range has no end bound, and `since` goes stale.**
Evidence: `apps/console/src/surfaces/LogsSurface.tsx:30-36` presets map to a lower bound only; :86 sets
`since: Date.now() - window` and never `until`; the memo (:89) freezes `since` while the page is open.
The plumbing exists (`packages/contracts/src/logs.ts:107` `until`; `apps/bff/src/engine/logs.ts:90`).
Fix: a custom absolute range setting both bounds; recompute relative presets per refetch; show the
resolved window in the summary line.
Test: unit: a custom range sends both bounds (the BFF receives `until` in seconds); with fake timers,
the 24h preset's `since` moves.

**CD-14 (S2, FC, partly fixed). Export sends the page limit, not the filtered set.**
Fixed by GD.1: the binding is an audited command (`packages/bindings/src/manifest.ts:204-210`, route
`apps/bff/src/routes.ts:46`). Still open: the export sends the page filter with `limit: LOG_PAGE_LIMIT`
(100) (`LogsSurface.tsx:79-88, 201`; `useLogs.ts:18`); the BFF clamps at 500 (`server.ts:334-338,
426-427`); the engine applies it (`crucible/crates/cdb-server/src/handler.rs:7411`). TRD-CONSOLE-09 :81 and :109 still
describe the whole filtered set.
Fix: an export-specific limit (omit it and let the engine cap at its per-tenant limit, or page with
`offset` and say "truncated at N"); align the TRD.
Test: contract on `parseLogExportRequest`; unit: the export body does not carry the page limit; live:
more than 100 matching rows export.

**CD-61 (S3, crdb). LOG_EXPORT and LOG_QUERY read different pools in episode mode.**
Evidence: `crucible/crates/cdb-server/src/handler.rs:7260-7270` (`log_query`) reads episodes from the
live overlay; `log_export` (:7412-7420) calls `log_pool` (:7318-7338), which scans legacy decisions and
adds stored episodes; its comment (:7412-7414) says otherwise; export ignores `offset`.
Fix: branch export on episode mode exactly as the query does, through one shared helper.
Test: unit on `episode_mode_node` (:15041): export ids equal query ids for the same filter; no legacy
decision id.

**CD-63 (S2, FC+crdb). The drawer's Recent decisions is always empty.**
Evidence: `forgecentral/apps/bff/src/engine/entity-detail.ts:298-301` sends `entity_type: ref.kind`
(`principal` or `vtz`); the engine accepts only host, user, ip, process, hash, mac, interface
(`crucible/crates/cdb-server/src/handler.rs:7092-7103`) and returns an empty list otherwise (:7134-7138); the BFF shows it
as empty (:392-396), which reads as "none".
Fix: crdb first: resolve a principal id to its indexed subject in ENTITY_DECISIONS (preferred) or
expose the mapping on LIST_PRINCIPALS; FC then sends an accepted kind. Until then, render not-applicable,
not empty.
Test: contract: a principal ref sends an accepted kind; crdb: a user-indexed decision resolves from the
principal id; live: a user with decisions shows rows.

**CD-59 (S3, FC; needs a crdb field). The enforcement pill, badge and copy are constants.**
Evidence: `apps/console/src/surfaces/SocOpsSurface.tsx:99` (badge `Enforcement off`), :174 (pill);
`SocVerdictPanel.tsx:387-392` ("Enforcement is off on this deployment" whenever nothing executed); the
only engine signal is `enforcement_active` on action effects (`wire-dto.ts:199, 1385`), no read.
Fix: crdb: `enforcement_active` on a read (the SOC KPIs reply). FC: drive the pill, badge and copy from
it.
Test: unit: both values render different pill and copy; crdb: the KPIs reply carries the posture.

**CD-25 (S2, crdb). CONTAIN: every failure is Denied; replays return the original; no release.**
Evidence: `crucible/crates/cdb-server/src/handler.rs:2349-2351` maps every error to Denied;
`containment_store.rs:254-259` returns the original on a matching command id without comparing the
payload, and `contain` (`handler.rs:2361-2372`) then echoes the new request's action and subject as
recorded; no release verb (Permit and Monitor refused as `NotARestriction`); `IncidentAct::Contained`
appears only in tests.
Fix: map validation errors to Framing; compare the payload digest on replay (Conflict on mismatch); build
the reply from the stored record; an audited `CONTAIN_RELEASE`; an optional incident id writing
`Contained` to the trail.
Test: unit: same id, different action is Conflict; malformed is Framing; release clears the pointer; the
incident trail gains the act.

**CD-34 (S3, FC, partly fixed, D5). Isolate on every drawer; posture fixed.**
Fixed by GD.10 (`8d7a2b2`): the result and failure copy (`apps/console/src/entity/useIsolate.ts:27-49`).
Still open: `apps/console/src/shell/DrawerHost.tsx:177` offers Isolate for every entity kind; :198 always
sends `quarantine` with fixed confirm copy (:193); the BFF accepts principal, vtz and object
(`server.ts:231`).
Fix (by D5): gate Isolate on containable kinds (or disable it with a reason, per GD.13), narrow the BFF
route, offer the posture choice or drop `deny`, name the posture in the confirm.
Test: RTL: an object drawer has no Isolate; contract: isolating an object is 404 or 405.

**CD-20 (S2, crdb). DETECT_SUMMARY aggregates every tenant.**
Evidence: `crucible/crates/cdb-server/src/handler.rs:5873-5881` discards the session and calls
`node.detection_summary()`, computed over every ingest tenant (`bootstrap.rs:6152-6178`); posture
counters and coverage (`handler.rs:5919`) are node-global.
Fix: pass the session tenant into the summary and coverage; per-tenant counters, or label them
node-wide on the wire.
Test: two tenants' fires; tenant A's summary excludes tenant B's techniques.

**CD-19 (S2, crdb). The Overview zone grouping is a hard-coded demo.**
Evidence: `crucible/crates/cdb-cyber/src/connectivity.rs:664-701` (`VtzAssignment::demo()`: three
`Demo.*` zones, `claude`/`codex`/`demo-agent` substring rules, default `demo-users-public`), used at
`connectivity_live.rs:171` and `handler.rs:7780`; authored zones are added as flowless rings (:7789-7796).
Fix: derive the assignment from the authored zone store and membership selectors per tenant; retire
`demo()` outside tests.
Test: unit: an authored zone with a membership selector receives a matching entity's flows; live: an
authored zone shows flows and a risk band.

**CD-48 (S3, crdb). Four object kinds never resolve members.**
Evidence: `crucible/crates/cdb-cyber/src/object_resolve.rs:42-62` maps Application, Certificate, Script,
Data Store (and Group, Kernel) to no source, and :151-153 returns an empty list; a named deferral.
Fix: a Data Store resolver over observed read and write edges (the source exists, `leg_crosslink.rs:63`,
`derivation_inputs.rs:366`); the other three need a source first; meanwhile an "unresolvable kind" flag
on the wire so the Console says so instead of an empty list.
Test: unit: a Data Store selector matching a written file resolves its host; RTL: an unresolvable kind
shows the note.

### RM.8 Console shell and copy

**CD-45 (S3, FC). Operator copy exposes internal names and plan ids.**
Evidence: `forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx` passes owner strings rendered
verbatim by `Pending` (:62-64): :253 (TRD-04 ... crdb IP-CONSOLE-SETTINGS-WIRE SET.6c), :310 (SET.6d),
:347 (TRD-07 ... SET.6a); "the Console sidecar" at :127, :141; `SettingsIdentityTabs.tsx:91` (crdb
SET.1b); `DistributionPanel.tsx:119` (crypto sidecar); the drawer (CD-50). Noted again at the end of
GD.13.
Fix: Forge-level operator copy; internal ids stay in code comments.
Test: a contract test renders every surface and the drawer's pending states and asserts no visible text
matches the internal-name pattern (repo names, sidecar, TRD numbers, plan ids).

**CD-50 (S4, FC). Pending drawer sections show internal plan ids.**
Evidence: `apps/bff/src/engine/entity-detail.ts:228-232` (`TRD-CONSOLE-05 ...`), :407-412 (`... not
queryable in crdb`); `packages/design/src/components/EntityDrawer.tsx:125` renders
`Not yet available ({gatingTask})`.
Fix: keep `gatingTask` diagnostic only; render operator copy (or a separate plain `reason` on the
pending variant, `packages/contracts/src/entity.ts:45`).
Test: unit: a pending section renders no TRD id or repo name.

**CD-36 (S3, FC). Retry after a failed commit clears the message instead of resending.**
Evidence: `onRetry={() => commit.reset()}` at `SettingsSurface.tsx:310, 497` and
`SettingsSectionForms.tsx:541`; `SettingsChangesTab.tsx:120` (`approve.reset()`), :206
(`rollback.reset()`); the button reads Retry (`states/States.tsx:69-71`).
Fix: resend with the same variables behind the confirm, or label the button Dismiss.
Test: RTL: a first POST 503, Retry sends the same body again (or the button reads Dismiss and sends
nothing).

**CD-35 (S3, FC, D2). No tenant selector; `/auth/me` lacks role and tenant; memory-only sessions.**
Evidence: the BFF reads `x-active-tenant` (`apps/bff/src/server.ts:184-190`) and no SPA file sends it;
`auth/router.ts:61-67, 213-220` return subject, tier and email only; sessions are an in-memory map
(`auth/session.ts:49-51`, 1 h TTL at `config.ts:74`).
Fix: roles and tenant (and the switchable tenants) on the operator DTO; a shell tenant switcher for
global admins through one shared fetch wrapper; sessions per D2.
Test: contract: `/auth/me` carries roles and tenant; e2e: a switched tenant rides every request.

### RM.9 Installers and lifecycle

**CD-26 (S2, FC). Installer [4b] pins a peer the control plane does not read, and restarts cdb.**
Evidence: `forgecentral/deploy/install.sh:138-169` runs `cdb-mkconfig --add-wire-peer` into `node.cbor`
and restarts cdb on change (:161-163); the :7879 plane admits only `control_plane.peers`
(`crucible/crates/cdb-server/src/transport.rs:307-311`); no `cdb-mkconfig` version check (:152).
Fix: remove [4b] or retarget it to `control_plane.peers`; gate on a version probe; restart only for a
control-plane change.
Test: installer test: a re-run on a pinned node changes nothing and does not restart cdb; live: the cdb
PID is unchanged after a Console reinstall (it was on 2026-09-25: "already carries this wire peer").

**CD-27 (S2, FC). Installer re-run rewrites RBAC, OIDC, ports and the sidecar config.**
Evidence: `deploy/install.sh:183-188` rewrites `FC_RBAC_CONFIG` (empty `groupRoles`, one
`localRbac` subject); :193-205 the OIDC trio; :215-218 the ports; `sidecar/deploy/provision-sidecar.sh:
160` rewrites the sidecar config; only `SESSION_PORT` is passed to the sidecar (:116) while
`CONSOLE_SIGNER_PORT` and `CONSOLE_IDAM_SECRET_PORT` change only the BFF side (:216-217); the secret
path is hard-coded (`apps/bff/src/server.ts:1930`).
Fix: merge rather than rewrite (preserve grants, upsert the operator); `CONSOLE_GROUP_ROLES`; write OIDC
only when unset or overridden; pass sign and secret ports and path to both sides; the BFF reads
`FC_IDAM_SECRET_PATH`.
Test: installer test: a seeded group grant survives a re-run; a port override lands in both files.

**CD-40 (S3, FC). The sidecar admin cert has no renewal; uninstall deletes the signing seed.**
Evidence: `forgecentral/sidecar/deploy/provision-sidecar.sh:80` mints a 365-day self-signed cert,
re-minted only when missing or forced (:58); the seed lives in `/etc/console-sidecar` (:20), which
`deploy/uninstall.sh:38-47, 65` removes.
Fix: keep the seed on uninstall by default (a flag to remove it); renew the admin cert near expiry and
warn in validate; refresh the engine leaf copy when its fingerprint changes.
Test: uninstall then install keeps the same anchor; validate fails under 30 days to expiry.

**CD-28 (S2, crdb). SIEM write-back needs a hand-authored boot `secret_ref`.**
Evidence: `crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:852` hard-codes an empty SIEM section; no
`CDB_SIEM_*` env var; no installer knob; the worker starts only when configured (`bootstrap.rs:857-886`).
Fix: `CDB_SIEM_SECRET_REF`, port and timeout in `cdb-mkconfig`; an installer knob writing the credential
file (0640, owner cdb); Configuration Guide entries.
Test: mkconfig unit: the env produces a configured section; live: the worker starts.

**CD-39 (S3, torch, D6). Endpoint installer hazards.**
Evidence (`torch/deploy/torch-install/installer/`): lanes commented opt-in (`install.sh:19`,
`phases/35-tetragon.sh:2, 10, 127-143`, `lib/common.sh:53`) default on (`lib/common.sh:58, 81-83`);
discovery seeded enabled (`phases/50-systemd.sh:137`) while logging DISABLED (:147); the arm64 patched
checksum is empty (`vendor/tetragon/MANIFEST:59`) while patched defaults on, so `35-tetragon.sh:46`
dies; no certificate renewal (the `Renewer` seam in `crates/torch-core/src/identity.rs:431` is unused;
`30-enroll.sh` does not restart torchd); govern-attest exits 0 unattested (`55-govern-attest.sh:44-47`,
the EK cert persisted only from `TORCH_EK_CERT_SRC`, `30-enroll.sh:33-36`); `torch-agent@` has no
`User=` (`50-systemd.sh:259-276`).
Fix: correct the comments; make the discovery seed and log agree (D6); patched off on arm64 or build it;
a renewal timer (re-enroll then restart torchd) or `Renewer` with hot reload; persist the NV-read EK
cert and fail loudly when attestation was expected; `User=` on the agent unit.
Test: installer tests (seed and log agree; arm64 defaults run); live: the leaf renews before expiry
without a manual step (today it is re-enrolled by hand each day); unit: the agent unit has `User=`.

### RM.10 Documentation

**CD-42 (S4, FC). Console docs drift.**
Evidence: `forgecentral/deploy/README.md:52-67` documents the retired `CONSOLE_ENROLL_ENV` flow and
never mentions `CONSOLE_PEER_TENANT` (required, `deploy/install.sh:147`); `:7878` in ten plan and
ledger docs; `apps/bff/deploy/config.example.env:34-35` comment defaults (5000, 15000) differ from the
code (2000, 5000; `apps/bff/src/config.ts:49, 53`); `config.ts:65` says a 60 s lease;
`auth/tier.ts:16-17` promises a config override that does not exist; `apps/bff/src/openapi.ts`
documents the base and Settings paths only.
Fix: rewrite the README's running section; correct the example defaults and the comments; extend the
OpenAPI document to every route family with the existing drift test.
Test: contract: each commented default in `config.example.env` equals the zod default; the OpenAPI and
router agreement test covers every `/api/*` route.

**CD-43 (S4, crdb). The engine Configuration Guide is count-gated only.**
Evidence: `crucible/docs/reference/configuration/CrucibleDB_Configuration_Guide.html:1043-1047` exports three env vars the
code never reads; :340 gives `CDB_MEMTABLE_BUDGET=4194304` against the code's 67108864
(`cdb-mkconfig.rs:1125`); the validation table (from :1381) has 14 rows against 40 `ConfigViolation`
variants (`config_document.rs:1860`); the PDF dates from 2026-07-09 (`4713b8d4`);
`crates/cdb-admin/tests/config_guide_drift.rs:34-58` checks labels and two counts only.
Fix: remove the three vars; correct the default; generate (or check value by value) the validation and
knob tables; regenerate or drop the PDF.
Test: drift test: every `CDB_*` in the guide is read under `crates/`; knob defaults equal `default_for`;
validation rows equal the variant count.

**CD-44 (S4, FC, partly fixed). Ledger drift.**
Fixed by GD.4 to GD.10 and `8e1917b`: every surface TRD in scope was rewritten to the built surface.
Still open: `docs/implementation-plans/IP-CONSOLE-03-soc-ops-LEDGER.md` :45 (Raw Telemetry and Audit
Trail still "explicit not-availables"), :68 (contradicts the state lines), :97 (half-updated count),
:114 (S3.14 NOT BUILT, undecided); `IP-CONSOLE-11-settings-LEDGER.md` :34 (Federation "no edit"
though it has Onboard, Configure and Sync), :38-39 (the ST.5 header note superseded by ST.5b).
Fix: correct those lines; decide S3.14 (build or drop).
Test: docs review; optionally a gate grep for the known-stale phrases.

## 6. Closing

The plan is complete when every row in Section 4 is FIXED (census row and ledger row carrying the
merge hash) or explicitly re-decided by the operator (recorded in Section 2 and the ledger). Each fix
PR runs the full gate of its repo before push and is reviewed and merged by the operator, one at a time.
