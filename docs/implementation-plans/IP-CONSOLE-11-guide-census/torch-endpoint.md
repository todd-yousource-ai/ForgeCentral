# Torch endpoint census -- every Console configuration as it lands on the endpoint, plus Torch's own configuration

Slice: Torch (the endpoint side). Part of the ForgeCentral in-app manual configuration census; other
censuses cover the Console and the engine.

- Code read (read-only): torch `d8f03ca`, crucible `d0ace55a`, forgecentral `d3ea588`. Torch builds against
  crucible rev `b5e301ff` for cdb-types / cdb-wire / cdb-artifact (torch/Cargo.lock:197-199, 461-463,
  471-473); the Forge bundle types are unchanged between that rev and crucible HEAD
  (`git log b5e301ff..HEAD -- crates/cdb-types/src/forge.rs` is empty).
- Every claim cites `repo/path:line` relative to /home/todd/dev. Inside sections 1-2 a bare `torchd.rs:N`
  means torch/crates/torch-edge/src/bin/torchd.rs, `policy.rs:N` means torch/crates/torch-edge/src/policy.rs,
  `apply.rs` / `realize.rs` / `audit.rs` / `verify.rs` mean torch/crates/torch-forge/src/..., `edge.rs` means
  torch/crates/torch-edge/src/edge.rs. Sections 3, 5, 6 and 7 carry their own short-cite conventions,
  stated at their tops.
- "UNVERIFIED:" marks anything the code could not establish; "code-derived" means followed through the
  code but not run. Nothing was built, run, or tested; no live file under /etc was read; no service was
  touched. TRDs were not trusted; comments were checked against code and contradictions are listed.
- Inside sections 3, 5, 6 and 7, a reference like "section N" or "(Section N)" means that part's own
  subsection (for example "section 3" inside section 5 means 5.3).

## Index

- 0. Bottom line for the manual
  - 0.1 What the manual must say (10 load-bearing findings)
  - 0.2 Console manual section id -> what happens on the endpoint
- 1. torchd -- the daemon, its lanes, and every configuration knob
  - 1.1 How torchd starts; 1.2 the lanes; 1.3 every environment variable; 1.4 the JSON config files
- 2. The Forge policy lane on the endpoint
  - 2.1 enablement + anchor; 2.2 cadence + transport; 2.3 verify + apply; 2.4 convergence states;
    2.5 FINDING lease unit mismatch; 2.6 FINDING host effect of an apply
- 3. torch-forge, torch-vtz, torch-enforce (bundle format, verification, apply, realized vs deferred
  dimensions, what a VTZ is on Linux, torch-enforce)
- 4. Enforcement: where it is OFF, what the code does anyway, what would engage it
- 5. Console actions that reach (or do not reach) the endpoint, and everything Torch ships back
- 6. The other binaries and shared config: torch-placed, torch-enroll, torch-shim, torch-trustflow,
  torch-scenario, torch-wrap / torch-broker, torch-core
- 7. The endpoint installer (phases, knobs, artifacts, enrollment, govern-attest, validate checks)
- 8. Consolidated UNVERIFIED items and open questions
- 9. Counts


## 0. Bottom line for the manual

### 0.1 What the manual must say (the load-bearing findings)

1. On a stock install NO Console configuration reaches the endpoint. The single engine-to-torchd path that
   changes endpoint state is the `BUNDLE_FETCH` reply of the policy lane (5.2), and that lane exists only
   when `TORCH_POLICY_ANCHOR` + `TORCH_POLICY_ENDPOINT_CN` are set (torch/crates/torch-edge/src/bin/torchd.rs:199-219).
   The torch installer never writes them (torch/deploy/torch-install/installer/phases/40-config.sh:12-46;
   7.3.3) and the Console's sidecar README tells the operator to hand-deliver `distribution-anchor.json`
   (forgecentral/sidecar/deploy/README.md:89-100). A host without the lane simply never reports, so the
   Console's convergence view shows it as `silent`.
2. Even with the lane provisioned, every Console-distributed bundle is refused on the endpoint as
   `StaleLease` (code-derived, UNVERIFIED live): the Console stamps the lease in unix milliseconds
   (forgecentral/apps/bff/src/engine/distribute.ts:27-34, 95) while torchd compares it against unix
   nanoseconds (torchd.rs:335-342, 1042-1048, 1723-1725; torch/crates/torch-forge/src/apply.rs:192-195).
   Convergence would read `rejected (StaleLease)`, re-sent every fetch cadence (2.4, 2.5).
3. If a bundle did get past the lease check, applying it is NOT inert, contrary to the in-code comments
   (torchd.rs:1004-1005; torch/crates/torch-edge/src/policy.rs:12-13): the apply shells out to `nft -f -`
   (or `iptables-restore`) in torchd's own network namespace, which on the stock unit is the host's, with
   ambient CAP_NET_ADMIN (torch/crates/torch-forge/src/realize.rs:325-341; torch/crates/torch-vtz/src/egress.rs:124-184, 374-400;
   torch/deploy/torch-install/installer/phases/50-systemd.sh:63-64). For any zone whose `ordinary-network`
   posture is not `permit-deny-risky` that is a host-wide drop of new non-loopback egress; nothing ever
   removes the table (2.6, 3.3).
4. Of 30 authored policy dimensions, 5 are realized on the endpoint (4 admission checks + the conditional
   egress attach), 16 are carried and signature-bound but never read, 9 never reach the endpoint
   (schedule, geo, tags, active window, group membership, object catalog, VTZ record fields, most domain
   postures, floor/quarantine) (3.10). The authored `rules` (objects, actions, protocols, ports, logging)
   are verified but never parsed; `UnknownRuleKind` and `AppendFailed` are never produced (2.3, 3.5).
5. Enforcement is OFF and there is no switch: "AG.7" is a comment label, not code; no env var, constant or
   Cargo feature enables enforcement; the BPF-LSM attach always errors; torchd builds no ambient tier;
   nothing consults the applied policy to decide an action (section 4; 3.14-3.15).
6. Isolate/containment, reassign zone, VTZ membership, remediation, SOC plan approve/modify, cognition runs,
   capture/DLP policy and grants have no endpoint path: the engine records them (CONTAIN and plan approval
   return `enforcement_active: false`) or the Console binding is `pending` (5.3).
7. The applied policy lives only in torchd memory: a restart forgets it, re-fetches, re-realizes, and resets
   the downgrade guard; the realized-tier evidence never reaches the Console (2.3; 3.6; 5.7).
8. What the Console can see from an endpoint: enrollment record, Construction Reports, LUG identity
   inventory + events, box-flow connectivity, security/govern telemetry (after engine decode), and bundle
   convergence. What it cannot: lane state, health, queue depth, discovery detections, placement outcome,
   the local apply audit, certificate expiry (journal only); AIOps host metrics are shipped every 30 s but
   no Console surface reads them (5.5-5.7).
9. Installer defaults are ON for the sensor, file/dns/module lanes, agent governance, the transcript tap,
   discovery (seeded policy `"enabled": true` while the log line says "DISABLED") and identity inventory;
   several comments still say "opt-in" (7.8). There is no certificate renewal and torchd must be restarted
   by hand after a re-enroll (7.4, 6.C.4).
10. Operational hazards found in passing: a torchd worker that fails terminally (for example the security drainer
    after a terminal engine refusal) stays stopped until the service is restarted (1.1 item 7); `TORCH_POLICY_FETCH_SECS=0` is accepted (1.3); torch-placed has no peer-credential check
    and no timeouts (6.B.3, 6.B.7); the torch-agent@ launcher runs agents as root (7.8 F8); the Tetragon
    tp.d prune deletes non-torch policies (7.8 F6); an arm64 default install fails (7.8 F3).

### 0.2 Console manual section -> what happens on the endpoint

"No endpoint effect" means: no torch code receives it (5.2 shows torchd's complete inbound surface).

| Console section id(s) | Endpoint effect | Torch data behind the Console view | Where |
|---|---|---|---|
| policies.distribute | The ONLY one. Pull-only: torchd fetches the newest in-scope bundle every `TORCH_POLICY_FETCH_SECS` (300 s), verifies, applies, reports. Needs hand-provisioned anchor + CN; refused `StaleLease` today; if applied, host-netns nft attach | BUNDLE_REPORT | 2; 3.3; 5.3 row 5 |
| policies.convergence | none (read) | per endpoint `applied` / `rejected`+reason / `silent` from BUNDLE_REPORT | 2.4; 5.3 row 7 |
| policies.enforcement | none; binding pending | nothing (torch ships no enforcement status) | 5.3 row 6 |
| policies.byZone/detail/create/edit/publish/delete | none directly; published policies become bundle `rules` at the next distribute, which torch verifies but never reads | none | 3.10 rows 15-21 |
| vtz.create/edit/rescope/delete, vtz.tree/detail/memberCounts/policyCount | none directly; the endpoint sees only `scope.vtz` (a string) and the member CN list inside a distributed bundle | none | 3.10 rows 5-7, 29 |
| vtz.setMembership | none; binding pending (no engine verb) | none | 5.3 row 3 |
| vtz.riskBand, overview.graph | none (read) | box-flow export (conntrack -> NetFlow v5, `cdb.source=torch-flow`) | 1.2; 5.5 row 3; 5.6 |
| overview.live | none; binding pending (needs a push stream torch does not have) | none | 5.6 |
| overview.entityConnections | none (read) | UNVERIFIED which stream feeds it (not traced in this slice) | -- |
| entity.header, entity.info | none (read) | the AIG Agent record created at enrollment by torch-enroll (`LIST_AGENTS`) | 5.5 row 12; 5.6 |
| entity.capabilities | none (read) | Construction Reports (`INGEST_CONSTRUCTION_REPORT`) from the govern/discovery lanes; subject reports need the govern-attest grant | 5.5 rows 7-8; 7.5 |
| entity.zones, entity.effectivePolicies | none; bindings pending | none (torch ships no zone/policy posture) | 5.6 |
| entity.recentDecisions, logs.query/explain/tail/export, soc.incidents, soc.incident.detail, soc.telemetry.raw, soc.impact | none (read) | security lane (`cdb.source=tetragon`), govern lane (`cdb.source=torch-obs`), LUG events -- per-relation mapping is the engine census's | 5.5 rows 2, 4-6, 10 |
| entity.isolate | none: the engine records a Quarantine/Deny disposition with `enforcement_active: false` | none | 5.3 row 1 |
| entity.reassignZone, entity.remediation | none; bindings pending | none | 5.3 rows 2, 4 |
| entity.fullReport | not traced in this slice | -- | -- |
| soc.plan.propose/approve/modify, soc.cognition.run, soc.case.*, soc.notes, soc.narrative, soc.audit.trail, soc.disposition | none: no torch receiver; engine-side only (plan approval returns `enforcement_active: false`; "an approved containment step is recorded `refused`") | none | 5.3 rows 12-13 |
| users.list, users.detail, groups.list, groups.detail | none (read) | LUG snapshot (accounts, groups, privileges, sessions) + LUG events (sshd/pam), when `TORCH_IDENTITY_INVENTORY=1` (installer default) | 1.2; 5.5 rows 9-10 |
| users.create/edit/setStatus, groups.create/edit/setMembers, idam.connectors/configure/connect/sync | none (torch ships host accounts; it never creates or changes them) | none | 5.3 row 15 |
| objects.* | none; objects reach the endpoint only as selector strings inside bundle `rules`, never read | none | 3.10 rows 16, 28 |
| Settings: `lug_exposure` and decoder settings | none on the endpoint; they change what the engine ACCEPTS. `snapshot_cadence_hours` is documented as honored by the torch collector but torch never reads it (the endpoint cadence is `TORCH_IDENTITY_CADENCE_HOURS`) | none | 5.3 row 14 |

## 1. torchd -- the daemon, its lanes, and every configuration knob

Scope: torch/crates/torch-edge/src/bin/torchd.rs and the torch-edge modules it calls. Line numbers are
at torch HEAD d8f03ca. All paths are relative to /home/todd/dev.

### 1.1 How torchd starts (fail-closed order)

1. Installs the stderr failure-event sink before anything else can fail
   (torch/crates/torch-edge/src/bin/torchd.rs:1782). Every `torch_types::obs::failure(...)` label quoted
   below lands in torchd's stderr, i.e. the systemd journal.
2. Parses the seam target (`seam_target`, torchd.rs:263-297): `CDB_ADDR` is required; the identity mode's
   files must be readable. Any error -> "torchd: configuration error" and exit FAILURE (torchd.rs:1784-1797).
3. Parses the edge knobs (`edge_knobs`, torchd.rs:150-229), then the governance config (`govern_config`,
   torchd.rs:1131-1165), then the discovery config (`discover_config`, torchd.rs:1174-1188), then the
   transcript-tap flag (torchd.rs:1192-1195). An enabled-but-incomplete lane config refuses startup
   (torchd.rs:1798-1815).
4. Resolves the identity ONCE before the runtime starts (`resolve_credential`, torchd.rs:304-333): in `tpm`
   mode it opens the TPM keystore, re-derives the device key and checks it against the enrolled certificate;
   a mismatch ("was the TPM cleared, or is CDB_CLIENT_CERT a foreign certificate?") refuses startup
   (torchd.rs:323-325).
5. Opens the non-lossy queue at `TORCH_SPILL_DIR` UNCONDITIONALLY (even when the security lane is off); a
   failure refuses startup (torchd.rs:803-809).
6. Opens one enrolled seam connection per OTLP lane AT STARTUP -- security sink (torchd.rs:870), AIOps
   (torchd.rs:886), box-flow (torchd.rs:900), govern (torchd.rs:913) -- each with `?`, so an engine that is
   unreachable at startup makes `run` return an error and torchd exit FAILURE (torchd.rs:1839-1852).
   Seam deadlines: connect 5 s, handshake 5 s, round trip 30 s (torch/crates/torch-core/src/seam.rs:178-190).
7. Starts every worker under `SenseSupervisor` (torchd.rs:1086) and then waits ONLY for SIGTERM/SIGINT
   (torchd.rs:1089, 1760-1773). A worker that ends `Failed` marks the aggregate health Failed
   (torch/crates/torch-sense/src/supervisor.rs:102-129, 157-176) but does NOT stop torchd; it shows up only as
   the exit status when torchd is later stopped ("exited unhealthy", torchd.rs:1840-1847). Which workers can
   end Failed: the security drainer on a TERMINAL node refusal (`drainer.permanent_failure`,
   supervisor.rs:235-241; torch/crates/torch-sense/src/queue.rs:227-231) -- a transient peer-down is retried
   forever at the 2 s backoff cap and is not terminal (queue.rs:232-240); the security lane on an enqueue
   (spill) failure (edge.rs:160-170, 181-205). The AIOps, box-flow, policy and identity lanes log and continue
   instead of failing. Operational consequence: after a terminal refusal the security drainer stays stopped,
   exports keep spilling until the queue blocks the sensor, and only a service restart resumes shipping;
   systemd's Restart=on-failure acts only on process exit.
8. On shutdown it drains the non-lossy queue for at most 15 s (`DRAIN_DEADLINE`, torchd.rs:76, 1095-1106);
   anything still queued stays spilled on disk and is delivered on the next start (torchd.rs:1100-1104).

### 1.2 The lanes torchd can run

| Lane | Enabled when | What it reads | What it ships (over the one :7878 mTLS seam) | Failure posture | Evidence |
|---|---|---|---|---|---|
| Security (Tetragon) | `TORCH_TETRAGON_GRPC` set (Linux; wins) OR `TORCH_TETRAGON_SOURCE` set | Tetragon gRPC UDS stream, or a JSON-lines file/FIFO (reopened on EOF every 2 s) | Each recognized raw Tetragon line as an OTLP Logs body, `cdb.source=tetragon`, through the non-lossy spill queue + drainer | Enqueue failure ends the lane Failed; FIFO absence is a transient wait | torchd.rs:815-883; torch/crates/torch-edge/src/edge.rs:123-215 |
| Security-lane watchdog | Whenever the security lane runs | queue intake + pending counters every 60 s | nothing; emits `security_lane.stalled` to stderr when nothing moved and a backlog sits | never fails | torchd.rs:862-869; edge.rs:296-330 |
| AIOps | ALWAYS | host metrics every `TORCH_AIOPS_INTERVAL_SECS` (default 30 s) | OTLP metrics batch | delivery error logged as `aiops.deliver_failed`, lane continues | torchd.rs:885-894; edge.rs:469-503 |
| Box-flow export | ALWAYS | `/proc/net/nf_conntrack` every `TORCH_FLOW_EXPORT_INTERVAL_SECS` (default 30 s) | NetFlow v5 datagrams as OTLP bodies, `cdb.source=torch-flow`, unattributed device flows | unreadable conntrack skips the tick | torchd.rs:896-907; edge.rs:525-570 |
| Agent governance | `TORCH_AGENT_GOVERN=1` + manifest + key + source; REQUIRES `TORCH_IDENTITY=tpm` | the govern FIFO (Tetragon stream copy), reopened every 2 s | GCI-attributed governed ObservabilityEvents, chained and anchored (ML-DSA-87 by the in-TPM key) every `TORCH_AGENT_GOVERN_ANCHOR_SECS`; plus signed Construction Reports at startup | a PEM identity refuses startup; report shipping is best-effort | torchd.rs:909-997, 1131-1165, 1231-1330 |
| Transcript tool lane | `TORCH_AGENT_GOVERN=1` AND `TORCH_AGENT_TRANSCRIPT_TAP=1` | governed agents' `~/.claude/projects/**/*.jsonl` transcripts, read through the root helper every 2 s | `mcp.tool_call` / `mcp.tool_result` / `llm.request` / `llm.response` payloads, content BY REFERENCE (SHA-512), fed into the govern lane | overflow dropped + counted | torchd.rs:926-958, 1192-1195; torch/crates/torch-edge/src/transcript_tap.rs:1-67 |
| Discovery (auto-govern) | `TORCH_AGENT_GOVERN=1` AND `TORCH_AGENT_DISCOVER=1` AND the config file's `"enabled": true` | discovery FIFO (Tetragon connect/DNS/exec), /proc poll, root-helper process enumeration + socket table, DNS resolution of endpoint marker hosts every 300 s, install dirs /usr/local/bin, /usr/bin, /opt/bin, $HOME/.local/bin | detections logged to stderr; discovered agents onboarded (signed Construction Reports shipped), GCI-registered into the govern lane, and moved by the root helper into cgroup `torch-vtz-<zone>.slice` (attribution only; no controller limits are written, torch/crates/torch-edge/src/placement.rs:330-333) | helper unreachable -> agent stays observe-only | torchd.rs:984-996, 1367-1628; torch/crates/torch-discover/src/sweep.rs:31-45 |
| Policy refresh (Forge) | `TORCH_POLICY_ANCHOR` set (then `TORCH_POLICY_ENDPOINT_CN` required) | `BUNDLE_FETCH` reply every `TORCH_POLICY_FETCH_SECS` (default 300 s) | `BUNDLE_REPORT` after each delivered bundle | tick-level failures logged, lane continues; bad anchor refuses startup | torchd.rs:999-1055; torch/crates/torch-edge/src/policy.rs (section 2 below) |
| Identity inventory | `TORCH_IDENTITY_INVENTORY=1` (requires readable /etc/machine-id) | NSS/account files; full sweep every `TORCH_IDENTITY_CADENCE_HOURS` (default 24 h) plus an early sweep (300 s hold-down) when /etc/passwd, /etc/group, /etc/sudoers, /etc/subuid or /etc/subgid changes (checked every 60 s) | `LUG_SNAPSHOT` (accounts/groups/privileges/sessions) | best-effort; next tick retries | torchd.rs:415-465, 513-594; torch/crates/torch-edge/src/lug_uplink.rs:34-41, 259-300 |
| Identity events | same switch as inventory (always paired) | new auth-log lines via the root helper (cursor starts at END of log), every 10 s, batch max 512 | `LUG_EVENT` (sshd/pam auth + session deltas) | best-effort | torchd.rs:597-735, 1066-1075 |

### 1.3 Every environment variable torchd reads

Lookups are exact-name `std::env::var` reads; torchd has no allow-list, so a misspelled key is silently
ignored (the lane it was meant to enable simply stays off). Boolean switches are ON only for the exact
string `1` -- `true`, `yes`, `on` are OFF (torchd.rs:442, 1132, 1177, 1180, 1193-1194).

| Variable | Default | Validation / bounds | Effect | Evidence |
|---|---|---|---|---|
| `CDB_ADDR` | none (REQUIRED) | must be set | engine seam address (host:port) | torchd.rs:269 |
| `CDB_SERVER_NAME` | `wire.localhost` | none | TLS server name checked on the engine certificate | torchd.rs:270 |
| `TORCH_IDENTITY` | `pem` | `pem` or `tpm` (tpm only on Linux); anything else refuses startup | identity custody: `pem` = dev custody PEM files; `tpm` = enrolled cert over the in-TPM key | torchd.rs:271-295 |
| `CDB_CA` | none | file must be readable (both modes) | CA bundle the engine certificate is verified against | torchd.rs:274, 280 |
| `CDB_CLIENT_CERT` | none | file must be readable (both modes) | the client certificate chain presented | torchd.rs:275, 281 |
| `CDB_CLIENT_KEY` | none | file must be readable (`pem` mode only; never read in `tpm` mode) | the client private key | torchd.rs:276 |
| `TORCH_TCTI` | `device:/dev/tpmrm0` | none | TPM access path (`tpm` mode) | torchd.rs:282 |
| `TORCH_SPILL_DIR` | `/var/lib/torch/spill` | queue open must succeed | durable spill directory of the non-lossy queue | torchd.rs:223-224, 803-809 |
| `TORCH_QUEUE_CAPACITY` | 1024 | positive integer (> 0) | in-flight export bound; overflow BLOCKS the sensor (never drops) | torchd.rs:83, 151-161; torch/crates/torch-sense/src/queue.rs:1-21 |
| `TORCH_AIOPS_INTERVAL_SECS` | 30 | integer > 0 | AIOps snapshot interval | torchd.rs:80, 162-172 |
| `TORCH_FLOW_EXPORT_INTERVAL_SECS` | 30 | integer > 0 | box-flow (conntrack) export interval | torchd.rs:173-183; edge.rs:530 |
| `TORCH_NODE_ROLE` | `standard` | `standard` or `inference-host`; anything else refuses startup | `standard` drops loopback network events from the security lane; `inference-host` ships them (a node serving a local model) | torchd.rs:188-197; edge.rs:53-68, 83-110 |
| `TORCH_TETRAGON_SOURCE` | unset (lane off) | path; opened lazily and reopened | security lane via file/FIFO | torchd.rs:221, 844-861 |
| `TORCH_TETRAGON_GRPC` | unset | UDS path; Linux only (ignored with a message elsewhere) | security lane via Tetragon gRPC; takes precedence over `TORCH_TETRAGON_SOURCE` | torchd.rs:222, 815-843 |
| `TORCH_POLICY_ANCHOR` | unset (policy lane off) | file must load as a non-empty JSON `{key_id: hex}` map, else startup refuses | enables the Forge policy lane; the trust root for bundle signatures | torchd.rs:199-219, 1006-1008; policy.rs:65-83 |
| `TORCH_POLICY_ENDPOINT_CN` | none | REQUIRED when the anchor is set, else startup refuses | this endpoint's bound FQDN; the applier builds `CertIdentity{cn, sans:[cn]}` from it for the scope check | torchd.rs:202-205, 1009-1012 |
| `TORCH_POLICY_FETCH_SECS` | 300 | unsigned integer; NO lower bound (0 is accepted -- every other interval knob refuses 0) | bundle fetch cadence | torchd.rs:206-212; policy.rs:35 |
| `TORCH_AGENT_GOVERN` | off | exact `1` | enables agent governance (and gates discovery + transcript tap) | torchd.rs:1132 |
| `TORCH_AGENT_GOVERN_MANIFEST` | none | REQUIRED when governing; readable JSON array (an EMPTY array is valid) | declared agents | torchd.rs:1136-1141; torch/crates/torch-edge/src/agent_govern.rs:1149-1209 |
| `TORCH_AGENT_GOVERN_KEY` | none | REQUIRED; file of exactly 32 bytes | ML-DSA-87 seed signing Construction Reports (key id `torchd-govern-report`) | torchd.rs:741, 1142-1150 |
| `TORCH_AGENT_GOVERN_SOURCE` | none | REQUIRED; path (FIFO reopened) | govern lane input stream | torchd.rs:1160 |
| `TORCH_AGENT_GOVERN_ANCHOR_SECS` | 60 | integer > 0 | batch-anchor cadence | torchd.rs:1112, 1151-1158 |
| `TORCH_AGENT_DISCOVER` | off | exact `1`, and only with `TORCH_AGENT_GOVERN=1` | enables discovery | torchd.rs:1174-1188 |
| `TORCH_AGENT_DISCOVER_CONFIG` | none | REQUIRED when discovering; JSON policy (schema in 1.4) | the discovery policy | torchd.rs:1183-1187; agent_govern.rs:253-324 |
| `TORCH_DISCOVER_SOURCE` | `/run/torch/discover.fifo` | path | discovery telemetry collector input | torchd.rs:103, 1395-1396 |
| `TORCH_AGENT_TRANSCRIPT_TAP` | off | exact `1`, and only with `TORCH_AGENT_GOVERN=1` | enables the transcript tool lane | torchd.rs:1192-1195 |
| `TORCH_PLACE_SOCKET` | `/run/torch/place/place.sock` | path | the root helper (`torch-placed`) socket used by discovery placement, transcript reads, process enumeration, and auth-log reads | torchd.rs:98, 623, 931, 1542 |
| `TORCH_IDENTITY_INVENTORY` | off in the binary (the installer writes `1`) | exact `1`; requires readable /etc/machine-id | identity inventory + identity event lanes | torchd.rs:439-465 |
| `TORCH_IDENTITY_CADENCE_HOURS` | 24 | integer > 0 (u32; no upper bound) | full identity sweep cadence | torchd.rs:445-452; lug_uplink.rs:34 |

Non-configurable constants that shape lane behavior (TUNE-tagged, code only): drain deadline 15 s
(torchd.rs:76); security/govern reopen backoff 2 s (torchd.rs:88, 94); endpoint re-resolve 300 s
(torchd.rs:109); net-obs buffer 8192 and process buffer 16384 (torchd.rs:115, 121); identity poll 60 s,
event flush 10 s, event batch 512 (torchd.rs:415, 597, 601); LUG hold-down 300 s (lug_uplink.rs:41);
security-lane liveness 60 s (edge.rs:296); exec dedup window 60 s over 4096 signatures
(torch/crates/torch-edge/src/cmdsig.rs:68, 88); transcript poll 2 s, channel 4096, 4 MiB per read
(transcript_tap.rs:60-72); discovery sweep 1..3600 s, default 30 s (agent_govern.rs:196-202); seam sink
per-send timeout 5 s (torch/crates/torch-edge/src/sink.rs:157); retry budget 4 attempts, 50 ms..2 s
backoff, 0.5 jitter (torch/crates/torch-types/src/retry.rs:15-27).

### 1.4 The two JSON files torchd reads besides the anchor

Govern manifest (`TORCH_AGENT_GOVERN_MANIFEST`): a JSON array of entries with `package_format`
(`cargo` | `npm` | `pip`, anything else refused), `package_source_root`, `package_identity` (becomes the
agent label), `package_content_hash`, `binary_path`, `host_material`, `policy_version`, `version`,
`install_path`, `zone_id` (the torch-vtz cgroup zone `torch-vtz-<zone_id>.scope` the agent is attributed
by) (agent_govern.rs:1149-1209). Unknown keys are NOT rejected (no `deny_unknown_fields` on
`ManifestEntry`, agent_govern.rs:1148-1149). An empty array is valid and is the installer default: the lane
comes up armed and governs only what discovery finds (torchd.rs:1126-1129, 1139-1141).

Discovery policy (`TORCH_AGENT_DISCOVER_CONFIG`, the installer path is /etc/torch/govern/discover.json per
the doc comment at agent_govern.rs:262-264): `enabled` (default false), `sweep_secs` (default 30, must be
1..=3600), `endpoints` (extra model-endpoint marker hosts), `signatures` (`[{label, basenames[]}]`),
`allow`, `deny` (agent_govern.rs:253-324). Unknown keys ARE rejected (`deny_unknown_fields`,
agent_govern.rs:256, 266). Every list extends the built-in seed (data, not code). `"enabled": false` in
the file keeps discovery off even with `TORCH_AGENT_DISCOVER=1` (torchd.rs:984).

## 2. The Forge policy lane on the endpoint (item 1 of the slice)

### 2.1 Enablement, anchor file, and who provisions it

- The lane exists only when `TORCH_POLICY_ANCHOR` is set; `TORCH_POLICY_ENDPOINT_CN` is then mandatory
  (torchd.rs:199-219). With it unset torchd logs "policy lane disabled (TORCH_POLICY_ANCHOR unset)"
  (torchd.rs:1054).
- Anchor format: a JSON object mapping `signing_key_id` -> hex ML-DSA-87 verifying key. Missing file, non-
  JSON, an empty map, odd-length or non-hex values all refuse startup (policy.rs:56-83, 267-275).
- Who writes it: the Console's sidecar provisioning prints it as `distribution-anchor.json`
  (forgecentral/sidecar/deploy/provision-sidecar.sh:96-126) and its README says the operator must deliver it
  to each Torch node and point `TORCH_POLICY_ANCHOR` at it; the anchor does not rotate with the daily ZTP
  leaf (forgecentral/sidecar/deploy/README.md:89-100).
- The torch installer does NOT provision it: phase 40 writes torchd.env with no `TORCH_POLICY_*` key
  (torch/deploy/torch-install/installer/phases/40-config.sh:12-46), and it rewrites torchd.env from scratch
  on every run ("edits are overwritten", 40-config.sh:15, 46), so a hand-added `TORCH_POLICY_*` line in
  torchd.env is lost on the next phase-40 run. The installer's only torchd drop-ins are govern.conf and
  discover.conf and no phase deletes files in torchd.service.d (50-systemd.sh:107-170; no `rm` of that
  directory in any phase), so a hand-written drop-in (for example policy.conf) is the re-run-safe place;
  the installer writes no such file. Net: on a stock install the policy lane is OFF and no Console
  distribution reaches the endpoint.

### 2.2 Cadence and transport

- `run_policy_lane` sleeps one full cadence BEFORE the first fetch (policy.rs:238-246), so after a torchd
  start the first bundle arrives no sooner than `TORCH_POLICY_FETCH_SECS` (default 300 s, policy.rs:35).
- Each tick opens a FRESH enrolled seam connection (policy.rs:231-237, torchd.rs:1032-1041); connect failure
  -> `policy.connect_failed`, fetch failure -> `policy.fetch_failed`, audited-chain failure ->
  `policy.apply_failed`, report failure -> `policy.report_failed` (policy.rs:184, 250-259). None ends the lane.
- Fetch = `BUNDLE_FETCH { request_id, have }` where `have` is the version the in-memory applier holds
  (policy.rs:156-162; torch/crates/torch-core/src/forge_fetch.rs:30-36). Nothing identifying travels in the
  frame: the engine scopes by the verified session peer's bound FQDN (`session.device_cn`)
  (crucible/crates/cdb-server/src/handler.rs:6829-6868).
- Engine selection rule: the engine scans ALL of the tenant's stored bundles (one live bundle per zone) and
  delivers the single highest-version bundle whose scope names the peer by CN; `UpToDate` if `have` >= it;
  `Denied` if none names the peer (crucible/crates/cdb-cyber/src/bundle_store.rs:161-209). Consequence: an
  endpoint named by bundles of two zones only ever receives the higher-version one; the other zone never
  reaches it and reads Silent for that endpoint (see 2.5).
- Reply decode: bytes -> `SignedPolicyBundle` (an undecodable payload is a protocol error, fail closed);
  no bytes -> `UpToDate` (forge_fetch.rs:48-68).

### 2.3 Verification and apply (torch-forge, driven by the lane)

The lane hands each delivery to torch-forge's audited chain (policy.rs:119-139;
torch/crates/torch-forge/src/audit.rs:189-211). `EndpointPolicyApplier::verify_and_apply`
(torch/crates/torch-forge/src/apply.rs:184-238) runs, in CODE order:

1. Signature against the anchor (ML-DSA-87 over SHA-512 of the canonical preimage) -> `SignatureInvalid`
   (apply.rs:189; torch/crates/torch-forge/src/verify.rs:65-82). The preimage includes `rules` when non-empty
   (v2 domain) (crucible/crates/cdb-artifact/src/policy_bundle.rs:100-133).
2. Freshness lease: `now >= lease.not_after` -> `StaleLease` (apply.rs:192-195).
3. Identity scope: the scope must contain exactly `CertIdentity{cn: TORCH_POLICY_ENDPOINT_CN, sans: [same]}`
   (full equality, crucible/crates/cdb-types/src/forge.rs:336-341; torchd.rs:1009-1012) -> `ScopeMismatch`
   (apply.rs:199-201). The Console builds members as `{cn, sans:[cn]}`
   (forgecentral/apps/bff/src/engine/distribute.ts:93), so the shapes agree; the engine's own gate matches
   CN only (bundle_store.rs:189-193), so a wrong `TORCH_POLICY_ENDPOINT_CN` shows up as an on-device
   `ScopeMismatch`, not as a fetch refusal.
4. Monotonic version under the write lock: lower -> `DowngradeRejected`; equal -> idempotent success; higher
   (or nothing applied yet) -> realize, then atomically swap the posture (apply.rs:203-237).
5. Realize failure (host cannot realize, or the new policy loosens the previous one on any axis) ->
   `VtzCannotRealize`, last-known-good kept (apply.rs:218-236; torch/crates/torch-forge/src/realize.rs:344-377).

Only these five `ApplyError` variants are produced on the endpoint. `UnknownRuleKind` and `AppendFailed`
exist in the wire mapping (policy.rs:205-217) but no non-test torch-forge code returns them (grep of
torch/crates/torch-forge/src for `ApplyError::` outside test modules: only apply.rs and verify.rs, variants
SignatureInvalid/StaleLease/ScopeMismatch/DowngradeRejected/VtzCannotRealize). The engine type doc that says
the endpoint refuses an unknown rule tag with `UnknownRuleKind` (crucible/crates/cdb-types/src/forge.rs:385-390)
is therefore not what the endpoint does: the carried `rules` are covered by the signature but are neither
parsed for tags, realized, nor even retained (the applied set stores version, vtz, policy, lease and
realized tiers only, apply.rs:224-230).

State: the applier's posture is IN MEMORY ONLY -- it starts `NoPolicy` on every construction (apply.rs:68-80)
and torch-forge performs no filesystem IO at all (no `std::fs`/`File` in torch/crates/torch-forge/src). So a
torchd restart forgets the applied version: `have` is None again, the engine re-delivers, and the monotonic
downgrade guard restarts from nothing. (The policy.rs:146-149 doc comment claiming a restart "re-learns it
from last-known-good" is not supported by the code.)

The on-device audit record is one `ForgeAudit::Apply` fact per delivered bundle, written to stderr by
`StderrForgeAudit` (torchd.rs:1629-1641; audit.rs:178-211). `UpToDate` writes nothing.

### 2.4 Convergence reporting and its states

- After a delivered bundle (applied OR rejected) the lane sends `BUNDLE_REPORT { vtz_id: bundle.scope.vtz,
  version, rejected_reason }`, `rejected_reason` = the `ApplyError` variant name or none for applied
  (policy.rs:164-189, 197-218; forge_fetch.rs:71-91). `UpToDate` reports nothing.
- The report is advisory: a failed report is not retried until the next delivered bundle (policy.rs:167-172).
  Because a REJECTED bundle does not advance `have`, the engine re-delivers it every cadence, so the endpoint
  re-verifies, re-rejects and re-reports it every cadence (code-derived from policy.rs:156 + bundle_store.rs:204).
- Engine side: the report is keyed to the verified peer (`session.device_cn`), never a payload field; an
  unknown reason name is refused (handler.rs:6874-6933). Latest report per (tenant, vtz, endpoint)
  (crucible/crates/cdb-cyber/src/apply_report_store.rs:1-17, 48-56).
- `BUNDLE_CONVERGENCE` (the Console's read) projects the zone's newest stored bundle scope against reports:
  `applied` (a report at version >= target with no rejection), `rejected` + reason (a rejection of exactly the
  target version), `silent` (anything else, including no report or only older reports); `has_bundle:false`
  when the zone has no stored bundle (apply_report_store.rs:122-229; handler.rs:6935-6983).

### 2.5 FINDING -- freshness-lease unit mismatch (code-derived, not live-tested)

- torchd's lease clock is wall-clock NANOSECONDS: the lane's `now` is `torch_core_hlc` = `Hlc(now_nanos())`
  (torchd.rs:335-342, 1042-1048, 1723-1725).
- The Console stamps the lease in MILLISECONDS: `lease: { issued_at: nowMs, not_after: nowMs + 24h in ms }`
  with `nowMs = Date.now()` ("the unix-ms Hlc convention this producer stamps")
  (forgecentral/apps/bff/src/engine/distribute.ts:27-34, 95, 150-156). The sidecar signs the draft lease
  verbatim (forgecentral/sidecar/src/signing.rs:247) and the engine stores the exact bytes
  (bundle_store.rs:1-21). `Hlc` itself is an opaque u64 with no unit (crucible/crates/cdb-types/src/primitives.rs:151-159).
- Therefore, for any Console-distributed bundle that passes the signature check, `now_ns (~1.8e18) >=
  not_after_ms (~1.8e12)` holds and the endpoint refuses it with `StaleLease` (apply.rs:192-195). The Console's
  convergence read would show `rejected (StaleLease)` for every in-scope endpoint that runs the lane.
  UNVERIFIED live: the policy lane has not been enabled on the box (see 2.1), and nothing here was run.

### 2.6 FINDING -- what an apply would do to the host if a bundle got past the lease check

torchd builds the realization as `TorchVtzRealization::new(BrokerEndpoint::new("127.0.0.1", 7878))` with no
ambient tier (torchd.rs:1013-1017). On a first or higher-version apply, `realize` runs the cooperative tier
(realize.rs:344-377), whose first step is `EgressScaffold::attach_policy` (realize.rs:325-341). That call is
not stubbed or gated: it detects `nft` (else `iptables-restore`/`iptables`) and pipes a ruleset into it
(torch/crates/torch-vtz/src/egress.rs:124-153, 170-184, 238-246). There is no namespace switch on this path,
so it runs in torchd's own network namespace; the stock torchd unit has no PrivateNetwork and carries
`AmbientCapabilities=CAP_DAC_READ_SEARCH CAP_NET_ADMIN` (torch/deploy/torch-install/installer/phases/50-systemd.sh:31-67, capabilities at :63-64),
which an `nft` child inherits. The ruleset (egress.rs:374-400) is `table inet torch_vtz`, output chain
`policy drop`, accepting loopback, established/related, and `127.0.0.1 tcp dport 7878`; the governed and
restricted sets are declared EMPTY (hostnames are never loaded into them); a final `accept` is added only
when `allow_ordinary_internet` is true. The Console sets that flag true only when the zone's effective
`ordinary-network` posture is `permit-deny-risky`, and always sends empty brokered/restricted lists,
`DenyUnwrappedExec`, `Unclassified` and an all-zero resource bound
(forgecentral/packages/contracts/src/forge.ts:126-170). So, reading the code, the first applied bundle for a
zone that does not permit ordinary network would drop every NEW outbound non-loopback connection from the
whole host (including a remote `CDB_ADDR`), and a permitting zone would install an allow-all chain.
Further code facts: attach runs BEFORE the Landlock `supported()` check (realize.rs:329-336), so a bundle
refused for missing Landlock leaves the ruleset attached; nothing in the repo ever deletes or flushes the
`torch_vtz` table (grep for delete/flush table: none); the computed cgroup limits are discarded
(`let _limits = ...`, realize.rs:337-339). This contradicts the comments that "an applied bundle realizes
nothing until enforcement is separately engaged" (torchd.rs:1004-1005; policy.rs:12-13). UNVERIFIED live:
not run; today the 2.5 lease mismatch and the unprovisioned anchor both keep this path unreachable.

## 3. torch-forge, torch-vtz, torch-enforce

Fork output for the parent census (item 1, minus the torchd policy lane itself, which the parent covers).
Read-only: nothing was built, run, or tested; no live file under /etc was read.

### Index (this part)

1. Conventions
2. Headline findings
3. Is the egress attach live on the torchd apply path? (verdict + evidence)
4. The policy bundle as the endpoint parses it (wire format, signature, key)
5. Verification chain in code order, and every refusal reason
6. Apply semantics: atomic, monotonic, fail-closed, persistence, restart
7. Audit trail (ForgeAuditor) and what the live path actually emits
8. EndpointPolicyApplier / ForgeDistributionClient contracts
9. TorchVtzRealization: what "realize" actually does
10. Authored policy dimensions on the endpoint: REALIZED / PARSED-BUT-NOT-REALIZED / ABSENT (table)
11. torch-forge v2 model modules (library-only, no production caller)
12. torch-vtz: what a VTZ becomes on Linux
13. What a "zone" actually is on an installed host today
14. torch-enforce: the ambient kernel-authorization tier
15. Enforcement status and exactly what would engage it
16. Configuration knobs in the three crates
17. Doc / README claims contradicted by code
18. UNVERIFIED items

### 3.1 Conventions

- Paths are relative to /home/todd/dev and start with the repo name (torch/, crucible/, forgecentral/).
- torch pins the shared crdb crates at rev b5e301ff (torch/crates/torch-forge/Cargo.toml:19,24;
  torch/crates/torch-enforce/Cargo.toml:20; torch/Cargo.lock:461-463). The crucible files cited here
  (cdb-types src/forge.rs, forge_v2.rs, enrollment.rs, primitives.rs; cdb-artifact src/policy_bundle.rs)
  are identical at b5e301ff, at crucible HEAD, and in the working tree (`git diff --numstat b5e301ff`
  empty); cdb-artifact src/signing.rs differs by one import line (line 23) only, so all cited line
  numbers hold at the pinned rev.
- "Production" = reachable from a shipped binary (torchd, torch-placed). Code inside
  `#[cfg(test)] mod tests` or under tests/ is "test-only".
- Test-module boundaries used below: torch-forge realize.rs tests start at line 381, compose.rs at 334;
  torch-vtz lib.rs at 248, egress.rs at 649, landlock.rs at 251, seccomp.rs at 241, resource.rs at 106;
  torch-wrap mode.rs at 124, posture.rs at 205.

### 3.2 Headline findings

1. The ONLY host-mutating torch-vtz call reachable in production is the nftables/iptables egress attach
   inside torch-forge's realize step (torch/crates/torch-forge/src/realize.rs:329-330). It runs in
   torchd's own network namespace (the host's), with the ambient CAP_NET_ADMIN the stock unit grants.
   The in-code claims that "an applied bundle realizes nothing" (torch/crates/torch-edge/src/bin/torchd.rs:1004-1005,
   torch/crates/torch-edge/src/policy.rs:12-13) are contradicted by the code. See section 3.
2. Lease clock unit mismatch: torchd compares leases against `Hlc(unix NANOSECONDS)`
   (torch/crates/torch-edge/src/bin/torchd.rs:1047, 1723-1725, 335-342), while ForgeCentral stamps
   `issued_at`/`not_after` in unix MILLISECONDS (forgecentral/apps/bff/src/engine/distribute.ts:27-34, 95).
   `now >= not_after` is therefore always true, so every ForgeCentral-produced bundle is refused
   `StaleLease` (torch/crates/torch-forge/src/apply.rs:192-195) before realize runs. `cdb_types::Hlc` is an
   opaque u64 whose unit the type does not fix (crucible/crates/cdb-types/src/primitives.rs:151-159), and the
   engine carrier does not interpret the lease (no `not_after` read in crucible/crates/cdb-cyber/src/bundle_store.rs
   or crucible/crates/cdb-server/src/handler.rs). Deterministic from code; UNVERIFIED on a live host.
3. The bundle's authored `rules` (source/destination kinds and selectors, action, protocols, ports,
   logging) are signature-bound but NEVER read by torch: `verify_and_apply` realizes only `bundle.policy`
   (torch/crates/torch-forge/src/apply.rs:224-236); no torch code touches `SignedPolicyBundle::rules`
   (grep for `.rules`/`BundleRule` in torch-forge and torch-edge finds only `Ruleset::rules()` in library
   modules). A bundle carrying any tag values -- including tags the endpoint "does not understand" --
   is applied if its flat policy realizes, contradicting crucible/crates/cdb-types/src/forge.rs:389-391.
4. torch can produce only 5 of the 7 `ApplyError` variants: SignatureInvalid, StaleLease, ScopeMismatch,
   DowngradeRejected, VtzCannotRealize. `UnknownRuleKind` and `AppendFailed` are never constructed
   (only mapped to strings at torch/crates/torch-edge/src/policy.rs:205-216).
5. Of the flat EndpointPolicy, only `allow_ordinary_internet` has a host effect (and only via the attach
   in finding 1). `brokered`/`restricted` render into nft rules over sets that nothing populates; `exec`
   only probes Landlock support; `resource_bound` limits are computed and discarded; `max_classification`
   only feeds the loosening check (section 9).
6. No persistence: the applied posture and its version high-water mark live only in memory
   (torch/crates/torch-forge/src/apply.rs:60,77); torch-forge performs no filesystem IO (no `std::fs` in
   torch/crates/torch-forge/src). A torchd restart resets to NoPolicy, re-fetches with `have = None`,
   skips the loosening comparison for the first apply, and would accept an older validly-signed,
   unexpired bundle (downgrade protection does not survive restart; acknowledged at
   torch/crates/torch-forge/src/realize.rs:137-142).
7. torch-enforce cannot engage enforcement on any host: `BpfLsmAuthorizer::attach()` returns `Err`
   unconditionally, even when every BPF-LSM primitive is present
   (torch/crates/torch-enforce/src/lsm.rs:126-136), and `LinuxAmbientAuthorizer::realize` reports `Refused`
   even on an `Ok` attach (torch/crates/torch-enforce/src/platform.rs:56-71). torchd never composes an
   ambient tier (`TorchVtzRealization::new` sets `ambient: None`, torch/crates/torch-forge/src/realize.rs:306-311;
   `with_ambient` is called only in tests, realize.rs:458,691). There is no config switch: engaging it
   requires new code (section 15).
8. torch-vtz's namespaces, Landlock, seccomp, cgroup-limit and process-audit primitives have NO production
   caller (only tests and torch-inspect's preflight probes). On an installed host a "zone" is a cgroup
   directory / systemd slice used for attribution only (section 13).
9. The scope check is full `CertIdentity` equality (cn AND sans) against `{cn: TORCH_POLICY_ENDPOINT_CN,
   sans: [cn]}` (torch/crates/torch-edge/src/bin/torchd.rs:1009-1012; crucible/crates/cdb-types/src/forge.rs:331-336;
   crucible/crates/cdb-types/src/enrollment.rs:128-135). ForgeCentral builds members in exactly that shape
   with `agent: null` (forgecentral/apps/bff/src/engine/distribute.ts:93). Agent narrowing is ignored.
10. README drift: torch-forge README claims torch-wrap and torch-inspect consume it; only torch-edge
    depends on torch-forge (torch/crates/torch-edge/Cargo.toml:25 is the sole `torch-forge =` line in any
    crate manifest). torch-enforce README says torchd "composes the ambient authorizer"; torch-edge uses
    only `resolve_pid` / `zone_of_pid` / `zone_of_cgroup` (section 17).

### 3.3 Is the egress attach live on the torchd apply path?

VERDICT: Yes in code. From a delivered bundle to `nft -f -` there is no feature flag, cfg gate, env switch,
dry-run mode, or namespace entry. It is NOT reached today for ForgeCentral-produced bundles (lease unit
mismatch, finding 2) and not reached at all unless the policy lane is provisioned (the installer never sets
`TORCH_POLICY_ANCHOR`: `grep -rn TORCH_POLICY torch/deploy torch/scripts torch/docs` returns nothing).
The parent's pointer is CONFIRMED on every point, with the refinements below.

Call chain (production):

| Step | Code | Evidence |
|---|---|---|
| torchd builds the applier with a cooperative-only realization, broker hard-coded 127.0.0.1:7878 | `TorchVtzRealization::new(BrokerEndpoint::new("127.0.0.1", 7878))`; `EndpointPolicyApplier::new(anchor, endpoint, realization)` | torch/crates/torch-edge/src/bin/torchd.rs:1013-1017 |
| lane drives every delivery through the audited chain | `run_policy_lane` -> `refresh_policy_once(..., now())` -> `apply_delivery` -> `audited_refresh` | torch/crates/torch-edge/src/policy.rs:247, 110-137; torch/crates/torch-forge/src/audit.rs:189-197 |
| client calls the applier | `applier.verify_and_apply(bundle, now)` | torch/crates/torch-forge/src/distribution.rs:131 |
| after signature, lease, scope and version pass, realize runs under the write lock | `self.realization.realize(&bundle.policy, previous.as_ref())` | torch/crates/torch-forge/src/apply.rs:218-236 |
| loosening check (before any attach) | `is_tightening_of` -> `RealizeError::Loosening` | torch/crates/torch-forge/src/realize.rs:354-358 |
| cooperative tier: attach FIRST, then the Landlock probe | `EgressScaffold::attach_policy(egress)` then `FsConfinement::supported()` | torch/crates/torch-forge/src/realize.rs:325-341 |
| backend detection: `nft --version`, else `iptables-restore --version` / `iptables --version` | `EgressBackend::detect` | torch/crates/torch-vtz/src/egress.rs:238-246, 188-196 |
| nft path: spawn `nft -f -`, write ruleset to stdin, 5 s bounded wait | `EgressScaffold::attach` | torch/crates/torch-vtz/src/egress.rs:124-153, 26 |
| iptables path: spawn `iptables-restore` (no `--noflush`), write ruleset | `attach_iptables` | torch/crates/torch-vtz/src/egress.rs:199-223 |
| no setns / netns entry anywhere; the doc assumes the caller is already inside the zone's netns | "The caller runs this inside the zone's net namespace" | torch/crates/torch-vtz/src/egress.rs:117-119 |

Privilege and namespace of that child process:

- The stock unit runs torchd as `User=$TORCH_SVC_USER` with `AmbientCapabilities=CAP_DAC_READ_SEARCH CAP_NET_ADMIN`
  and the same bounding set, `NoNewPrivileges=yes`, `ProtectSystem=strict`, no `PrivateNetwork=` and no
  `RestrictAddressFamilies=` (torch/deploy/torch-install/installer/phases/50-systemd.sh:39-64, caps at 63-64).
  So the spawned `nft` runs in the host network namespace. Whether the ambient CAP_NET_ADMIN is inherited by
  the exec'd `nft` is Linux ambient-capability semantics, not repo code: UNVERIFIED live, but nothing in the
  unit strips it.
- The comment justifying CAP_NET_ADMIN names only the conntrack read for the flow-export lane
  (50-systemd.sh:58-62); the policy lane's use of it is not mentioned there.

What the attached ruleset is (nft form, torch/crates/torch-vtz/src/egress.rs:374-400). The reading of its
effect below applies standard nftables semantics to the rendered text; it was not exercised (section 18):

```
table inet torch_vtz {
  set torch_governed   { type ipv4_addr; flags interval; }
  set torch_restricted { type ipv4_addr; flags interval; }
  chain output {
    type filter hook output priority 0; policy drop;
    oif "lo" accept
    ct state established,related accept
    ip daddr @torch_restricted drop
    ip daddr 127.0.0.1 tcp dport 7878 accept      # the hard-coded "broker"
    ip daddr @torch_governed drop
    accept                                         # ONLY when allow_ordinary_internet == true
  }
}
```

- Both sets are declared empty; the doc says "populated ... by the deployment's DNS resolver"
  (egress.rs:371-372) but no code or installer file adds elements (grep for `torch_governed`,
  `torch_restricted`, `add element`, `ipset` finds only the renderers and tests). So the restricted and
  governed rules match nothing.
- Effective host behavior therefore depends only on `allow_ordinary_internet`:
  - true: the trailing `accept` passes every packet the earlier rules did not -> no practical restriction.
  - false: every NEW locally-originated packet that is not on loopback and not to 127.0.0.1:7878 hits
    `policy drop`, host-wide (all processes, not a zone), IPv4 and IPv6 (the `ip daddr` rules are IPv4-only,
    so IPv6 falls straight to the policy). Established/related flows continue.
- ForgeCentral's composer sets `allow_ordinary_internet` true ONLY when the zone's effective
  `ordinary-network` posture is `permit-deny-risky`; absent or deny yields false
  (forgecentral/packages/contracts/src/forge.ts:156-170). It also always sends `brokered: []`,
  `restricted: []`, `resource_bound` all zeros, `max_classification: Unclassified`, `exec: DenyUnwrappedExec`
  (forge.ts:126-140, 163-170).

Ordering and lifecycle hazards (all from code):

- Attach happens BEFORE the Landlock probe (realize.rs:329 vs 331). If Landlock is unsupported the
  cooperative tier fails, no ambient tier exists, the bundle is refused `VtzCannotRealize`
  (realize.rs:371-376; apply.rs:236) -- but the ruleset is already in the kernel. The endpoint then reports
  "rejected" while the host carries the new ruleset.
- The realize error detail is discarded: `realize_cooperative(...).is_ok()` drops the reason
  (realize.rs:362) and the applier maps any `RealizeError` to the bare `VtzCannotRealize` (apply.rs:236).
- No removal path exists: no `delete table`, `flush table`, `flush ruleset`, or `--noflush` string anywhere
  in torch/crates, torch/deploy, or torch/scripts. The table survives lease expiry, torchd stop, and later bundles.
- Lease expiry after apply changes nothing on the host: `enforcement_at` / `decide` / `audited_decide`
  (the only code that turns a stale lease into a deny) have no production caller (grep: callers only in
  torch-forge's own tests and tests/failure_semantics.rs).
- Every torchd restart re-attaches: posture resets to NoPolicy (apply.rs:77), the next fetch sends
  `have = None` (distribution.rs:101), so the newest bundle is re-delivered and realized again.
- The ruleset text carries no flush/delete statement, so a second `nft -f -` adds to an existing
  `torch_vtz` table. UNVERIFIED (nft semantics, not exercised): whether rules append (duplicate) rather
  than replace; if they append, a later TIGHTER bundle (true -> false) would sit behind the earlier
  unconditional `accept` and not take effect, while the endpoint still reports Applied.
- iptables fallback: the ruleset references ipsets `torch_restricted`/`torch_governed`
  (egress.rs:411,419) that nothing creates. UNVERIFIED: iptables-restore semantics -- the restore would be
  expected to fail on the missing sets (-> VtzCannotRealize); if it were accepted, a restore without
  `--noflush` replaces the host's whole filter table.

Conditions that must ALL hold for the attach to run:

1. `TORCH_POLICY_ANCHOR` set to a readable, non-empty JSON key map and `TORCH_POLICY_ENDPOINT_CN` set
   (torch/crates/torch-edge/src/bin/torchd.rs:1006-1012; torch/crates/torch-edge/src/policy.rs:64-83).
2. A delivered bundle whose ML-DSA-87 signature verifies under an anchor key (section 5 step 1).
3. `now_ns < lease.not_after` -- i.e. a lease stamped in nanoseconds; ForgeCentral's millisecond leases
   never satisfy this (finding 2).
4. A scope member equal to `{cn, sans: [cn]}` for this endpoint's configured CN.
5. Version greater than the applied one, or first apply since process start.
6. Not a loosening of the previously applied policy in this process (realize.rs:354-358).
7. `nft` (or `iptables-restore`/`iptables`) resolvable on torchd's PATH.

Adjacent note (outside this directive): the torch-vtz tests call `attach_policy` / `attach_default_deny`
in the test process's own netns (torch/crates/torch-vtz/src/egress.rs:868-883, 1016-1032); a gate run
as root on a host with `nft` would attach the default-deny table to that host (scripts/ci.sh:47-48 runs
`cargo test` wherever it is invoked). UNVERIFIED how the gate is run.

### 3.4 The policy bundle as the endpoint parses it

Transport (torch-core, not in the three crates; cited for completeness):
- Request `WireRequest::BundleFetch { request_id, have: Option<u64> }` -- nothing identifying in the frame;
  the carrier scopes by the verified mTLS peer (torch/crates/torch-core/src/forge_fetch.rs:29-38).
- Reply `BundleDelivered { bundle: Option<bytes>, version }`: bytes are decoded as CBOR into
  `SignedPolicyBundle` through the torch-core codec; undecodable bytes -> `QueryError::Protocol`
  (not an ApplyError, so no apply report); `None` -> UpToDate (forge_fetch.rs:50-69).
- Report `WireRequest::BundleReport { request_id, vtz_id, version, rejected_reason: Option<String> }`
  (forge_fetch.rs:71-90).

`SignedPolicyBundle` (crucible/crates/cdb-types/src/forge.rs:545-571):

| Field | Type | Notes |
|---|---|---|
| version | `BundleVersion(u64)` | monotonic; `Ord` is the comparison (forge.rs:339-346). ForgeCentral sets it to the store commit counter (forgecentral/apps/bff/src/engine/distribute.ts:80-82). |
| policy | `EndpointPolicy` | the flat disposition the endpoint realizes (forge.rs:440-460) |
| rules | `Vec<BundleRule>` | `#[serde(default)]`; flat tag strings (forge.rs:551-557, 399-425) |
| contributors | `Vec<PolicyVersionRef { policy: PolicyId(Uuid), version: SemVer }>` | audit trail (forge.rs:48-57, 559-560) |
| scope | `IdentityScope { vtz: VtzId(String), members: Vec<ScopeMember { endpoint: CertIdentity { cn, sans }, agent: Option<AgentGci(String)> }> }` | forge.rs:260-337; enrollment.rs:128-135 |
| lease | `FreshnessLease { issued_at: Hlc(u64), not_after: Hlc(u64) }` | forge.rs:362-373 |
| signing_key_id | `KeyId(String)` | selects the anchor key |
| signature_algorithm | `SignatureAlgorithm` | must be `MlDsa87` |
| signature | `Vec<u8>` | detached |

`EndpointPolicy` (forge.rs:440-460): `max_classification: Classification`, `brokered: ModelMcpDestSet`
(destination strings only; no credential field, forge.rs:192-258), `restricted: Vec<String>`,
`allow_ordinary_internet: bool`, `exec: ExecDisposition` (single variant `DenyUnwrappedExec`,
forge.rs:157-163), `resource_bound: ResourceBound { cpu_millicores, memory_bytes, pids, io_bytes_per_sec,
cost_micros, storage_bytes, rate_per_sec }` (all u64, forge.rs:174-190).

`BundleRule` (forge.rs:399-425): `policy_id`, `policy_version`, `source_kind`, `source_selector_kind`
(`exact`/`glob`/`group_ref`/`cidr`), `source_selector_value`, `destination_kind`,
`destination_selector_kind`, `destination_selector_value`, `action` (`permit`/`monitor`/`quarantine`/`deny`),
`protocols: Vec<String>` (`tcp`/`udp`/`https`/`ssh`; empty = unrestricted), `ports: String` (empty =
unrestricted), `logging` (`full`/`sampled`/`off`). The doc states schedule / geo / tags are deliberately
NOT carried (forge.rs:395-398).

Signature scheme (crucible/crates/cdb-artifact/src/policy_bundle.rs, shared by producer and endpoint;
torch re-exports it at torch/crates/torch-forge/src/verify.rs:31):
- Message = SHA-512 of a deterministic definite-length CBOR preimage whose struct keys are in FIELD
  DECLARATION order (not RFC 8949 canonical) (policy_bundle.rs:29-35).
- Preimage excludes `signature`; domain tag first. Empty `rules` -> v1 layout with domain
  `"torch/forge/policy_bundle/v1"`; non-empty `rules` -> v2 layout (rules inserted after policy) with domain
  `"torch/forge/policy_bundle/v2"` (policy_bundle.rs:48, 58, 62-87, 100-133). Stripping or injecting rules
  flips the domain and breaks the signature (policy_bundle.rs:50-57).
- A preimage that cannot be encoded refuses as `SignatureInvalid` (policy_bundle.rs:96-99, 115, 130).
- The encoding is pinned by a SHA-512 golden vector in torch (torch/crates/torch-forge/src/verify.rs:266-289).

Trusted key (`DistributionAnchor`, torch/crates/torch-forge/src/verify.rs:33-84):
- A map `KeyId -> raw ML-DSA-87 verifying key` wrapping crdb's `MlDsa87Verifier`; empty by default (every
  bundle refuses) (verify.rs:40-59).
- Verify = preimage -> SHA-512 -> `MlDsa87Verifier::verify(digest, signature, bundle.signing_key_id,
  bundle.signature_algorithm)`; algorithm != MlDsa87 -> `UnsupportedAlgorithm`, unknown key id ->
  `KeyNotFound`, bad signature -> `Invalid`, all collapsed to `ApplyError::SignatureInvalid`
  (verify.rs:72-83; crucible/crates/cdb-artifact/src/signing.rs:275-293).
- Where the key comes from in production: `load_anchor(TORCH_POLICY_ANCHOR)` reads a JSON object
  `{ "<signing_key_id>": "<hex verifying key>" }`, once, at torchd start; a startup failure aborts torchd
  (torch/crates/torch-edge/src/policy.rs:55-83; torch/crates/torch-edge/src/bin/torchd.rs:1007-1008). The doc
  says "the shape FD.5's installer provisioning writes at enrollment" (policy.rs:57-58), but no installer
  phase writes an anchor (grep of torch/deploy for anchor/TORCH_POLICY finds only the EK anchor of
  55-govern-attest.sh).
- Rotation: the anchor may hold several key ids; revocation = drop the key from the anchor (pinned by
  torch/crates/torch-forge/tests/failure_semantics.rs:305-367). A changed anchor file takes effect only on
  torchd restart (it is read once, torchd.rs:1007-1008).

### 3.5 Verification chain in code order, and every refusal reason

`EndpointPolicyApplier::verify_and_apply(bundle, now)` (torch/crates/torch-forge/src/apply.rs:184-241).
The first failing step returns and leaves the posture untouched.

| # | Check | Refusal (`ApplyError`) | Evidence |
|---|---|---|---|
| 0 | CBOR decode of the delivered bytes (torch-core) | not an ApplyError: `QueryError::Protocol`; nothing is applied or reported | torch/crates/torch-core/src/forge_fetch.rs:52-59 |
| 1 | ML-DSA-87 signature against the anchor (unknown key id, wrong algorithm, bad bytes, unencodable preimage) | `SignatureInvalid` | apply.rs:189-190; verify.rs:72-83 |
| 2 | Freshness: `now >= lease.not_after` (expired on tie). `issued_at` is never checked (a future-issued bundle is accepted) | `StaleLease` | apply.rs:192-195 |
| 3 | Scope: `bundle.scope.includes_endpoint(&self.endpoint)` -- full `CertIdentity` equality, agent ignored | `ScopeMismatch` | apply.rs:197-201; crucible/crates/cdb-types/src/forge.rs:331-336 |
| 4 | Version vs the CURRENT applied version, under the write lock: older | `DowngradeRejected` | apply.rs:211-216 |
| 4b | equal version | `Ok(())`, idempotent no-op, realize NOT re-run (and a fresh Applied report is still sent) | apply.rs:217; distribution.rs:131-141 |
| 4c | higher, or nothing applied | proceed to realize | apply.rs:218 |
| 5 | Realize: loosening vs the previously applied policy, or no tier realized | `VtzCannotRealize` (detail discarded) | apply.rs:219-236; realize.rs:344-378 |

Never produced by torch: `UnknownRuleKind` (bundle.rules are never inspected) and `AppendFailed` (audit
failure never aborts; see section 7). The module doc lists the order signature -> freshness -> scope ->
version (apply.rs:5-20) and the function doc lists signature -> version -> freshness -> scope
(apply.rs:171-172); the code order is the table above.

### 3.6 Apply semantics

- Atomic: posture is `RwLock<Arc<PolicyPosture>>`; realize and the swap both happen under the write lock
  and the new posture is one `Arc` assignment; readers take `Arc` snapshots that later applies never mutate
  (apply.rs:22-29, 60, 89-94, 211-240). A poisoned lock is recovered, not propagated (apply.rs:90-93, 211).
- Fail-closed start: `PolicyPosture::NoPolicy` is the default and the applier starts there
  (torch/crates/torch-forge/src/lib.rs:149-156; apply.rs:77).
- Monotonic compares only `BundleVersion` (u64) against the in-memory active version (apply.rs:212-218).
  Racing applies converge to the higher version (pinned by apply.rs test at 641-659 and
  tests/failure_semantics.rs:409).
- Stale bundle -> StaleLease. Replayed same version -> no-op success. Older version while a newer is
  applied -> DowngradeRejected. Bundle for another endpoint -> ScopeMismatch. All are reported to the
  carrier by the torch-edge lane with the variant name (torch/crates/torch-edge/src/policy.rs:197-216).
- May-only-tighten: a higher version that loosens ANY axis versus the last applied policy is refused
  (realize.rs:157-184, 354-358): egress via torch-vtz `EgressPolicy::is_tightening_of`
  (torch/crates/torch-vtz/src/egress.rs:427-446 -- deny-unlisted may not become allow-unlisted; no named host
  may drop in rank Restricted > Governed > Ordinary), every `resource_bound` axis must be `<=`
  (realize.rs:196-213), exec rank (realize.rs:221-225, single variant so always equal), and
  `max_classification` must be `<=` (realize.rs:183). Consequence with ForgeCentral's composer: once a zone
  with `allow_ordinary_internet = false` is applied, a later bundle flipping it to true is refused
  `VtzCannotRealize` for the rest of the process lifetime.
- Persisted state: NONE. `AppliedPolicySet`/`PolicyPosture` derive Serialize "so last-known-good can be
  persisted across a restart (FG1.4)" (torch/crates/torch-forge/Cargo.toml:25-26; lib.rs:100-115), but no
  code writes them. On restart: NoPolicy, loosening check skipped for the first apply (`previous = None`,
  realize.rs:130-142), and an older-but-unexpired validly-signed bundle would be accepted.
- `AppliedPolicySet` keeps `version`, `vtz` (from `scope.vtz`), `policy`, `lease`, `realized` tiers; the
  signature, contributors and scope members are not retained (lib.rs:87-115).

### 3.7 Audit trail (ForgeAuditor) and what the live path emits

- Types (torch/crates/torch-forge/src/audit.rs): `ForgeAudit::Apply(ApplyOutcome)`,
  `ForgeAudit::Enforcement(EnforcementRecord)`, `ForgeAudit::Counters(EnforcementCounters)` (audit.rs:78-89);
  counters `brokered, allowed, dropped, exec_denied, stale_denied, no_policy_denied` (audit.rs:48-62).
  All payload-free (audit.rs:8-11).
- `audited_refresh` emits exactly one Apply fact per DELIVERED bundle (applied or rejected); UpToDate emits
  nothing; an emit failure is returned as `AuditedPathError::Audit(outcome, err)` AFTER the apply already
  happened -- it never aborts or rolls back the apply (audit.rs:178-211).
- `audited_decide` / `record_enforcement` / `emit_counters` (audit.rs:140-165, 220-230) have no production
  caller, so no Enforcement or Counters fact is ever emitted by torchd.
- torchd's sink is `StderrForgeAudit`: one stderr line `torchd: forge apply audit {fact:?}` (Rust Debug
  format), and it never fails (torch/crates/torch-edge/src/bin/torchd.rs:1629-1641). The "real sink rides the
  OTLP emission" claim is deferred (audit.rs:21-25); nothing ships these facts to the engine.
- The durable, engine-side convergence record is the lane's BUNDLE_REPORT (vtz_id, version,
  rejected_reason), not the audit fact (torchd.rs:1629-1633; policy.rs:164-216). The realized-tier evidence
  (`RealizedTiers`) is not in the report.

### 3.8 EndpointPolicyApplier / ForgeDistributionClient contracts

- `EndpointPolicyApplier::new(anchor, endpoint: CertIdentity, realization: Box<dyn VtzRealization>)` ->
  starts NoPolicy (apply.rs:63-79). `endpoint` is the applier's own identity; the bundle can never name
  itself into scope (apply.rs:12-15, 197-201).
- `posture()` -> atomic snapshot (apply.rs:88-94). `is_enforcing()` -> installed, IGNORING freshness
  (apply.rs:96-104). `enforcement_at(now)` -> `Enforcing` only if installed AND `now < not_after`, else
  `Deny(NoPolicy | StalePolicy)` (apply.rs:106-125). `decide(action, agent, now)` -> `EnforcementRecord`
  with version, vtz, endpoint, agent, action, decision (apply.rs:127-167; decision table in
  torch/crates/torch-forge/src/attribute.rs:75-93: governed egress -> PermitViaBroker, ordinary -> Permit,
  restricted -> Deny(RestrictedEgress), UnwrappedExec -> Deny(UnwrappedExecDenied)). None of
  `enforcement_at`/`decide` is called in production.
- `ForgeDistribution` trait: `pull(have)` + `report_apply(outcome)` (torch/crates/torch-forge/src/distribution.rs:30-48).
  `ForgeDistributionClient::refresh` sends the applied version as `have` and runs `apply_and_report`;
  `receive_pushed` is the identical path for a pushed bundle (distribution.rs:96-143). torchd uses a
  one-shot adapter whose `report_apply` is a no-op (the lane reports separately)
  (torch/crates/torch-edge/src/policy.rs:85-108); no push transport exists.
- `RefreshOutcome = UpToDate | Applied(version) | Rejected(version, ApplyError)` (distribution.rs:56-64).

### 3.9 TorchVtzRealization: what "realize" actually does

`TorchVtzRealization { broker, ambient: Option<Box<dyn AmbientEnforcement>> }`
(torch/crates/torch-forge/src/realize.rs:291-321). torchd uses `new(127.0.0.1:7878)` -> `ambient: None`.

`realize(policy, previous)` (realize.rs:344-378):
1. If `previous` is Some and the new policy is not a tightening on every axis -> `Loosening`.
2. `translate_egress`: governed = `brokered` destinations, restricted = `restricted`, ordinary =
   `allow_ordinary_internet`, routed via the broker (realize.rs:227-243).
3. Cooperative tier (`realize_cooperative`, realize.rs:323-341):
   - `EgressScaffold::attach_policy(egress)` -- the host-mutating step (section 3);
   - if exec is `DenyUnwrappedExec` and `FsConfinement::supported()` is false -> Unsupported
     (probe only; Landlock is never applied here);
   - `let _limits = ResourceLimits::from_grant(&translate_resource(..))` -- computed and dropped
     ("realized per agent launch", realize.rs:337-339; no production caller of `apply_limits`).
   - success adds `CooperativeLaunchRedirect`.
4. Ambient tier: only if `ambient` is Some (never in torchd) -> `AmbientKernelAuthorization`.
5. No tier -> `Unsupported("no enforcement tier realized the disposition")`.

Translation helpers with no production caller: `translate_exec` -> `FsConfinement::deny_unwrapped_exec(cache,
exec_roots)` (realize.rs:245-263); `translate_resource` -> memory_bytes, pids, cpu_percent =
ceil(millicores/10) floored at 1; io/cost/storage/rate are not mapped ("enforced by CDB budgets and other
layers") (realize.rs:265-289).

### 3.10 Authored policy dimensions on the endpoint

Categories: REALIZED = has an effect in production code on the endpoint (admission check or host change).
PARSED-BUT-NOT-REALIZED = present in the bundle types and decoded (and signature-bound) but nothing on the
host acts on it. ABSENT = authored in the Console/engine model but not in any type the endpoint receives.

| # | Dimension (bundle field) | Status | What concretely happens | Evidence |
|---|---|---|---|---|
| 1 | Bundle version | REALIZED (admission) | downgrade refused, equal = no-op, higher applies | apply.rs:211-218 |
| 2 | Signature envelope (signing_key_id, signature_algorithm, signature) | REALIZED (admission) | ML-DSA-87 verify against anchor | verify.rs:72-83 |
| 3 | lease.not_after | REALIZED (admission only) | refuses when `now_ns >= not_after`; ForgeCentral ms leases always refuse; post-apply expiry has no host effect | apply.rs:192-195; torchd.rs:1723-1725; distribute.ts:95 |
| 4 | lease.issued_at | PARSED-BUT-NOT-REALIZED | never compared | apply.rs:184-241 |
| 5 | scope.vtz (zone identity) | PARSED-BUT-NOT-REALIZED | kept as attribution and reported as `vtz_id`; no host boundary is created from it | apply.rs:228-234; torch/crates/torch-edge/src/policy.rs:164-181 |
| 6 | scope.members[].endpoint (Applied-To endpoints) | REALIZED (admission) | ScopeMismatch unless one member equals `{cn, sans:[cn]}` | forge.rs:331-336; torchd.rs:1009-1012 |
| 7 | scope.members[].agent (agent narrowing) | PARSED-BUT-NOT-REALIZED | ignored by the scope check; an agent-scoped bundle applies host-wide; ForgeCentral always sends null | forge.rs:331-336; distribute.ts:93 |
| 8 | contributors (authored policy versions) | PARSED-BUT-NOT-REALIZED | signature-bound, then dropped | policy_bundle.rs:67; torch-forge lib.rs:94-96 |
| 9 | policy.allow_ordinary_internet (the `ordinary-network` domain posture) | REALIZED (conditional, host-wide) | adds or omits the trailing `accept` in the host-netns nft chain (section 3) | egress.rs:390-392; realize.rs:329-330; forge.ts:159-161 |
| 10 | policy.brokered (governed model/MCP destinations) | PARSED-BUT-NOT-REALIZED | rendered as a drop on an empty set plus a 127.0.0.1:7878 accept; no DNS resolution; ForgeCentral sends [] | egress.rs:379-389, 395; forge.ts:165 |
| 11 | policy.restricted (denied destinations) | PARSED-BUT-NOT-REALIZED | rendered as a drop on an empty set; ForgeCentral sends [] | egress.rs:379, 396; forge.ts:166 |
| 12 | policy.exec = DenyUnwrappedExec (the `execution` domain) | PARSED-BUT-NOT-REALIZED | only `FsConfinement::supported()` is probed; no Landlock applied | realize.rs:331-336 |
| 13 | policy.resource_bound (7 axes) | PARSED-BUT-NOT-REALIZED | limits computed and discarded; used only in the loosening check; ForgeCentral sends all zeros | realize.rs:196-213, 337-339; forge.ts:126-134 |
| 14 | policy.max_classification | PARSED-BUT-NOT-REALIZED | used only in the loosening check; not part of any decision | realize.rs:183; attribute.rs:80-93 |
| 15 | rules[].source_kind / source_selector_kind / source_selector_value (users, groups, agents, services...) | PARSED-BUT-NOT-REALIZED | decoded + signed, never read | forge.rs:405-410; apply.rs:224-236 |
| 16 | rules[].destination_kind / destination_selector_* (objects: URI, network/CIDR, application, data store, kernel classes...) | PARSED-BUT-NOT-REALIZED | same | forge.rs:411-416 |
| 17 | rules[].action (permit / monitor / quarantine / deny) | PARSED-BUT-NOT-REALIZED | same; "quarantine" moves nothing | forge.rs:417-418 |
| 18 | rules[].protocols (tcp/udp/https/ssh) | PARSED-BUT-NOT-REALIZED | same; no torch code references the cdb `Protocol`/`NetworkMatch` types | forge.rs:419-420 |
| 19 | rules[].ports | PARSED-BUT-NOT-REALIZED | same; no torch reference to `PortSpec` | forge.rs:421-422 |
| 20 | rules[].logging (full/sampled/off) | PARSED-BUT-NOT-REALIZED | same | forge.rs:423-424 |
| 21 | rules[].policy_id / policy_version | PARSED-BUT-NOT-REALIZED | same | forge.rs:401-404 |
| 22 | Schedule (days of week, hour window) | ABSENT | not carried by the bundle; no torch reference to `Schedule`/`Weekday`/`HourWindow` | forge.rs:395-398; forgecentral/packages/contracts/src/forge.ts:212-214 |
| 23 | Active window (absolute) | ABSENT | filtered producer-side (engine excludes expired policies) | crucible/crates/cdb-types/src/forge_v2.rs:1003-1011; distribute.ts:122-125 |
| 24 | Geo (residency allowlist) | ABSENT | not carried | forge.rs:395-398; forge_v2.rs:1092-1105 |
| 25 | Tags (PHI/PII labels) | ABSENT | not carried | forge.rs:395-398; forge_v2.rs:1106-1107 |
| 26 | Per-domain default postures other than ordinary-network / execution (file-and-config, IPC, device, memory, privilege escalation, kernel module, credential store, persistence, governed egress) | ABSENT | v1 bundle has no posture map; ForgeCentral records them as `unexpressedDomains` | forge.rs:437-439; forge.ts:76-79, 94-97, 172-175 |
| 27 | Group / user membership resolution | ABSENT | no membership field in the bundle; `groups::expand_ruleset` is library-only | forge.rs:545-571; torch/crates/torch-forge/src/groups.rs:124 |
| 28 | Named object catalog records | ABSENT | only selector strings travel inside rules | forge.rs:399-425 |
| 29 | VTZ record fields (zone type, micro-segmentation, telemetry mode, re-auth interval, hierarchy, description, lifecycle) | ABSENT | bundle carries only the `VtzId` string; ForgeCentral records them as `unexpressedFields` | forge_v2.rs:1825-1842; forge.ts:87-92 |
| 30 | Catastrophic floor layer / quarantine-zone policy / risk provenance | ABSENT | not in the bundle; torch-forge implements them as library code only | torch/crates/torch-forge/src/floor.rs:26-27; quarantine.rs:70-82; risk.rs:27-32; compose.rs:26-28 |

Counts: REALIZED 5 (4 admission checks + 1 conditional host effect), PARSED-BUT-NOT-REALIZED 16, ABSENT 9.

### 3.11 torch-forge v2 model modules (library-only, no production caller)

In production, torch-edge imports only `EndpointPolicyApplier`, `ForgeAuditor`, `TorchVtzRealization`,
`AuditSink`, `ForgeAudit`, `AuditError`, `audited_refresh`, `AuditedPathError`, `DistributionAnchor`,
`ForgeDistribution`, `ForgeDistributionClient`, `RefreshOutcome` from torch-forge
(torch/crates/torch-edge/src/bin/torchd.rs:61, 1636-1637; torch/crates/torch-edge/src/policy.rs:23-26);
no other crate depends on torch-forge. Everything below is pure, tested library code over the cdb-types v2
model (`Rule`, `Ruleset`, `ObjectKind`, `Action`, `Selector`, crucible/crates/cdb-types/src/forge_v2.rs),
which is NOT the flat `BundleRule` shape the bundle carries.

- compose.rs: flattens a VTZ's root-to-leaf authored policies into an `EffectivePolicy` (union rulesets,
  min resource bound and classification, contributor list, floor layer, group expansion); refuses
  `NoPolicyOnPath`, `VersionMismatch`, `PostureLoosening`, `FloorLoosening`, `ReservedZone`,
  `DuplicateScope`, `IllegalRuleRole` (compose.rs:1-28, 49-75, 185-240). Its own doc: "No live caller yet"
  (compose.rs:26-28).
- rules.rs: `decode_ruleset` (typed `Rule` CBOR, not `BundleRule`) with bounds MAX_RULESET_BYTES 1 MiB,
  MAX_RULES 4096, MAX_UNKNOWN_RULE_BYTES 16 KiB, MAX_RULE_NESTING_DEPTH 16; unknown rules retained, never
  dropped (rules.rs:1-68, 294).
- evaluate.rs: `evaluate` (lattice max, unmatched = Deny), `evaluate_effective` (unmatched -> domain
  posture: Deny, or Monitor for PermitDenyRisky), `decide` (unknown-rule touch -> Deny, then rules, then
  posture, then the realization gate) (evaluate.rs:93-156, 219-248).
- lattice.rs: `Permit < Monitor < Quarantine < Deny`, compose by max; Monitor and above emit an event
  (lattice.rs:21-47; crucible/crates/cdb-types/src/forge_v2.rs:200-219).
- taxonomy.rs: role validity; `Exact` = equality, `Glob` = `*`/`?`; `GroupRef` and `Cidr` selectors match
  NOTHING ("Enforcement is AG.7-OFF, so no disposition rests on either arm today") (taxonomy.rs:111-129).
- groups.rs: `expand_ruleset` -- resolved groups expand to exact members; an unresolved group expands to
  nobody on Permit/Monitor and to everyone (`Glob("*")`) on Deny/Quarantine (groups.rs:1-24, 124).
- domains.rs: `domain_of` and `recommended_postures` (Deny: governed egress, execution, privilege
  escalation, kernel module, credential store, persistence; PermitDenyRisky: ordinary network, file/config,
  IPC, device, memory) (domains.rs:100-126).
- floor.rs: FLOOR_DOMAINS = [GovernedEgress, Execution], read-only Deny default (floor.rs:24-37).
- quarantine.rs: reserved leaf label "quarantine"; floor ruleset = one Monitor rule Agent -> broker-attributed
  URI, everything else Deny; floor bound 100 millicores, 64 MiB, 8 pids, 64 KiB/s IO, 0 cost, 0 storage,
  1 req/s; unrealizable containment -> Deny (quarantine.rs:28-101).
- risk.rs: `RiskAction` = Deny | Quarantine only (a risk-derived Permit is unrepresentable) (risk.rs:27-32).
- compat.rs: `v1_to_v2` maps an EndpointPolicy to a v2 Policy; documents that broker-only-ness is a
  realization-edge guarantee, not an evaluator one (compat.rs:1-40).
- object_realize.rs: static Linux realizer table -- Uri/Network -> Egress; Application/Script ->
  ExecAllowlist; User/Group/Agent -> Identity; Service/Server -> ServiceIdentity; Kernel(_) ->
  AmbientKernel; RegistryKey/Certificate/DataStore -> NotAvailable (Deny) (object_realize.rs:37-99). It names
  primitives; it executes nothing. (The module doc and its test list omit DataStore from NotAvailable,
  object_realize.rs:15-16, 142-146, but the code includes it at line 73.)

### 3.12 torch-vtz: what a VTZ becomes on Linux

torch-vtz is a Linux primitive library (torch/crates/torch-vtz/src/lib.rs:6-24). Dependencies: thiserror, libc
only (torch/crates/torch-vtz/Cargo.toml:14-18). No env vars, no Cargo features, no `cfg(target_os)` gating.

| Primitive | Mechanism and defaults | Privilege needed | Production caller? | Evidence |
|---|---|---|---|---|
| Namespaces | `ZoneSpec::mandatory(zone_id)` = user, pid, mount, uts, ipc, net (the `Cgroup` namespace variant exists but is NOT in the mandatory set) + a cgroup slice; launched by shelling to `unshare(1)` with `--map-root-user` (user ns) and `--fork` (pid ns); realizability probed by `unshare ... true`; unrealizable -> `VtzError::Unsupported` | user/pid/uts/ipc realizable unprivileged in the dev container; mount/net/cgroup "need more privilege" (test comment) | No (tests only) | lib.rs:44-76, 116-135, 171-235, 286-295 |
| cgroup v2 slice | `/sys/fs/cgroup/torch-vtz-<zone_id>` created with `create_dir_all`; pid placed by writing `cgroup.procs` | write access to the cgroup tree (root or delegation) | No (tests only) | lib.rs:78-103, 224-245 |
| cgroup limits | `ResourceLimits::from_grant`: `memory.max` bytes, `pids.max`, `cpu.max` = percent x 100000 us / 100 over a 100000 us period; unset = no write | write to slice control files | No (`apply_limits` only in tests) | resource.rs:26-104 |
| seccomp-bpf | `SeccompProfile::builtin_agent()` allows 33 syscalls (read, write, open, openat, close, fstat, lseek, mmap, mprotect, munmap, brk, rt_sigaction, rt_sigprocmask, rt_sigreturn, ioctl, access, execve, exit, exit_group, arch_prctl, set_tid_address, set_robust_list, prlimit64, getrandom, clock_gettime, futex, epoll_create1, epoll_ctl, epoll_wait, socket, connect, sendto, recvfrom); default EPERM; arch guard kills on foreign ABI (x86_64 / aarch64 only, else `UnsupportedArch`); installed in `pre_exec` via `PR_SET_NO_NEW_PRIVS` + `PR_SET_SECCOMP` | none (NO_NEW_PRIVS) | No (tests only) | seccomp.rs:22-54, 98-142, 150-223 |
| Landlock / deny-unwrapped-exec | ABI-1 access flags only; `write_confined(cache)` handles the write/create/remove set; `deny_unwrapped_exec(cache, exec_roots)` additionally handles `EXECUTE`, allowed only under `exec_roots`; reads unhandled; installed in `pre_exec` after `PR_SET_NO_NEW_PRIVS`; `supported()` = ABI version >= 1 | none (unprivileged LSM) | No (`apply` only in tests; `supported()` is probed by torch-forge realize and torch-inspect preflight) | landlock.rs:33-60, 93-176, 178-249 |
| Egress (nftables / iptables) | table `inet torch_vtz`, output hook policy drop; builtin policy governs api.anthropic.com, api.openai.com, generativelanguage.googleapis.com and allows ordinary internet; backend nft preferred, iptables-restore fallback; 5 s attach deadline | CAP_NET_ADMIN in the target netns | YES -- only via torch-forge realize (section 3) | egress.rs:22-36, 66-67, 83-247, 295-400, 402-425 |
| Egress tightening | `is_tightening_of` / `tighten` refuse a loosening update | none (pure) | via torch-forge loosening check | egress.rs:427-460 |
| BrokerEndpoint | `{host, port}`; the only broker in production is torchd's hard-coded 127.0.0.1:7878 (the local engine wire port on a co-resident box) | n/a | yes (torchd.rs:1013-1016) | egress.rs:249-268 |
| Egress flow audit | classify -> counters (allowed/brokered/dropped) + bounded 4096-record window, payload-free | none | No | egress.rs:517-647 |
| Process audit | `AuditedZone` records pid + exe per spawn, payload-free | none | No | audit.rs:1-80 |

Platform: nothing in torch-vtz is stubbed for macOS/Windows; it is Linux-only code with no cfg gating
(grep for `cfg(target_os`/`cfg(unix` in torch-vtz and torch-forge finds none), and torch-vtz is not in the
cross-target check list (torch/scripts/xcheck.sh:23-24). UNVERIFIED whether it compiles for macOS/Windows.

Other consumers: torch-inspect's construction sandbox builds a `ZoneSpec::mandatory` + `write_confined` +
`EgressPolicy::strict(&[], &[])` spec but only calls the preflight probes `namespaces_supported` and
`FsConfinement::supported` (torch/crates/torch-inspect/src/sandbox.rs:243-259, 297-310); torch-wrap uses
only the egress record types (torch/crates/torch-wrap/src/egress_capture.rs:26); torch-broker references
torch-vtz only in a test (torch/crates/torch-broker/tests/live_capture_capstone.rs:53); torch-trustflow uses
`EgressPolicy::classify` (torch/crates/torch-trustflow/src/compose.rs:10-30).

### 3.13 What a "zone" actually is on an installed host today

- Governed-agent launcher: systemd template `torch-agent@<zone>.service` with `Slice=torch-vtz-%i.slice`,
  `EnvironmentFile=<agents dir>/%i.env`, `ExecStart=/bin/sh -c 'exec ${TORCH_AGENT_CMD}'` -- no namespace,
  seccomp, Landlock, resource-limit, or network directives (torch/deploy/torch-install/installer/phases/50-systemd.sh:247-278).
- Discovered agents: the root helper `torch-placed` verifies the pid's binary hash (via
  `torch_enforce::resolve_pid`), validates the lowercase-hex zone token, creates
  `<TORCH_CGROUP_ROOT>/torch-vtz-<zone_id>.slice` and writes the pid to `cgroup.procs`
  (torch/crates/torch-edge/src/placement.rs:282-335); no limits are written. The unit doc: "Both operations
  grant OBSERVATION attribution only (AG.7/enforcement stays OFF)" (50-systemd.sh:196-197).
- torchd then attributes activity by reading the cgroup (`torch_enforce::zone_of_pid` / `zone_of_cgroup`,
  torch/crates/torch-edge/src/agent_govern.rs:1351-1358; torch/crates/torch-enforce/src/resolve.rs:88-130).
- So a VTZ on a real host today = a named cgroup for attribution. None of section 12's containment
  primitives is applied to it.

### 3.14 torch-enforce: the ambient kernel-authorization tier

Dependencies: cdb-types, thiserror, serde, torch-types (torch/crates/torch-enforce/Cargo.toml:14-33); no env
vars; no Cargo features.

- Contract (contract.rs): `SubjectIdentity = Resolved{binary_hash (SHA-512 hex), signer, zone, exe_path,
  principal uid} | Unknown` (contract.rs:67-102); `Operation = Exec | FileOpen | NetConnect`, mapped to
  `bprm_check_security`, `file_open`, cgroup `connect4/connect6` (contract.rs:104-119); `Verdict = Allow |
  Deny` (contract.rs:147-159); `EnforceAction` lattice with Quarantine collapsing to Deny at the hook
  (contract.rs:161-210); `EffectivePolicy::from_applied(EndpointPolicy, lease, vtz, version, contributors)` is
  the only constructor (contract.rs:212-258).
- Decision oracle `evaluate` (authorize.rs:66-119): NetConnect -- Unknown subject Deny; Ordinary Permit;
  Governed AND Restricted Deny (a direct connect to a governed host is denied so the broker is the only
  route). Exec -- Unknown Deny; zone member Permit; non-member Deny. FileOpen -- Permit (ungoverned in v1).
  Mismatched pair -- Deny.
- Freshness `decide`: absent -> Deny(NoPolicy); stale -> Deny(StalePolicy); policy deny ->
  Deny(DeniedByPolicy); plus DecisionTimeout and an inconsistency reason (freshness.rs:29-45, 91).
- Projections to kernel-map form: `project_exec`, `project_file` (LPM, FILE_VERDICT_MAP_CAPACITY 4096),
  `project_net` (NET_VERDICT_MAP_CAPACITY 4096); an unrepresentable rule refuses the whole projection
  (project.rs:1-40, 101, 131-134, 196, 313-315, 365).
- Budget: DEFAULT_DECISION_BUDGET_MILLIS = 2000 for userspace synchronous auth (macOS ES); overrun ->
  Deny(DecisionTimeout) (budget.rs:1-33).
- Reporting: `HookStatus = Live | Refused(reason) | NotAvailable(reason)`, `AmbientRealization`,
  `AmbientAuditor`, payload-free `AmbientEnforcementRecord`; the OTLP sink is deferred (report.rs:1-45).
- LSM probe: requires `bpf` in /sys/kernel/security/lsm, CAP_BPF (bit 39) and CAP_MAC_ADMIN (bit 33) in
  CapEff, and /sys/kernel/btf/vmlinux (lsm.rs:27-35, 88-106).
- `BpfLsmAuthorizer::attach()`: missing primitive -> Err(probed reason); ALL primitives present -> still
  Err("BPF-LSM primitive present but the program loader is not yet wired") (lsm.rs:115-136).
- Platforms: Linux `realize` -> Refused on Err, and ALSO Refused on a hypothetical Ok ("handle-retention is
  not wired") (platform.rs:47-73); macOS (Endpoint Security) and Windows (minifilter/WFP) -> NotAvailable
  (platform.rs:75-115); `host_authorizer` picks by `cfg!(target_os)` (platform.rs:117-133).
- Production use of torch-enforce: only `resolve_pid`, `zone_of_pid`, `zone_of_cgroup` (identity and zone
  resolution for torch-placed and the govern lane: torch/crates/torch-edge/src/placement.rs:320-329, 771-781;
  agent_govern.rs:766-770, 1351-1358). No production code calls `authorize`, `decide`, any `project_*`,
  `probe_bpf_lsm`, `BpfLsmAuthorizer::attach`, or `host_authorizer` (callers only in torch-enforce's own tests
  and tests/conformance.rs:340-360, 571).

### 3.15 Enforcement status and exactly what would engage it

Plain statement: enforcement is OFF on every host, and there is no switch that turns it on.

- "AG.7" is not a code switch. It appears only in comments/docs (torch/crates/torch-forge/src/taxonomy.rs:127;
  torch/crates/torch-edge/src/placement.rs:17; torch/crates/torch-edge/src/bin/torchd.rs:1005;
  torch/crates/torch-edge/src/policy.rs:12; torch/crates/torch-edge/src/agent_govern.rs:641;
  torch/crates/torch-enforce/README.md:18,238). No env var, constant, or Cargo feature named for
  enforcement exists (grep for TORCH_ENFORCE / enforce_mode / EnforceMode / observe_only / dry_run in
  torch/crates finds only unrelated hits: torch-core finding dispositions, torch-scenario's --dry-run, and
  the discovery sweep's `observe_only` list -- agents left ungoverned because placement failed, an
  attribution category, not an enforcement mode, torch/crates/torch-edge/src/agent_govern.rs:808-814).
- Ambient (kernel) tier -- cannot be engaged without NEW CODE:
  1. a BPF-LSM program and loader (lsm.rs:11-21, 126-136 -- absent from the repo);
  2. `LinuxAmbientAuthorizer::realize` retaining the attach handle (platform.rs:57-69 FIXME);
  3. an `impl torch_forge::AmbientEnforcement` bridging torch-enforce into torch-forge (none exists;
     the only impls are test fixtures, realize.rs:412-418);
  4. torchd constructing `TorchVtzRealization::with_ambient(...)` instead of `new(...)` (torchd.rs:1013-1016);
  5. host prerequisites: `lsm=bpf` boot, BTF, and CAP_BPF + CAP_MAC_ADMIN -- torchd's bounding set is
     exactly CAP_DAC_READ_SEARCH + CAP_NET_ADMIN (50-systemd.sh:63-64), so the unit would also change.
- Cooperative tier: Landlock deny-unwrapped-exec, seccomp, namespaces and cgroup limits have no production
  caller (sections 9, 12). The only reachable piece is the host-netns nft attach (section 3), gated by
  provisioning `TORCH_POLICY_ANCHOR` + `TORCH_POLICY_ENDPOINT_CN` and by a bundle that passes all checks.
- Decision paths: `EndpointPolicyApplier::enforcement_at` / `decide` / `audited_decide` (stale or absent
  policy -> deny) are never called in production, so the "a stale endpoint is a denying endpoint" property
  (torch/crates/torch-forge/src/lib.rs:12-13) is modeled, not realized.
- Mode reporting: torch-wrap reports `EnforcementMode::Cooperative, contained = false` unless a
  `MandatoryEngagement` is applied (torch/crates/torch-wrap/src/mode.rs:8-24, 39-77);
  `MandatoryEngagement::new` is called only in tests (mode.rs:165,177; posture.rs:219;
  torch-wrap tests/conformance.rs:81). So no production report can claim Mandatory/contained.
- What the endpoint emits instead of enforcement: the stderr apply-audit line, the BUNDLE_REPORT
  (applied / rejected + reason), and ordinary sensing telemetry. No enforcement record, counter, or
  ambient fact is emitted in production (section 7; report.rs:1-13 says the ambient sink is deferred).

### 3.16 Configuration knobs in the three crates

No crate among torch-forge, torch-vtz, torch-enforce reads an environment variable (grep for `env::var` in
the three src trees finds none) or declares a Cargo `[features]` table. Their behavior is fixed by code
constants and by what the caller passes in. The runtime inputs come from torchd:
`TORCH_POLICY_ANCHOR`, `TORCH_POLICY_ENDPOINT_CN`, `TORCH_POLICY_FETCH_SECS` (torch-edge, covered by the parent)
and the hard-coded broker `127.0.0.1:7878` (torchd.rs:1013-1016, not configurable).

| Crate | Constant / default | Value | Evidence |
|---|---|---|---|
| torch-forge | MAX_RULESET_BYTES (TUNE) | 1 MiB | rules.rs:39-45 |
| torch-forge | MAX_RULES (TUNE) | 4096 | rules.rs:47-53 |
| torch-forge | MAX_UNKNOWN_RULE_BYTES (TUNE) | 16 KiB | rules.rs:55-61 |
| torch-forge | MAX_RULE_NESTING_DEPTH (TUNE) | 16 | rules.rs:63-68 |
| torch-forge | quarantine_floor_bound (TUNE) | 100 mc, 64 MiB, 8 pids, 64 KiB/s, 0, 0, 1/s | quarantine.rs:45-60 |
| torch-forge | QUARANTINE_LABEL | "quarantine" | quarantine.rs:31 |
| torch-forge | FLOOR_DOMAINS | GovernedEgress, Execution | floor.rs:24-27 |
| torch-forge | recommended_postures (TUNE) | see section 11 | domains.rs:100-126 |
| torch-forge | cpu millicores -> percent | ceil(mc/10), min 1 | realize.rs:275-287 |
| torch-vtz | ATTACH_DEADLINE (TUNE) | 5 s | egress.rs:22-26 |
| torch-vtz | ATTACH_POLL_INTERVAL (TUNE) | 20 ms | egress.rs:28-30 |
| torch-vtz | MAX_BUFFERED_FLOW_RECORDS (TUNE) | 4096 | egress.rs:32-36 |
| torch-vtz | TORCH_VTZ_TABLE | "torch_vtz" | egress.rs:66-67 |
| torch-vtz | EgressPolicy::builtin governed seeds (TUNE) | api.anthropic.com, api.openai.com, generativelanguage.googleapis.com; ordinary allowed | egress.rs:295-313 |
| torch-vtz | SeccompProfile::builtin_agent (TUNE) | 33 syscalls, default EPERM | seccomp.rs:98-142 |
| torch-vtz | cpu.max period (TUNE) | 100000 us | resource.rs:50-64 |
| torch-vtz | mandatory zone | 6 namespaces + /sys/fs/cgroup/torch-vtz-<zone_id> | lib.rs:116-135 |
| torch-enforce | DEFAULT_DECISION_BUDGET_MILLIS (TUNE) | 2000 | budget.rs:26-33 |
| torch-enforce | FILE_VERDICT_MAP_CAPACITY (TUNE) | 4096 | project.rs:131-134 |
| torch-enforce | NET_VERDICT_MAP_CAPACITY (TUNE) | 4096 | project.rs:313-315 |
| torch-enforce | TORCH_VTZ_SLICE_PREFIX (TUNE) | "torch-vtz-" | resolve.rs:19-25 |
| torch-enforce | LSM probe paths / cap bits | /sys/kernel/security/lsm, /proc/self/status, /sys/kernel/btf/vmlinux; CAP_BPF 39, CAP_MAC_ADMIN 33 | lsm.rs:27-35 |
| cdb-types (shared) | ResourceBound units (TUNE) | millicores, bytes, count, bytes/s, cost micro-units, bytes, req/s | crucible/crates/cdb-types/src/forge.rs:165-190 |

### 3.17 Doc / README claims contradicted by code

| Claim | Where | What the code does |
|---|---|---|
| "an applied bundle realizes nothing until enforcement is separately engaged" | torch/crates/torch-edge/src/bin/torchd.rs:1004-1005; torch/crates/torch-edge/src/policy.rs:12-13 | apply runs `nft -f -` in the host netns (section 3) |
| "The caller runs this inside the zone's net namespace" | torch/crates/torch-vtz/src/egress.rs:117-119 | the only production caller (torch-forge realize) runs it in torchd's netns |
| a tag the endpoint does not understand "refuses the bundle with ApplyError::UnknownRuleKind" | crucible/crates/cdb-types/src/forge.rs:389-391 | torch never reads rules; UnknownRuleKind is never produced |
| `AppendFailed`: "Appending the apply audit failed; the apply is aborted fail-closed" | crucible/crates/cdb-types/src/forge.rs:607-609 | never produced; an audit failure is surfaced after the apply (audit.rs:205-209) |
| endpoint types serializable "so last-known-good can be persisted across a restart (FG1.4)" | torch/crates/torch-forge/Cargo.toml:25-26 | nothing persists; restart = NoPolicy |
| anchor "the shape FD.5's installer provisioning writes at enrollment" | torch/crates/torch-edge/src/policy.rs:57-58 | no installer phase writes a policy anchor |
| sets "populated from the policy's host suffixes by the deployment's DNS resolver" | torch/crates/torch-vtz/src/egress.rs:371-372 | no resolver exists in the repo |
| torch-forge "Consumed by 3 crates: torch-edge, torch-wrap, torch-inspect" | torch/crates/torch-forge/README.md:255-257 | only torch-edge declares the dependency |
| torch-enforce consumed by torch-edge which "composes the ambient authorizer into the runtime" | torch/crates/torch-enforce/README.md:237-239 | torch-edge uses only resolve_pid / zone_of_pid / zone_of_cgroup |
| torch-vtz "Consumed by 8 crates" incl. torch-enforce and torch-sense | torch/crates/torch-vtz/README.md:181-185 | 6 crate manifests declare it (broker, edge, trustflow, wrap, inspect, forge); torch-enforce only mirrors the slice prefix (resolve.rs:19-25) |
| object_realize: only RegistryKey/Certificate are NotAvailable | torch/crates/torch-forge/src/object_realize.rs:15-16, 142-146 | DataStore is also NotAvailable (object_realize.rs:73) |
| verify order "signature, monotonic version, freshness lease, identity scope" | torch/crates/torch-forge/src/apply.rs:171-172 | code order is signature, lease, scope, version, realize |

### 3.18 UNVERIFIED items

- Live behavior of the nft attach on any real host (whether `nft` is installed, whether the exec'd `nft`
  keeps the ambient CAP_NET_ADMIN, AppArmor/SELinux interference). Not exercised; no host was inspected.
- nft semantics of re-feeding the same `table inet torch_vtz` definition without a flush (append vs
  replace), and therefore whether a later tighter bundle takes effect after a permissive one.
- iptables-restore behavior on the missing `torch_restricted`/`torch_governed` ipsets (expected failure)
  and its default flush-the-table semantics if it were accepted.
- Whether any live host has `TORCH_POLICY_ANCHOR` set (the repo installer does not set it; /etc was not read).
- Whether the lease unit mismatch has been observed live (every ForgeCentral bundle -> StaleLease is
  deterministic from the code cited in finding 2, but no live BUNDLE_REPORT was read).
- Whether torch-vtz / torch-forge compile for macOS or Windows (no cfg gating, not in xcheck.sh).
- How the torch gate is invoked on the box (root on host vs container), which decides whether the
  torch-vtz egress tests attach a default-deny table to a real host.

## 4. Enforcement: where it is OFF, what the code does anyway, and what would engage it

This section is the synthesis; the evidence is in 2.6, 3.3, 3.12-3.15 and 5.4.

### 4.1 OFF, plainly

| Layer | State | Evidence |
|---|---|---|
| The "AG.7" enforcement gate | Not a code switch. The string appears only in comments and docs; no env var, constant or Cargo feature enables enforcement anywhere in torch/crates or the installer | 3.15; torch/crates/torch-edge/src/bin/torchd.rs:1005; torch/crates/torch-edge/src/policy.rs:12; torch/crates/torch-edge/src/placement.rs:17; torch/deploy/torch-install/installer/lib/common.sh:88, 106 |
| Ambient kernel tier (BPF-LSM / ES / minifilter) | Cannot engage: `BpfLsmAuthorizer::attach()` returns Err even with every primitive present; the Linux realizer reports Refused even on Ok; torchd builds `TorchVtzRealization::new` (ambient None); `with_ambient` is test-only | torch/crates/torch-enforce/src/lsm.rs:126-136; torch/crates/torch-enforce/src/platform.rs:56-71; torch/crates/torch-forge/src/realize.rs:306-311; torchd.rs:1013-1016 |
| Decision path (deny on stale/absent policy, per-action verdicts) | Modeled, not wired: `enforcement_at` / `decide` / `audited_decide` have no production caller; no torch-edge code reads the applied posture except the lane's own `have` | 3.8, 3.15; torch/crates/torch-edge/src/policy.rs:156 |
| VTZ containment primitives (namespaces, seccomp, Landlock, cgroup limits) | No production caller; a "zone" on a host is a cgroup slice used for attribution | 3.12-3.13 |
| Discovery placement (torch-placed) | Moves a pid into `torch-vtz-<zone>.slice`, writes no controller limits; attribution only | torch/crates/torch-edge/src/placement.rs:295-335; 6.B.5 |
| torch-agent@ launcher | `Slice=torch-vtz-%i.slice` only; no resource or sandbox directives | torch/deploy/torch-install/installer/phases/50-systemd.sh:247-278; 7.3.4 |
| Tetragon sensor | No TracingPolicy has `matchActions` or any enforcement action; observe-only | 7.3.8 |
| Console containment / plan approval | Engine records with `enforcement_active: false`; no endpoint receiver | 5.3 rows 1, 12 |
| Capture / DLP (torch-wrap) | Library only; no fetch, no webhook, no production caller | 5.3 row 10; 6.G |

### 4.2 The one host-mutating path the code does have (policy apply)

If -- and only if -- the policy lane is provisioned AND a delivered bundle passes signature, lease, scope and
version checks, `TorchVtzRealization::realize` runs `EgressScaffold::attach_policy`, which pipes a
`table inet torch_vtz` output chain with `policy drop` into `nft -f -` (fallback `iptables-restore`) in
torchd's own network namespace (the host's, with ambient CAP_NET_ADMIN on the stock unit). Only
`allow_ordinary_internet` changes the outcome (trailing `accept` or not); the governed/restricted sets are
declared empty; attach runs before the Landlock probe; nothing ever removes the table
(torch/crates/torch-forge/src/realize.rs:325-377; torch/crates/torch-vtz/src/egress.rs:124-184, 374-425;
torch/deploy/torch-install/installer/phases/50-systemd.sh:63-64). Today the path is unreachable twice over:
the installer does not provision the lane (2.1) and Console bundles fail the lease check first (2.5). This
contradicts the in-code statement that "an applied bundle realizes nothing until enforcement is separately
engaged" (torchd.rs:1004-1005; policy.rs:12-13). UNVERIFIED live.

### 4.3 What would engage enforcement (from the code, not a plan)

- Cooperative egress tier (exists, see 4.2): set `TORCH_POLICY_ANCHOR` + `TORCH_POLICY_ENDPOINT_CN` (for
  example via a torchd drop-in, since torchd.env is rewritten by the installer), and fix the lease unit
  mismatch on one side. Nothing else is needed for the nft attach to run; whether it SHOULD run in the host
  namespace is an open design question (8.2).
- Ambient kernel tier: new code only -- a BPF-LSM program + loader, handle retention in
  `LinuxAmbientAuthorizer::realize`, a production `impl AmbientEnforcement` bridging torch-enforce into
  torch-forge, torchd switching to `TorchVtzRealization::with_ambient(...)`, and unit/host changes
  (`lsm=bpf`, BTF, CAP_BPF + CAP_MAC_ADMIN beyond today's bounding set) (3.15).
- Decision-time enforcement (deny when stale/absent, per-action verdicts): a production caller of
  `EndpointPolicyApplier::enforcement_at` / `decide` wired to a hook -- none exists (3.8).
- Authored rules (objects, actions, protocols, ports) and schedules/geo: the endpoint does not read `rules`
  and the bundle does not carry schedule/geo/tags; both need new code on both sides (3.10).

### 4.4 What the endpoint emits instead

The stderr `torchd: forge apply audit ...` line per delivered bundle (never shipped), the `BUNDLE_REPORT`
(applied / rejected + reason, no realized-tier evidence), and ordinary sensing telemetry. No enforcement
record, counter, or ambient fact is emitted in production (3.7; 5.5 rows 11, 15).

## 5. Console actions that reach the endpoint, and what Torch ships back

Revisions read (read-only): torch `d8f03ca` (HEAD); crucible `d0ace55a` (HEAD) -- note torch compiles against
crucible rev `b5e301ff` for `cdb-wire`/`cdb-types` (torch/crates/torch-core/Cargo.toml:28,
torch/crates/torch-edge/Cargo.toml:51), so wire types quoted "at the pinned rev" were read with
`git show b5e301ff:<path>`; forgecentral `d3ea588`. Engine and Console reading was kept light (other agents
own those censuses); every engine/Console claim here is cited and scoped to what touches Torch.

### Index (this part)

1. Bottom line
2. The torchd inbound surface (the evidence base for Part 2)
3. Part 2 table -- each Console action and whether any endpoint path exists
4. Enforcement: what is OFF, what the code actually does, what would engage it
5. Part 5 table -- everything Torch ships to the engine
6. Where torch-originated data surfaces in the Console
7. What the Console cannot see (gaps)
8. UNVERIFIED items and open questions

Counts: 16 rows in the Part 2 table (15 Console actions/action groups + 1 enrollment note); 17 rows in the
Part 5 table (12 shipped streams + 5 not-shipped / unwired surfaces); 8 UNVERIFIED items.

### 5.1 Bottom line

- Exactly ONE Console action can reach a host: `policies.distribute` (Distribute a zone's signed policy
  bundle). It reaches torchd only by PULL -- the torchd policy lane polls `BUNDLE_FETCH` -- and only if the
  operator has hand-provisioned `TORCH_POLICY_ANCHOR` + `TORCH_POLICY_ENDPOINT_CN` in torchd's env; the torch
  installer never writes them (no match for `TORCH_POLICY` anywhere under torch/deploy; the only torch
  mention outside torchd.rs is torch/README.md:189 and torch/crates/torch-edge/src/policy.rs:10). So on a
  stock install NO Console action reaches the host.
- Every other Console action (isolate/containment, reassign zone, VTZ membership, remediation, SOC plan
  approve/modify, cognition run, Settings commits, all directory/policy CRUD) is engine-only. There is no
  command channel, push stream, subscription, or listener in torchd that the engine could use
  (Section 2).
- NEW FINDING (code-verified, not live-verified): a Console-distributed bundle would be REFUSED on-device as
  `StaleLease` every time. The Console stamps the bundle lease in unix MILLISECONDS
  (forgecentral/apps/bff/src/engine/distribute.ts:34, :95, :148; passed through unchanged by the signer,
  forgecentral/sidecar/src/signing.rs:247) while torchd's apply clock is unix NANOSECONDS
  (torch/crates/torch-edge/src/bin/torchd.rs:335-342 `now_nanos`, :1723-1724 `torch_core_hlc`, passed to the
  lane at :1042-1047) and the applier refuses when `now >= bundle.lease.not_after`
  (torch/crates/torch-forge/src/apply.rs:193-194). `Hlc` is an opaque `u64` with no unit
  (crucible@b5e301ff crates/cdb-types/src/primitives.rs:151-159). The torch tests use abstract clocks
  (`Hlc(100)`/`Hlc(150)`/`Hlc(200)`, torch/crates/torch-edge/src/policy.rs:345, :372), so the gate never
  exercised the mismatch. Because the lease check (step 2) precedes realization (step 4,
  torch/crates/torch-forge/src/apply.rs:224-236), this also means the nftables attach described in
  Section 4 is currently unreachable by a Console-made bundle.
- Torch ships 12 distinct streams (Section 5); none of them carries torchd lane state, health, version
  (except the LUG `collector_version` string), queue depth, or policy-lane posture beyond the per-bundle
  `BUNDLE_REPORT`. Health lives only in the host journal.

### 5.2 The torchd inbound surface (evidence base)

The seam client is strictly request/reply, one request in flight per connection: every data-plane call
writes one `QUERY_SUBMIT` frame and reads exactly one `CommitStatus` reply
(torch/crates/torch-core/src/seam.rs:812-847); OTLP writes one `OtlpExport` and reads one ack
(torch/crates/torch-core/src/seam.rs:857-888, :1087-1100). The multiplexer that could carry server-initiated
streams DROPS any frame for an unknown stream id (torch/crates/torch-core/src/mux.rs:267-273, client ids odd
so they "never collide with a server-initiated even id" :284) and is not used by any torch crate (its only
reference is the re-export torch/crates/torch-core/src/lib.rs:60). The frame types torch code references
include no subscribe/stream/push frame (grep of `FrameType::` across torch/crates: QuerySubmit, QueryResult,
OtlpExport, OtlpAck, CommitStatus, Agent*, Cognition*, Enroll*, Txn*, Cursor*, SecuritySearch*, Finding*,
Ping/Pong, Hello/Negotiate/Authenticate, Error). The SDK read path treats every operator-console reply
(`Contained`, `VtzMutated`, `PolicyMutated`, `PolicyEffective`, ...) as a protocol error, "not issued by the
SDK client" (torch/crates/torch-core/src/query.rs:96-126). The only listener in torch is the root helper's
local Unix socket, mode 0660 (torch/crates/torch-edge/src/placement.rs:689-703), whose client is torchd
itself.

Every seam request torchd sends, and what it does with the reply:

| # | Request (wire verb) | Sent by (torch) | Reply read | What torchd does with the reply | Evidence |
|---|---|---|---|---|---|
| 1 | `OtlpExport` frame (Metrics / Logs) | `SeamSink` over `SeamOtlpChannel` for the security drainer, AIOps, box-flow and govern lanes | `OtlpAck` or `Error` | Success/failure only. `Error` = terminal refusal of that export; any other frame = desync, reconnect + retry | torch/crates/torch-edge/src/sink.rs:111; torch/crates/torch-core/src/seam.rs:857-888, :1087-1100; torch/crates/torch-edge/src/bin/torchd.rs:870, :886, :900, :913 |
| 2 | `BUNDLE_FETCH` (`WireRequest::BundleFetch{request_id, have}`) | policy lane `refresh_policy_once` | `BundleDelivered{version, bundle}` | ACTED ON: decoded `SignedPolicyBundle` is verified and applied on-device (Section 3 row 5) -- the only reply that changes endpoint state | torch/crates/torch-core/src/forge_fetch.rs:30-69; torch/crates/torch-edge/src/policy.rs:150-192 |
| 3 | `BUNDLE_REPORT` (`WireRequest::BundleReport{vtz_id, version, rejected_reason}`) | policy lane, after a delivered bundle | `BundleReported` | Ack only; a failed report is counted `policy.report_failed` and never undoes the apply | torch/crates/torch-core/src/forge_fetch.rs:71-110; torch/crates/torch-edge/src/policy.rs:170-189 |
| 4 | `REGISTER_AGENT_REPORT_KEY` | `ship_construction_reports` | `AgentReportKeyRegistered` | Ack; on failure the whole report pass is skipped (logged) | torch/crates/torch-core/src/seam.rs:692-700; torch/crates/torch-edge/src/bin/torchd.rs:385-388 |
| 5 | `INGEST_CONSTRUCTION_REPORT` | `ship_construction_reports` | `ConstructionReportIngested{report_id}` | Report id logged to stderr | torch/crates/torch-core/src/seam.rs:711-726; torch/crates/torch-edge/src/bin/torchd.rs:389-410 |
| 6 | `LUG_SNAPSHOT` | identity-inventory lane | `WireLugSnapshotApplied` | Counts logged (nodes/edges/closed/replay) | torch/crates/torch-core/src/seam.rs:775-782; torch/crates/torch-edge/src/lug_uplink.rs:108; torch/crates/torch-edge/src/bin/torchd.rs:553-557 |
| 7 | `LUG_EVENT` | identity-event lane | `WireLugEventsApplied` | Counts logged; pending batch cleared | torch/crates/torch-core/src/seam.rs:790-797; torch/crates/torch-edge/src/lug_uplink.rs:118; torch/crates/torch-edge/src/bin/torchd.rs:706-717 |

Not sent by torchd: `submit_security_search` / `fetch_finding` / plane tunnels / transactions / heartbeat
(grep for calls outside torch/crates/torch-core/src/seam.rs finds none in torch-edge; the plane tunnels are
used only by torch-broker, which is linked only into the `validation-capstone` feature of torch-enroll,
torch/crates/torch-enroll/Cargo.toml:18-25, and the installer builds without that feature,
torch/deploy/torch-install/installer/phases/20-build.sh:32-34).

Only other engine-to-endpoint data flow: torch-enroll (operator-run, not Console-initiated) reads the
engine's `WireIdentityOffer` (the bound FQDN it must use as CSR CN) and the `EnrollResult` leaf certificate,
and persists the leaf as `device.pem` (torch/crates/torch-enroll/src/lib.rs:273-291, :307-325, :211-222). In a
shipped build enrollment ends at `Connected` and drops the session (torch/crates/torch-enroll/src/lib.rs:352,
:366).

Verdict on the "only inbound path is the BUNDLE_FETCH reply" claim: CONFIRMED for torchd. Nuance: at
enrollment time torch-enroll also consumes engine-supplied identity (FQDN offer + issued leaf).

### 5.3 Part 2 table -- Console action -> endpoint path

| # | Console action (manual id) | Engine verb it uses | What the engine does | Endpoint path? | Evidence |
|---|---|---|---|---|---|
| 1 | Isolate / containment (`entity.isolate`) | `CONTAIN` (`WireContain{operator, request: ContainmentRequest}`) | Records an audited, operator-attributed Quarantine/Deny disposition (disposition + current pointer + command-id marker) with `enforcement_active: false`; reply summary "... recorded for ...; enforcement off"; readable back via the `agent_containment` CrucibleQL relation | NO endpoint path exists. torch never requests or decodes a containment disposition (no match for `ContainmentDisposition`/`ContainmentRequest`/`WireContain` in torch/crates) and treats a `Contained` reply as a protocol error | forgecentral/apps/bff/src/engine/isolate.ts:1-7, :42-60; forgecentral/packages/bindings/src/manifest.ts:101-112; crucible/crates/cdb-wire/src/query.rs:71-100; crucible/crates/cdb-server/src/handler.rs:2319-2352, :2354-2373, :8648; crucible/crates/cdb-cyber/src/containment_store.rs:217-235; torch/crates/torch-core/src/query.rs:96-102 |
| 2 | Reassign zone (`entity.reassignZone`) | none -- binding status `pending` ("Forge VTZ membership-change command") | nothing | NO endpoint path exists (no engine verb; no torch receiver) | forgecentral/packages/bindings/src/manifest.ts:114-125 |
| 3 | Set VTZ membership (`vtz.setMembership`) | none -- binding `pending` on crdb `VtzSetMembership` | nothing (no such verb in the engine `WireRequest` enum at HEAD, crucible/crates/cdb-wire/src/query.rs `pub enum WireRequest`) | NO endpoint path exists. The only way an endpoint learns it belongs to a zone is the member list inside a distributed bundle's `IdentityScope` (row 5), which the Console fills from the operator's chosen endpoint FQDNs at distribute time; the drawer shows zones as `pending` | forgecentral/packages/bindings/src/manifest.ts:378-389; forgecentral/apps/bff/src/engine/distribute.ts:89-94; forgecentral/apps/bff/src/engine/entity-detail.ts:407 |
| 4 | Remediation (`entity.remediation`) | none -- binding `pending` on "IP-CONSOLE-07 AIOps Workflows surface" | nothing | NO endpoint path exists | forgecentral/packages/bindings/src/manifest.ts:127-138 |
| 5 | Distribute policy (`policies.distribute`) | `BUNDLE_COMMIT` (Console) then `BUNDLE_FETCH`/`BUNDLE_REPORT` (torchd) | Stores the exact signed bytes; serves the newest bundle whose scope names the VERIFIED peer's bound FQDN (`device_cn`), `UpToDate` when `have` is current, `Denied` when not in scope | YES -- the only one, pull-only, and only when the policy lane is provisioned. Trace below this table | see trace |
| 6 | Policy enforcement status (`policies.enforcement`) | none -- binding `pending` (surface `torch`, "IP-TORCH-POLICY-ENFORCE ... AG.7-OFF") | nothing | NO path: torch exposes no enforcement-status read and ships none | forgecentral/packages/bindings/src/manifest.ts:667-681 |
| 7 | Policy convergence (`policies.convergence`) | `BUNDLE_CONVERGENCE` | Projects each scope member as `applied` / `rejected` (+ `ApplyError` name) / `silent` from torchd's `BUNDLE_REPORT`s | Read-back only (row 13 of Section 5) | forgecentral/packages/bindings/src/manifest.ts:660-666; crucible/crates/cdb-server/src/handler.rs:6934-6982 |
| 8 | Agent governance changes (declared manifest, discovery policy, transcript tap, anchor cadence) | none | n/a | NO endpoint path exists. All are local: env keys + files read once at torchd start (`TORCH_AGENT_GOVERN*`, `TORCH_AGENT_DISCOVER*`, `TORCH_AGENT_TRANSCRIPT_TAP`); no seam request fetches any of them | torch/crates/torch-edge/src/bin/torchd.rs:1131-1165, :1174-1187, :1192-1195 |
| 9 | govern-attest grant | `cdb-actl agent-grant-provision --grant-authority govern-attest` (engine ADMIN plane, run by the torch installer on a co-resident box, or crdb `65-seed` for a remote node) | Grants the governor's AIG identity (sha256 of its EK cert DER) the authority the engine checks before accepting a report ABOUT another agent | NO endpoint path: nothing is pushed to torch; it only changes whether the engine ACCEPTS torchd's `INGEST_CONSTRUCTION_REPORT` | torch/deploy/torch-install/installer/phases/55-govern-attest.sh:1-18, :82-87; crucible/crates/cdb-server/src/handler.rs:8706-8716, :8774-8780 |
| 10 | Capture / DLP policy (tiers, dictionary, entropy) | none | n/a | NO endpoint path exists. torch-wrap has a signed `CapturePolicyBundle`/`CapturePolicyStore` library "from a fetch or a change webhook", but it is instantiated only in `#[cfg(test)]` code and torchd uses torch-wrap only for GCI minting; no fetch or webhook exists | torch/crates/torch-wrap/src/policy.rs:1-11, :22-46, :119-145 (tests from :222); torch/crates/torch-wrap/src/browser.rs:289 and sdk.rs:233 (both after `#[cfg(test)]` at :250 / :162) |
| 11 | Grants of any kind (Otlp plane grant, `Delegation`, `Cognition`, AIG authorities) | engine admin / enrollment | Admission decisions on the engine side (e.g. an `OtlpExport` from a peer without the Otlp plane grant is refused) | NO endpoint path: torch never reads a grant; it only experiences the engine's accept/refuse | crucible/crates/cdb-server/src/reactor.rs:530-533, :1440-1441; torch/crates/torch-core/src/seam.rs:849-856 |
| 12 | SOC plan approve / modify (`soc.plan.approve`, `soc.plan.modify`) | `SOC_PLAN_APPROVE` / `SOC_PLAN_MODIFY` | Records the approval; "An approved containment step is recorded `refused` ... nothing in the environment changed"; `enforcement_active: false` | NO endpoint path exists | forgecentral/packages/bindings/src/manifest.ts:858-878; crucible/crates/cdb-server/src/handler.rs:3400-3411, :3580-3617 |
| 13 | SOC cognition run (`soc.cognition.run`) | `SOC_COGNITION_RUN` | Engine-side cognition | NO endpoint path exists (torch has no receiver) | forgecentral/packages/bindings/src/manifest.ts:850-857 |
| 14 | Settings commits that touch Torch data (`lug_exposure`, `disabled_decoder_families`, `source_format_map`) | `SETTINGS_COMMIT` | Changes engine acceptance/decoding of torch's shipments (`lug_exposure` is the fail-closed gate on `LUG_SNAPSHOT`) | NO endpoint path. Notably `lug_exposure.snapshot_cadence_hours` is documented as "committed intent the torch collector honors" but torch never reads it -- torchd's cadence is its own env `TORCH_IDENTITY_CADENCE_HOURS` (default 24) | crucible/crates/cdb-wire/src/query.rs `WireSectionPatch` fields; crucible/crates/cdb-server/src/handler.rs:4475-4484, :4601-4614, :10044-10055; crucible/crates/cdb-admin/src/config_document.rs:278-284; torch/crates/torch-edge/src/bin/torchd.rs:445-458 (no `snapshot_cadence` in torch/crates) |
| 15 | All other Console commands (VTZ create/edit/rescope/delete, objects, users/groups, IdAM, policy create/edit/publish/delete, SOC case acts/disposition) | their own engine verbs | engine records | NO direct endpoint path; a VTZ/policy change reaches a host only if the operator later distributes a new bundle (row 5) | torch/crates/torch-core/src/query.rs:108-126 (these replies are protocol errors to torch) |
| 16 | (not a Console action) enrollment | bootstrap `EnrollIdentityOffer` / `EnrollSubmit` | engine binds the FQDN, issues the leaf (its lifetime is the engine-supplied `not_after`, torch/crates/torch-core/src/enroll.rs:70-76), records an AIG Agent node | Engine-to-endpoint data at enrollment only, run by the operator via torch-enroll | Section 2 |

#### Row 5 trace: `policies.distribute` end to end

1. Console: `POST /api/vtz/<id>/distribute` composes the flat `EndpointPolicy` from the zone's effective
   postures plus the zone's effective published rules (`rules` + `contributors`), sets
   `scope.members = [{endpoint:{cn, sans:[cn]}, agent:null}]` from the operator-chosen FQDNs, sets the lease to
   `{issued_at: nowMs, not_after: nowMs + 24h}` in milliseconds, has the sidecar sign it (the endpoint verifies against an ML-DSA-87 key map, torch/crates/torch-edge/src/policy.rs:58-83), and
   commits the signed bytes to the engine (`BUNDLE_COMMIT`)
   (forgecentral/apps/bff/src/server.ts:938-951; forgecentral/apps/bff/src/engine/distribute.ts:1-11, :34, :71-97,
   :138-150).
2. Engine: stores the bytes; on `BUNDLE_FETCH` serves the newest bundle whose scope names the peer's
   admission-resolved `device_cn`; refuses `Denied` when not in scope (non-oracle)
   (crucible/crates/cdb-server/src/handler.rs:6800-6863).
3. torchd policy lane (present only if `TORCH_POLICY_ANCHOR` is set; then `TORCH_POLICY_ENDPOINT_CN` is
   mandatory; cadence `TORCH_POLICY_FETCH_SECS`, default 300 s)
   (torch/crates/torch-edge/src/bin/torchd.rs:199-219, :1000-1055; torch/crates/torch-edge/src/policy.rs:35).
   The loop SLEEPS one cadence before the first fetch, reconnects a fresh seam each tick, and counts
   `policy.connect_failed` / `policy.fetch_failed` / `policy.apply_failed` without ever ending
   (torch/crates/torch-edge/src/policy.rs:224-263). `have` = the version in the in-memory posture
   (torch/crates/torch-edge/src/policy.rs:156); the posture is held only in memory
   (torch/crates/torch-forge/src/apply.rs:56-61), so a torchd restart refetches from `have = None`.
4. Verify-and-apply, in order: anchor signature -> `SignatureInvalid`; lease `now >= not_after` ->
   `StaleLease`; scope includes this endpoint's `CertIdentity{cn, sans:[cn]}` -> `ScopeMismatch`; version
   older -> `DowngradeRejected`, equal -> idempotent OK, newer -> realize then swap, realize failure ->
   `VtzCannotRealize` and last-known-good kept (torch/crates/torch-forge/src/apply.rs:184-241;
   torch/crates/torch-edge/src/bin/torchd.rs:1009-1017). As shown in Section 1, step 2 refuses every
   Console-made bundle today (ms lease vs ns clock).
5. What an applied bundle realizes on the host: `TorchVtzRealization::new` with NO ambient tier
   (torch/crates/torch-edge/src/bin/torchd.rs:1013-1016). Its cooperative tier calls
   `EgressScaffold::attach_policy`, which runs `nft -f -` (fallback `iptables-restore`) in the CURRENT
   network namespace, i.e. torchd's host namespace (torch/crates/torch-forge/src/realize.rs:325-340;
   torch/crates/torch-vtz/src/egress.rs:124-153, :170-184; the ruleset's output chain is `policy drop`,
   :374-399), then checks Landlock support for deny-unwrapped-exec and that the resource bound is
   representable. The bundle's authored `rules` (objects, actions, ports, schedules, geo) are carried and
   covered by the signature but not referenced by the applier or realization (no `bundle.rules` reference in
   torch/crates/torch-forge or torch-edge; `AppliedPolicySet` is built from `bundle.policy` only,
   torch/crates/torch-forge/src/apply.rs:228-234). The forge/vtz census owns the detail of this step; it is
   referenced here, not re-derived.
6. Audit + report: exactly one `ForgeAudit::Apply` fact per delivered bundle, written to stderr only
   (torch/crates/torch-forge/src/audit.rs:189-211; torch/crates/torch-edge/src/bin/torchd.rs:1634-1641), then
   `BUNDLE_REPORT{vtz_id = bundle.scope.vtz, version, rejected_reason = ApplyError name | None}`; `UpToDate`
   reports nothing (torch/crates/torch-edge/src/policy.rs:164-216).
7. Engine: `bundle_report` keys the outcome to the peer's `device_cn` (never a payload field); an unknown
   reason name is refused `Framing` (crucible/crates/cdb-server/src/handler.rs:6896-6932).
8. Console: `policies.convergence` shows per member `applied` / `rejected` (+ reason) / `silent`
   (crucible/crates/cdb-server/src/handler.rs:6934-6982). Predicted today, once the lane is provisioned:
   `rejected` with `StaleLease`, re-sent every cadence (posture never advances, so `have` stays `None`).

### 5.4 Enforcement: what is OFF, what the code does, what would engage it

- No Console action or engine verb engages enforcement: CONTAIN and SOC plan approval both return
  `enforcement_active: false` by construction (crucible/crates/cdb-server/src/handler.rs:2335, :2365,
  :3406-3409).
- torchd composes no ambient (kernel-authorization / BPF-LSM) tier: `TorchVtzRealization::with_ambient` and
  every `AmbientEnforcement` implementation appear only in test code
  (torch/crates/torch-forge/src/realize.rs:316 definition; uses at :458, :691 under `#[cfg(test)]` at :381).
- No torchd code consults the applied posture to decide an action (no `audited_decide`, `decide` or
  `enforcement_at` call in torch/crates/torch-edge); the applied set is posture evidence only.
- Discovery placement moves a pid into `torch-vtz-<zone>.slice` for attribution only, "never enforcement
  (AG.7 stays off)" (torch/crates/torch-edge/src/placement.rs:6-17).
- There is no AG.7 switch in code: no `TORCH_ENFORCE*` env key exists (the full TORCH_* list in torch/crates
  has none) and "AG.7" appears only in comments.
- CONTRADICTION to flag (referenced from the forge/vtz census, not re-derived): the comments say an applied
  bundle "realizes nothing until enforcement is separately engaged" (torch/crates/torch-edge/src/policy.rs:12-13;
  torch/crates/torch-edge/src/bin/torchd.rs:1000-1005), but the realize path shells out to `nft` in torchd's
  own (host) network namespace, and the installer grants torchd `AmbientCapabilities=CAP_DAC_READ_SEARCH
  CAP_NET_ADMIN` with no `PrivateNetwork` (torch/deploy/torch-install/installer/phases/50-systemd.sh:31-69,
  caps at :63-64). If the lease mismatch were fixed and an anchor provisioned, a newer verified bundle would
  attempt to install `table inet torch_vtz` with an output-chain `policy drop` in the host namespace.
  UNVERIFIED on a live box (lane is off).
- What would engage host enforcement, from the code: (1) provision `TORCH_POLICY_ANCHOR` (the sidecar's
  `distribution-anchor.json`, forgecentral/sidecar/deploy/provision-sidecar.sh:126,
  forgecentral/sidecar/deploy/README.md:96-100) and `TORCH_POLICY_ENDPOINT_CN`; (2) fix the lease unit
  mismatch; then the cooperative nft attach runs as above; (3) a load-bearing ambient tier needs a production
  `AmbientEnforcement` implementation passed via `with_ambient` -- none exists in torch today.

### 5.5 Part 5 table -- everything Torch ships to the engine

All OTLP streams are attributed by the engine to the verified session peer's tenant; no tenant travels in the
payload (torch/crates/torch-core/src/seam.rs:849-856). The engine admits an `OtlpExport` only from a peer
holding the Otlp plane grant, charges a per-connection quota, and verifies `torch-obs` bodies against the
connection's enrolled leaf key before storage (crucible/crates/cdb-server/src/reactor.rs:530-533,
:1440-1470).

| # | Stream | Enabled by | Torch builder | Seam op / DTO / channel + tags | Cadence | Key / subject | Engine handler (where easy) | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | AIOps host metrics | always on | `run_aiops_lane` + `HostMetricsCollector` + `AiopsBatcher` | `OtlpExport`, `OtlpSignal::Metrics`, OTLP gauges `system.cpu.usage.percent`, `system.memory.{total,used,available}.bytes`, `system.disk.{total,available}.bytes`, `system.net.{rx,tx}.bytes`; no `cdb.source` tag (routed to TimeSeries) | every `TORCH_AIOPS_INTERVAL_SECS` (default 30 s); delivery failure skipped, never fatal | peer tenant | engine OTLP ingest (TimeSeries) | torch/crates/torch-edge/src/bin/torchd.rs:77, :885-894; torch/crates/torch-edge/src/edge.rs:469-500; torch/crates/torch-sense/src/route.rs:109-116; torch/crates/torch-sense/src/metrics.rs:87-190; torch/crates/torch-sense/src/encode.rs:353-357 |
| 2 | Tetragon security events | `TORCH_TETRAGON_GRPC` (Linux, takes precedence) or `TORCH_TETRAGON_SOURCE` (FIFO) | `run_tetragon_security_lane_grpc` / `_reopening` -> non-lossy queue (`TORCH_SPILL_DIR`, `TORCH_QUEUE_CAPACITY`) -> `run_drainer` -> `SeamSink` | `OtlpExport`, `OtlpSignal::Logs`, resource `cdb.source=tetragon`, body = the raw Tetragon JSON line verbatim | event-driven; exec repeats folded by the dedup window; loopback network events dropped on `TORCH_NODE_ROLE=standard`; queue drained up to 15 s at shutdown, remainder spilled and sent next start | peer tenant | tetragon decoder family (graph/observations/detections) -- engine census | torch/crates/torch-edge/src/bin/torchd.rs:817-883, :1093-1106; torch/crates/torch-edge/src/edge.rs:101-104, :123-173; torch/crates/torch-sense/src/encode.rs:39, :190-211 |
| 3 | Box flow (whole-host connectivity) | always on | `run_flow_export_lane` reading `/proc/net/nf_conntrack` -> NetFlow v5 | `OtlpExport`, `OtlpSignal::Logs`, `cdb.source=torch-flow`, body = NetFlow v5 datagram bytes | every `TORCH_FLOW_EXPORT_INTERVAL_SECS` (default 30 s); unreadable conntrack skips the tick | unattributed device flows, peer tenant | `FLOW_SOURCE` classification -> flow collector | torch/crates/torch-edge/src/bin/torchd.rs:896-907; torch/crates/torch-edge/src/edge.rs:530-588; torch/crates/torch-sense/src/encode.rs:52, :139-160; crucible/crates/cdb-ingest/src/obs_ingest.rs:105-107; needs the unit caps at torch/deploy/torch-install/installer/phases/50-systemd.sh:57-64 |
| 4 | Governed agent events | `TORCH_AGENT_GOVERN=1` (requires `TORCH_IDENTITY=tpm`) | `GovernLane` (governor + chaining `Collector` + process summarizer + storm gate) | `OtlpExport`, `Logs`, `cdb.source=torch-obs`, `cdb.obs.kind=event`, body = canonical CBOR of a GCI-attributed `ObservabilityEvent` (process Open/Active/Persistent/Close summaries, network/file, `collector.gap`, `ChurnStorm`, tap payloads) | event-driven | the agent's GCI + `AgentRef` (label, install path, report id); box-level facts use a node-sentinel GCI | `cdb-ingest` `obs_ingest` classify -> `obs_verify` | torch/crates/torch-edge/src/bin/torchd.rs:909-996, :1269-1338; torch/crates/torch-edge/src/agent_govern.rs:1654-1719, :1890-1901; torch/crates/torch-sense/src/encode.rs:45, :60, :106-130; crucible/crates/cdb-ingest/src/obs_ingest.rs:1-18 |
| 5 | Governed chain anchors | same as 4 | `GovernLane::anchor_and_ship`, signed by the enrolled in-TPM key (`KeystoreAnchorSigner`, id `ztp-enrolled`) | `OtlpExport`, `Logs`, `cdb.source=torch-obs`, `cdb.obs.kind=anchor`, body = CBOR `AnchorWire{anchor, signature, signing_key_id, signature_algorithm}` | every `TORCH_AGENT_GOVERN_ANCHOR_SECS` (default 60 s); a quiet window ships nothing | seals the preceding chain | `obs_verify` (verified against the connection's enrolled leaf key) | torch/crates/torch-edge/src/bin/torchd.rs:913-920, :1112; torch/crates/torch-edge/src/agent_govern.rs:1643-1648, :1908-1941 |
| 6 | Transcript tool lane | `TORCH_AGENT_TRANSCRIPT_TAP=1` nested under `TORCH_AGENT_GOVERN=1` | `TranscriptTap` via the root helper's transcript reads | rides stream 4: typed payloads `mcp.tool_call`, `mcp.tool_result`, `llm.request`, `llm.response`, content by SHA-512 reference only | poll every 2 s; channel 4096, overflow dropped + counted | the governed agent's GCI | as 4 | torch/crates/torch-edge/src/bin/torchd.rs:929-956, :1188-1191; torch/crates/torch-edge/src/transcript_tap.rs:1-22, :60, :67 |
| 7 | Construction reports, declared agents | `TORCH_AGENT_GOVERN=1` with a non-empty manifest | `onboard_agent` (torch-inspect Cargo/Npm/Pip adapters) signed with the ML-DSA-87 govern seed (`TORCH_AGENT_GOVERN_KEY`, key id `torchd-govern-report`) | `REGISTER_AGENT_REPORT_KEY` once per pass, then `INGEST_CONSTRUCTION_REPORT{report, report_id, envelope, subject}` | once at torchd start; best-effort | subject `AgentGci(zone_id)` from the manifest | `register_agent_report_key`, `ingest_construction_report` (subject != governor requires govern-attest) | torch/crates/torch-edge/src/bin/torchd.rs:373-410, :741, :1227-1338; crucible/crates/cdb-server/src/handler.rs:8652-8700, :8718-8811 |
| 8 | Construction reports, discovered agents | `TORCH_AGENT_DISCOVER=1` + config `enabled` (nested under govern) | discovery sweep -> `run_discovery_report_shipper` (same governor key) | same two verbs | continuous, batched per sweep | subject `AgentGci(zone_id_of(gci))` | as 7 | torch/crates/torch-edge/src/bin/torchd.rs:759-789, :1418-1427, :1601-1603; torch/crates/torch-edge/src/agent_govern.rs:955-964 |
| 9 | Identity inventory snapshot (LUG) | `TORCH_IDENTITY_INVENTORY=1` + readable `/etc/machine-id` | `run_identity_inventory_lane` -> `LugShipper` | `LUG_SNAPSHOT` (`WireLugSnapshot`), carries `collector_version = "torchd/<version>"` | full sweep every `TORCH_IDENTITY_CADENCE_HOURS` (default 24 h); early sweep when `/etc/passwd`, `/etc/group`, `/etc/sudoers`, `/etc/subuid`, `/etc/subgid` change (60 s poll, 300 s hold-down) | namespace `posix_host:<machine-id>`; device scope from the session, never the frame | `lug_snapshot` (gated by committed `lug_exposure`) | torch/crates/torch-edge/src/bin/torchd.rs:415-462, :513-592; torch/crates/torch-edge/src/lug_uplink.rs:1-41; torch/crates/torch-core/src/seam.rs:765-782; crucible/crates/cdb-server/src/handler.rs:10044-10056 |
| 10 | Identity events (LUG) | same as 9 | `run_identity_event_lane`: sshd/pam lines from the auth log read by the root helper, parsed to `IdentityEvent` | `LUG_EVENT` (`WireLugEvents`), dedup by `raw_event_hash` | flush every 10 s or at 512 events; deltas only (cursor starts at log end) | namespace as 9 | `lug_events` | torch/crates/torch-edge/src/bin/torchd.rs:597-736; torch/crates/torch-core/src/seam.rs:786-797; crucible/crates/cdb-server/src/handler.rs:10196 |
| 11 | Policy convergence | policy lane on (`TORCH_POLICY_ANCHOR`) | `refresh_policy_once` | `BUNDLE_REPORT{vtz_id, version, rejected_reason}` | once per delivered bundle; `UpToDate` sends nothing; a failed report is not re-sent until the next delivery | keyed server-side to the peer's `device_cn` | `bundle_report` -> `bundle_convergence` | torch/crates/torch-edge/src/policy.rs:164-216; crucible/crates/cdb-server/src/handler.rs:6896-6982 |
| 12 | Enrollment / device identity | operator runs torch-enroll (installer enroll phase) | `enroll_and_connect` | bootstrap frames `EnrollIdentityOffer` (token + TPM attestation) then `EnrollSubmit` (token + CSR signed in the TPM + attestation) | once per enrollment; the leaf lifetime is the engine-supplied `not_after` (torch/crates/torch-core/src/enroll.rs:70-76); re-enrollment cadence is the installer census's topic | CN = engine-bound FQDN; DNS SAN = FQDN; URI SAN = operator SPIFFE provenance | engine records an AIG Agent node keyed by the EK anchor (else the subject) | torch/crates/torch-enroll/src/lib.rs:231-366; torch/crates/torch-core/src/enroll.rs:114-217, :222-292; crucible/crates/cdb-sed-graph/src/lib.rs:246-270 |
| 13 | Discovery detections + evidence | discovery on | sweep `on_swept` | NOT SHIPPED: stderr line "discovery detected agent ... evidence=[...]" only | per sweep | n/a | n/a | torch/crates/torch-edge/src/bin/torchd.rs:1589-1604 |
| 14 | Lane state, health, failures, queue depth | always | `eprintln!` status lines; `torch.obs` failure events (`policy.fetch_failed`, `security_lane.stalled`, ...) | NOT SHIPPED: stderr/journal only; no heartbeat is sent by any torchd lane | n/a | n/a | n/a | torch/crates/torch-types/src/obs.rs:1-40, :65-76; torch/crates/torch-edge/src/bin/torchd.rs:1782; torch/crates/torch-edge/src/edge.rs:309-331 |
| 15 | Policy apply audit fact (FG1.10) | policy lane on | `StderrForgeAudit` | NOT SHIPPED: stderr only (the durable record is stream 11) | per delivered bundle | n/a | n/a | torch/crates/torch-edge/src/bin/torchd.rs:1629-1641 |
| 16 | Agent tool-call match events (`cdb.match.*` Traces), skill-drift, Collector `Uplink` | none | `TelemetrySender`, `detect_skill_drift`, `Uplink` exist in torch-edge | NOT COMPOSED into torchd: each is only re-exported (torch/crates/torch-edge/src/lib.rs:57, :62-63) with no caller outside its own module | n/a | n/a | n/a | torch/crates/torch-edge/src/telemetry.rs:1-15; torch/crates/torch-edge/src/uplink.rs:1-18 |
| 17 | torch-shim / torch-trustflow / torch-scenario | n/a | these binaries/libraries | NO seam use at all (no `torch_core`/`SeamClient`/`send_otlp` reference); the shim is a transparent stdio interposer until a policy source is wired | n/a | n/a | n/a | torch/crates/torch-shim/src/main.rs:1-12 |

### 5.6 Where torch-originated data surfaces in the Console

| Console binding (op) | Status | Fed by Torch stream | Evidence |
|---|---|---|---|
| `entity.header`, `entity.info` (`list_agents_v1` = `LIST_AGENTS`) | live | 12 (the enrolled device's AIG Agent record: agent_id, status, enrolled_at, attributes) | forgecentral/packages/bindings/src/manifest.ts:31-45; crucible/crates/cdb-wire/src/query.rs:171-180; crucible/crates/cdb-server/src/handler.rs:2382-2425 |
| `entity.capabilities` (`agent_capabilities_v1`) | live | 7/8 via CrucibleQL `FIND construction_report WHERE agent_id = $a RETURN surface, entry` (preferred), else `FIND agent_capabilities ...`; rendered only for a ref present in `LIST_AGENTS` | forgecentral/packages/bindings/src/manifest.ts:91-96; forgecentral/apps/bff/src/engine/entity-detail.ts:290-326, :355-395 |
| `policies.convergence` (`bundle_convergence_v1`) | live | 11 | forgecentral/packages/bindings/src/manifest.ts:660-666 |
| `users.list` / `users.detail` (`list_principals_v1`), `groups.list` / `groups.detail` (`list_groups_v1`) | live | 9/10 (LUG accounts, groups, memberships, privileges) | forgecentral/packages/bindings/src/manifest.ts:409-433; forgecentral/apps/bff/src/engine/entity-detail.ts:291-293 |
| `overview.graph`, `vtz.riskBand` (`connectivity_graph_v1`) | live | 3 (box flow; torchd states the lane exists "so whole-box device connectivity renders in the Overview") | forgecentral/packages/bindings/src/manifest.ts:224-229, :293-298; torch/crates/torch-edge/src/bin/torchd.rs:896-899 |
| `logs.query`/`logs.explain`/`logs.export` (`log_*_v1`), `soc.*` incident/telemetry reads, `entity.recentDecisions` (`entity_decisions_v1`) | live | 2, 4-6 (and 10) after engine decode/detection -- exact per-relation mapping is the engine census's | forgecentral/packages/bindings/src/manifest.ts:79-84 (and the logs/soc entries) |
| `entity.zones`, `entity.effectivePolicies` | pending | none (drawer returns `pending('forge', ...)`) | forgecentral/apps/bff/src/engine/entity-detail.ts:407-412 |
| `policies.enforcement` | pending | none | forgecentral/packages/bindings/src/manifest.ts:667-681 |
| `overview.live` | pending (needs a SUBSCRIBE push stream) | none | forgecentral/packages/bindings/src/manifest.ts:244-252 |
| AIOps host metrics (stream 1) | no binding | shipped but unread: no Console reference to the metric names, TimeSeries, or host metrics (grep of forgecentral apps/ and packages/) | -- |

### 5.7 What the Console cannot see (gaps)

- Whether torchd is running, which lanes are enabled, node role, spill/queue depth, lane stalls, seam
  failures, torchd version (except the LUG `collector_version` if the identity lane is on): journal only
  (Section 5 rows 13-15).
- Whether the policy lane is provisioned at all: a host without an anchor simply never reports, so the
  Console shows it as `silent` (or `has_bundle: false` for a zone never distributed)
  (crucible/crates/cdb-server/src/handler.rs:6934-6982).
- What an applied bundle realized (the `RealizedTiers` evidence stays in the in-memory posture; the report
  carries only applied/rejected + reason) (torch/crates/torch-forge/src/apply.rs:224-236;
  torch/crates/torch-edge/src/policy.rs:197-203).
- Containment / plan approval / reassign / remediation effects on the host: none exist; the Console can show
  only the recorded disposition with `enforcement_active: false`.
- Discovery detection evidence, placement outcome (placed vs observe-only), and helper reachability:
  journal only (torch/crates/torch-edge/src/bin/torchd.rs:1589-1604).
- Host metrics: shipped every 30 s, no Console surface.
- Certificate expiry: torch has an unwired `Renewer` (re-exported only, torch/crates/torch-core/src/lib.rs:51)
  and ships nothing about leaf lifetime; an expired device just goes quiet.

### 5.8 UNVERIFIED items and open questions

1. UNVERIFIED live: the ms-vs-ns lease mismatch has not been observed on a box, because the policy lane is
   off there (no anchor; per the FC ledger, forgecentral/docs/implementation-plans/IP-CONSOLE-02-FORGE-DISTRIBUTION.md:247-251
   -- a doc, not code). Code path verified end to end (Section 1).
2. UNVERIFIED live: whether the realize-time `nft -f -` would succeed in torchd's context (needs `nft` or
   `iptables-restore` present on the host; the unit grants CAP_NET_ADMIN). Owned by the forge/vtz census.
3. UNVERIFIED: whether a declared/discovered agent's subject `AgentGci(zone_id)` ever appears in
   `LIST_AGENTS`. The engine stores subject reports without creating an AIG Agent record
   (crucible/crates/cdb-server/src/handler.rs:8781-8811) and the drawer shows capabilities only for refs in
   `LIST_AGENTS` (forgecentral/apps/bff/src/engine/entity-detail.ts:358-365), so discovered-agent reports may
   be stored but unreachable from the entity drawer. Checked: the ingest handler and the drawer composition
   only; not the engine's other AIG writers.
4. UNVERIFIED: `bundle_convergence` reads under the session tenant and `WireBundleConvergenceQuery` has no
   `operator` field at crucible HEAD (crucible/crates/cdb-wire/src/query.rs:3890-3895;
   crucible/crates/cdb-server/src/handler.rs:6938-6952); the FC ledger records this as a delegation gap
   (forgecentral/docs/implementation-plans/IP-CONSOLE-05-policies-LEDGER.md:42-52). Whether the Console can
   read convergence for its operator today is the engine census's to confirm.
5. UNVERIFIED: which engine LOG/SOC relations each torch stream populates (tetragon, torch-obs, LUG events);
   engine census.
6. UNVERIFIED: whether `disabled_decoder_families` / `source_format_map` can switch off decoding of
   `tetragon` / `torch-obs` / `torch-flow` bodies; only the field names were read
   (crucible/crates/cdb-wire/src/query.rs `WireSectionPatch`).
7. Open question: `lug_exposure.snapshot_cadence_hours` is documented as honored by the torch collector
   (crucible/crates/cdb-admin/src/config_document.rs:278-279) but no delivery path exists -- should the manual
   say "engine-side record only; set the endpoint cadence with TORCH_IDENTITY_CADENCE_HOURS"?
8. Open question: the policy applier's posture is memory-only (torch/crates/torch-forge/src/apply.rs:56-61),
   while policy.rs says a restart "re-learns it from last-known-good" (torch/crates/torch-edge/src/policy.rs:142-143).
   No persistence was found in apply.rs; a restart therefore starts from no policy until the next fetch.

## 6. The other binaries and shared configuration

Scope: torch-placed, torch-enroll, torch-shim, torch-trustflow, torch-scenario, torch-wrap (TORCH_EGRESS_BROKER), torch-broker, and the torch-core configuration any binary reads. torchd.rs itself is covered elsewhere; it is cited here only where these components couple to it. Every claim cites torch/<path>:<line> (or crucible/<path>:<line>). Code is the source of truth; read-only review, nothing built or run.

### Index (this part)

- A. At-a-glance: what each binary is, whether the installer ships/runs it, how it is configured
- B. torch-placed (the root helper)
  - B.1 Env knobs
  - B.2 Compile-time bounds (TUNE constants)
  - B.3 Privilege model and socket access
  - B.4 Socket protocol (9 request ops)
  - B.5 What a placement does on the host
  - B.6 Failure behavior
  - B.7 Observations
- C. torch-enroll (zero-touch enrollment CLI)
  - C.1 Env knobs (16; 7 required)
  - C.2 Protocol steps
  - C.3 Files written
  - C.4 Certificate lifetime and renewal
  - C.5 Failure behavior
  - C.6 Doc drift and observations
- D. torch-shim (stdio MCP interposer)
- E. torch-trustflow (TLS-terminating loopback proxy library)
- F. torch-scenario (lab traffic driver)
- G. torch-wrap (TORCH_EGRESS_BROKER) and torch-broker
- H. torch-core shared configuration (CDB_*, EnvCredentialProvider, TPM/TCTI, deadlines, retry, TLS)
- I. Counts and UNVERIFIED list

---

### 6.A At-a-glance

| Binary / crate | Kind | Installed by installer? | Runs as / started by | Configured by | Live or deferred |
|---|---|---|---|---|---|
| torch-placed | bin in torch-edge (torch/crates/torch-edge/src/bin/torch-placed.rs:1) | Built+staged always (torch/deploy/torch-install/installer/phases/20-build.sh:13, :33); the systemd unit is written ONLY when TORCH_AGENT_GOVERN=1 AND TORCH_AGENT_DISCOVER=1 (torch/deploy/torch-install/installer/phases/50-systemd.sh:76, :127, :199-231); both default 1 (torch/deploy/torch-install/installer/lib/common.sh:90, :108); GOVERN also requires TORCH_SECURITY_LANE=1 (50-systemd.sh:77-78) | root (User=root, Group=torch) under systemd `torch-placed.service` (50-systemd.sh:204-206, :214) | 3 env vars (B.1) | Live (observation attribution only, never enforcement: torch/crates/torch-edge/src/placement.rs:15-17) |
| torch-enroll | bin (torch/crates/torch-enroll/Cargo.toml:31-33) | Built+staged (20-build.sh:13, :34); run once by phase 30 (torch/deploy/torch-install/installer/phases/30-enroll.sh:42-57) | root, interactive, from the installer | 16 env vars (C.1) | Live |
| torch-shim | bin (torch/crates/torch-shim/Cargo.toml:14-16) | Built+staged to $TORCH_PREFIX (20-build.sh:13, :34, :44-48) but NOTHING invokes it (no installer phase, no torchd caller; see D) | would be launched by an agent's rewritten MCP config | CLI args after `--` only | Transparent pass-through today; governed pump DEFERRED (torch/crates/torch-shim/src/main.rs:8-12) |
| torch-trustflow | library only (no [[bin]] in torch/crates/torch-trustflow/Cargo.toml) | No | n/a | no runtime knobs | Provider forwarding DEFERRED-LIVE (torch/crates/torch-trustflow/src/lib.rs:20-21; torch/crates/torch-trustflow/src/proxy.rs:8-10); only a dev-dependency of torch-edge (torch/crates/torch-edge/Cargo.toml:72, :77-81) |
| torch-scenario | bin (torch/crates/torch-scenario/Cargo.toml:14-16) | No (not in the installer's BINS, 20-build.sh:13) | operator, by hand, lab only | 5 CLI flags (F) | Lab tool, "never shipped to an endpoint" (torch/crates/torch-scenario/src/main.rs:13-15) |
| torch-wrap | library | n/a (linked into torchd for GCI minting only) | n/a | TORCH_EGRESS_BROKER is WRITTEN into a generated shim, never read (G) | Cooperative wrap / capture policy / DLP / browser host: no production caller outside the crate (G) |
| torch-broker | library | No (not a torch-edge dependency; only torch-enroll's optional `validation-capstone` feature, torch/crates/torch-enroll/Cargo.toml:19, :25-26) | n/a | constants only | Validation-only on the endpoint |

---

### 6.B torch-placed

What it is: "the tiny root helper that performs the identity-verified cgroup placement the unprivileged `torchd` cannot" (torch/crates/torch-edge/src/bin/torch-placed.rs:5-6). torchd runs `User=torch` and asks it over a Unix socket (torch/crates/torch-edge/src/placement.rs:8-13). Placement "grants OBSERVATION attribution only, never enforcement (AG.7 stays off): moving a pid into a slice only makes `zone_of_pid` resolve it" (placement.rs:15-17; also torch-placed.rs:13). Beyond placement it also serves read-only privileged reads (process enumeration, pid-exact connections, env NAMES, agent artifacts, agent transcripts, the auth log) -- see B.4.

#### 6.B.1 Env knobs (read by the helper process)

| Name | Default | Validation / bounds | Effect | Installer value |
|---|---|---|---|---|
| TORCH_PLACE_SOCKET | `/run/torch/place/place.sock` (torch-placed.rs:34, :39-40) | none beyond bind success; any path accepted (torch-placed.rs:39-40); a stale socket file at the path is removed first (placement.rs:690-692) | The Unix socket the helper binds (mode 0660, placement.rs:694) | `$TORCH_PLACE_SOCKET` (50-systemd.sh:212), default `/run/torch/place/place.sock` (common.sh:111) |
| TORCH_CGROUP_ROOT | `/sys/fs/cgroup` (torch-placed.rs:36, :41-42) | none (any path) | The cgroup-v2 mount under which `torch-vtz-<zone_id>.slice` is created (placement.rs:330) | `/sys/fs/cgroup` hard-coded in the unit (50-systemd.sh:213) |
| TORCH_IDENTITY_AUTH_LOG | `/var/log/auth.log` (placement.rs:603-604) | read per request from the HELPER's own environment, never from the request (placement.rs:596-598) | The one auth source the `read_auth_log` op may read (II.N identity-event lane) | NOT set by the unit (50-systemd.sh:203-226), so the default applies |

Default-off semantics: the helper has no enable flag of its own; it exists on a host only if the installer wrote its unit (TORCH_AGENT_GOVERN=1 and TORCH_AGENT_DISCOVER=1, see A). No other env var is read (the only `std::env::var` reads are torch-placed.rs:39, :41 and placement.rs:604).

#### 6.B.2 Compile-time bounds (TUNE constants, not operator-settable)

| Constant | Value | Effect |
|---|---|---|
| MAX_ZONE_ID_LEN | 64 (placement.rs:32) | Zone token length ceiling; the derived token is 32 hex chars (torch/crates/torch-types/src/zone.rs:32) |
| AUTH_LOG_MAX_READ | 1 MiB (placement.rs:594) | Max bytes returned per auth-log read |
| ARTIFACT_STATE_DIRS | `.claude`, `.codex` (placement.rs:961) | Allowlist of agent state dirs the helper may read under a home |
| ARTIFACT_EXTS / ARTIFACT_NAMES | `jsonl`; `SKILL.md`, `settings.local.json`, `settings.json` (placement.rs:964-965) | The only file shapes returned by the artifact read |
| ARTIFACT_MAX_FILES / _FILE_BYTES / _TOTAL_BYTES / _DEPTH | 256 / 16 MiB / 48 MiB / 8 (placement.rs:968-971) | Bounds on the artifact and transcript walks |
| TRANSCRIPT_RANGE_MAX_BYTES | 4 MiB (placement.rs:1025) | Cap on one transcript range read (further clamps the caller's max_bytes, placement.rs:1185) |

#### 6.B.3 Privilege model and socket access

- Runs as root: `User=root`, `Group=$TORCH_SVC_USER` (default `torch`, common.sh:24) (50-systemd.sh:205-206). Hardening in the unit is limited to `NoNewPrivileges=yes` and `ProtectHome=read-only` (50-systemd.sh:219, :226); there is no `ProtectSystem`, `CapabilityBoundingSet` or `DeviceAllow` line in that unit (50-systemd.sh:199-230). `Restart=on-failure`, `RestartSec=2` (50-systemd.sh:215-216).
- Socket directory: `ExecStartPre` creates `/run/torch` as `torch:torch 0750` and the socket dir as `root:torch 2770` (setgid) on every start (50-systemd.sh:210-211). The socket itself is chmod `0660` after bind (placement.rs:689-695). Result: only root and members of group `torch` can connect (placement.rs:683-685; torch-placed.rs:18-20).
- NO peer-credential check: there is no `SO_PEERCRED`/ucred/getsockopt use in placement.rs or torch-placed.rs (grep of both files for peer-cred terms matches only unrelated "remote peer" comments at placement.rs:58, :60, :844, :853). Access control is the filesystem mode alone; any process in group `torch` can issue every op.
- torchd side: torchd reaches the socket via `TORCH_PLACE_SOCKET` (default `/run/torch/place/place.sock`, torch/crates/torch-edge/src/bin/torchd.rs:98) at torchd.rs:623 (identity-event lane), :931-937, :1466, :1512, :1541-1542, :1616 (discovery/govern). The discover drop-in grants torchd write to the socket dir despite `ProtectSystem=strict` via `ReadWritePaths=-$place_dir` and orders torchd `After=torch-placed.service` (50-systemd.sh:152-170).
- Installer render checks: the unit file exists, `systemctl is-active`, and the socket appears within 5 s (50 polls x 0.1 s) or the install dies (50-systemd.sh:233-243).

#### 6.B.4 Socket protocol

Transport: one connection per request; the client writes ONE newline-terminated JSON object and reads ONE newline-terminated JSON reply (placement.rs:556-572, :701-702, :713-766). Requests are serde internally tagged by `"op"` in snake_case (placement.rs:39-41). All 9 ops:

| op | Request fields | Reply type (fields) | What the helper does | Scoping |
|---|---|---|---|---|
| `resolve` | pid (placement.rs:45-48) | ResolveReply {ok, binary_hash, uid, message} (placement.rs:271-280) | SHA-512 of `/proc/<pid>/exe` + real uid via torch-enforce resolve_pid (placement.rs:770-791; torch/crates/torch-enforce/src/resolve.rs:35-57, :106-109; SHA-512 at torch/crates/torch-types/src/hash.rs:15-17) | read-only |
| `place` | pid, binary_hash, zone_id (placement.rs:246-253) | PlaceReply {ok, message} (placement.rs:258-263) | identity-verified cgroup move (B.5) | zone token charset/length validated first |
| `enumerate_processes` | none (placement.rs:56) | EnumerateReply {ok, processes[pid, uid, exe]} (placement.rs:223-241) | readlink `/proc/<pid>/exe` for every pid + uid from status (placement.rs:798-841) | read-only; kernel threads skipped |
| `process_connections` | none (placement.rs:61) | ProcessConnectionsReply {ok, connections[pid, remote_ip]} (placement.rs:203-219) | joins `/proc/net/tcp{,6}` established sockets with `/proc/<pid>/fd` inodes (placement.rs:850-913) | read-only |
| `process_env` | pid (placement.rs:65-68) | ProcessEnvReply {ok, names} (placement.rs:192-199) | reads `/proc/<pid>/environ`, returns NAMES only, never values (placement.rs:915-956) | read-only |
| `read_agent_artifacts` | pid, state_dir (placement.rs:76-81) | AgentArtifactsReply {ok, files[relpath, contents_b64]} (placement.rs:172-188) | walks `<HOME>/<state_dir>` returning artifact-shaped files base64 (placement.rs:980-1020, :1207-1252) | state_dir allowlist (:990), HOME from the pid's own environ (torch/crates/torch-edge/src/proc_home.rs:27-41), HOME must be a dir owned by the pid's real uid (:1004, :1281-1283), symlink entries skipped (:1226), bounded (B.2) |
| `read_auth_log` | offset (placement.rs:88-91) | AuthLogReply {ok, lines, offset, message} (placement.rs:159-168) | reads complete lines appended since offset from the FIXED auth path (placement.rs:601-674) | path never caller-supplied; `offset=u64::MAX` = seek-to-end sentinel (:626-633); file shorter than offset = rotation, reset to 0 (:635-637); 1 MiB cap (:649) |
| `list_agent_transcripts` | pid, state_dir, transcript_subdir (placement.rs:97-104) | AgentTranscriptsReply {ok, files[relpath, len]} (placement.rs:124-140) | lists `*.jsonl` + lengths under `<HOME>/<state_dir>/<subdir>`, never contents (placement.rs:1050-1080, :1121-1161) | same scoping as artifacts (:1030-1046) + subdir must be a clean relpath (:1061, :1198-1203) |
| `read_agent_transcript_range` | pid, state_dir, relpath, offset, max_bytes (placement.rs:108-119) | TranscriptRangeReply {ok, data_b64, len, message} (placement.rs:145-154) | one bounded byte range of one transcript (placement.rs:1085-1117, :1166-1189) | clean relpath, `*.jsonl`, leaf must be a regular file (symlink leaf refused) (:1173-1180), capped 4 MiB (:1185) |

A malformed request line gets a PlaceReply `{ok:false, message:"malformed request: ..."}` regardless of which op was intended, and nothing is acted on (placement.rs:752-758).

Audit: every op logs one line to stderr (the helper's audit log, torch-placed.rs:22-23, :59), e.g. `torch-placed: place pid=.. zone=.. -> ok|<reason>` (placement.rs:1322-1329), resolve (:773, :782), enumerate (:832-835), connections (:904-907), env (:947-950), artifacts (:1011-1014), transcripts (:1071-1074, :1107-1110), auth-log open refusals (:614-616).

#### 6.B.5 What a placement does on the host

`place_pid_in_zone` (placement.rs:295-335), in order, fail-closed at each step:
1. Zone token must be non-empty, <= 64 chars, lowercase hex only, so it cannot escape the `torch-vtz-*.slice` namespace (placement.rs:306-316).
2. Re-verify identity on the privileged side: `torch_enforce::resolve_pid(pid)` hashes the running image; mismatch -> `IdentityMismatch`, vanished/unreadable -> `IdentityUnresolved` (placement.rs:317-329; resolve.rs:35-57).
3. `mkdir -p <TORCH_CGROUP_ROOT>/torch-vtz-<zone_id>.slice`, then write `<pid>\n` to its `cgroup.procs` (cgroup v2 move) (placement.rs:330-333).
The zone token is derived from the GCI: `zone_id_of(gci)` = first 32 hex chars of SHA-512("torch-vtz-zone-id:v1:" + GCI composite) (torch/crates/torch-wrap/src/gci.rs:156-158; torch/crates/torch-types/src/zone.rs:32, :36, :69-75). The daemon side builds the request from the discovered agent's running pid and GCI; a non-running (not `Source::Running`) agent is refused `NotRunning` before any socket call (placement.rs:414-443).
No cgroup controller (cpu/memory/io/pids) is written; only the directory is created and the pid moved (placement.rs:330-333) -- consistent with "observation attribution only" (placement.rs:15-17).

#### 6.B.6 Failure behavior

- Helper startup: bind failure -> stderr line + exit FAILURE (torch-placed.rs:44-52); systemd restarts on failure (50-systemd.sh:215-216). `serve_placements` only returns if the listener stops yielding; that is a clean stop, exit SUCCESS (torch-placed.rs:59-63).
- Per-connection accept errors are skipped (placement.rs:704-706); a read error drops the connection with no reply (placement.rs:716-718).
- torchd side, by op (all fail closed / degrade, never error the daemon): placement -> `PlacementError::Failed`, agent stays OBSERVE-ONLY (placement.rs:337-342, :436-442); resolve -> None, never minted from a guess (placement.rs:445-450); enumerate -> empty vec, reconcile falls back to the unprivileged /proc poll (placement.rs:360-370); connections -> None so the caller falls back to UID attribution (placement.rs:386-397); env names -> empty (placement.rs:452-467); artifacts -> empty, surfaces stay Unknown (placement.rs:469-486); transcripts -> empty / None (placement.rs:502-553); auth log -> Err, treated as "no events this tick" (placement.rs:579-589; torchd.rs:692-694 records `identity.auth_log_unreadable`).

#### 6.B.7 Observations (code-read; not runtime-tested)

1. No request timeout on either side, and the server is sequential. The helper serves connections one at a time in a single loop (placement.rs:703-708) and blocks in `read_line` with no read timeout (placement.rs:714-718); the client likewise has no connect/read timeout (placement.rs:560-569). No `set_read_timeout` appears in placement.rs outside tests. A connected-but-silent client in group `torch` would stall every other helper request; a stalled helper blocks the calling torchd thread (the identity lane uses spawn_blocking, torchd.rs:647-652, :671-675).
2. The uid-ownership guard covers HOME only. `read_agent_artifacts` and `agent_state_root` check that HOME is a directory owned by the pid's uid (placement.rs:1004, :1039, :1281-1283), then open `<HOME>/<state_dir>` (and `<...>/<transcript_subdir>`) with `read_dir`, which follows a symlink at that path (placement.rs:1010, :1070, :1123-1128, :1211-1216). Symlinks are skipped only for entries found DURING the walk (placement.rs:1223-1228; the transcript walk skips them because a symlink is neither `is_dir` nor `is_file`, :1135-1145). UNVERIFIED at runtime: whether a process whose own `~/.claude` is a symlink to another user's directory would have the root helper read the target; the code as written does not check the state dir's ownership or symlink status.
3. Installer coupling: the unit is only written inside the DISCOVER block (50-systemd.sh:127, :199), but torchd's identity-event lane (spawned when TORCH_IDENTITY_INVENTORY=1, torchd.rs:439-442, :1061-1069; installer default 1, common.sh:126) also reads the auth log ONLY through this helper (torchd.rs:603-608, :622-624, :670-675). With TORCH_AGENT_DISCOVER=0 (or GOVERN=0 or SECURITY_LANE=0) the helper is absent and every tick records `identity.auth_log_unreadable` (torchd.rs:692-694).
4. "Deltas only" depends on the helper at startup: torchd seeds its cursor with the seek-to-end sentinel, but `map_or(0, ...)` makes the cursor 0 if the helper is unreachable at that moment (torchd.rs:644-652). If the helper becomes reachable later, reads start from byte 0 of the auth log (1 MiB per read, placement.rs:634-649), contrary to the lane's stated deltas-only intent (torchd.rs:611-613). UNVERIFIED at runtime.
5. Installer text/behavior mismatch (installer slice, noted in passing): the seeded discovery policy JSON says `"enabled": true` (50-systemd.sh:135-144) while the success message says "seeded a DISABLED discovery policy" (50-systemd.sh:147).

---

### 6.C torch-enroll

What it is: the device-edge zero-touch enrollment CLI; reads config from the environment, opens the TPM via the TCTI, runs enroll-and-connect once (torch/crates/torch-enroll/src/main.rs:1-5; torch/crates/torch-enroll/src/lib.rs:1-15). The installer runs it in phase 30 as root, interactively (30-enroll.sh:2-6, :42-57), skipping the phase if `$TORCH_IDENTITY_DIR/device.pem` already exists (30-enroll.sh:14-17).

#### 6.C.1 Env knobs

`require(key)` fails with "missing required env var KEY" (main.rs:132-134); `env_or` supplies a default (main.rs:136-138); a CA path that cannot be read fails "read PATH: ..." (main.rs:140-142).

| Name | Required? | Binary default | Validation | Effect | Installer passes |
|---|---|---|---|---|---|
| TORCH_IDP_HOST | required (main.rs:32) | -- | must be set | IdP host; HTTPS on :443, OS CA store (torch/crates/torch-core/src/device_grant.rs:287-304) | `$TORCH_IDP_HOST` (30-enroll.sh:43), must be non-empty (30-enroll.sh:20); installer default empty (common.sh:44) |
| TORCH_IDP_CLIENT_ID | required (main.rs:33) | -- | must be set | OAuth device-code client id (device_grant.rs:57-58, :168-172) | `$TORCH_IDP_CLIENT_ID` (30-enroll.sh:44, :21; common.sh:45) |
| TORCH_IDP_AUDIENCE | optional | `https://crucibledb/enroll` (main.rs:34) | none | token audience (device_grant.rs:59-60, :171) | not passed explicitly (30-enroll.sh:42-56); inherits only if already in the installer's exported env |
| TORCH_IDP_SCOPE | optional | `openid profile email` (main.rs:35) | none | requested scope (device_grant.rs:61-62, :170) | not passed explicitly (same) |
| TORCH_PROPOSED_FQDN | optional | `torch-edge-01.test.crucibledb` (main.rs:40) | none client-side | FQDN proposed on FIRST enrollment only; ignored once the node has a bound name (lib.rs:38-41, :284-288); becomes the cert CN + DNS SAN (lib.rs:291-303) | `$TORCH_PROPOSED_FQDN` (30-enroll.sh:46), installer default `hostname -f` (common.sh:47) |
| TORCH_ATTEST_NONCE | required (main.rs:42) | -- | raw bytes must equal the node's `attestation_nonce` (main.rs:41; lib.rs:42); TPM quote refuses > 64 bytes (torch/crates/torch-core/src/keystore.rs:173, :322-326) | quote extraData (lib.rs:260-265) | `$TORCH_ATTEST_NONCE` (30-enroll.sh:45, :22; common.sh:46) |
| TORCH_BOOTSTRAP_ADDR | required (main.rs:43) | -- | host:port | node enrollment bootstrap listener (lib.rs:44-45) | `$TORCH_BOOTSTRAP_ADDR` (30-enroll.sh:47), default `127.0.0.1:7443` (common.sh:36) |
| TORCH_BOOTSTRAP_SERVER_NAME | optional | `localhost` (main.rs:44) | must parse as a TLS ServerName (lib.rs:268-269) | SNI/verify name on bootstrap | `$TORCH_BOOTSTRAP_SERVER_NAME` (30-enroll.sh:48), default `enroll.localhost` (common.sh:37) |
| TORCH_BOOTSTRAP_CA | required (main.rs:45) | -- | PEM path; each cert must parse (torch/crates/torch-core/src/enroll.rs:90-97) | pinned enrollment-CA root, server-auth-only TLS (enroll.rs:82-112) | `$TORCH_ETC/bootstrap-ca.pem` staged from `$TORCH_BOOTSTRAP_CA_SRC` (30-enroll.sh:27, :29, :49), default src `/etc/cdb/ztp/enroll-tls/ca.pem` (common.sh:38) |
| TORCH_WIRE_ADDR | required (main.rs:46) | -- | host:port | mTLS wire plane (:7878 seam) connected after issuance (lib.rs:50-51, :341-352) | `$CDB_ADDR` (30-enroll.sh:50), default `127.0.0.1:7878` (common.sh:33) |
| TORCH_WIRE_SERVER_NAME | optional | `localhost` (main.rs:47) | must parse as ServerName (lib.rs:346-347) | wire SNI/verify name | `$CDB_SERVER_NAME` (30-enroll.sh:51), default `wire.localhost` (common.sh:34) |
| TORCH_WIRE_CA | required (main.rs:48) | -- | PEM path | wire-plane CA (lib.rs:54-55) | `$TORCH_ETC/wire-ca.pem` from `$TORCH_WIRE_CA_SRC` (30-enroll.sh:26, :28, :52), default src `/etc/cdb/mtls/ca.pem` (common.sh:35) |
| TORCH_TCTI | optional | `device:/dev/tpmrm0` (main.rs:51) | TCTI string must parse and the TPM must answer a get_random probe, else `Unavailable` -- no software fallback (keystore.rs:399-410) | which TPM (swtpm in dev, `/dev/tpmrm0` in prod, main.rs:50) | `$TORCH_TCTI` (30-enroll.sh:53), default `device:/dev/tpmrm0` (common.sh:48) |
| TORCH_EK_CERT | optional | unset -> EK cert read from TPM NV index 0x01c00002 (keystore.rs:295-306) | PEM must contain a certificate (keystore.rs:215-224) | out-of-band EK cert (GCE Shielded VM case, main.rs:53-59) | set to `$TORCH_ETC/ek-cert.pem` only when `TORCH_EK_CERT_SRC` is set (30-enroll.sh:32-38; common.sh:49-51) |
| TORCH_IDENTITY_OUT | optional | unset -> connect-only, nothing persisted (main.rs:66-68) | dir created if absent (lib.rs:215) | where `device.pem` is written (C.3) | `$TORCH_IDENTITY_DIR` (30-enroll.sh:54), default `/etc/torch/identity` (common.sh:20-21) |
| TORCH_COGNITION_MODEL | optional | `gemma` (lib.rs:474) | none | model id named in the B1.5 brokered-cognition probe | compiled ONLY under the `validation-capstone` feature (lib.rs:465; Cargo.toml:14-19); the installer builds default features (20-build.sh:31-34), so inert on installed endpoints |

Not a knob: `TORCH_CN` appears in the crate README (torch/crates/torch-enroll/README.md:88) but no code reads it (grep of crates/ and deploy/ finds no reader). The CN is the device FQDN (lib.rs:291-303).

#### 6.C.2 Protocol steps (as coded, torch/crates/torch-enroll/src/lib.rs:231-369)

1. Keygen: open the keystore, generate the device key; print its RFC 7638 JWK thumbprint (lib.rs:236-243). The key is a deterministic owner-hierarchy primary, NIST P-384 ECDSA-SHA384, fixed_tpm/fixed_parent (non-exportable) (keystore.rs:228-231, :412-450; LOAD-BEARING note at :428-432).
2. Federated device grant (RFC 8628): POST `/oauth/device/code` with client_id/scope/audience (device_grant.rs:163-184); print `APPROVE ENROLLMENT: open <verification_uri> and enter code <user_code>` (main.rs:87-94); poll POST `/oauth/token` every `interval` s (IdP value, default 5, floor 1; `slow_down` adds 5 s) until approved, denied/expired (`GrantError::Denied`), or `expires_in` elapses (device_grant.rs:113-115, :194-230). No `jkt` is sent to the IdP (extras = `&[]`, lib.rs:245-250). IdP transport bounds: 5 s connect, 5 s TLS, 20 s exchange, 256 KiB response cap (device_grant.rs:259-272).
3. TPM attestation over the nonce: EK cert + RSA-2048 restricted AK + TPM2_Quote (lib.rs:260-265; keystore.rs:262-264, :485-494).
4. Identity pre-flight: over the server-auth-only bootstrap channel, send {token, attestation}; the node answers with the bound FQDN, an invitation to propose (`fqdn: None` -> use TORCH_PROPOSED_FQDN), or a non-oracle refusal (lib.rs:272-289; enroll.rs:219-234).
5. CSR signed in the TPM: CN = FQDN, DNS SAN = FQDN, URI SAN = `spiffe://<issuer host>/<token sub>` (lib.rs:291-303; torch/crates/torch-core/src/token_binding.rs:191-195).
6. Submit {token, csr_der, attestation} in one `EnrollSubmit` frame; the node returns `Issued{certificate_der, serial, not_after}` or `Refused` (lib.rs:305-323; enroll.rs:146-217). There is NO client-side token-to-key self-check; the node establishes the binding from the attested CSR key (lib.rs:305-306; enroll.rs:11-13, :114-126).
7. Connect the mTLS wire plane signing the handshake in the TPM (lib.rs:332-352); in a shipped build the session is then dropped (lib.rs:365-366).
Bootstrap TLS: TLS 1.3 only, X25519MLKEM768 preferred then X25519, pinned root, no client cert (enroll.rs:82-112). Wire TLS: TLS 1.3 only, X25519MLKEM768 only (torch/crates/torch-core/src/mtls_signer.rs:166-175). Each bootstrap phase is bounded by the default SeamDeadlines (5 s connect, 5 s handshake, 30 s exchange) (enroll.rs:153-199; torch/crates/torch-core/src/seam.rs:178-191).
Progress lines printed: `[1/6]` .. `[6/6]` (main.rs:82-105).

#### 6.C.3 Files written

- torch-enroll writes exactly one file: `<TORCH_IDENTITY_OUT>/device.pem`, the issued leaf certificate (PUBLIC), creating the dir if absent (lib.rs:203-222; main.rs:69-76). No mode is set in code (plain `create_dir_all` + `fs::write`, lib.rs:215-220). The private key is never written; it stays in the TPM and torchd re-derives it (main.rs:66-68; lib.rs:189-194).
- The installer then sets `device.pem` to `root:torch 0640` (30-enroll.sh:59-62); the identity dir is `root:torch 0750` (torch/deploy/torch-install/installer/phases/10-prereqs.sh:42). The installer also stages `wire-ca.pem`, `bootstrap-ca.pem`, and optionally `ek-cert.pem` into `/etc/torch` as `root:torch 0640` (30-enroll.sh:28-29, :35).
- torchd consumes it as `CDB_CLIENT_CERT` with `TORCH_IDENTITY=tpm` (torch/deploy/torch-install/installer/phases/40-config.sh:16, :20; torchd.rs:278-283, :304-332).

#### 6.C.4 Certificate lifetime and renewal

- Torch code states NO lifetime: it only prints the node-returned `notAfter` (main.rs:100-101; enroll.rs:69-77).
- Node side (crucible): `CDB_ENROLL_VALIDITY_SECS` overrides "the CA's short default" (crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:800-811); any configured value must be > 0 and <= 7 days (`MAX_ENROLLMENT_CERT_VALIDITY_SECS = 7 * 24 * 3600`, crucible/crates/cdb-server/src/config.rs:890, :911-923).
- UNVERIFIED: the 24-hour figure. Checked torch crates/deploy for 24h/re-enroll/notAfter statements (none in code) and crucible for the validity knob (above); when unset the lifetime is the CA's default, which is configured outside these three repos.
- No automatic renewal on the endpoint: torch-core defines `RenewalPolicy`, `Renewer`, `maybe_renew` (torch/crates/torch-core/src/identity.rs:431-482; re-exported torch/crates/torch-core/src/lib.rs:51) but nothing outside identity.rs calls them. Re-enroll is manual: `sudo rm ${TORCH_IDENTITY_DIR}/device.pem && sudo ./install.sh --only 30-enroll` (30-enroll.sh:8-9); each device code is single-use (30-enroll.sh:57).

#### 6.C.5 Failure behavior

- Any stage error aborts with `torch-enroll: <message>` and exit 1 (main.rs:19-27; `FlowError` variants lib.rs:59-91). A node refusal is the single non-oracle `Refused` (lib.rs:88-90, :287, :322).
- Nothing is persisted unless the flow returns an identity (persist happens after `enroll_and_connect` succeeds, main.rs:62-76). Note the device key itself is a TPM primary re-derivable from the owner seed, not a stored object (keystore.rs:428-432).
- Installer: a failed run dies with the single-use-code hint (30-enroll.sh:57); success without `device.pem` also dies (30-enroll.sh:60).

#### 6.C.6 Doc drift and observations

1. README says step 5 "BIND self-check the token-to-key binding" (torch/crates/torch-enroll/README.md:31); code has no client self-check (lib.rs:305-306; enroll.rs:114-126).
2. README names `TORCH_CN` (README.md:88); no code reads it.
3. Binary defaults differ from installer defaults: FQDN `torch-edge-01.test.crucibledb` vs `hostname -f`; server names `localhost` vs `enroll.localhost` / `wire.localhost` (main.rs:40, :44, :47 vs common.sh:34, :37, :47). A hand-run torch-enroll without the installer's env would propose a test FQDN.
4. The printed `jkt` (main.rs:84-86) is informational; it is not pushed to the IdP (lib.rs:245-250).

---

### 6.D torch-shim

What it is: the stdio MCP interposer (TRD-34 R-OBS-42): spawn the real MCP server as a child and pump its newline-delimited JSON-RPC, governing each `tools/call` with the same inline policy and emitting the same `mcp.*` events as the HTTP proxy path (torch/crates/torch-shim/src/lib.rs:6-18).

Configuration:
- CLI only: every argument after the first `--` is the real server command + args (main.rs:22-31); no `--` -> "no server command after `--`", exit 1 (main.rs:28-31). Spawn failure -> exit 1 (main.rs:33-44). No env vars, no config file.
- The per-agent MCP config rewrite (`rewrite_mcp_config`) replaces each stdio server's `command` with the shim path and `args` with `["--", <original command>, <original args>...]`, storing the originals under `x-torch-original-command` / `x-torch-original-args` so `restore_mcp_config` reverts exactly; HTTP/SSE (`url`) servers are left alone (torch/crates/torch-shim/src/config.rs:13-16, :35-64, :70-88). `ShimContext` carries only the MCP server name and a classification (torch/crates/torch-shim/src/shim.rs:22-27).

Live vs deferred:
- The binary today is a TRANSPARENT forwarder: "Until that is wired the shim is a transparent interposer" (main.rs:8-12, :46-58). The governed `pump_requests` exists only in the library.
- Nothing rewrites an agent's MCP config: `rewrite_mcp_config` has no caller outside its own tests (grep of crates/ outside torch-shim finds only torch/crates/torch-edge/tests/runtime_obs_conformance.rs:34, a test). torch-shim is a DEV-dependency of torch-edge only (torch/crates/torch-edge/Cargo.toml:72, :77-81).
- The installer stages it to `$TORCH_PREFIX/torch-shim` (`/opt/torch/bin`, root 0755) (20-build.sh:13, :44-48; common.sh:19) but no phase references it further (grep of deploy/ finds only 20-build.sh and the README table, torch/deploy/torch-install/README.md:38).
- Where MCP tool activity reaches the node today is the transcript tap (AG.8), which feeds `governed_payload` (torch/crates/torch-edge/src/transcript_tap.rs:43; torch/crates/torch-edge/src/agent_govern.rs:1505-1517), not this shim.

---

### 6.E torch-trustflow

What it is: the TLS-terminating loopback proxy library (TRD-34 R-OBS-40): per-host CA + on-the-fly leaf minting so the runtime fabric can extract llm.* facts and evaluate inline policy (torch/crates/torch-trustflow/src/lib.rs:6-18). Library only: no `[[bin]]` (torch/crates/torch-trustflow/Cargo.toml).

Configuration surface (all compile-time or caller-supplied; no env, no file):
- Per-agent loopback port = 49152 + (fold(GCI composite) mod 16384), i.e. in 49152..=65535 (torch/crates/torch-trustflow/src/port.rs:10-15, :23-31).
- Wrap-time injection it would WRITE into an agent's launch env: `HTTPS_PROXY` and `HTTP_PROXY` = `http://127.0.0.1:<port>`, and `SSL_CERT_FILE`, `CURL_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE` = the CA file path (torch/crates/torch-trustflow/src/inject.rs:33-56); `write_ca` materializes the CA PEM (inject.rs:75-77).
- CA: self-signed "Torch TrustFlow per-host CA", KeyCertSign/CrlSign, "generated once at install" per its doc (torch/crates/torch-trustflow/src/ca.rs:8-12, :55-75). No installer phase generates it (grep of deploy/ for trustflow: no match).
- Inline policy deadline: 50 ms, shared with the shim (torch/crates/torch-obs/src/enforce.rs:27).
- Bypass handling composes the VTZ egress classification (Governed / Ordinary / Restricted->Dropped) (torch/crates/torch-trustflow/src/compose.rs:10-36).

Live vs deferred: real provider forwarding is DEFERRED-LIVE (lib.rs:20-21; proxy.rs:8-10). No production caller: `TrustFlowCa`, `ProxyInjection`, `terminate_and_forward`, `loopback_port`, `governed_route` have no uses outside the crate (grep); it is a dev-dependency of torch-edge only (torch/crates/torch-edge/Cargo.toml:72, :77-81).

---

### 6.F torch-scenario

What it is: the WT.2 weight-tuning scenario driver: executes a crdb-authored scenario manifest as real host traffic so the sensor path observes it; "a lab tool for the WT.3 rebuild, never shipped to an endpoint" (torch/crates/torch-scenario/src/main.rs:1-15; torch/crates/torch-scenario/Cargo.toml description + :19-25).

CLI (no env vars) (main.rs:120-151):

| Flag | Default | Validation | Effect |
|---|---|---|---|
| `--manifest <path>` | required | read + parse (main.rs:49-51, :145) | the manifest (projection of `cdb_cyber::ScenarioManifest`) |
| `--dry-run` | off | -- | build the plan, emit nothing (main.rs:58-65) |
| `--no-pace` | pacing on | -- | run steps straight through instead of sleeping to offsets (main.rs:77-90) |
| `--out <path>` | none | -- | write the run manifest JSON for the WT.4 join (main.rs:54-56, :99-118) |
| `--connect-timeout-ms N` | 200 ms (main.rs:124) | integer (main.rs:133-139) | per-connect timeout of the live emitter (torch/crates/torch-scenario/src/emit.rs:96-105) |
| unknown arg | -- | error (main.rs:141) | -- |

Safety bounds: every endpoint must be RFC 5737 TEST-NET (`192.0.2.`, `198.51.100.`, `203.0.113.`) or a `.invalid` name, else the manifest is refused (torch/crates/torch-scenario/src/manifest.rs:148-168, :116-134); a threat class without an endpoint is refused (manifest.rs:120-127). Actions: TCP connect (SYN is the signal), DNS resolve, or exec of the fixed `/bin/true --wt-scenario` (emit.rs:108-135; torch/crates/torch-scenario/src/plan.rs:160-162). Constants: cadence 60 s, behavioural sink `198.51.100.250:443`, contact burst 3 x 5 s (plan.rs:23, :117, :127, :134). Not built or installed by the installer (20-build.sh:13).

---

### 6.G torch-wrap (TORCH_EGRESS_BROKER) and torch-broker

torch-wrap:
- `TORCH_EGRESS_BROKER` is a constant (`BROKER_ENV`) that the cooperative wrap WRITES into a generated `#!/bin/sh` launch shim (`export TORCH_EGRESS_BROKER="<broker>"; exec "<exe>" "$@"`, chmod 0755) in a caller-given wrap dir (torch/crates/torch-wrap/src/wrap.rs:13-16, :75-114, :116-126). Torch never READS it (no `env::var` of it anywhere; the only literal is wrap.rs:16). `WrapPolicy` = {broker, policy_version} (wrap.rs:31-39). The wrap refuses unless the binary's provenance verifies (signature against a pinned key, or explicit hash-pin opt-in; signature-required is the default posture) (torch/crates/torch-wrap/src/lib.rs:17-20; wrap.rs:81-88).
- Not wired: `wrap`, `instant_wrap`, `CapturePolicyStore`, `PinnedPolicyVerifier`, `WrapVerificationPolicy`, `MachineIdHostMaterial`, `host_redirector`, `DlpFilter` have no non-test use outside torch-wrap (grep). torchd/torch-edge use torch-wrap only for GCI minting and zone derivation (`mint_gci_from_hash`, `zone_id_of`, `hash_hex`, `Gci`/`GciTrust`), e.g. torchd.rs:1302, :1314; agent_govern.rs:44, :428, :560; placement.rs:25, :425.
- Other torch-wrap configuration shapes that exist in code but are not delivered to an endpoint today: `CapturePolicy` {version, capture_enabled, dictionary, entropy_threshold, min_entropy_len}, "authored per VTZ", in an ML-DSA-87-signed `CapturePolicyBundle` (torch/crates/torch-wrap/src/policy.rs:20-58); the browser native-messaging host pins `TORCH_CAPTURE_EXTENSION_ID`, which is a documented placeholder `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` to be replaced at signing (torch/crates/torch-wrap/src/browser.rs:29-35), 1 MiB frame cap (browser.rs:37-40); `MAX_FORCE_RELAUNCH_ATTEMPTS = 3` (torch/crates/torch-wrap/src/running.rs:32).

torch-broker:
- Library client of the brokered surfaces (workspace, file tree, git, registry, cognition, capture) over the seam (torch/crates/torch-broker/src/lib.rs:1-59). Constants only: agent-plane call deadline 30 s (torch/crates/torch-broker/src/plane.rs:58), cognition call deadline 120 s (torch/crates/torch-broker/src/cognition.rs:80), workspace name prefix `gci/` (torch/crates/torch-broker/src/workspace.rs:34), capture media type `application/vnd.torch.capture+json` (torch/crates/torch-broker/src/capture.rs:17).
- Not in torchd: torch/crates/torch-edge/Cargo.toml has no torch-broker entry at all (its [dependencies] run :17-71); used only by torch-enroll's optional `validation-capstone` feature (torch/crates/torch-enroll/Cargo.toml:14-19, :25-26), which the installer does not enable (20-build.sh:31-34).

---

### 6.H torch-core shared configuration

#### 6.H.1 CDB_* environment variables

Production reads of `CDB_*` occur only in torchd's `seam_target` (torchd.rs:263-296); every other `"CDB_..."` literal in torch/crates is in tests (torch/crates/torch-edge/src/bin/torchd.rs:2102-2153 are inside `#[cfg(test)]` starting at torchd.rs:1855; torch/crates/torch-core/tests/live_*_capstone.rs:33-37; torch/crates/torch-broker/tests/live_capture_capstone.rs:354-360; torch/crates/torch-edge/tests/live_capstone.rs:55-59).

| Name | Reader | Default | Required? | Meaning |
|---|---|---|---|---|
| CDB_ADDR | torchd (torchd.rs:269) | -- | yes | the node's :7878 seam host:port |
| CDB_SERVER_NAME | torchd (torchd.rs:270) | `wire.localhost` | no | TLS server name for the seam |
| CDB_CA | torchd (torchd.rs:274 pem, :280 tpm) | -- | yes (both modes) | path to the wire CA PEM |
| CDB_CLIENT_CERT | torchd (torchd.rs:275 pem, :281 tpm) | -- | yes (both modes) | path to the client cert (in tpm mode: the enrolled `device.pem`) |
| CDB_CLIENT_KEY | torchd (torchd.rs:276) | -- | yes, pem mode only | path to the client key PEM (dev custody) |

Related (torchd, same function): `TORCH_IDENTITY` `pem` (default) or `tpm` (Linux only); anything else is a typed error (torchd.rs:271-289); `TORCH_TCTI` default `device:/dev/tpmrm0` in tpm mode (torchd.rs:282). In tpm mode torchd re-derives the owner-hierarchy primary and refuses to start if it does not match the certificate ("was the TPM cleared, or is CDB_CLIENT_CERT a foreign certificate?") (torchd.rs:304-332). The installer also uses `CDB_ADDR`/`CDB_SERVER_NAME` as installer knobs to feed torch-enroll's wire settings (30-enroll.sh:50-51; common.sh:33-34).

#### 6.H.2 EnvCredentialProvider

Reads three caller-NAMED variables holding PEM CONTENTS (not paths): `ca_var`, `cert_var`, `key_var`; unset or empty fails closed (torch/crates/torch-core/src/identity.rs:340-392). Marked "Dev custody only" (identity.rs:342-345). Constructed only in tests (identity.rs:673, :695, inside `#[cfg(test)]` at identity.rs:484); no binary uses it. torchd's pem mode reads FILE PATHS instead (torchd.rs:265-277).

#### 6.H.3 TPM keystore and TCTI

- `TpmBackend::new(tcti)` -- e.g. `swtpm:host=127.0.0.1,port=2321` or `device:/dev/tpmrm0` (keystore.rs:187-199). `open()` = parse TCTI + create context + `get_random(8)` probe; any failure -> `Unavailable`, never a software fallback (keystore.rs:399-410).
- Device key: owner-hierarchy primary, P-384 ECDSA-SHA384, non-exportable, deterministic so a fresh process re-derives the same key; a TPM2_Clear changes it and torchd's self-check fails closed (keystore.rs:228-231, :412-450).
- Sign: message <= 1024 bytes, SHA-384 hashed in-TPM (keystore.rs:167-169, :452-483). Attest: nonce <= 64 bytes; RSA-2048 RSASSA-SHA256 restricted AK; EK cert from NV 0x01c00002 or the out-of-band override (keystore.rs:171-173, :262-264, :295-306, :322-326, :485-494).
- `TORCH_TEST_TCTI` is test-only (keystore.rs:510 `#[cfg(test)]`, reads at :599 etc.; agent_govern.rs:2790 is inside the `#[cfg(test)]` module starting at agent_govern.rs:2292).

#### 6.H.4 Deadlines, retry, TLS, frame and lease constants (compile-time)

| Item | Value | Where |
|---|---|---|
| SeamDeadlines default | connect 5 s, handshake 5 s, round-trip 30 s | torch/crates/torch-core/src/seam.rs:168-191 |
| Max wire frame payload | 8 MiB | seam.rs:37 |
| IdpDeadlines default | connect 5 s, TLS 5 s, exchange 20 s, 256 KiB response cap | device_grant.rs:243-272 |
| Device-grant poll interval default | 5 s (IdP may override; `slow_down` +5 s; floor 1 s) | device_grant.rs:113-115, :205, :225 |
| RetryPolicy default | 4 attempts, 50 ms base, 2 s cap, 0.5 jitter | torch/crates/torch-types/src/retry.rs:15-27, :43-52 (torchd uses the default, torchd.rs:806) |
| Lease heartbeat | every 1/3 of the server-advertised lease window | torch/crates/torch-core/src/lease.rs:14-17, :37-41 |
| Wire (mTLS signer) TLS | TLS 1.3 only, X25519MLKEM768 only | mtls_signer.rs:166-175 |
| Bootstrap TLS | TLS 1.3 only, X25519MLKEM768 then X25519, no client cert | enroll.rs:82-112 |
| Mux defaults | 128 concurrent streams, out buffer 256, stream buffer 64 | torch/crates/torch-core/src/mux.rs:34-39 |
| Query result caps | 10,000 rows, 64 MiB | torch/crates/torch-core/src/result.rs:25-28 |

None of these is operator-configurable through env or file; they change only by code.

---

### 6.I Counts and UNVERIFIED list

Counts:
- Env vars read by the non-torchd binaries: 19 -- torch-placed 3 (TORCH_PLACE_SOCKET, TORCH_CGROUP_ROOT, TORCH_IDENTITY_AUTH_LOG); torch-enroll 16 (7 required: TORCH_IDP_HOST, TORCH_IDP_CLIENT_ID, TORCH_ATTEST_NONCE, TORCH_BOOTSTRAP_ADDR, TORCH_BOOTSTRAP_CA, TORCH_WIRE_ADDR, TORCH_WIRE_CA; 9 optional incl. the feature-gated TORCH_COGNITION_MODEL).
- CLI surfaces: torch-shim 1 (server command after `--`); torch-scenario 5 flags.
- Env names WRITTEN (not read) for a wrapped agent: 7 (TORCH_EGRESS_BROKER; HTTPS_PROXY, HTTP_PROXY, SSL_CERT_FILE, CURL_CA_BUNDLE, NODE_EXTRA_CA_CERTS, REQUESTS_CA_BUNDLE) -- none is wired to a live path.
- torch-placed socket ops: 9. torch-placed TUNE constants: 10.
- Production CDB_* reads: 5 (torchd only).
- Test-only env: TORCH_TEST_TCTI; EnvCredentialProvider (caller-named).

UNVERIFIED:
1. The 24-hour enrollment certificate lifetime: not stated in torch code; node knob `CDB_ENROLL_VALIDITY_SECS` unset -> CA default (crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:800-811), 7-day ceiling (crucible/crates/cdb-server/src/config.rs:890). The CA default is configured outside these repos.
2. Whether a symlinked `<HOME>/.claude` (or `.codex`) would steer the root helper's artifact/transcript read to another user's files (B.7 item 2) -- code does not guard it; not exercised at runtime.
3. Whether the identity-event lane re-ships the whole auth log when the helper is unreachable at torchd start and appears later (B.7 item 4) -- inferred from torchd.rs:644-652 + placement.rs:634-649; not exercised.
4. Runtime behavior of a stalled helper (B.7 item 1) -- inferred from the absence of timeouts; not exercised.

## 7. The endpoint installer

Scope: everything under torch/deploy/torch-install (install.sh, lib/common.sh, phases/*.sh,
tetragon/*.yaml, README.md, vendor/). torch/deploy/README.md was read: it documents the torch-dev
container only and has nothing installer-related (torch/deploy/README.md:1-31).
Repo state read: torch HEAD d8f03ca. Read-only; nothing was run. Paths are relative to /home/todd/dev.
Short cites: when a cite gives only `file:line`, the file is under torch/deploy/torch-install/installer/.

Index
1. Phases in run order (runner, selection flags, per-phase behavior)
2. Knobs (flags, env, phase-local env, pass-through env, bundle-assembly knobs)
3. Artifacts written (packages/users, dirs, /etc/torch files, torchd.env, units + drop-ins, FIFOs +
   bridges, torch-placed socket, Tetragon config, sysctl, TracingPolicies)
4. Enrollment phase (Auth0 device flow, identity landing, certificate lifetime, re-enroll)
5. govern-attest phase (the grant, identity, what the engine sees)
6. Validate checks (60-validate) + in-phase render checks
7. Lanes ON vs OFF on a default install; enforcement
8. Findings: doc-vs-code drift and hazards
9. UNVERIFIED items

---------------------------------------------------------------------------------------------------

### 7.1 Phases in run order

#### 7.1.1 Runner (install.sh)

- Authoritative phase list, in order: `10-prereqs 20-build 30-enroll 35-tetragon 40-config 50-systemd
  55-govern-attest 60-validate` (torch/deploy/torch-install/installer/install.sh:28).
  Drift: the header comment lists only six phases (omits 35-tetragon and 55-govern-attest,
  install.sh:6); the README phase table omits 55-govern-attest (torch/deploy/torch-install/README.md:35-43).
- Flags (install.sh:33-42):
  - `--only <phase>` repeatable (install.sh:35); `--skip <phase>` repeatable (install.sh:36);
    `--from <phase>` start at that phase (install.sh:37); `--list` prints the phases and exits
    before the root check (install.sh:38); `-h|--help` prints the header (install.sh:30,39);
    anything else dies "unknown argument" (install.sh:40).
  - Selection: `--from` drops phases before the named one, `--only` keeps only listed phases, `--skip`
    removes listed phases (install.sh:46-54). An empty selection -- e.g. a misspelled `--from` --
    dies "no phases selected" (install.sh:55).
- Must run as root (install.sh:57; predicate lib/common.sh:138).
- Each phase runs as a child `bash phases/<p>.sh`; any failure dies with the resume hint
  `sudo ./install.sh --from <p>` (install.sh:62-66). Strict mode `set -Eeuo pipefail` in the runner
  (install.sh:22), the lib (lib/common.sh:5) and every phase (e.g. phases/10-prereqs.sh:5).
- Every phase re-sources lib/common.sh at its top (e.g. phases/35-tetragon.sh:13), so the common
  `:=` defaults are applied inside each phase BEFORE any phase-local `${VAR:-0}` fallback is
  evaluated. The effective defaults are therefore the lib/common.sh values (see section 8, finding F2).
- Idempotency primitives: `write_unit` rewrites a unit only when its content changed, then runs
  `systemctl daemon-reload` (lib/common.sh:147-154); `ensure_user`/`ensure_dir` are no-ops when the
  user/dir already exists (lib/common.sh:141-146). `wait_for` polls once per second to a timeout and
  dies on timeout (lib/common.sh:157-165).
- No phase ever restarts torchd: 50-systemd ends with `systemctl enable --now torchd.service`
  (phases/50-systemd.sh:281) and there is no restart/try-restart call anywhere in the installer.
  Per systemd semantics (not repo code), `enable --now` does not restart an already-running unit, so a
  re-run that changes torchd.env or a drop-in takes effect at the next torchd restart.

#### 7.1.2 Per phase

10-prereqs (phases/10-prereqs.sh)
- Requires systemd (`systemctl`) (10-prereqs.sh:9).
- TPM check: when TORCH_TCTI is `device:<path>` (default `device:/dev/tpmrm0`), the path must be a
  character device or the phase dies; a non-device TCTI only warns (10-prereqs.sh:12-19). There is no
  software-key fallback (10-prereqs.sh:3-4).
- TSS runtime: if `ldconfig -p` lacks libtss2-esys, `apt-get install libtss2-esys-3.0.2-0
  libtss2-tcti-device0 tpm-udev` (network); no apt-get -> die (10-prereqs.sh:22-29).
- Service user `torch` (10-prereqs.sh:32); added to group `tss` when that group exists, else a warning
  (10-prereqs.sh:33-37).
- Layout dirs (10-prereqs.sh:40-44) -- see 3.2. Idempotent.

20-build (phases/20-build.sh)
- Stages four binaries: torchd, torch-enroll, torch-shim, torch-placed (20-build.sh:13) into
  /opt/torch/bin, root:root 0755 (20-build.sh:20,47).
- TORCH_BIN_DIR set -> copy prebuilts; each must exist and be executable or die (20-build.sh:15-24).
- Else: `cargo build --release -p torch-edge --bin torchd --bin torch-placed -p torch-enroll
  --bin torch-enroll -p torch-shim --bin torch-shim` run as the repo owner via runuser
  (20-build.sh:26-35); dies if that user has no cargo (20-build.sh:27-28); resolves the real target dir
  with `cargo metadata` + jq, installing jq via apt when missing (20-build.sh:39-42); a missing artifact
  dies (20-build.sh:46). The cargo path is not airgapped (apt, cargo git deps); the TORCH_BIN_DIR path is.
- Re-running overwrites the binaries unconditionally (no version check).

30-enroll (phases/30-enroll.sh) -- section 4. Skips when /etc/torch/identity/device.pem is non-empty
(30-enroll.sh:14-17). Interactive.

35-tetragon (phases/35-tetragon.sh)
- Runs only when TORCH_SECURITY_LANE=1 (default 1 per lib/common.sh:58); otherwise logs and exits 0
  (35-tetragon.sh:16-19).
- Preconditions: kernel BTF at /sys/kernel/btf/vmlinux (35-tetragon.sh:22); arch amd64 or arm64, else
  die (35-tetragon.sh:23-28).
- Supply mode: TORCH_TETRAGON_PATCHED=1 (default 1, lib/common.sh:80) selects
  `vendor/tetragon/<arch>/tetragon-v1.7.0-<arch>-torch.tar.gz` and SHA256_TETRAGON_PATCHED_<ARCH>; an
  EMPTY checksum for the arch dies (fail closed) (35-tetragon.sh:38-48). Otherwise the upstream
  tarball + SHA256_TETRAGON_<ARCH> (35-tetragon.sh:49-57). Missing tarball dies (35-tetragon.sh:58);
  checksum mismatch dies (35-tetragon.sh:59).
- Installs the payload offline: `cp -Rf usr/local/. /usr/local/` and the vendored tetragon.service to
  /usr/lib/systemd/system (0644) (35-tetragon.sh:63-67).
- Writes tetragon drop-ins, config, TracingPolicies, the conntrack sysctl, enables tetragon, then the
  bridges (details in 3.4-3.8).
- Waits up to 30 s for the export file to be non-empty, else dies (35-tetragon.sh:225).

40-config (phases/40-config.sh)
- Requires device.pem and /etc/torch/wire-ca.pem (40-config.sh:9-10).
- (Re)writes /etc/torch/torchd.env via temp file + `install -o root -g torch -m 0640`
  (40-config.sh:12-47). Always overwrites operator edits; the file's first line says so
  (40-config.sh:15; torch/deploy/torch-install/README.md:60-61).

50-systemd (phases/50-systemd.sh)
- Requires /opt/torch/bin/torchd and torchd.env (50-systemd.sh:11-12).
- Writes torchd.service (50-systemd.sh:31-68). If TORCH_AGENT_GOVERN=1: requires TORCH_SECURITY_LANE=1
  or dies (50-systemd.sh:76-78); report seed, manifest, govern.conf drop-in (50-systemd.sh:79-119). If
  also TORCH_AGENT_DISCOVER=1: discover.json, discover.conf drop-in + render checks, torch-placed.service
  (enabled, started, render checks) (50-systemd.sh:127-245). Then the torch-agent@.service template
  (50-systemd.sh:247-278). Finally enables + starts torchd (50-systemd.sh:281).

55-govern-attest (phases/55-govern-attest.sh) -- section 5. Skips (never fails) when governance and
discovery are both off, the crdb admin plane is not local, or no EK cert file exists
(55-govern-attest.sh:17-18,24-27,39-48).

60-validate (phases/60-validate.sh) -- section 6.

---------------------------------------------------------------------------------------------------

### 7.2 Knobs

#### 7.2.1 Flags (5)

| Flag | Effect | Cite |
|---|---|---|
| `--only <phase>` | run only the named phase(s); repeatable | install.sh:35,51 |
| `--skip <phase>` | skip the named phase(s); repeatable | install.sh:36,52 |
| `--from <phase>` | start at the named phase | install.sh:37,49-50 |
| `--list` | print phases, exit (no root needed) | install.sh:38 |
| `-h`, `--help` | print usage (header lines 2-18) | install.sh:30,39 |

#### 7.2.2 Environment knobs defined in lib/common.sh (47 + 1 test hook)

All are `: "${VAR:=default}"` -- an unset OR empty value takes the default, so only an explicit
non-default value changes behavior. "Lane switch" knobs compare against the exact string "1".

| Knob | Default | Validation | Read by | Effect |
|---|---|---|---|---|
| TORCH_REPO | repo root (installer dir/../../..) (lib/common.sh:18) | none | 20-build.sh:26-40; install.sh:59 | cargo build source |
| TORCH_PREFIX | /opt/torch/bin (lib/common.sh:19) | none | 20-build, 30-enroll, 50-systemd | binary dir; ExecStart paths |
| TORCH_ETC | /etc/torch (lib/common.sh:20) | none | all | config dir |
| TORCH_IDENTITY_DIR | ${TORCH_ETC}/identity (lib/common.sh:21) | none | 30-enroll, 40-config | TORCH_IDENTITY_OUT; device.pem home |
| TORCH_DATA_DIR | /var/lib/torch (lib/common.sh:22) | none | 10-prereqs, 50-systemd | state dir; torchd ReadWritePaths (50-systemd.sh:55) |
| TORCH_SPILL_DIR | ${TORCH_DATA_DIR}/spill (lib/common.sh:23) | none | 10-prereqs, 40-config | torchd.env TORCH_SPILL_DIR (40-config.sh:22) |
| TORCH_SVC_USER | torch (lib/common.sh:24) | none | all | service user AND group name everywhere |
| TORCH_BIN_DIR | empty (lib/common.sh:28) | each binary executable (20-build.sh:19) | 20-build | stage prebuilts instead of cargo |
| CDB_ADDR | 127.0.0.1:7878 (lib/common.sh:33) | TCP reachability in 60-validate.sh:9 | 30-enroll.sh:50, 40-config.sh:17 | node wire seam for torch-enroll + torchd |
| CDB_SERVER_NAME | wire.localhost (lib/common.sh:34) | none | 30-enroll.sh:51, 40-config.sh:18 | seam TLS server name |
| TORCH_WIRE_CA_SRC | /etc/cdb/mtls/ca.pem (lib/common.sh:35) | non-empty (30-enroll.sh:26) | 30-enroll | copied to /etc/torch/wire-ca.pem |
| TORCH_BOOTSTRAP_ADDR | 127.0.0.1:7443 (lib/common.sh:36) | none | 30-enroll.sh:47 | node enrollment listener |
| TORCH_BOOTSTRAP_SERVER_NAME | enroll.localhost (lib/common.sh:37) | none | 30-enroll.sh:48 | enrollment TLS server name |
| TORCH_BOOTSTRAP_CA_SRC | /etc/cdb/ztp/enroll-tls/ca.pem (lib/common.sh:38) | non-empty (30-enroll.sh:27) | 30-enroll | copied to /etc/torch/bootstrap-ca.pem |
| TORCH_IDP_HOST | empty; REQUIRED for 30-enroll (lib/common.sh:44) | non-empty or die (30-enroll.sh:20) | 30-enroll.sh:43 | federated IdP (Auth0 tenant) host |
| TORCH_IDP_CLIENT_ID | empty; REQUIRED (lib/common.sh:45) | non-empty or die (30-enroll.sh:21) | 30-enroll.sh:44 | IdP device-code (Native) client id |
| TORCH_ATTEST_NONCE | empty; REQUIRED (lib/common.sh:46) | non-empty or die (30-enroll.sh:22) | 30-enroll.sh:45 | must equal the node's attestation nonce |
| TORCH_PROPOSED_FQDN | `hostname -f`, else `hostname` (lib/common.sh:47) | none | 30-enroll.sh:46 | proposed device CN |
| TORCH_TCTI | device:/dev/tpmrm0 (lib/common.sh:48) | char device when `device:*` (10-prereqs.sh:12-19) | 10-prereqs, 30-enroll.sh:53, 40-config.sh:21, 50-systemd.sh:18-20 | TPM access; torchd.env; unit DeviceAllow |
| TORCH_EK_CERT_SRC | empty (lib/common.sh:51) | readable + non-empty when set (30-enroll.sh:34) | 30-enroll.sh:33-38 | out-of-band EK leaf -> /etc/torch/ek-cert.pem, passed as TORCH_EK_CERT |
| TORCH_SECURITY_LANE | 1 (lib/common.sh:58) | "1" = on | 35-tetragon.sh:16, 40-config.sh:30, 50-systemd.sh:25,77, 60-validate.sh:37 | whole Tetragon sensor; writes TORCH_TETRAGON_GRPC; prerequisite of govern |
| TORCH_TETRAGON_EXPORT | /var/log/tetragon/tetragon.log (lib/common.sh:59) | none | 35-tetragon.sh:102-103,225, bridges | Tetragon JSON export path + bridge tail source |
| TORCH_TETRAGON_FIFO | /run/torch/tetragon.fifo (lib/common.sh:60) | none | 35-tetragon.sh:243-272 | security FIFO (pinned-source rollback only) |
| TORCH_TETRAGON_SOCK | /var/run/tetragon/tetragon.sock (lib/common.sh:61) | none | 35-tetragon.sh:91-94, 40-config.sh:31 | gRPC socket chgrp; value of TORCH_TETRAGON_GRPC |
| TORCH_TETRAGON_PATCHED | 1 (lib/common.sh:80) | "1"; checksum for arch must be non-empty (35-tetragon.sh:46) | 35-tetragon.sh:38,191 | patched Tetragon build; satisfies the uprobe-string requirement |
| TORCH_FILE_TELEMETRY | 1 (lib/common.sh:81) | "1" | 35-tetragon.sh:131,155,181; 60-validate.sh:39 | torch-file.yaml (vfs_write) |
| TORCH_DNS_TELEMETRY | 1 (lib/common.sh:82) | "1"; needs patched build or kernel kfunc, else die (35-tetragon.sh:190-196) | 35-tetragon.sh:139,158,195; 60-validate.sh:40 | torch-dns.yaml (getaddrinfo) |
| TORCH_MODULE_TELEMETRY | 1 (lib/common.sh:83) | same as DNS (35-tetragon.sh:201-202) | 35-tetragon.sh:144,161,201; 60-validate.sh:40 | torch-module.yaml (dlopen) |
| TORCH_AGENT_GOVERN | 1 (lib/common.sh:90) | "1"; requires TORCH_SECURITY_LANE=1 (50-systemd.sh:77-78) | 35-tetragon.sh:281, 50-systemd.sh:27,76, 55-govern-attest.sh:24 | govern bridge, seed, manifest, govern.conf, torch-agent@ template, 55 phase |
| TORCH_GOVERN_FIFO | /run/torch/govern.fifo (lib/common.sh:91) | none | 35-tetragon.sh:282-309; 50-systemd.sh:113 | govern FIFO; TORCH_AGENT_GOVERN_SOURCE |
| TORCH_GOVERN_MANIFEST | ${TORCH_ETC}/govern/manifest.json (lib/common.sh:92) | none | 50-systemd.sh:79,95-105,111 | TORCH_AGENT_GOVERN_MANIFEST |
| TORCH_GOVERN_SEED | ${TORCH_ETC}/govern/report-seed.bin (lib/common.sh:93) | none here; torchd requires exactly 32 bytes (torch/crates/torch-edge/src/bin/torchd.rs:1142-1150) | 50-systemd.sh:83-90,112 | TORCH_AGENT_GOVERN_KEY |
| TORCH_GOVERN_MANIFEST_SRC | empty (lib/common.sh:94) | readable | 50-systemd.sh:95-97 | operator manifest copied OVER the existing manifest |
| TORCH_GOVERN_ANCHOR_SECS | 20 (lib/common.sh:95) | none here; torchd requires > 0 (torchd.rs:1151-1157) | 50-systemd.sh:114 | TORCH_AGENT_GOVERN_ANCHOR_SECS (torchd's own default is 60, torchd.rs:1112) |
| TORCH_AGENT_TRANSCRIPT_TAP | 1 (lib/common.sh:100) | torchd treats only "1" as on (torchd.rs:1193-1194) | 50-systemd.sh:117 | transcript tool lane (AG.8) |
| TORCH_GOVERN_AGENTS_DIR | ${TORCH_ETC}/govern/agents (lib/common.sh:101) | none | 50-systemd.sh:258,270 | per-zone launcher env dir |
| TORCH_AGENT_DISCOVER | 1 (lib/common.sh:108) | "1"; nested inside the govern block (50-systemd.sh:127) | 35-tetragon.sh:320, 50-systemd.sh:127, 55-govern-attest.sh:24 | discover bridge, discover.json, discover.conf, torch-placed |
| TORCH_DISCOVER_CONFIG | ${TORCH_ETC}/govern/discover.json (lib/common.sh:109) | render check (50-systemd.sh:178-184) | 50-systemd.sh:131-161 | TORCH_AGENT_DISCOVER_CONFIG |
| TORCH_DISCOVER_CONFIG_SRC | empty (lib/common.sh:110) | readable | 50-systemd.sh:131-133 | operator policy copied OVER the existing file |
| TORCH_PLACE_SOCKET | /run/torch/place/place.sock (lib/common.sh:111) | socket must appear within 5 s (50-systemd.sh:238-243) | 50-systemd.sh:128,162,212 | torch-placed socket; torchd env |
| TORCH_DISCOVER_FIFO | /run/torch/discover.fifo (lib/common.sh:112) | none | 35-tetragon.sh:321-348; 50-systemd.sh:166 | discovery FIFO; TORCH_DISCOVER_SOURCE |
| TORCH_TETRAGON_SOURCE | empty (lib/common.sh:116) | none | 35-tetragon.sh:236; 40-config.sh:28-29 | pins the FIFO transport: written to torchd.env INSTEAD of TORCH_TETRAGON_GRPC, and the tetragon FIFO bridge is written + enabled |
| TORCH_AIOPS_INTERVAL_SECS | empty (lib/common.sh:117) | forwarded verbatim only when set (40-config.sh:33); torchd validates | 40-config | AIOps snapshot interval |
| TORCH_QUEUE_CAPACITY | empty (lib/common.sh:118) | forwarded when set (40-config.sh:34) | 40-config | non-lossy queue capacity |
| TORCH_NODE_ROLE | empty (lib/common.sh:121) | forwarded when set (40-config.sh:37); torchd accepts only standard / inference-host (torchd.rs:188-197) | 40-config | security-lane loopback posture |
| TORCH_IDENTITY_INVENTORY | 1 (lib/common.sh:126) | always written (40-config.sh:42) | 40-config | identity-inventory (LUG) lane |
| TORCH_IDENTITY_CADENCE_HOURS | empty = torchd's 24 h (lib/common.sh:127) | forwarded when set (40-config.sh:43); torchd requires > 0 (torchd.rs:445-452) | 40-config | full-sweep cadence |
| _torch_kallsyms (test hook) | /proc/kallsyms (lib/common.sh:134) | n/a | kernel_has_uprobe_string_kfunc | kfunc probe file |

INSTALLER_DIR is computed and exported by the runner (install.sh:23-24); it is not an operator knob.

#### 7.2.3 Phase-local knobs (not in lib/common.sh; 12 + SUDO_USER)

| Knob | Default | Read in | Effect |
|---|---|---|---|
| TORCH_CONTENT_CAPTURE | 0 (`${...:-0}`) | 35-tetragon.sh:118,149,169 | "1" installs torch-loopback-head.yaml; otherwise the loaded policy is deleted |
| TORCH_SOCKET_LIFECYCLE | 0 | 35-tetragon.sh:124,152,176 | "1" installs torch-close.yaml; otherwise deleted |
| CDB_ADMIN_ADDR | 127.0.0.1:7440 | 55-govern-attest.sh:30 | crdb admin plane address |
| CDB_ADMIN_SNI | admin.localhost | 55-govern-attest.sh:31 | admin TLS SNI |
| CDB_ADMIN_CA | /etc/cdb/admin/ca.pem | 55-govern-attest.sh:32 | admin CA (must be readable) |
| CDB_ADMIN_CERT | /etc/cdb/admin/client.pem | 55-govern-attest.sh:33 | admin client cert (must be readable) |
| CDB_ADMIN_KEY | /etc/cdb/admin/client.key | 55-govern-attest.sh:34 | admin client key (must be readable) |
| CDB_ACTL | /usr/local/bin/cdb-actl | 55-govern-attest.sh:35 | admin CLI (must be executable) |
| CDB_NODE_CBOR | /etc/cdb/node.cbor | 55-govern-attest.sh:36,62-78 | node config, decoded for the tenant |
| TORCH_GOVERN_EK_CERT | ${TORCH_EK_CERT:-${TORCH_ETC}/ek-cert.pem} | 55-govern-attest.sh:37,45,49 | EK cert the governor anchor is derived from |
| TORCH_EK_CERT | unset | 55-govern-attest.sh:37 | only the fallback of TORCH_GOVERN_EK_CERT |
| CDB_GOVERN_TENANT | empty -> node.cbor decode -> hardcoded df46dcb7-2e91-448c-a406-42e492b85e36 | 55-govern-attest.sh:60-79 | tenant of the grant |
| SUDO_USER (set by sudo) | root | 55-govern-attest.sh:63 | user that runs the python cbor decode |

#### 7.2.4 Pass-through to torch-enroll (never set by the installer)

30-enroll invokes `env VAR=... torch-enroll` without `-i` (30-enroll.sh:42-56), so any other variable the
operator passed into the installer's environment reaches torch-enroll. torch-enroll reads, with
defaults: TORCH_IDP_AUDIENCE (default `https://crucibledb/enroll`) and TORCH_IDP_SCOPE (default
`openid profile email`) (torch/crates/torch-enroll/src/main.rs:34-35).

#### 7.2.5 Per-agent launcher knob (consumed by a unit, not by the installer)

TORCH_AGENT_CMD in `/etc/torch/govern/agents/<zone>.env` -- the command the torch-agent@<zone> unit
execs; a missing env file or unset variable fails the unit (50-systemd.sh:266-271).

#### 7.2.6 Bundle-assembly knobs (vendor/, run on a networked host, not by install.sh)

- vendor/fetch-tetragon.sh `[arch...]` (default both amd64 arm64); downloads the Cilium release
  tarballs and verifies SHA256 (torch/deploy/torch-install/vendor/fetch-tetragon.sh:10-12,19-43).
- vendor/build-tetragon-patched.sh `[--print-only]`, env GO=/path/to/go; builds for the HOST arch only;
  asserts clang == TETRAGON_CLANG_VERSION and pins Go via GOTOOLCHAIN
  (torch/deploy/torch-install/vendor/build-tetragon-patched.sh:22-23,30-37,47-56).
- vendor/tetragon/MANIFEST: TETRAGON_VERSION=v1.7.0, TETRAGON_SRC_COMMIT, TETRAGON_GO_TOOLCHAIN=go1.26.2,
  TETRAGON_CLANG_VERSION=18.1.3, upstream + patched checksums; SHA256_TETRAGON_PATCHED_ARM64 is EMPTY
  (torch/deploy/torch-install/vendor/tetragon/MANIFEST:19-59).
- vendor/tetragon/patches/0001-uprobe-string-fallback.patch: adds a probe_read_user_str fallback so a
  uprobe `string` arg works on kernels < 6.12 (patch header lines 1-25). The tarballs under
  vendor/tetragon/<arch>/ are gitignored (torch/deploy/torch-install/vendor/tetragon/.gitignore:3-4).
- torch/deploy/gen-device-ek-pki.sh `[OUT_DIR]` (default /var/lib/cdb-models/ztp-ek-pki), EK_PKI_DAYS
  (default 3650): issues an EK leaf over the TPM's real EK public for TPMs without an EK cert in NV
  (torch/deploy/gen-device-ek-pki.sh:2-10,19-20); its output is what TORCH_EK_CERT_SRC points at
  (torch/deploy/torch-install/README.md:52).

---------------------------------------------------------------------------------------------------

### 7.3 Artifacts written

#### 7.3.1 Packages, users, groups

- apt packages when libtss2-esys is missing: libtss2-esys-3.0.2-0, libtss2-tcti-device0, tpm-udev
  (10-prereqs.sh:26); jq when missing on the cargo build path (20-build.sh:39).
- User `torch`: `useradd --system --no-create-home --shell /usr/sbin/nologin` (lib/common.sh:141-142).
- `torch` is added to group `tss` if that group exists (10-prereqs.sh:33-34).
- The installer uses `torch` as a GROUP throughout (e.g. `-g torch`, `Group=torch`) but never creates it
  explicitly. UNVERIFIED: it relies on useradd creating a same-named user group (distro default).

#### 7.3.2 Directories

| Path | Owner:group mode | Cite |
|---|---|---|
| /opt/torch/bin | root:root 0755 | 10-prereqs.sh:40 (ensure_dir group defaults to owner, lib/common.sh:145) |
| /etc/torch | root:torch 0750 | 10-prereqs.sh:41 |
| /etc/torch/identity | root:torch 0750 | 10-prereqs.sh:42 |
| /var/lib/torch | torch:torch 0750 | 10-prereqs.sh:43 |
| /var/lib/torch/spill | torch:torch 0750 | 10-prereqs.sh:44 |
| /etc/torch/govern | root:torch 0750 | 50-systemd.sh:79 |
| /etc/torch/govern/agents | root:torch 0750 | 50-systemd.sh:258 |
| /run/torch | torch:torch 0750 (tmpfs; re-created by bridge + torch-placed ExecStartPre) | 35-tetragon.sh:282,291,321,330; 50-systemd.sh:210 |
| /run/torch/place | root:torch 2770 (setgid) | 50-systemd.sh:211 |
| /var/log/tetragon | root:root 0750 | 35-tetragon.sh:103 |
| /etc/tetragon/tetragon.conf.d, /etc/tetragon/tetragon.tp.d | root 0755 | 35-tetragon.sh:95-96 |
| /etc/systemd/system/tetragon.service.d | root 0755 | 35-tetragon.sh:76 |
| /etc/systemd/system/torchd.service.d | root 0755 | 50-systemd.sh:107 |

#### 7.3.3 Files under /etc/torch

| File | Owner:group mode | Contents / source | Cite |
|---|---|---|---|
| /etc/torch/wire-ca.pem | root:torch 0640 | copy of TORCH_WIRE_CA_SRC (node wire CA, public) | 30-enroll.sh:28 |
| /etc/torch/bootstrap-ca.pem | root:torch 0640 | copy of TORCH_BOOTSTRAP_CA_SRC (enrollment CA, public) | 30-enroll.sh:29 |
| /etc/torch/ek-cert.pem | root:torch 0640 | ONLY when TORCH_EK_CERT_SRC is set | 30-enroll.sh:33-37 |
| /etc/torch/identity/device.pem | root:torch 0640 | the issued PUBLIC leaf, written by torch-enroll (torch/crates/torch-enroll/src/lib.rs:211-216), then chown/chmod | 30-enroll.sh:60-62 |
| /etc/torch/torchd.env | root:torch 0640 | torchd's environment (below) | 40-config.sh:12-46 |
| /etc/torch/govern/report-seed.bin | root:torch 0640 | 32 bytes from /dev/urandom, generated ONCE, never rotated by a re-run | 50-systemd.sh:81-90 |
| /etc/torch/govern/manifest.json | root:torch 0640 | `[]` seeded when absent, or the TORCH_GOVERN_MANIFEST_SRC copy | 50-systemd.sh:92-105 |
| /etc/torch/govern/discover.json | root:torch 0640 | default policy seeded when absent, or the TORCH_DISCOVER_CONFIG_SRC copy | 50-systemd.sh:129-150 |
| /etc/torch/govern/agents/<zone>.env | not written (operator-provided) | TORCH_AGENT_CMD for torch-agent@<zone> | 50-systemd.sh:253-255,270 |

Seeded discovery policy (verbatim, 50-systemd.sh:135-144):
`{"enabled": true, "sweep_secs": 30, "endpoints": [], "signatures": [], "allow": [], "deny": []}`
(the comment says built-in markers apply, 50-systemd.sh:129-130).

The report seed is the govern lane's report-signing key: torchd requires exactly 32 bytes and calls it
"the ML-DSA-87 seed" (torch/crates/torch-edge/src/bin/torchd.rs:1142-1150); a new seed "would change
every agent's Construction Report id" (50-systemd.sh:81-82).

torchd.env as rendered with all defaults (derived from 40-config.sh:15-43 with lib/common.sh defaults):

```
# torchd environment -- written by the Torch installer (re-runnable: edits are overwritten).
TORCH_IDENTITY=tpm
CDB_ADDR=127.0.0.1:7878
CDB_SERVER_NAME=wire.localhost
CDB_CA=/etc/torch/wire-ca.pem
CDB_CLIENT_CERT=/etc/torch/identity/device.pem
TORCH_TCTI=device:/dev/tpmrm0
TORCH_SPILL_DIR=/var/lib/torch/spill
TORCH_TETRAGON_GRPC=/var/run/tetragon/tetragon.sock
TORCH_IDENTITY_INVENTORY=1
```

Conditional lines: TORCH_TETRAGON_SOURCE=<pinned> replaces TORCH_TETRAGON_GRPC when the operator pins a
source (40-config.sh:28-29); neither is written when TORCH_SECURITY_LANE is not 1 and nothing is pinned
(40-config.sh:30-32), and torchd then logs "security lane disabled ... AIOps lane only"
(torchd.rs:882). TORCH_AIOPS_INTERVAL_SECS, TORCH_QUEUE_CAPACITY, TORCH_NODE_ROLE and
TORCH_IDENTITY_CADENCE_HOURS are written only when set (40-config.sh:33-37,43).

torchd keys the installer NEVER writes (anywhere -- torchd.env or drop-ins): TORCH_POLICY_ANCHOR,
TORCH_POLICY_ENDPOINT_CN, TORCH_POLICY_FETCH_SECS (read at torchd.rs:199-219),
TORCH_FLOW_EXPORT_INTERVAL_SECS (torchd.rs:173), CDB_CLIENT_KEY (pem mode only, torchd.rs:276). A grep of
the installer for POLICY_ANCHOR / POLICY_ENDPOINT / POLICY_FETCH / FLOW_EXPORT / forge finds nothing.

#### 7.3.4 systemd units and drop-ins

Unit files written to /etc/systemd/system by `write_unit` are root:root 0644 (lib/common.sh:152).

torchd.service (50-systemd.sh:31-68), enabled + started (50-systemd.sh:281)
- [Unit] Description "Torch edge daemon (enrolled sensing -> CrucibleDB uplink)"; After= + Wants=
  network-online.target (50-systemd.sh:35-36); plus After= + Wants= torch-tetragon-bridge.service when
  TORCH_SECURITY_LANE=1 and torch-govern-bridge.service when TORCH_AGENT_GOVERN=1 (50-systemd.sh:24-29).
- [Service] User=torch, Group=torch (50-systemd.sh:40-41); SupplementaryGroups=tss when the group exists
  (50-systemd.sh:15-16,42); EnvironmentFile=/etc/torch/torchd.env (50-systemd.sh:43);
  ExecStart=/opt/torch/bin/torchd (50-systemd.sh:44); Restart=on-failure, RestartSec=5
  (50-systemd.sh:45-46); TimeoutStopSec=25, above torchd's 15 s DRAIN_DEADLINE (50-systemd.sh:48;
  torchd.rs:76).
- Hardening: NoNewPrivileges=yes, ProtectSystem=strict, ProtectHome=yes, PrivateTmp=yes,
  ReadWritePaths=/var/lib/torch, DevicePolicy=closed, DeviceAllow=/dev/tpmrm0 rw (only for a `device:`
  TCTI) (50-systemd.sh:18-20,51-57); AmbientCapabilities and CapabilityBoundingSet both exactly
  CAP_DAC_READ_SEARCH CAP_NET_ADMIN, for the box-flow lane's /proc/net/nf_conntrack read
  (50-systemd.sh:58-64).
- [Install] WantedBy=multi-user.target (50-systemd.sh:66-67).

torchd.service.d/govern.conf (50-systemd.sh:107-118), when TORCH_AGENT_GOVERN=1:
```
[Service]
Environment=TORCH_AGENT_GOVERN=1
Environment=TORCH_AGENT_GOVERN_MANIFEST=/etc/torch/govern/manifest.json
Environment=TORCH_AGENT_GOVERN_KEY=/etc/torch/govern/report-seed.bin
Environment=TORCH_AGENT_GOVERN_SOURCE=/run/torch/govern.fifo
Environment=TORCH_AGENT_GOVERN_ANCHOR_SECS=20
Environment=TORCH_AGENT_TRANSCRIPT_TAP=1
```

torchd.service.d/discover.conf (50-systemd.sh:152-170), when TORCH_AGENT_GOVERN=1 AND TORCH_AGENT_DISCOVER=1:
```
[Unit]
Wants=torch-placed.service
After=torch-placed.service
[Service]
Environment=TORCH_AGENT_DISCOVER=1
Environment=TORCH_AGENT_DISCOVER_CONFIG=/etc/torch/govern/discover.json
Environment=TORCH_PLACE_SOCKET=/run/torch/place/place.sock
Environment=TORCH_DISCOVER_SOURCE=/run/torch/discover.fifo
ReadWritePaths=-/run/torch/place
```
(the leading `-` tolerates an absent path, placement then fails closed to observe-only, 50-systemd.sh:167-169).

torch-placed.service (50-systemd.sh:199-230), when GOVERN=1 and DISCOVER=1; enabled + started (50-systemd.sh:231)
- No [Unit] ordering. Type=simple, User=root, Group=torch (50-systemd.sh:204-206).
- ExecStartPre: `install -d -o torch -g torch -m 0750 /run/torch` and `install -d -o root -g torch -m 2770
  /run/torch/place` (50-systemd.sh:210-211).
- Environment TORCH_PLACE_SOCKET=/run/torch/place/place.sock, TORCH_CGROUP_ROOT=/sys/fs/cgroup
  (50-systemd.sh:212-213); ExecStart=/opt/torch/bin/torch-placed (50-systemd.sh:214);
  Restart=on-failure, RestartSec=2 (50-systemd.sh:215-216).
- NoNewPrivileges=yes; ProtectHome=read-only so it can READ a discovered agent's home artifacts
  (50-systemd.sh:219-226). No ProtectSystem, no capability bounding (it needs cgroup writes,
  50-systemd.sh:217-218).
- Purpose per the installer: (1) identity-verified move of a discovered agent's pid into its
  torch-vtz-<zone>.slice; (2) scoped cross-uid read of {.claude,.codex} artifacts located from the
  agent's own /proc/<pid>/environ HOME; "Both operations grant OBSERVATION attribution only
  (AG.7/enforcement stays OFF)" (50-systemd.sh:187-197). The helper's own code is outside this part.

torch-agent@.service template (50-systemd.sh:258-278); NOT enabled by the installer -- the operator runs
`systemctl enable --now torch-agent@<zone>` (50-systemd.sh:254-255)
- [Unit] After= + Wants= torchd.service torch-govern-bridge.service (50-systemd.sh:262-263).
- [Service] Slice=torch-vtz-%i.slice (the instance is the manifest zone_id) (50-systemd.sh:269);
  EnvironmentFile=/etc/torch/govern/agents/%i.env (50-systemd.sh:270); ExecStart=/bin/sh -c
  'exec ${TORCH_AGENT_CMD:?...}' (50-systemd.sh:271); Restart=on-failure, RestartSec=5.
- No User= line, so systemd runs the agent command as root unless the command drops privilege
  (systemd default for a system unit). No resource-control directive: the slice is attribution only.

Bridge units (shared shape): torch-govern-bridge.service (35-tetragon.sh:281-310),
torch-discover-bridge.service (35-tetragon.sh:320-349), torch-tetragon-bridge.service (only when
TORCH_TETRAGON_SOURCE is pinned, 35-tetragon.sh:236-273)
- [Unit] After= + Wants= tetragon.service.
- [Service] runs as root (no User=; "The bridge runs as root (it reads Tetragon's root-owned export)",
  35-tetragon.sh:259,298,337); ExecStartPre `install -d -o torch -g torch -m 0750 /run/torch`;
  ExecStartPre creates the FIFO ONLY if it is missing (`mkfifo -m 0640`), because re-creating it would
  strand torchd on a dead inode (35-tetragon.sh:253-258,292-297,331-336); ExecStartPre `chgrp torch
  <fifo>`; ExecStart `sh -c 'exec tail -n0 -F <export> > <fifo>'` (follows rotation, no replay);
  Restart=always, RestartSec=2; WantedBy=multi-user.target.
- Enabled + started: 35-tetragon.sh:309 (govern), 348 (discover), 271 (tetragon, pinned only).
- On the default gRPC transport the tetragon bridge is `systemctl disable --now`'d
  (35-tetragon.sh:236-238).

tetragon.service
- The vendored upstream unit is installed to /usr/lib/systemd/system/tetragon.service 0644
  (35-tetragon.sh:67). Its content (from the gitignored vendored tarball, not a committed file):
  User=root, ExecStart=/usr/local/bin/tetragon, Restart=on-failure, RestartSec=5, StartLimitBurst=10,
  StartLimitIntervalSec=2min.
- Drop-in tetragon.service.d/torch-restart.conf: `[Unit] StartLimitIntervalSec=0` and
  `[Service] Restart=always` -- a flap must never latch the sensor dark (35-tetragon.sh:68-83).
- Drop-in tetragon.service.d/torch-socket-group.conf: ExecStartPost polls up to 150 x 0.2 s (30 s) for
  the gRPC socket, then `chgrp torch` it; exits 1 (fails the start) if it never appears
  (35-tetragon.sh:84-94).
- `systemctl reset-failed tetragon.service` then `enable --now` (35-tetragon.sh:220-224).

Totals: 6 unit files written under /etc/systemd/system (torchd, torch-placed, torch-agent@,
torch-govern-bridge, torch-discover-bridge, torch-tetragon-bridge [pinned only]) + 1 vendored
(tetragon.service) + 4 drop-ins (govern.conf, discover.conf, torch-restart.conf,
torch-socket-group.conf). Enabled + started on a default install: tetragon, torch-govern-bridge,
torch-discover-bridge, torch-placed, torchd.

#### 7.3.5 FIFOs and what feeds them

| FIFO | Mode / owner | Fed by | Read by (torchd env) | Default |
|---|---|---|---|---|
| /run/torch/govern.fifo | 0640, created by the root bridge, chgrp torch | torch-govern-bridge: `tail -n0 -F /var/log/tetragon/tetragon.log` | govern lane (TORCH_AGENT_GOVERN_SOURCE) | ON |
| /run/torch/discover.fifo | same | torch-discover-bridge: same export | discovery net-obs collector (TORCH_DISCOVER_SOURCE) | ON |
| /run/torch/tetragon.fifo | same | torch-tetragon-bridge: same export | security lane, only when TORCH_TETRAGON_SOURCE is pinned | OFF (rollback) |

- Each FIFO carries the WHOLE-host export (the govern lane filters to the governed agent by GCI,
  35-tetragon.sh:276-279; discovery needs every process, 35-tetragon.sh:316-319).
- The security lane's default transport is NOT a FIFO: torchd subscribes to Tetragon's gRPC socket
  /var/run/tetragon/tetragon.sock, made reachable to the unprivileged torchd by the socket-group drop-in
  (35-tetragon.sh:228-238; 40-config.sh:23-31).

#### 7.3.6 torch-placed socket

- /run/torch/place/place.sock is created by torch-placed itself; the installer creates the setgid dir
  root:torch 2770 so only root + torch reach it (50-systemd.sh:196,207-211) and polls up to 5 s (50 x
  0.1 s) for the socket, dying if absent (50-systemd.sh:236-243). torchd gets write access to the dir
  through discover.conf ReadWritePaths (50-systemd.sh:167-169).

#### 7.3.7 Tetragon configuration and sysctl

- Payload into /usr/local: tetragon daemon, tetra CLI, BPF objects, bpftool, gops (35-tetragon.sh:66;
  tarball listing).
- /etc/tetragon/tetragon.conf.d seeded from the payload defaults with `cp -rn` (never clobbers operator
  edits) (35-tetragon.sh:97-98). Upstream defaults in the vendored tarball (not committed):
  export-file-compress=true, log-level=info, log-format=text,
  server-address=unix:///var/run/tetragon/tetragon.sock.
- export-filename is then overwritten with TORCH_TETRAGON_EXPORT (35-tetragon.sh:101-102).
- /etc/sysctl.d/99-torch-conntrack-acct.conf `net.netfilter.nf_conntrack_acct = 1`, applied live with
  sysctl (tolerates the module not being loaded yet) (35-tetragon.sh:208-218). This serves the
  always-on box-flow export lane (torchd.rs:896-907) but is written only inside 35-tetragon, i.e. only
  when the security lane is on.

#### 7.3.8 TracingPolicies (tetragon/*.yaml -> /etc/tetragon/tetragon.tp.d, 0644)

Keep set and pruning (35-tetragon.sh:105-166)
- torch-connect.yaml is always kept; the others join the keep set per knob (35-tetragon.sh:117-146).
- When tetragon is active, `tetra tracingpolicy delete` removes the retired `torch-connect-write` policy
  and every torch policy whose knob is not 1 (35-tetragon.sh:147-164).
- `find /etc/tetragon/tetragon.tp.d -maxdepth 1 -type f ! -name <keep>... -delete` deletes EVERY file in
  tp.d that is not in the keep set -- including non-torch files (35-tetragon.sh:165-166).
- A uprobe `string` policy (dns, module) is installed only with the patched build or a kernel exporting
  bpf_copy_from_user_str (read from /proc/kallsyms); otherwise the phase dies
  (35-tetragon.sh:186-206; lib/common.sh:134).

| Policy | Hook and capture | Enable (default) | Evidence component / decoder | Cite |
|---|---|---|---|---|
| torch-connect | kprobe `tcp_connect`, arg0 `sock` -> saddr, sport, daddr, dport | always | Network Connection Creation (lib/common.sh:67); decoder CONNECT_FUNCS (torch/crates/torch-sense/src/tetragon.rs:31) | tetragon/torch-connect.yaml:14-25; 35-tetragon.sh:117,167-168 |
| torch-file | kprobe `vfs_write`, arg0 `file` -> path; kernel selector Prefix include list: /etc/, /bin/, /sbin/, /usr/bin/, /usr/sbin/, /usr/local/, /usr/lib/, /lib/, /lib64/, /boot/, /root/, /var/spool/cron/, /var/www/, /srv/, /opt/ | TORCH_FILE_TELEMETRY (1) | File Modification; FILE_WRITE_FUNCS (tetragon.rs:45-50) | tetragon/torch-file.yaml:27-70; 35-tetragon.sh:131-133,181-185 |
| torch-dns | uprobe `getaddrinfo` in /lib/x86_64-linux-gnu/libc.so.6, arg0 `string` -> queried name (entry probe, no answer) | TORCH_DNS_TELEMETRY (1); patched or kfunc | Network Traffic Content; DNS_RESOLVE_SYMBOLS (tetragon.rs:98) | tetragon/torch-dns.yaml:30-48; 35-tetragon.sh:139-141,195-200 |
| torch-module | uprobe `dlopen` in /lib/x86_64-linux-gnu/libc.so.6, arg0 `string` -> library path (entry probe) | TORCH_MODULE_TELEMETRY (1); patched or kfunc | Module Load; MODULE_LOAD_SYMBOLS (tetragon.rs:102) | tetragon/torch-module.yaml:26-41; 35-tetragon.sh:144-146,201-206 |
| torch-close | kprobe `tcp_close`, arg0 `sock` (flow close; byte counters) | TORCH_SOCKET_LIFECYCLE (0); DEFERRED-LIVE | flow CLOSE; CLOSE_FUNCS (tetragon.rs:43) | tetragon/torch-close.yaml:9-28; 35-tetragon.sh:124-126,176-180 |
| torch-loopback-head | kprobe `tcp_sendmsg`: arg0 `sock`, arg1 `char_buf` (returnCopy false, sizeArgIndex 3); selector DAddr 127.0.0.0/8, ::1/128 | TORCH_CONTENT_CAPTURE (0); DEFERRED-LIVE | content signal (DT.5); decoder cap MAX_HEAD_BYTES=512 (tetragon.rs:298) | tetragon/torch-loopback-head.yaml:22-62; 35-tetragon.sh:118-120,169-175 |

- Which torch lane consumes them: all loaded policies emit into ONE Tetragon stream; the security lane
  reads it over gRPC (or the pinned FIFO), and the govern and discovery lanes read the same events via
  the export file and their own FIFOs (3.5). Without any policy Tetragon emits only process exec/exit
  (tetragon/torch-connect.yaml:4-5).
- Coverage ceilings stated in the policies: dns and module see glibc callers only (Go resolver, musl,
  DoH/DoT, static binaries not covered) (tetragon/torch-dns.yaml:19-21; tetragon/torch-module.yaml:16-18);
  file excludes /home, /tmp, /var/tmp, /var/lib, /var/log, /run by design (tetragon/torch-file.yaml:17-22).
- No policy has a `matchActions` or any enforcement action (grep of tetragon/*.yaml finds none): the
  sensor is observe-only.

---------------------------------------------------------------------------------------------------

### 7.4 Enrollment phase (30-enroll)

Inputs and staging
- Hard requirements: TORCH_IDP_HOST, TORCH_IDP_CLIENT_ID, TORCH_ATTEST_NONCE (30-enroll.sh:20-22) and a
  built torch-enroll (30-enroll.sh:23).
- Stages the public CA PEMs to /etc/torch/wire-ca.pem and /etc/torch/bootstrap-ca.pem, root:torch 0640
  (30-enroll.sh:26-30); optional out-of-band EK cert to /etc/torch/ek-cert.pem (30-enroll.sh:32-38).

Environment passed to torch-enroll (30-enroll.sh:42-56)
- TORCH_IDP_HOST, TORCH_IDP_CLIENT_ID, TORCH_ATTEST_NONCE, TORCH_PROPOSED_FQDN, TORCH_BOOTSTRAP_ADDR,
  TORCH_BOOTSTRAP_SERVER_NAME, TORCH_BOOTSTRAP_CA=/etc/torch/bootstrap-ca.pem, TORCH_WIRE_ADDR=$CDB_ADDR,
  TORCH_WIRE_SERVER_NAME=$CDB_SERVER_NAME, TORCH_WIRE_CA=/etc/torch/wire-ca.pem, TORCH_TCTI,
  TORCH_IDENTITY_OUT=/etc/torch/identity, and TORCH_EK_CERT=/etc/torch/ek-cert.pem when staged.
- torch-enroll reads these at torch/crates/torch-enroll/src/main.rs:32-48 (IdP, FQDN, nonce, bootstrap,
  wire), 51 (TCTI), 56-59 (TORCH_EK_CERT overrides the NV EK cert), 69-75 (TORCH_IDENTITY_OUT).
  The nonce's raw bytes must equal the node's decoded attestation_nonce (main.rs:41-42).

The Auth0 device flow as implemented
- torch-core's device grant POSTs `/oauth/device/code` to the IdP host
  (torch/crates/torch-core/src/device_grant.rs:176), then polls `/oauth/token` with grant_type
  `urn:ietf:params:oauth:grant-type:device_code`, honoring `interval`, adding 5 s on `slow_down`, until
  `expires_in` (device_grant.rs:187-225). Audience/scope default to https://crucibledb/enroll and
  "openid profile email" (main.rs:34-35).
- Relay of the device code: torch-enroll prints to stdout
  `[2/6] APPROVE ENROLLMENT: open <verification_uri> and enter code <user_code>` plus "sign in as the
  operator; an MFA push will follow" (main.rs:87-94). The installer runs torch-enroll in the foreground,
  so the prompt appears on the installer's terminal and the phase blocks until approval
  (30-enroll.sh:40-57; README.md:29-31). There is no other relay channel in the installer.
- Progress lines: [1/6] key generated in the keystore (main.rs:84), [3/6] identity offer CN=<fqdn>,
  [4/6] submit, [5/6] certificate issued with serial and notAfter (main.rs:100-101), [6/6] mTLS wire
  plane connected (main.rs:103-104).
- Failure: "each device code is single-use; re-run this phase for a fresh one" (30-enroll.sh:57).

Where the identity lands
- torch-enroll persists ONLY the public leaf, as `<TORCH_IDENTITY_OUT>/device.pem`
  (torch/crates/torch-enroll/src/lib.rs:204-216; main.rs:66-75); the device key stays in the TPM and is
  re-derived by torchd at start (30-enroll.sh:2-6; README.md:3-7). The installer then sets
  /etc/torch/identity/device.pem to root:torch 0640 (30-enroll.sh:60-63).
- torch-enroll does NOT persist the EK certificate it read from TPM NV; /etc/torch/ek-cert.pem exists
  only when TORCH_EK_CERT_SRC was given (30-enroll.sh:33-37). This matters for 55-govern-attest
  (section 5).
- The CN is the proposed FQDN (default `hostname -f`); the node binds the FQDN to the TPM identity so the
  name survives a re-enroll (README.md:62-63; main.rs:37-40).
- 40-config points torchd at it: TORCH_IDENTITY=tpm, CDB_CLIENT_CERT=/etc/torch/identity/device.pem,
  CDB_CA=/etc/torch/wire-ca.pem (40-config.sh:16-20).

Certificate lifetime ("24 hours") and the daily re-enroll
- UNVERIFIED in torch: no torch code sets or checks a 24-hour lifetime. torch-enroll only prints the
  node-issued notAfter (main.rs:100-101). A grep of torch-enroll, torchd.rs and deploy/ for 24h / 86400 /
  expire / validity / re-enroll finds no lifetime.
- Where the lifetime actually comes from (engine side, pointer only): the node's enrollment policy
  `validity_secs`, set from CDB_ENROLL_VALIDITY_SECS or else "the CA's own default (also short)"
  (crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:800-811; crucible/crates/cdb-enroll/src/ca.rs:47-50),
  hard-capped at 7 days (crucible/crates/cdb-server/src/config.rs:890,918-921). The concrete 24 h default
  was not traced (UNVERIFIED).
- No renewal automation in the installer: no timer, cron, OnCalendar or renew path exists (grep of
  installer/ and README.md). Re-enroll is manual and deliberate:
  `sudo rm /etc/torch/identity/device.pem && sudo ./install.sh --only 30-enroll` (30-enroll.sh:8-9;
  README.md:62). It is interactive every time (a fresh device code, operator IdP sign-in + MFA).
- 30-enroll does not restart torchd, and torchd reads CDB_CLIENT_CERT once, when main() assembles the
  seam target at startup (torchd.rs:1784 -> seam_target, torchd.rs:263-282). So after a re-enroll torchd
  presents the old leaf until it is restarted (`systemctl restart torchd`); the installer does not do this.

---------------------------------------------------------------------------------------------------

### 7.5 govern-attest phase (55-govern-attest)

What it does
- Seeds the governor's `govern-attest` AIG authority on the node so torchd can SHIP Construction Reports
  about the agents it governs; without it crdb refuses the ship "query refused (class Denied)"
  (55-govern-attest.sh:2-5).
- Command (55-govern-attest.sh:82-86):
  `cdb-actl --addr 127.0.0.1:7440 --sni admin.localhost --ca /etc/cdb/admin/ca.pem --cert
  /etc/cdb/admin/client.pem --key /etc/cdb/admin/client.key agent-grant-provision --tenant <TENANT>
  --agent <ANCHOR> --grant-authority govern-attest --class internal`; failure dies
  (55-govern-attest.sh:86). Idempotent: a re-run is a no-op when the grant exists
  (55-govern-attest.sh:16-17).
- Acting identity: the crdb ADMIN client credentials under /etc/cdb/admin (the co-resident node's admin
  plane), not torch's device identity (55-govern-attest.sh:14,30-35).

Against which identity (the grantee)
- ANCHOR = lowercase hex SHA-256 of the governor's EK certificate DER:
  `openssl x509 -in $TORCH_GOVERN_EK_CERT -outform DER | sha256sum` (55-govern-attest.sh:49). The comment
  states this equals what the engine records at enrollment (cdb-enroll DeviceIdentity::from_attestation)
  and that granting "torchd" or the SPIFFE subject leaves the governor refused (55-govern-attest.sh:7-12).
- TORCH_GOVERN_EK_CERT defaults to ${TORCH_EK_CERT:-/etc/torch/ek-cert.pem} (55-govern-attest.sh:37).
- TENANT: CDB_GOVERN_TENANT, else a best-effort python3/cbor2 decode of
  node.cbor.enrollment_bootstrap.tenant (run as SUDO_USER), else the hardcoded
  df46dcb7-2e91-448c-a406-42e492b85e36, which "MUST equal" crdb 50-config's hardcoded tenant
  (55-govern-attest.sh:52-79).

Skip conditions (exit 0, never fail)
- TORCH_AGENT_GOVERN and TORCH_AGENT_DISCOVER both not 1 (55-govern-attest.sh:24-27).
- cdb-actl not executable or any admin CA/cert/key unreadable -> "remote node: seed via crdb 65-seed
  CDB_GOVERN_ATTEST_EK_CERT" (55-govern-attest.sh:39-42).
- EK cert file unreadable -> "no EK cert ... unattested enrollment" (55-govern-attest.sh:44-48). Because
  torch-enroll does not persist an NV-read EK cert (section 4), this skip also fires on an attested
  enrollment whose EK cert came from TPM NV unless TORCH_EK_CERT / TORCH_GOVERN_EK_CERT is supplied.

What the engine sees (pointer; engine slice owns detail)
- The authority string is `govern-attest` (crucible/crates/cdb-types/src/forge.rs:139).
- governor_may_attest reads the governor Agent node's authorities and returns true only if one has that
  source id; any read failure is "not held" (crucible/crates/cdb-server/src/handler.rs:8702-8716).
- ingest_construction_report verifies the report's ML-DSA-87 signature against the GOVERNOR's enrolled
  report-signing key, stores the report keyed by its SUBJECT, gates attesting about another agent on
  govern-attest, and records the governor as attested_by; every refusal is a non-oracle Denied
  (crucible/crates/cdb-server/src/handler.rs:8718-8760).
- Console rendering of Construction Reports: UNVERIFIED in this part (the Console slice owns it; the
  manual id list has an `entity.capabilities` section that may be where they surface).

Ordering: 55 runs after 50-systemd has already started torchd (install.sh:28). Reports torchd tried to
ship before the grant are refused by the engine; whether torchd retries them is not traced here.

---------------------------------------------------------------------------------------------------

### 7.6 Validate checks (60-validate)

| # | Check | Pass | Fail | Cite |
|---|---|---|---|---|
| V1 | TCP connect to CDB_ADDR (default 127.0.0.1:7878) via bash /dev/tcp | "node wire seam ... reachable" | die: wire seam not reachable | 60-validate.sh:9-10; lib/common.sh:136 |
| V2 | torchd.service is active within 15 s | "torchd.service active ready" | die on timeout | 60-validate.sh:12; lib/common.sh:135,157-165 |
| V3 | the current InvocationID resolves (journal scoped to THIS start) | continue | die: cannot resolve invocation id | 60-validate.sh:14-18 |
| V4 | within ~30 s (30 x 1 s) the current invocation's journal contains `edge running (enrolled to` | "torchd connected: the edge is running over the enrolled TPM identity" | early die (with last 20 journal lines) on `torchd: identity error` / `torchd: configuration error`; die on timeout | 60-validate.sh:19-30 |
| V5 | for each ENABLED sensor lane (torch-connect always; torch-file, torch-dns, torch-module per knob), `tetra tracingpolicy list` shows state `enabled` | "sensor lane <name> loaded (enabled)" | die: lane is `<state or absent>`, not enabled (hint: patched Tetragon or kernel >= 6.12 for dns/module) | 60-validate.sh:32-50 |
| -- | prints the last 5 torchd journal lines | informational | never fails | 60-validate.sh:52-53 |

- V4's strings exist in torchd: "torchd: edge running (enrolled to {addr})" is printed after every lane
  is assembled and the supervisor starts (torchd.rs:1086-1087); lanes such as AIOps and flow export
  connect to the seam before that (torchd.rs:886,900). "configuration error" (torchd.rs:1787,1794) and
  "identity error" (torchd.rs:1827).
- V5 runs only when TORCH_SECURITY_LANE is 1 AND the `tetra` CLI is on PATH; without `tetra` the lane
  check is silently skipped (60-validate.sh:37). It checks 4 lanes by default; the opt-in torch-close
  and torch-loopback-head are never checked.
- Not validated anywhere in 60: the govern/discover bridges, torch-placed, the transcript tap, the
  identity lane, the Forge policy lane, the govern-attest grant.

In-phase checks outside 60-validate
- 35-tetragon: BTF present, arch supported, patched checksum provisioned, tarball present, SHA-256 match,
  uprobe-string support, export file non-empty within 30 s (35-tetragon.sh:22-28,46,58-59,190-193,225).
- 50-systemd discover render checks: discover.conf exists and contains exactly TORCH_AGENT_DISCOVER=1,
  TORCH_AGENT_DISCOVER_CONFIG, TORCH_PLACE_SOCKET, TORCH_DISCOVER_SOURCE lines; the policy file exists
  (50-systemd.sh:172-185).
- 50-systemd torch-placed checks: unit file rendered, unit active, socket present within 5 s
  (50-systemd.sh:232-244).
- 50-systemd: govern requires the security lane (50-systemd.sh:77-78).
- 30-enroll: device.pem present after torch-enroll succeeds (30-enroll.sh:60).

---------------------------------------------------------------------------------------------------

### 7.7 Lanes ON vs OFF on a default install; enforcement

| torchd lane | Default install | Installer control | What reaches torchd | torchd gate |
|---|---|---|---|---|
| AIOps (host metrics) | ON (always) | none (interval only if set) | TORCH_AIOPS_INTERVAL_SECS when set | always runs (torchd.rs:885-894) |
| Box-flow export (conntrack) | ON (always) | none; conntrack accounting sysctl only in 35-tetragon; unit grants CAP_DAC_READ_SEARCH + CAP_NET_ADMIN | nothing (interval never written) | always runs (torchd.rs:896-907) |
| Security (Tetragon) | ON | TORCH_SECURITY_LANE=1 | TORCH_TETRAGON_GRPC=/var/run/tetragon/tetragon.sock (or pinned TORCH_TETRAGON_SOURCE) | disabled when both unset (torchd.rs:882) |
| Sensor sub-lanes | connect ON; file, dns, module ON; close OFF; loopback-head OFF | TORCH_FILE/DNS/MODULE_TELEMETRY, TORCH_SOCKET_LIFECYCLE, TORCH_CONTENT_CAPTURE | TracingPolicies in tp.d | n/a |
| Agent governance | ON | TORCH_AGENT_GOVERN=1 (needs security lane) | govern.conf: TORCH_AGENT_GOVERN=1 + manifest/key/source/anchor | torchd.rs:1132 (exact "1") |
| Transcript tool tap | ON (nested in govern) | TORCH_AGENT_TRANSCRIPT_TAP=1 | govern.conf | torchd.rs:1193-1194 |
| Discovery (auto-govern) | ON (nested in govern) + seeded policy `enabled: true` | TORCH_AGENT_DISCOVER=1 | discover.conf | torchd.rs:1177-1190; runs only if the policy is enabled (torchd.rs:984) |
| Identity inventory (LUG) | ON | TORCH_IDENTITY_INVENTORY=1 | torchd.env | torchd.rs:442 (exact "1"); needs /etc/machine-id (torchd.rs:454-455) |
| Forge policy refresh | OFF | NONE -- no installer knob | nothing (TORCH_POLICY_* never written) | lane exists only when TORCH_POLICY_ANCHOR is set (torchd.rs:199-219,1006) |
| Enforcement | OFF | NONE | n/a | n/a |

Enforcement, plainly
- The installer has no enforcement knob. Its only enforcement mentions are comments saying AG.7 stays OFF
  and governance/discovery are observe + report, never blocking (lib/common.sh:88-89,105-107;
  50-systemd.sh:124-125,197).
- The TracingPolicies carry no enforcement action (3.8).
- The only host-mutating helpers are torch-placed (cgroup moves into torch-vtz-<zone>.slice and a scoped
  artifact read) and the torch-agent@ launcher (runs a declared agent in torch-vtz-<zone>.slice); the
  installer describes both as attribution-only (50-systemd.sh:187-197,247-257) and the launcher unit sets
  no resource limits (50-systemd.sh:259-277).
- Even the Forge policy lane, which the installer does not provision, "realizes nothing until
  enforcement is separately engaged" per torchd (torchd.rs:1000-1005).

Opt-out mechanics
- TORCH_SECURITY_LANE=0 alone FAILS the install at 50-systemd because TORCH_AGENT_GOVERN defaults to 1
  and requires the security lane (50-systemd.sh:77-78; lib/common.sh:56-57). Opting out of the sensor
  requires TORCH_SECURITY_LANE=0 TORCH_AGENT_GOVERN=0.
- A re-run with a lane knob set to 0 does NOT remove what an earlier run provisioned: there is no removal
  branch for govern.conf, discover.conf, torch-placed.service, torch-govern-bridge or
  torch-discover-bridge (the installer's only removals are the tp.d prune, `tetra tracingpolicy delete`,
  and disabling the tetragon FIFO bridge: 35-tetragon.sh:147-166,237). With systemd, an EnvironmentFile
  value overrides an Environment= value (systemd.exec semantics, not repo code), so a hand edit of
  torchd.env could override the drop-ins -- but 40-config overwrites torchd.env on every run.

---------------------------------------------------------------------------------------------------

### 7.8 Findings: doc-vs-code drift and hazards

F1. The Forge policy lane is never provisioned. No installer file writes TORCH_POLICY_ANCHOR,
    TORCH_POLICY_ENDPOINT_CN or TORCH_POLICY_FETCH_SECS, so on an installer-built endpoint policy
    distribution never reaches torchd (torchd.rs:199-219,1006). A hand edit of torchd.env is lost on the
    next 40-config run (40-config.sh:15).

F2. Default-ON vs "opt-in" drift. Effective defaults (lib/common.sh:58,80-83,90,100,108,126) are ON for
    the security lane, the patched build, the file/dns/module lanes, governance, the transcript tap,
    discovery and identity inventory. Stale text says otherwise: install.sh:19-20 ("OPT-IN via
    TORCH_SECURITY_LANE=1"); 35-tetragon.sh:2,10 ("OPT-IN", "Disabled by default"); 35-tetragon.sh:127-146
    (file/dns/module "OPT-IN ... default OFF"); lib/common.sh:53 ("OPT-IN" immediately above "Default ON");
    tetragon/torch-file.yaml:24 ("ships default OFF"); README.md:40 ("connect + write kprobes") and
    README.md:83-87 ("`vfs_write` is never monitored" and the security lane reads a FIFO -- torch-file.yaml now hooks vfs_write by default, and the security-lane default is gRPC, 35-tetragon.sh:228-238).

F3. arm64 default install fails. TORCH_TETRAGON_PATCHED defaults to 1 but SHA256_TETRAGON_PATCHED_ARM64
    is empty (vendor/tetragon/MANIFEST:57-59), so 35-tetragon dies on arm64 (35-tetragon.sh:46). With
    PATCHED=0, dns/module still need the kernel kfunc or the phase dies (35-tetragon.sh:190-193). Also the
    dns and module policies pin /lib/x86_64-linux-gnu/libc.so.6 (tetragon/torch-dns.yaml:43;
    tetragon/torch-module.yaml:36); how Tetragon treats that path on arm64 is UNVERIFIED (V5 would catch a
    load_error).

F4. No certificate renewal. Nothing in the installer renews the short-lived leaf; re-enroll is a manual,
    interactive `rm device.pem && --only 30-enroll`, and torchd must then be restarted by hand because it
    reads the leaf only at startup (section 4).

F5. govern-attest can silently skip on an attested box. The anchor comes from /etc/torch/ek-cert.pem,
    which exists only when TORCH_EK_CERT_SRC was set; torch-enroll does not persist an NV-read EK cert.
    Then the phase logs "unattested enrollment" and exits 0, and Construction Report ships stay refused
    until the grant is seeded elsewhere (55-govern-attest.sh:37,44-48; 30-enroll.sh:33-37;
    torch/crates/torch-enroll/src/lib.rs:216).

F6. The tp.d prune deletes every file in /etc/tetragon/tetragon.tp.d not in torch's keep set, including
    an operator's own non-torch TracingPolicy (35-tetragon.sh:165-166).

F7. The seeded discovery policy is `"enabled": true` (50-systemd.sh:137) but the log line says "seeded a
    DISABLED discovery policy (operator authors + enables it; nothing wrapped until then)"
    (50-systemd.sh:147).

F8. The torch-agent@ launcher has no User=, so a governed agent started through it runs as root unless its
    command drops privilege (50-systemd.sh:259-277).

F9. torchd.service keeps After=/Wants=torch-tetragon-bridge.service whenever TORCH_SECURITY_LANE=1
    (50-systemd.sh:25-26) although the default gRPC transport retires that bridge (35-tetragon.sh:236-238).
    On a fresh install the unit file never exists; on a box upgraded from the FIFO transport the file
    remains, and under systemd Wants= semantics torchd's start would pull the disabled bridge back up
    (runtime effect UNVERIFIED).

F10. Conntrack byte accounting (for the always-on box-flow lane) is enabled only inside 35-tetragon, so a
    TORCH_SECURITY_LANE=0 install ships unweighted flow edges (35-tetragon.sh:208-218; torchd.rs:896-907).

F11. torch-loopback-head.yaml's comment claims a 512-byte bound ("TUNE: bound the captured head to 512
    bytes") but no field in the policy sets 512 (returnCopy false, sizeArgIndex 3); the effective cap is
    the decoder's MAX_HEAD_BYTES=512 (tetragon/torch-loopback-head.yaml:59-62;
    torch/crates/torch-sense/src/tetragon.rs:298).

F12. The govern anchor cadence differs between installer and daemon defaults: installer 20 s
    (lib/common.sh:95) vs torchd 60 s when unset (torchd.rs:1112).

F13. 55-govern-attest hardcodes a fallback tenant UUID (df46dcb7-2e91-448c-a406-42e492b85e36) that must
    match crdb's hardcoded value (55-govern-attest.sh:55-60).

---------------------------------------------------------------------------------------------------

### 7.9 UNVERIFIED items

- The 24-hour certificate lifetime: not in torch code; node-side default not traced (section 4).
- Whether the `torch` group is always created by `useradd --system` on every supported distro (3.1).
- Runtime effect of F9 (a stale Wants= on an upgraded box) and the arm64 libc path in F3.
- Console rendering of Construction Reports enabled by the govern-attest grant (section 5).
- Whether torchd retries Construction Report ships refused before 55-govern-attest runs (section 5).
- Upstream Tetragon unit/config values were read from the gitignored vendored tarball (tar listing /
  extract-to-stdout), not from a committed file.

## 8. Consolidated UNVERIFIED items and open questions

### 8.1 UNVERIFIED (what was checked, what is missing)

| # | Item | Checked | Why still UNVERIFIED |
|---|---|---|---|
| U1 | Every Console bundle refused `StaleLease` (ms lease vs ns clock) | Code path end to end: distribute.ts:95 -> signing.rs:247 -> bundle_store.rs (verbatim) -> policy.rs -> apply.rs:192-195 with torchd.rs:1723-1725 | The policy lane is not provisioned anywhere we can see; no live BUNDLE_REPORT was read |
| U2 | The host-netns nft attach on apply | realize.rs:325-377, egress.rs:124-184, unit caps 50-systemd.sh:63-64 | Not run; ambient-cap inheritance by the exec'd `nft`, nft re-feed semantics (append vs replace), iptables-restore on the missing ipsets are kernel/tool behavior, not repo code |
| U3 | 24-hour device certificate lifetime | torch has no lifetime code; crucible `CDB_ENROLL_VALIDITY_SECS` unset -> CA default, capped at 7 days (crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:800-811; crucible/crates/cdb-server/src/config.rs:890; crucible/crates/cdb-enroll/src/ca.rs:40-58); the only 24 h in cdb-enroll is a test (crucible/crates/cdb-enroll/src/broker.rs:1354-1356) | The CA (step-ca) default is configured outside these repos |
| U4 | `TORCH_POLICY_FETCH_SECS=0` hot loop | torchd.rs:206-212 (no > 0 check); policy.rs:238-246 (sleep(cadence) each tick) | Inferred from tokio semantics; not run |
| U5 | Identity-event lane replaying the whole auth log if torch-placed is down at torchd start | torchd.rs:644-652 (`map_or(0, ..)`), placement.rs:626-649 | Not exercised (6.B.7 item 4) |
| U6 | Root helper following a symlinked `~/.claude` / `~/.codex` | placement.rs:1004-1010, 1123-1128, 1211-1228 | Not exercised (6.B.7 item 2) |
| U7 | A stalled torch-placed client blocking every helper request | placement.rs:560-569, 703-718 (no timeouts, sequential) | Not exercised (6.B.7 item 1) |
| U8 | Whether discovered agents' Construction Reports are reachable from the entity drawer | engine ingest stores subject reports without an AIG Agent record (crucible/crates/cdb-server/src/handler.rs:8781-8810); drawer lists only `LIST_AGENTS` refs (forgecentral/apps/bff/src/engine/entity-detail.ts:358-365) | Other engine AIG writers not traced (5.8 item 3) |
| U9 | Delegated-operator convergence read | `WireBundleConvergenceQuery` has no operator field (crucible/crates/cdb-wire/src/query.rs:3890-3895) | Engine census owns it (5.8 item 4) |
| U10 | Which engine LOG/SOC relations each torch stream populates; whether decoder Settings can disable torch sources | field names only | Engine census owns it (5.8 items 5-6) |
| U11 | `torch` group creation by `useradd --system` on every distro; stale `Wants=torch-tetragon-bridge` on an upgraded box; arm64 libc path in torch-dns/torch-module | installer code | Distro/systemd/Tetragon runtime behavior (7.9) |
| U12 | Whether torch-vtz / torch-forge compile for macOS/Windows | no cfg gating; not in torch/scripts/xcheck.sh:23-24 | Not built (3.18) |
| U13 | The torch gate attaching nft rules to the machine it runs on | `attach_default_deny` / `attach_policy` are called by unit tests in the test process's own netns (torch/crates/torch-vtz/src/egress.rs:866-883, 1016-1032); `scripts/ci.sh:47-48` runs `cargo test`; host observation: `/usr/sbin/nft` and `/usr/sbin/iptables-restore` exist on the AWS box (`which`, read-only) | Whether the gate runs as root in the host netns was not checked; if it does, the default-deny test would install `table inet torch_vtz` with `policy drop` on the host (outside this slice, flagged for safety) |
| U14 | overview.entityConnections and entity.fullReport data sources | not traced in this slice | Console/engine censuses |

Resolved in assembly (was UNVERIFIED in a part): torchd does NOT retry a Construction Report the engine
refuses (for example before 55-govern-attest has run): `ship_construction_reports` logs the failure and
returns (torchd.rs:373-411), declared reports ship once at startup (torchd.rs:960), and a discovered agent
that was placed is marked wrapped and "not re-swept" (torch/crates/torch-edge/src/agent_govern.rs:895-907),
so its report is not re-produced until torchd restarts; an agent whose placement failed is retried (and its
report re-shipped) on the next sweep (agent_govern.rs:904-907).

### 8.2 Open questions for the operator / owners (decisions the manual depends on)

1. Lease units: which side is canonical -- the Console's unix-ms (`distribute.ts:27-34`) or torchd's unix-ns
   (`torchd.rs:1723-1725`)? Until one changes, policy distribution cannot converge.
2. Host-namespace egress attach: is it intended that applying a bundle installs a host-wide nftables output
   policy (2.6, 4.2)? If not, the realize step needs a zone netns (or a gate) before the lane is provisioned
   anywhere.
3. Policy-lane provisioning: should the torch installer write `TORCH_POLICY_ANCHOR` / `TORCH_POLICY_ENDPOINT_CN`
   (and via which file, since torchd.env is rewritten each run)? Should `TORCH_POLICY_ENDPOINT_CN` default to
   the enrolled CN so it cannot drift from the engine's `device_cn` gate?
4. Multi-zone endpoints: the engine delivers only the highest-version bundle naming an endpoint
   (crucible/crates/cdb-cyber/src/bundle_store.rs:181-208), so an endpoint in two distributed zones converges
   on one and reads `silent` on the other. Is that the intended semantics for the manual?
5. `lug_exposure.snapshot_cadence_hours`: document as engine-side record only (torch never reads it) or wire it?
6. Discovery seed: the seeded policy is `"enabled": true` but the installer says "DISABLED" -- which is
   intended (7.8 F7)?
7. Restart semantics: the applied policy and downgrade high-water mark are memory-only; is that acceptable
   for the manual's "fail-closed" wording (2.3, 3.6)?
8. Should the manual show the AIOps host metrics torch already ships (no Console surface reads them today)?

## 9. Counts

| What | Count | Where |
|---|---|---|
| Environment variables torchd reads | 29 (24 `TORCH_*` + 5 `CDB_*`); 4 boolean switches accept only the exact string `1` | 1.3 |
| torchd lanes / workers | 10 (security, watchdog, AIOps, box-flow, governance, transcript tap, discovery, policy, identity inventory, identity events) | 1.2 |
| Config files torchd reads besides its env | 3 (policy anchor JSON, govern manifest JSON, discovery policy JSON) + the enrolled cert and CA PEMs | 1.4, 2.1 |
| Apply refusal reasons on the wire / producible by torch | 7 / 5 | 2.3, 3.5 |
| Convergence states | 3 (`applied`, `rejected`+reason, `silent`) + `has_bundle:false` | 2.4 |
| Authored policy dimensions | 30: 5 realized, 16 parsed-not-realized, 9 absent | 3.10 |
| Env vars read by the other binaries | 19 (torch-placed 3, torch-enroll 16 of which 7 required) | 6.B.1, 6.C.1 |
| torch-placed socket operations | 9 | 6.B.4 |
| CLI surfaces | torch-shim 1 (server command after `--`), torch-scenario 5 flags | 6.D, 6.F |
| Installer flags / env knobs | 5 flags; 47 knobs in lib/common.sh (+1 test hook); 12 phase-local (+ SUDO_USER); 2 pass-through to torch-enroll | 7.2 |
| Installer artifacts | 8 files under /etc/torch; 6 unit files + 1 vendored unit + 4 drop-ins; 5 services started by default; 3 FIFOs; 6 TracingPolicies (4 on by default) | 7.3 |
| Installer validate checks | 5 in 60-validate (the last repeats per enabled sensor lane, 4 by default) + in-phase render checks | 7.6 |
| Console actions examined | 16 rows; exactly 1 (`policies.distribute`) has an endpoint path, pull-only and unprovisioned by default | 5.3 |
| Torch -> engine streams | 12 shipped + 5 not shipped / not wired; 10 Console bindings read torch data | 5.5, 5.6 |
| Consolidated UNVERIFIED items / open questions | 14 / 8 | 8 |
