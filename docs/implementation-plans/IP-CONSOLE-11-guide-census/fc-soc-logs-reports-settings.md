# Configuration census -- ForgeCentral SOC Ops, Logs, Reports and Settings

Slice: the ForgeCentral Console surfaces SOC Ops (`/soc-ops`), Logs (`/logs`), Reports (`/reports`)
and Settings (`/settings`, all ten tabs, including the IdAM connector panel as mounted under
Settings > Federation). Source of truth: the CODE at forgecentral `d3ea588` (HEAD at census time) and,
for a few cross-checks only, crucible `d0ace55a`. Read-only census; nothing was built or run.

Conventions used below:
- Every path is repo-relative and prefixed with its repo (`forgecentral/...`, `crucible/...`).
- "Binding" means an entry in `forgecentral/packages/bindings/src/manifest.ts` (the INV-CONSOLE-NO-STUB
  registry). "NONE registered" means no manifest entry exists for that control or value.
- "Engine op" is the externally-tagged `WireRequest` variant the BFF dispatches (the CBOR enum tag),
  exactly as spelled in `forgecentral/packages/wire/src/payload.ts` / `dispatch.ts`. The engine side
  of each op is out of this slice.
- "Tier" is the Crucible EXPLAIN tier (`User` / `Developer` / `Admin` / `SecurityAudit`).
- UI strings are quoted exactly; a typographic character in the source is transliterated to ASCII and
  noted.
- UNVERIFIED marks anything the code in this slice cannot establish.

## Index

Status legend: LIVE = a control that changes engine state over a live wire op; PENDING = a control or
value the UI itself states is not available (named engine work); RO = read-only configuration display;
VIEW = view-only or client-side control that changes no engine state.

SOC Ops (`/soc-ops`)
- SOC-01 Generate verdict (cognition run) -- LIVE
- SOC-02 Approve full response (plan approve) -- LIVE
- SOC-03 Modify plan (response step editor) -- LIVE
- SOC-04 Assign (case act `assigned`) -- LIVE
- SOC-05 Acknowledge (case act `acked`) -- LIVE
- SOC-06 Close without verdict (case act `closed`) -- LIVE
- SOC-07 Record disposition (seven verdicts) -- LIVE
- SOC-08 Record note (case act `noted`, dock Notes pane) -- LIVE
- SOC-09 Read-only configuration displays on SOC Ops (posture pills, KPI strip, model ref, plan state, audit acts) -- RO
- SOC-10 View controls (focus tabs, channels, selection, disclosure, node scope, dock tabs) -- VIEW

Logs (`/logs`)
- LOG-01 Export (audited LOG export) -- LIVE
- LOG-02 Filters and time range (no saved filters exist) -- VIEW
- LOG-03 Live tail Pause / Resume -- VIEW (`logs.tail` binding PENDING; v1 polls)
- LOG-04 Decision rationale and row drill-in -- VIEW

Reports (`/reports`)
- REP-01 Incident report picker -- VIEW
- REP-02 Export as text / Export as JSON -- VIEW (client-side download, not an engine op)
- REP-03 Weekly volume and coverage panel -- RO

Settings (`/settings`), tabs in the order rendered
- SET-00 The Settings surface: tab strip, gating, shared states -- (overview)
- Tab 1 SOC
  - SET-SOC-01 Narrative model line -- RO
  - SET-SOC-02 Dual-control notice -- RO
  - SET-SOC-03 Response tiers (p_low / p_high) -- LIVE
  - SET-SOC-04 SIEM enrichment write-back -- LIVE
  - SET-SOC-05 "What these settings are" registry list -- RO
- Tab 2 Configuration
  - SET-CFG-01 Version line, surface picker, the settings table (source + apply labels) -- RO
  - SET-CFG-02 Knob edit: Edit / Stage / Commit or Propose N changes / Discard staged -- LIVE
  - SET-CFG-03 Section form: Dual control -- LIVE
  - SET-CFG-04 Section form: Egress destinations -- LIVE
  - SET-CFG-05 Section form: LUG exposure -- LIVE
  - SET-CFG-06 Section form: Disabled decoder families -- LIVE
  - SET-CFG-07 Section form: Source-format overrides -- LIVE
  - SET-CFG-08 Section form: Narrative model -- LIVE
- Tab 3 RBAC
  - SET-RBAC-01 Engine admin assignments -- RO
  - SET-RBAC-02 Console operator roles -- RO
- Tab 4 Federation
  - SET-FED-01 Onboard Auth0 / Configure (connector connectivity, secret, cadences) -- LIVE
  - SET-FED-02 Sync Now -- LIVE
  - SET-FED-03 Connector cards -- RO
  - SET-FED-04 SSO group to admin role map -- RO
- Tab 5 Changes
  - SET-CHG-01 Pending approvals + Approve -- LIVE
  - SET-CHG-02 Configuration history -- RO
  - SET-CHG-03 Roll back to version N -- LIVE
- Tab 6 Security
  - SET-SEC-01 Admin endpoint (connectivity report) -- RO
  - SET-SEC-02 Server security (security report) -- RO
  - SET-SEC-03 Registered egress destinations (egress report) -- RO
  - SET-SEC-04 This browser session key exchange -- RO
- Tab 7 KeyLock
  - SET-KEY-01 Agent key issuing (key-issuing report) -- RO
  - SET-KEY-02 Signing-key rotation -- PENDING
- Tab 8 Observability
  - SET-OBS-01 Telemetry ingest (telemetry report) -- RO
  - SET-OBS-02 Observability settings mirror -- RO
  - SET-OBS-03 Telemetry exporter configuration -- PENDING
- Tab 9 HA & Topology
  - SET-HA-01 This node (server report) -- RO
  - SET-HA-02 Cluster leader / lag / Rotate Leadership / Test Quorum Loss / regions -- PENDING
- Tab 10 FIPS Mode
  - SET-FIPS-01 Crypto build posture (no toggle by construction) -- RO

Cross-cutting and drift
- X-01 Binding-manifest coverage gaps
- X-02 BFF gating model (session only; one role check; the Settings tier)
- X-03 Tenant scoping (the SPA never sends a tenant override)
- X-04 "Retry" on a failed commit does not resend
- D-11 TRD-CONSOLE-11 (Settings) drift, enumerated
- D-03 TRD-CONSOLE-03 (SOC Ops) drift
- D-08 TRD-CONSOLE-08 (Reports) drift
- D-09 TRD-CONSOLE-09 (Logs) drift
- L-11 IP-CONSOLE-11-settings-LEDGER vs code
- L-03 IP-CONSOLE-03-soc-ops-LEDGER vs code
- Appendix A: the Configuration tab's rows (engine registry cross-check)
- Appendix B: control -> BFF route -> wire request map
- Open questions

Counts (items above, excluding SET-00 and the cross-cutting / drift sections): 51 items --
22 LIVE, 3 PENDING, 20 RO, 6 VIEW.

---

# Part 1 -- SOC Ops (`/soc-ops`)

The surface is `SocOpsSurface` (forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:280-365). Every
incident-scoped control below appears only on the `Incidents` focus, after an incident is selected in
the "Credibility Alerts" queue and its detail read succeeds
(forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:196-277). All SOC commands are mounted above
the BFF's read-only 405 gate (forgecentral/apps/bff/src/server.ts:2650-2656) and are session-gated only
(no BFF role check; see X-02). Each command is operator-delegated with the plain delegation
`{principal, tenant}` (forgecentral/apps/bff/src/engine/operator-engine.ts:849-878).

There is NO separate Contain / Isolate control on SOC Ops (no contain, isolate or entity-drawer call in any
Soc* file or SOC hook). The only containment path is SOC-02 (approving an engine-proposed plan whose
steps carry `quarantine` / `deny`), which is an authorization only while enforcement is OFF. The entity
drawer's Isolate (`entity.isolate`, `Contain`) is reached from other surfaces and is outside this slice.

### SOC-01 Generate verdict (cognition run)
- Location: SOC Ops > Incidents > (select an incident) > Forge verdict panel > "Generate verdict"
- Configures: starts the engine's narrative and business-impact pipelines for the selected incident
  (the one control that spends on-box model time). The engine deduplicates by reuse key; the reply is
  what the engine did, never the result.
- Binding: `soc.cognition.run`, command, LIVE, audited: true, authz `operator:soc.respond`
  (forgecentral/packages/bindings/src/manifest.ts:850-857).
- BFF route: `POST /api/soc/generate` body `{incident}` -> `handleSocCommand`
  (forgecentral/apps/bff/src/server.ts:1439-1488) -> `resolveCognitionRun`
  (forgecentral/apps/bff/src/engine/soc.ts:451-464).
- Engine op: `SocCognitionRun` `{request_id, incident, operator}`
  (forgecentral/packages/wire/src/payload.ts:833-840; forgecentral/apps/bff/src/engine/wire-client.ts:1043).
- Fields: `incident` only, taken from the selection (not typed). BFF: must be a non-blank trimmed
  string, else 400 (forgecentral/apps/bff/src/server.ts:1470-1474); whole body <= 8192 bytes
  (forgecentral/apps/bff/src/server.ts:233, 236-247).
- Applies: the note under the button reports the engine's immediate answer
  (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:366-378): before any click "Runs the
  narrative and impact pipelines on the on-box model. Minutes, not seconds."; `started`/`running`
  "The run is in flight. These panels re-read as the records land."; `recorded` "Every record for this
  evidence already exists; nothing was re-generated."; `refused` "The engine refused the run: <detail>"
  (or "The engine refused the run."). States: forgecentral/packages/contracts/src/soc.ts:969,
  1408-1417.
- Gating: no confirm dialog (the click calls `run.mutate` directly,
  forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:355-365); no BFF role check; engine-side
  authorization only.
- Preconditions and disabled states: disabled while the request is in flight, or while this
  component's last reply was `started`/`running` (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:359).
- Failure states: BFF 400 (no incident), 401 (no session), 503 (`engine_unavailable` or
  `SocUnavailableError`), engine refusal -> 409 Conflict / 400 Framing / 403 otherwise, 502 other
  (forgecentral/apps/bff/src/server.ts:1547-1557). SPA text (forgecentral/apps/console/src/surfaces/useCognitionRun.ts:24-33):
  403 "This operator is not permitted to start a run."; 503 "The engine answered with something the
  Console will not render."; every other status, including 400 and 409, "The run request did not reach
  the engine." (misleading for an engine refusal).
- Behaviour note (claim not implemented): on success the BFF drops the tenant's SOC read cache
  (forgecentral/apps/bff/src/server.ts:1485) and the SPA invalidates the narrative and impact reads
  ONCE (forgecentral/apps/console/src/surfaces/useCognitionRun.ts:64-73). `RUN_POLL_INTERVAL_MS = 5_000`
  is exported (forgecentral/apps/console/src/surfaces/useCognitionRun.ts:42) but used nowhere; the
  narrative/impact queries have no `refetchInterval` (forgecentral/apps/console/src/surfaces/useSoc.ts:116-122,
  199-205) and window-focus refetch is off app-wide (forgecentral/apps/console/src/query/client.ts:12-14).
  So "These panels re-read as the records land" is not what the code does: the operator must re-select
  the incident (or remount the panel) to see a finished run.
- Evidence: forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:350-379;
  forgecentral/apps/console/src/surfaces/useCognitionRun.ts:44-73; forgecentral/apps/bff/src/server.ts:1479-1488.
- TRD drift: TRD-CONSOLE-03 has no Generate control; its Section 7 still lists "Verdict narrative ...
  PENDING" (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:233). Section 5.2 fixes the model as
  Gemma 4 `gemma4:26b-a4b-it-qat` (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:155-157); in code
  the model is whatever `soc_narrative.model_ref` binds (SET-CFG-08) and the panel shows it as
  `modelRef` and `inputHash` separated by a middle dot (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:328-332).

### SOC-02 Approve full response
- Location: SOC Ops > selected incident > Forge verdict > "Coordinated response" > "Approve full response"
- Configures: records the operator's authorization of the engine-proposed response plan at the
  revision shown. With enforcement OFF nothing is carried out; containment steps come back `refused`.
- Binding: `soc.plan.approve`, command, LIVE, audited, `operator:soc.respond`
  (forgecentral/packages/bindings/src/manifest.ts:861-868). The plan itself is `soc.plan.propose`,
  read, LIVE over `soc_incident_detail_v1` (forgecentral/packages/bindings/src/manifest.ts:788-794),
  although the manifest's own header comment still calls it PENDING
  (forgecentral/packages/bindings/src/manifest.ts:749-753).
- BFF route: `POST /api/soc/plan/approve` body `{incident, atRevision}` -> `handleSocCommand`
  (forgecentral/apps/bff/src/server.ts:1528-1536) -> `resolveApprovePlan`
  (forgecentral/apps/bff/src/engine/soc.ts:228-246).
- Engine op: `SocPlanApprove` `{request_id, incident, at_revision, operator}`
  (forgecentral/packages/wire/src/payload.ts:562-570).
- Fields: `atRevision` = the plan revision the detail read returned; not operator-entered
  (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:506). BFF: integer >= 0, required, never
  defaulted (forgecentral/apps/bff/src/server.ts:1531-1535).
- Applies: outcome line (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:486-494):
  `enforcementActive` true "Approved, and the response was carried out."; false "Approved and
  recorded. Nothing was carried out: enforcement is off on this deployment, so each containment step is
  recorded refused with its reason."
- Gating: confirm dialog "Approve the full response?" / "This authorizes N step(s) under your
  principal and is audited. Enforcement is off on this deployment, so no containment will actually be
  carried out." / button "Approve", tone critical
  (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:498-511). No BFF role check.
- Preconditions and disabled states: disabled when the plan has no steps, is already approved, or an
  approval is in flight (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:418). Note text
  (437-443): "Nothing to act on: no plan has been proposed." / "This plan is already approved. A second
  approval is refused, not re-recorded." / "Approval is audited under your principal, and authorizes
  only the steps listed above." Empty-plan copy (392-396): "No response plan has been proposed. The
  engine records and audits plans, and both operator commands exist, but nothing proposes one yet --
  so there is nothing here to approve." (stale: the ledger and the manifest say the crdb SS.6 proposer
  landed; see L-03).
- Failure states: BFF 409 Conflict / 400 Framing / 403 / 503 / 502
  (forgecentral/apps/bff/src/server.ts:1547-1557). SPA (forgecentral/apps/console/src/surfaces/usePlanCommand.ts:29-42):
  409 "The plan changed, was already approved, or does not exist yet. Re-read the incident and try
  again."; 400 "The engine would not accept this plan."; 403 "This operator is not permitted to act on
  this plan."; 503 "The engine answered with something the Console will not render."; else "The command
  did not reach the engine."; shown as "The approval was refused. <reason>"
  (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:477-484). Success drops the BFF SOC cache
  (forgecentral/apps/bff/src/server.ts:1545) and invalidates the incident and queue reads
  (forgecentral/apps/console/src/surfaces/usePlanCommand.ts:74-87).
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-03 Section 7 still lists "Verdict: Coordinated response ... PENDING -- no
  response-plan record exists" and "Approve Full Response ... PENDING"
  (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:235-236); both are LIVE. TRD 4.4 "SIMULATE
  CONTAINMENT" (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:133-134) does not exist in code.

### SOC-03 Modify plan (response step editor)
- Location: SOC Ops > selected incident > Forge verdict > "Modify plan" -> editor "Modify the
  response plan": per row "Step N" (title), "Action" (select), "Remove"; then "Add step", "Save plan",
  "Cancel".
- Configures: replaces the unapproved plan's steps (title + action only) and bumps its revision, so an
  approval against the old revision is refused.
- Binding: `soc.plan.modify`, command, LIVE, audited (forgecentral/packages/bindings/src/manifest.ts:872-879).
- BFF route: `POST /api/soc/plan/modify` body `{incident, steps:[{title, action}]}` ->
  `handleSocCommand` (forgecentral/apps/bff/src/server.ts:1537-1543) -> `resolveModifyPlan`
  (forgecentral/apps/bff/src/engine/soc.ts:254-272).
- Engine op: `SocPlanModify` `{request_id, incident, steps:[{title, action}], operator}`; `action` is
  `''` for an investigative step (forgecentral/packages/wire/src/payload.ts:596-606;
  forgecentral/packages/contracts/src/soc.ts:725-730).
- Fields:
  - Step title: text; SPA trims and disables Save if any title is blank
    (forgecentral/apps/console/src/surfaces/SocPlanEditor.tsx:64, 73-78, 140-142). BFF/contracts: non-blank
    after trim, else 400 (forgecentral/packages/contracts/src/soc.ts:822-825). No length cap other than
    the 8192-byte body.
  - Action: select "Investigate (no containment)" (value `''`) | `quarantine` | `deny`
    (forgecentral/apps/console/src/surfaces/SocPlanEditor.tsx:98-114; RESPONSE_ACTIONS
    forgecentral/packages/contracts/src/soc.ts:131). BFF: absent/null/`''` = investigative; otherwise a
    string, lower-cased, must be `quarantine` or `deny` (forgecentral/packages/contracts/src/soc.ts:826-838).
  - Add step / Remove: no minimum; removing every row and saving posts `steps: []`, which the BFF
    accepts ("clearing a plan's steps is a real operator act",
    forgecentral/packages/contracts/src/soc.ts:810-816). Engine acceptance of an empty plan: UNVERIFIED
    (engine side).
  - `state` and `authority` are never sent (forgecentral/packages/wire/src/payload.ts:600-602).
- Applies: helper "Saving replaces the proposed steps and bumps the revision, so an approval issued
  against the old plan is refused rather than applied." / blank title: "Every step needs a title. The
  engine refuses a blank one." (forgecentral/apps/console/src/surfaces/SocPlanEditor.tsx:146-155).
- Gating: NOT confirm-gated: "Save plan" submits straight to the mutation
  (forgecentral/apps/console/src/surfaces/SocPlanEditor.tsx:71-79;
  forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:446-466). No BFF role check.
- Preconditions and disabled states: "Modify plan" disabled when the plan is empty, approved, or the
  editor is already open (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:430). Save disabled
  while saving or any title is blank.
- Failure states: as SOC-02 (same mapping); shown as "The plan was not changed. <reason>"
  (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:468-475); the editor stays open with the
  operator's edits on a refusal (451-460).
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-03 A11 "Approve/Modify are confirm-gated and audited"
  (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:292); Modify is not confirm-gated.

### SOC-04 Assign (case act `assigned`)
- Location: SOC Ops > selected incident > Forge verdict > "Case" > "Assign to (principal id)" + "Assign"
- Configures: records that the incident is handed to a principal (audit act `assigned`, detail = the
  assignee id). Who holds the case is a trail fact, not an incident field
  (forgecentral/packages/bindings/src/manifest.ts:881-885).
- Binding: `soc.case.assign`, command, LIVE, audited, `operator:soc.respond`
  (forgecentral/packages/bindings/src/manifest.ts:886-893).
- BFF route: `POST /api/soc/act` body `{incident, act:"assigned", assignee}` -> `handleSocCommand`
  (forgecentral/apps/bff/src/server.ts:1489-1526) -> `resolveCaseAct`
  (forgecentral/apps/bff/src/engine/soc.ts:472-489).
- Engine op: `SocIncidentAct` `{request_id, incident, act, assignee, operator}`
  (forgecentral/packages/wire/src/payload.ts:643-653; forgecentral/packages/contracts/src/soc.ts:1175-1188).
- Fields: assignee principal id, typed by hand (no picker, operator ruling in
  forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:17-22). Format: UUID shape
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case-insensitive, after trim
  (forgecentral/packages/contracts/src/soc.ts:1117-1126); SPA and BFF both trim + lower-case
  (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:272;
  forgecentral/packages/contracts/src/soc.ts:1152-1157). The BFF refuses a body that also carries
  `note` (forgecentral/packages/contracts/src/soc.ts:1153). Placeholder
  "00000000-0000-0000-0000-000000000000". The engine records the id as submitted; engine-side
  validation is a pending rider (C.1r) (forgecentral/packages/bindings/src/manifest.ts:883-885).
- Applies: outcome "Recorded" + "Assigned and recorded in the trail."
  (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:174-189, 421-425); the field clears on
  success (231-237). Success drops the BFF SOC cache (forgecentral/apps/bff/src/server.ts:1515) and
  invalidates the incident's audit, notes, detail, the queue and the KPIs
  (forgecentral/apps/console/src/surfaces/useCaseCommand.ts:95-101).
- Gating: confirm "Assign this incident?" / "The incident is handed to principal <id>. The act is
  audited under your principal; the engine records the id as submitted." / button "Record", tone
  critical (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:152-157, 432-442).
- Preconditions and disabled states: disabled until the text is a principal id and while any case
  command is in flight (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:268). Helper
  (301-305): invalid text "Not a principal id. The engine records principal ids only."; otherwise
  "Assignees are the principals in the RBAC groups on Settings, entered by id. A picker over the
  directory lands with the engine RBAC store; no operator list is invented here." (Note: Settings >
  RBAC shows engine admin identities and the Console's IdP-group / OIDC-subject grants, never principal
  ids, so the Console offers no place to look an assignee id up; see SET-RBAC-01/02.)
- Failure states: BFF: 400 malformed; an in-band refusal with a blank reason -> 404; with a reason ->
  409 `{explanation}`; a thrown engine refusal -> 409 Conflict / 400 Framing / 403; 503; 502
  (forgecentral/apps/bff/src/server.ts:1511-1526, 1547-1557). SPA
  (forgecentral/apps/console/src/surfaces/useCaseCommand.ts:41-58): 409 "The engine refused it:
  <explanation>" or, with no body reason, "The engine refused the act and recorded no reason."; 404
  "The incident is unknown, another tenant's, or above this session's clearance." (typographic
  apostrophes in source); 400 "The engine would not accept the request as sent."; 403 "This operator is
  not permitted to act on cases."; 503 "The engine answered with something the Console will not
  render."; else "The command did not reach the engine."; shown as "The act was not recorded. <reason>"
  (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:411-415). A closed incident refuses assign
  (copy at 168).
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-03 specifies no case controls at all (Sections 5.1, 7, 8:
  forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:141-151, 215-252).

### SOC-05 Acknowledge (case act `acked`)
- Location: SOC Ops > selected incident > Forge verdict > Case > "Acknowledge"
- Configures: records that a human has seen the incident; changes nothing else.
- Binding: `soc.case.ack`, command, LIVE, audited (forgecentral/packages/bindings/src/manifest.ts:895-903).
- BFF route: `POST /api/soc/act` `{incident, act:"acked"}` -> `handleSocCommand` -> `resolveCaseAct`.
- Engine op: `SocIncidentAct` with `act: "acked"`, no optional fields
  (forgecentral/packages/wire/src/payload.ts:643-653).
- Fields: none. BFF refuses a stray `assignee` or `note` (forgecentral/packages/contracts/src/soc.ts:1164-1170).
- Applies: "Acknowledged and recorded in the trail." (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:178-179).
- Gating: confirm "Acknowledge this incident?" / "Records that a human has seen it. Audited under your
  principal; it changes nothing else." / "Record" (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:158-163).
- Preconditions and disabled states: disabled while a case command is in flight (283). A closed
  incident refuses it (engine; copy at 168).
- Failure states: as SOC-04.
- Evidence: forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:278-288.
- TRD drift: not in TRD-CONSOLE-03.

### SOC-06 Close without verdict (case act `closed`)
- Location: SOC Ops > selected incident > Forge verdict > Case > "Close without verdict"
- Configures: takes the incident out of both SOC channels with NO verdict and no calibration signal.
- Binding: `soc.case.close`, command, LIVE, audited; "Refused once closed"
  (forgecentral/packages/bindings/src/manifest.ts:916-926).
- BFF route: `POST /api/soc/act` `{incident, act:"closed"}` -> `handleSocCommand` -> `resolveCaseAct`.
- Engine op: `SocIncidentAct` with `act: "closed"`.
- Fields: none (stray fields refused, forgecentral/packages/contracts/src/soc.ts:1164-1170).
- Applies: `closedNow` true "Closed without a verdict. The incident left both channels; no calibration
  signal was recorded."; false "The engine recorded the close but reports the incident was not closed
  by it." (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:184-187).
- Gating: confirm "Close without a verdict?" / "The incident leaves both channels with NO verdict
  recorded, so calibration learns nothing from it. Prefer a disposition when you know what this was.
  Audited under your principal; a closed incident refuses assign, acknowledge and close, but still
  accepts notes." / "Record" (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:164-169).
- Preconditions and disabled states: disabled while a case command is in flight (293).
- Failure states: as SOC-04.
- Evidence: forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:289-299.
- TRD drift: not in TRD-CONSOLE-03.

### SOC-07 Record disposition (the closure verdict)
- Location: SOC Ops > selected incident > Forge verdict > Case > form "Record a disposition":
  "Verdict" select, the verdict's one field, "Acceptance lapses on" (risk-accepted only), "Record
  disposition".
- Configures: closes the incident with a verdict and records it as calibration's label;
  `false_positive` is the one verdict that down-weights the rule tenant-wide; on an already-closed
  incident it is a correction.
- Binding: `soc.disposition`, command, LIVE, audited (forgecentral/packages/bindings/src/manifest.ts:927-938).
- BFF route: `POST /api/soc/disposition` body `{incident, disposition, <one field>}` ->
  `handleSocCommand` (forgecentral/apps/bff/src/server.ts:1489-1526) -> `resolveDisposition`
  (forgecentral/apps/bff/src/engine/soc.ts:509-528).
- Engine op: `SocDisposition` `{request_id, incident, disposition, justification?, authorized_by?,
  action_taken?, blocking_control?, accepting_party?, expiry_seconds?, predecessor?, operator}`
  (forgecentral/packages/wire/src/payload.ts:578-593; forgecentral/packages/contracts/src/soc.ts:1322-1352).
- Fields (SPA labels forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:41-78; SPA builder
  105-131; BFF parser forgecentral/packages/contracts/src/soc.ts:1271-1319):
  - "False positive" (`false_positive`): "Justification", text, required non-blank (trimmed).
  - "Benign, authorized" (`benign_authorized`): "Authorized by", text, required.
  - "True positive, remediated" (`true_positive_remediated`): "Action taken", select over `reimage`,
    `credential_rotation`, `patch`, `isolate`, `remove` (forgecentral/packages/contracts/src/soc.ts:941-947);
    BFF lower-cases and narrows.
  - "True positive, blocked" (`true_positive_blocked`): "Blocking control", text, required.
  - "True positive, risk accepted" (`true_positive_risk_accepted`): "Accepting party", text, required;
    plus "Acceptance lapses on", a date input (`YYYY-MM-DD`), converted to 00:00 UTC unix seconds; SPA
    requires it strictly in the future (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:90-96,
    119-125); BFF only requires a positive integer (forgecentral/packages/contracts/src/soc.ts:1299-1311);
    the engine refuses a passed expiry (per the SPA hint at 405).
  - "Duplicate" (`duplicate`): "Predecessor incident id", text, required (not format-checked).
  - "Undetermined" (`undetermined`): no field.
  - Default verdict on render is "Undetermined" (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:212-217),
    so "Record disposition" is enabled immediately. Changing the verdict clears the field (324-331). No
    length cap on text fields in SPA or contracts; only the 8192-byte BFF body cap.
- Applies: `closedNow` true "Verdict recorded: <label>. The incident is closed."; false "Verdict
  recorded: <label>, as a correction. The incident was already closed, so this did not close it."
  (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:192-197). Hints (398-408): undetermined
  "Closes the incident with no verdict label; unlike a plain close, the trail records that an operator
  ruled it undetermined."; false_positive "The one verdict that down-weights the rule tenant-wide. It
  needs your justification."; incomplete risk acceptance "Needs the accepting party and a lapse date in
  the future; the engine refuses an expiry that has passed."; other incomplete "Needs <field>."; complete
  "Recorded as a calibration label and closes the incident."
- Gating: confirm title `Record the verdict "<label>"?`; description for false_positive "This closes
  the incident and DOWN-WEIGHTS the rule for this tenant. It is audited under your principal and cannot
  be un-recorded; a later verdict is a correction on top of it."; for every other verdict "This closes
  the incident and records the verdict as a calibration label. It is audited under your principal and
  cannot be un-recorded; a later verdict is a correction on top of it." / "Record"
  (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:142-151). Copy conflict: for "Undetermined"
  the confirm says it records a calibration label while the inline hint (400) says "no verdict label".
- Preconditions and disabled states: disabled while the draft is incomplete or a case command is in
  flight (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:394).
- Failure states: as SOC-04; shown as "The verdict was not recorded. <reason>"
  (forgecentral/apps/console/src/surfaces/SocCaseControls.tsx:416-420). Success invalidates the same
  reads as SOC-04 (forgecentral/apps/console/src/surfaces/useCaseCommand.ts:119-131).
- Evidence: as cited.
- TRD drift: not in TRD-CONSOLE-03.

### SOC-08 Record note (case act `noted`)
- Location: SOC Ops > selected incident > Investigation dock > "Notes" tab > textarea "Case note" +
  "Record note"
- Configures: attaches an audited, undeletable case note (accepted on a closed incident too).
- Binding: `soc.case.note`, command, LIVE, audited (forgecentral/packages/bindings/src/manifest.ts:904-915);
  the list is `soc.notes`, read, LIVE (822-828).
- BFF route: `POST /api/soc/act` `{incident, act:"noted", note}` -> `handleSocCommand` ->
  `resolveCaseAct`; list `GET /api/soc/notes?id=` (forgecentral/apps/bff/src/server.ts:1691-1701).
- Engine op: `SocIncidentAct` with `act: "noted"`, `note` (forgecentral/packages/wire/src/payload.ts:643-653);
  list `SocNotes` (forgecentral/apps/bff/src/engine/wire-client.ts:1086).
- Fields: note text. SPA: submits the TRIMMED text; blocks blank; "over cap" when the UNTRIMMED draft
  length (UTF-16 units) exceeds 4000 (`MAX_NOTE_CHARS`, forgecentral/packages/contracts/src/soc.ts:1133;
  forgecentral/apps/console/src/surfaces/SocInvestigationDock.tsx:357-358, 390-395). BFF: non-blank only,
  no maximum (forgecentral/packages/contracts/src/soc.ts:1158-1163); the engine refuses over 4000 in-band
  (forgecentral/packages/bindings/src/manifest.ts:905-907). Edge (derived, untested): the BFF's
  8192-byte body cap (forgecentral/apps/bff/src/server.ts:233) can refuse a multi-byte note well under
  4000 characters (for example about 3000 three-byte characters), which the SPA reports as "The engine
  would not accept the request as sent."
- Applies: counter "N of 4000 characters. Accepted on a closed incident too; audited and not
  deletable." / over cap "N of 4000 characters: over the engine's ceiling."
  (forgecentral/apps/console/src/surfaces/SocInvestigationDock.tsx:414-418); outcome "Recorded" + "The
  note was recorded as <noteRef>." (430-437). The draft clears only on success (449-454).
- Gating: confirm "Record this note?" / "The note is audited under your principal and cannot be
  deleted." / "Record", tone critical (forgecentral/apps/console/src/surfaces/SocInvestigationDock.tsx:439-460).
- Preconditions and disabled states: "Record note" disabled when blank, over cap, or recording (410).
- Failure states: as SOC-04, shown as "The note was not recorded. <reason>" (422-429). If the notes
  READ fails, the pane still says "Loading the notes." (no error branch: 362-364); a refused read shows
  "The notes cannot be read for this incident." (365-368).
- Evidence: forgecentral/apps/console/src/surfaces/SocInvestigationDock.tsx:352-463.
- TRD drift: TRD-CONSOLE-03 Section 6 lists five dock tabs, no Notes
  (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:203-208).

### SOC-09 Read-only configuration displays on SOC Ops
- Location: SOC Ops command header, KPI strip, queue cards, Forge verdict header, dock Audit Trail.
- Configures: nothing; these are where engine configuration becomes visible:
  - Header pills: "Detection active" / "Detection disabled" / "Posture unknown" from
    `DETECT_SUMMARY.enabled`, and a constant "Enforcement off" pill
    (forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:150-178).
  - KPI strip, six tiles: Events Analyzed, Noise Collapsed, Material Incidents, Auto-Contained (badge
    "Enforcement off"), Decision Waiting, Rules Evaluable ("N of M" + the top blocker, or "Not
    reported" / "Older node") (forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:67-147).
  - Queue credibility line: "credibility X.XX" plus "NN% likely a true positive" only on a node with a
    committed calibration, else "Uncalibrated" (forgecentral/apps/console/src/surfaces/SocDecisionQueue.tsx:127-140).
  - Verdict header: "Generated" + `<modelRef>` and `<inputHash>` separated by a middle dot once a narrative exists, i.e. the model
    bound in SET-CFG-08 (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:323-333).
  - Audit Trail glosses `plan_withheld` "the engine withheld containment under the response tier" (the
    visible effect of SET-SOC-03) and `siem_enriched` "the engine wrote the enrichment row to the SIEM"
    (the visible effect of SET-SOC-04) (forgecentral/apps/console/src/surfaces/SocInvestigationDock.tsx:263-292).
- Binding: KPI strip -- NONE registered (the manifest comment claims DETECT_SUMMARY is "already
  registered by the detection work", forgecentral/packages/bindings/src/manifest.ts:747, but no entry
  exists); queue `soc.incidents`, narrative `soc.narrative`, trail `soc.audit.trail` LIVE
  (forgecentral/packages/bindings/src/manifest.ts:757-817).
- BFF route: `GET /api/soc/kpis` -> `resolveSocKpis` (reads DETECT_SUMMARY and the queue together,
  forgecentral/apps/bff/src/engine/soc.ts:201-216); `GET /api/soc/incidents`; `GET /api/soc/narrative?id=`;
  `GET /api/soc/audit?id=` (forgecentral/apps/bff/src/server.ts:1585-1746).
- Engine op: `DetectSummary`, `SocIncidentList` (limit 200, forgecentral/apps/bff/src/engine/soc.ts:106,
  126), `SocNarrative`, `SocAudit`.
- Fields: none editable.
- Applies: n/a. Reads are cached per tenant in the BFF for `FC_CACHE_TTL_MS` (default 2000 ms,
  forgecentral/apps/bff/src/config.ts:49) under `soc-v1` (forgecentral/apps/bff/src/server.ts:1562, 1647-1651).
- Gating: session only.
- Preconditions and disabled states: n/a.
- Failure states: KPI read failure "The detection summary cannot be shown" (+ code, Retry)
  (forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:318-324); refused queue is 503, never an
  empty queue (forgecentral/apps/bff/src/engine/soc.ts:128-138).
- Evidence: as cited.
- TRD drift: TRD Section 2 names five KPI tiles (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:64);
  code has six. The header in TRD Section 2 has a tenant/shift line, an `ELEVATED` posture pill, global
  search and a shift-lead readout (62); code has none of these.

### SOC-10 View controls (not configuration)
- Location: SOC Ops focus tabs "Incidents" / "Alerts" / "Threat Intel" / "Assets" / "Analytics" /
  "Automation" / "Exceptions" (forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:38-46; every
  tab but Incidents renders "Not yet built", 308-314); queue channels "All" / "Urgent Review" /
  "Threat Inspection" (forgecentral/apps/console/src/surfaces/SocDecisionQueue.tsx:71-75, 230-266);
  incident selection (no auto-select: "Select an incident",
  forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:206-212, 283); lineage disclosure "Material
  path" / "Show evidence" / "Full story", default Material path
  (forgecentral/apps/console/src/surfaces/SocLineageGraph.tsx:42-54;
  forgecentral/apps/console/src/surfaces/SocOpsSurface.tsx:284); node scope (click a graph node);
  dock tabs "Evidence" / "Timeline" / "Model Reasoning" / "Raw Telemetry" / "Audit Trail" / "Notes"
  (forgecentral/apps/console/src/surfaces/SocInvestigationDock.tsx:44-51).
- Configures: nothing on the engine; component state only, not persisted, not in the URL.
- Binding / BFF route / Engine op: none (filters over data already read).
- Fields, Applies, Gating: n/a.
- Preconditions and disabled states: n/a.
- Failure states: a channel emptied by its filter says "No incidents in <channel>" /
  "<N> open incident(s) sit outside this channel. Switch to All to see everything the engine holds
  open." (forgecentral/apps/console/src/surfaces/SocDecisionQueue.tsx:303-308).
- Evidence: as cited.
- TRD drift: TRD Section 8 "the queue's first card is selected on load"
  (forgecentral/docs/spec/TRD-CONSOLE-03-soc-ops.md:248); code selects nothing. TRD 8 "click a node (1)
  -> Open entity (2) -> drawer" (252); the lineage graph has no entity-drawer action (no drawer use in
  any Soc* file).

---

# Part 2 -- Logs (`/logs`)

The surface is `LogsSurface` (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:62-361). The only
state-changing control is Export. All Logs routes are session-gated only (no BFF role check) and use the
plain operator delegation (forgecentral/apps/bff/src/engine/operator-engine.ts:985-999).

### LOG-01 Export (audited LOG export)
- Location: Logs > header, beside the Live badge and Pause > "Export" (reads "Exporting..." in flight)
- Configures: runs an AUDITED engine export of the current filter; the engine records a receipt on the
  audit chain and returns the rows, which the browser downloads.
- Binding: `logs.export`, LIVE, op `log_export_v1` -- registered as kind `read`, not `command`
  (forgecentral/packages/bindings/src/manifest.ts:195-205), so it carries no `authz` and is outside the
  "command binding must be audited" rule (forgecentral/packages/bindings/src/validate.ts:39-41;
  forgecentral/packages/contracts/src/binding.ts:41-52).
- BFF route: `POST /api/logs/export` body `{commandId, filter}` -> `handleLogExport`
  (forgecentral/apps/bff/src/server.ts:369-418) -> `parseLogExportRequest` (321-361) ->
  `resolveLogExport` (forgecentral/apps/bff/src/engine/logs.ts:135-158).
- Engine op: `LogExport` `{operator?, query: {request_id, since?, until?, technique?, tactic?, rule_id?,
  confidence?, action?, search?, limit, offset?}, command_id, issued_at}`
  (forgecentral/packages/wire/src/payload.ts:376-391, 413-420; forgecentral/apps/bff/src/engine/logs.ts:86-100).
- Fields:
  - `commandId`: a fresh `crypto.randomUUID()` per click (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:198),
    the idempotency key (a replay returns the same receipt, `commitVersion` 0). BFF: non-blank string.
  - `filter`: the current UI filter (LOG-02) including `limit: 100` (`PAGE_LIMIT`,
    forgecentral/apps/console/src/surfaces/LogsSurface.tsx:25, 76-86). BFF: limit > 0 clamped to <= 500,
    else 100; `since`/`until` finite numbers in ms (sent to the engine in seconds); strings non-empty;
    `offset` a positive integer (forgecentral/apps/bff/src/server.ts:321-361, 425-426).
  - Consequence: the export is capped at the page size (100 rows); it is not "the whole filtered set".
    Whether the engine applies `limit` inside LOG_EXPORT: UNVERIFIED (engine side). `since` is the value
    computed when the time-range control last changed (76-86), not at click time.
- Applies: receipt line "Exported N decision(s); audit receipt <first 16 of exportId> recorded at
  version V." or "... (already recorded)." when `commitVersion` is 0
  (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:208-216); download
  `decision-log-<first 16 of exportId>.json` containing `{exportId, rows}` (JSON only)
  (forgecentral/apps/console/src/surfaces/useExportLogs.ts:36-46).
- Gating: no confirm dialog (one click). Session only (forgecentral/apps/bff/src/server.ts:381-389);
  the engine authorizes.
- Preconditions and disabled states: disabled while an export is in flight
  (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:195).
- Failure states: BFF 405 (non-POST), 401, 503 `engine_unavailable`, 400 `malformed_request`, 403
  `{error:"refused", class}` on an engine refusal, 502 otherwise
  (forgecentral/apps/bff/src/server.ts:376-417). SPA: any non-2xx -> "The export was refused or
  unavailable. Nothing was recorded." (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:217-221).
- Evidence: forgecentral/apps/console/src/surfaces/useExportLogs.ts:12-30;
  forgecentral/packages/contracts/src/logs.ts:141-158.
- TRD drift: TRD-CONSOLE-09 Section 3 calls it a "Command binding `logs.export`"
  (forgecentral/docs/spec/TRD-CONSOLE-09-logs.md:49-51) -- registered as a read binding; Section 5
  "Export (1) -> confirm/download (2)" (77) -- there is no confirm; Section 8 "an audited engine export
  of exactly the filtered set" (101-102) -- capped at the 100-row page.

### LOG-02 Filters and time range (no saved filters)
- Location: Logs > filter bar (role "search"): "Search" (placeholder "finding, rule, or evidence"),
  "Confidence", "Outcome", "Time range"
- Configures: the engine-side LOG_QUERY predicate for the table (and for LOG-01). Nothing is saved.
- Binding: `logs.query`, read, LIVE (forgecentral/packages/bindings/src/manifest.ts:161-171).
- BFF route: `GET /api/logs?search=&confidence=&action=&since=&limit=` -> `handleLogs`
  (forgecentral/apps/bff/src/server.ts:472-522) -> `parseLogFilter` (429-464) -> `resolveLogQuery`
  (forgecentral/apps/bff/src/engine/logs.ts:106-114).
- Engine op: `LogQuery` (forgecentral/apps/bff/src/engine/wire-client.ts:1237).
- Fields:
  - Search: free text, trimmed, omitted when blank (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:78-80, 224-233).
  - Confidence: "Any" (none) / "High" `HIGH` / "Medium" `MEDIUM` / "Low" `LOW` / "Contested"
    `CONTESTED` -- an exact tier, not a threshold (234-247).
  - Outcome: "Any" / "Escalate" `escalate` / "Candidate" `candidate` / "Observe only" `observe-only`
    -- the advisory posture tag, sent as `action` (248-256).
  - Time range: "All time" (default) / "Last 24h" / "Last 7 days" / "Last 30 days" -> `since = now -
    window` in ms (28-33, 66, 257-265).
  - Page size fixed at 100 (25). The BFF/contracts also accept `technique`, `tactic`, `ruleId`, `until`
    (forgecentral/packages/contracts/src/logs.ts:105-124), but the UI has no control for them.
  - Saved filters: NONE. The filter is component state only (`useState`,
    forgecentral/apps/console/src/surfaces/LogsSurface.tsx:63-66); it is not URL-encoded and not stored.
  - A background backfill (up to 50 pages x 100 rows, refreshed every 30 s) supplies an instant
    client-filtered placeholder until the engine's result arrives
    (forgecentral/apps/console/src/surfaces/useLogs.ts:48-64, 69-107, 114-131).
- Applies: immediately (the filter is the query key).
- Gating: session only.
- Preconditions and disabled states: none.
- Failure states: first-load failure "Could not load the decision log." + Retry; empty "No decisions
  match" / "No governed decision matches <active filters>." or "No governed decisions have been
  recorded yet." (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:268-291). BFF 403 on an engine
  refusal, 502 otherwise (forgecentral/apps/bff/src/server.ts:510-520).
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-09 Section 4 (forgecentral/docs/spec/TRD-CONSOLE-09-logs.md:57-63) specifies
  filters by entity, category, decision, VTZ, confidence threshold and tag, a "Last 24h" default, and
  "a shareable, URL-encoded view (a Crucible-stored operator preference)". Code: no entity / category /
  VTZ / tag filter, confidence is exact, the default is "All time", nothing is URL-encoded or stored.

### LOG-03 Live tail Pause / Resume
- Location: Logs > header > badge "Live" / "Reconnecting" / "Paused" + "Pause" / "Resume" (aria-pressed)
- Configures: whether the SPA re-polls the page every 2 s; not persisted.
- Binding: `logs.tail`, PENDING, owningRepo `crdb`, gatingTask "IP-CONSOLE-READINESS Part B (bounded
  decision SUBSCRIBE push stream)" (forgecentral/packages/bindings/src/manifest.ts:181-194); v1 polls
  `logs.query`.
- BFF route / Engine op: as LOG-02.
- Fields: none. Poll interval 2000 ms (`LIVE_POLL_MS`, forgecentral/apps/console/src/surfaces/useLogs.ts:14, 62).
- Applies: immediately. Badge derivation (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:52-59,
  93-95): paused -> Paused; a failed poll that kept rows -> Reconnecting; else Live.
- Gating: none.
- Preconditions and disabled states: the hook comment says the poll runs "When `live` (the range
  includes now)" (forgecentral/apps/console/src/surfaces/useLogs.ts:41-47), but the surface passes
  `!paused` for every range (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:88).
- Failure states: see badge.
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-09 Section 3 "Stream binding `logs.tail`" (44-46) and Section 6 "the live tail
  applies deltas in place (never re-fetches on a tick)" (82): code re-fetches the page each tick.

### LOG-04 Decision rationale and row drill-in (view)
- Location: Logs > table (columns "Time (UTC)", "Decision", "ATT&CK", "Confidence", "Outcome") >
  "Decision" cell button -> panel "Why this decision fired" (Finding, Rule, ATT&CK + tactics, Scope,
  Evidence, Acting entity "View <id>", "Close"); a row click opens the entity drawer for the acting
  entity (or the rationale when none)
- Configures: nothing.
- Binding: `logs.explain`, read, LIVE (forgecentral/packages/bindings/src/manifest.ts:172-180).
- BFF route: `GET /api/logs/explain/<id>` -> `handleLogs` -> `resolveLogExplain`
  (forgecentral/apps/bff/src/engine/logs.ts:120-128).
- Engine op: `LogExplain` `{request_id, decision_id, operator?}` (forgecentral/packages/wire/src/payload.ts:397-404).
- Fields / Applies / Gating: n/a.
- Failure states: an absent or denied decision is a non-oracle 404 (forgecentral/apps/bff/src/server.ts:511-515);
  SPA "Could not load the rationale." + Retry (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:302-308).
- Evidence: forgecentral/apps/console/src/surfaces/LogsSurface.tsx:97-167, 294-358.
- TRD drift: TRD-CONSOLE-09 Section 2 columns Entity, Category, Trust Delta, VTZ and a Confidence
  percentage (forgecentral/docs/spec/TRD-CONSOLE-09-logs.md:24-32) -- absent; Section 5 "Row -> EXPLAIN
  -> full replay ... AIOps Rewind" (68-69) -- absent.

---

# Part 3 -- Reports (`/reports`)

The surface is `ReportsSurface` (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:170-230). It
changes no engine state. It was built under the SOC plan (IP-CONSOLE-03 S3.16 / S3.17), not under
IP-CONSOLE-08 (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:1-12).

### REP-01 Incident report picker
- Location: Reports > "Incident report" panel > "Incident" select ("Choose an incident", then one
  option per OPEN incident, text `<subject> -- <finding> (<ruleId>)`)
- Configures: which incident's shaped report is read and shown; view only.
- Binding: the option list is `soc.incidents` (LIVE); the report read (`SOC_INCIDENT_REPORT`) has NO
  binding registered (no `soc.report` entry in forgecentral/packages/bindings/src/manifest.ts:755-841).
- BFF route: `GET /api/soc/incidents`; `GET /api/soc/report?id=<incident>` -> `handleSoc`
  (forgecentral/apps/bff/src/server.ts:1720-1731) -> `resolveIncidentReport`
  (forgecentral/apps/bff/src/engine/soc.ts:354-372).
- Engine op: `SocIncidentList`; `SocReport` `{request_id, incident, operator?}`
  (forgecentral/packages/wire/src/payload.ts:676-683).
- Fields: the select only. The option shows the raw `subject` (possibly a long digest), not the
  resolved `subjectName` the SOC queue uses (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:206-210).
  Only incidents in the open queue are offered; no Console path reports on a closed incident.
- Applies: the report renders a narrative-state line (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:34-45):
  "Narrative published by <modelRef>" / "Narrative refused: <detail>" / "No narrative model is bound;
  the model sections are the declared template" (when unbound -- the visible effect of SET-CFG-08) /
  "No narrative run is recorded for this evidence; the model sections are the declared template", plus
  " -- needs human review"; six sections each labelled "model (adjudicated)" / "engine (record)" /
  "template (declared fallback)" (forgecentral/packages/contracts/src/soc.ts:1509-1536).
- Gating: session only.
- Preconditions and disabled states: the select appears only when the queue read succeeds with at
  least one incident; else "No open incidents to report on" / "A report is shaped from an incident's
  record. When the queue has an incident, pick it here." (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:189-194).
- Failure states: "The incident queue could not be read" + Retry; "The report could not be read" +
  Retry; a refusal (404) "No report for this incident" / "The engine did not serve a report: the incident
  is unknown to this tenant or above your clearance." (182-223).
- Evidence: as cited.
- TRD drift: see D-08.

### REP-02 Export as text / Export as JSON
- Location: Reports > Incident report (after a pick) > "Export as text" / "Export as JSON"
- Configures: nothing on the engine. A client-side download of exactly the report just read.
- Binding: NONE. (`entity.fullReport` is PENDING, gatingTask "IP-CONSOLE-08 Reports surface",
  forgecentral/packages/bindings/src/manifest.ts:139-151.)
- BFF route / Engine op: none (uses the REP-01 read already in hand).
- Fields: format only. Files `incident-report-<first 24 of incidentId>.txt` (via `reportToText`) or
  `.json` (the `SocReport` view model, camelCase) (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:23-32;
  forgecentral/packages/contracts/src/soc.ts:1542-1562).
- Applies: immediate download. Not audited; no confirm.
- Gating: none beyond having read the report.
- Preconditions and disabled states: shown only with a report on screen.
- Failure states: none handled.
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-08 Section 3 requires `report.export` / `report.share` as "a real, audited
  engine export (PDF/CSV/JSON) ... the share is a tier-respecting link"
  (forgecentral/docs/spec/TRD-CONSOLE-08-reports.md:38-39): code has an unaudited client download,
  text/JSON only, and no share.

### REP-03 Weekly volume and coverage panel
- Location: Reports > "Weekly volume and coverage" (top of the page)
- Configures: nothing; displays the engine's weekly derivation. Fixed at 12 weeks (`WEEKS_SHOWN`,
  forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:96-97); there is no range control.
- Binding: NONE registered for `SOC_WEEKLY_SUMMARY`.
- BFF route: `GET /api/soc/weekly?weeks=12` -> `handleSoc` (400 outside 1..12, default 4 when absent,
  forgecentral/apps/bff/src/server.ts:1616-1621, 1661-1672) -> `resolveWeekly` (clamps 1..12,
  forgecentral/apps/bff/src/engine/soc.ts:375-401).
- Engine op: `SocWeekly` `{request_id, weeks, until_seconds?, operator?}`
  (forgecentral/packages/wire/src/payload.ts:695-704).
- Fields: none. Displays "Corpus coverage now: N of M rules evaluable on this node's sources (current
  reading, not per week)." or "Corpus coverage: no reading on this node.", plus " Incident counts may
  undercount: the engine scan hit its ceiling."; table "Week of", "Firings", "Opened", "Promoted",
  "Muted", "Techniques fired", "Incidents opened", "Incidents closed"
  (forgecentral/apps/console/src/surfaces/ReportsSurface.tsx:103-146).
- Applies: n/a.
- Gating: session only.
- Preconditions and disabled states: n/a.
- Failure states: refusal (404) "No weekly volume for this tenant" / "The engine refused the read:
  nothing is shown in its place."; error "The weekly volume could not be read" + Retry (148-167).
- Evidence: as cited.
- TRD drift: see D-08.

---

# Part 4 -- Settings (`/settings`)

### SET-00 The Settings surface: tab strip, gating, shared states
- Location: left rail "Settings" (`/settings`, forgecentral/apps/console/src/ia/destinations.ts:42) ->
  heading "Settings" -> tab strip (aria "Settings") with TEN tabs in this order: "SOC",
  "Configuration", "RBAC", "Federation", "Changes", "Security", "KeyLock", "Observability",
  "HA & Topology", "FIPS Mode" (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:508-519).
  Default tab: SOC (522). The tab list is a hard-coded constant; the comment calling it "The tabs whose
  engine bindings are live" (507) is not backed by any binding lookup.
- Configures: nothing itself; hosts the tabs below.
- Binding: NONE. The manifest registers no `settings.*` (or `soc.settings*`) binding at all
  (forgecentral/packages/bindings/src/manifest.ts:941-961), and the no-stub test's prefix list has no
  `settings.` (forgecentral/apps/console/src/test/contract/no-stub.test.tsx:18-29). See X-01.
- BFF route: the ten `/api/settings*` paths documented in `SETTINGS_PATHS`
  (forgecentral/apps/bff/src/openapi.ts:37-130) plus the `/api/idam/*` routes used by Federation.
- Engine op: see each item. Every Settings wire op carries the Settings delegation
  `{principal, tenant, settings_tier?}` (forgecentral/apps/bff/src/engine/operator-engine.ts:676-686,
  799-848; forgecentral/packages/wire/src/payload.ts:103-116); the Federation connector panel's IdAM ops
  carry the plain delegation without `settings_tier` (forgecentral/apps/bff/src/engine/operator-engine.ts:729-748).
- Fields: n/a.
- Applies: every Settings read is uncached on both tiers (`staleTime: 0`,
  forgecentral/apps/console/src/surfaces/useSettings.ts:46, 97, 156, 186, 203, 261, 289; BFF "nothing is
  cached", forgecentral/apps/bff/src/server.ts:1993-1998).
- Gating:
  - SPA: none. Every signed-in operator sees the Settings rail entry and all ten tabs; there is no role
    check anywhere in the SPA (no `role` use in forgecentral/apps/console/src outside the RBAC table).
  - BFF: a session is required on every route; the ONLY Console-role check is `global-admin` on
    `GET /api/settings/console-rbac` (forgecentral/apps/bff/src/server.ts:2115-2118).
  - Engine tier: the BFF sends `settings_tier` = the session's tier for a `global-admin` session ONLY
    (forgecentral/apps/bff/src/engine/principal.ts:29-36, 48-61). A global admin's tier is at least
    `Admin` (forgecentral/apps/bff/src/auth/tier.ts:33-37; forgecentral/apps/bff/src/auth/oidc.ts:139),
    `SecurityAudit` when an IdP group maps to `console-security-audit` (tier.ts:19-24). The engine reads
    `settings_tier` and, when it is absent, falls back to the Console PEER's own session tier
    (crucible/crates/cdb-server/src/handler.rs:4205-4224); so whether a tenant-admin or tenant-user is
    refused depends on the peer's provisioned tier -- UNVERIFIED here (the FC comment asserts they stay
    refused, forgecentral/apps/bff/src/engine/principal.ts:33-35). SETTINGS_READ requires Admin or
    SecurityAudit (crucible/crates/cdb-server/src/handler.rs:4243-4248); the per-op commit/approve tier
    (FC comments say Admin: forgecentral/apps/console/src/surfaces/useSettings.ts:4;
    forgecentral/apps/bff/src/server.ts:1991, 2232) is UNVERIFIED engine-side.
  - Dual control: when the committed `governance.dual_control` set contains `tenant-config`, the read
    says `dualControlRequired` (crucible/crates/cdb-server/src/handler.rs:4283-4285) and the surface
    switches to propose mode (SET-CFG-02..08, SET-CHG-03) and locks the SOC tab (SET-SOC-02).
- Preconditions and disabled states: a 403 from any Settings read renders an empty state titled "Admin
  or SecurityAudit tier required" (hint wording per tab, cited per item).
- Failure states: a failed read renders an ErrorState with "Retry" (refetch). A failed commit /
  proposal / approval / rollback renders an ErrorState whose "Retry" only clears the error (`reset()`),
  it does not resend (X-04).
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-11 Section 6 "unauthorized tabs/actions absent for a non-admin operator"
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:74-75) -- all tabs render for everyone; Section 9.3
  "A tab whose engine binding has not landed is ABSENT from the strip" (168-170) -- the strip is a fixed
  list. Full tab-set drift in D-11.

## Tab 1 -- SOC

All SOC-tab items read one engine op. BFF route `GET /api/settings/soc` -> `handleSocSettings`
(forgecentral/apps/bff/src/server.ts:2336-2364) -> `resolveSocSettings`
(forgecentral/apps/bff/src/engine/soc.ts:408-423); engine op `SocSettingsRead`
`{request_id, operator}` (forgecentral/packages/wire/src/payload.ts:802-806). Read states
(forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:483-505): loading "Reading the committed
settings"; error "The settings could not be read" + Retry; 403 "Admin or SecurityAudit tier required" /
"The engine serves these settings to Admin and SecurityAudit operators only; nothing is shown in their
place."; an unknown vendor or ceiling tag makes the whole read a 503 (fail-closed,
forgecentral/packages/contracts/src/soc.ts:1725-1732; forgecentral/apps/bff/src/server.ts:2380-2381).

### SET-SOC-01 Narrative model line
- Location: Settings > SOC > "Narrative model: <ref>" (or "none bound (verdict narratives serve the
  declared template)") followed by " -- committed at version N"
- Configures: nothing here (read-only). Edited at Settings > Configuration > Section settings >
  Narrative model (SET-CFG-08).
- Binding: NONE registered.
- BFF route / Engine op: as the tab header above.
- Fields: `narrative_model_ref`, empty string rendered as none bound
  (forgecentral/packages/contracts/src/soc.ts:1737-1740).
- Applies: n/a.
- Gating: as SET-00.
- Preconditions and disabled states: n/a.
- Failure states: tab read states.
- Evidence: forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:100-109.
- TRD drift: TRD-CONSOLE-11 9.2 puts the editable model ref on a "Policy" tab
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:159); there is no Policy tab (D-11).

### SET-SOC-02 Dual-control notice (SOC tab locked)
- Location: Settings > SOC > badge "Dual control" + "The committed governance places tenant-config
  under dual control. The Console reads these settings but cannot commit them: propose and approve on
  the admin plane."
- Configures: nothing; states why every SOC control is disabled.
- Binding: NONE registered.
- BFF route / Engine op: as the tab header; `dual_control_required` on the read.
- Fields: n/a.
- Applies: n/a.
- Gating: shown when `dualControlRequired` (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:91,
  110-116); every input and both Commit buttons are then disabled (141, 153, 158, 181, 191, 207, 217,
  227, 236, 247).
- Preconditions and disabled states: there is NO Console path to change the response tiers or the SIEM
  write-back under dual control: `SOC_SETTINGS_COMMIT` has no propose form (ledger ST.9 note,
  forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings-LEDGER.md:29), and on the Configuration
  tab the rows `soc.tiers` and `siem_writeback` are section-origin rows
  (crucible/crates/cdb-admin/src/config_registry.rs:811-838) outside the engine's patchable sections
  (crucible/crates/cdb-server/src/handler.rs:4448-4454), with no field in the section patch
  (forgecentral/packages/contracts/src/generated/wire-dto.ts:1065-1072), so they render "read-only".
  "The admin plane" in this copy can only mean the engine's own admin plane (`cdb-actl`, `:7440`
  loopback, per forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:138-141), not the Console's `:8443`
  admin plane; the copy does not say which.
- Failure states: n/a.
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-11 9.4 "Under dual control the Console offers PROPOSE ... and APPROVE"
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:178-180) and 9.5 "the commit control is replaced by
  Propose" (192): not true for the SOC tab. The ledger's claim that the tiers are "editable as `soc.*`
  knobs on Configuration, which propose" (IP-CONSOLE-11-settings-LEDGER.md:29) is contradicted by the
  code and the registry (L-11).

### SET-SOC-03 Response tiers (p_low / p_high)
- Location: Settings > SOC > form "Response tiers" > "p_low (milli)", "p_high (milli)" > "Commit tiers"
- Configures: the calibrated probability bars for automated response. Hint verbatim: "The calibrated
  probability bars (milli, 0 to 1000). Below p_low a firing is noise; at or above p_high the response
  is proposed whole; between, the engine investigates and withholds containment. Ships at 0 / 1000
  until the curve is measured." (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:129-133)
- Binding: NONE registered.
- BFF route: `POST /api/settings/soc` body `{tiers:{pLowMilli, pHighMilli}}` -> `handleSocSettings`
  (forgecentral/apps/bff/src/server.ts:2365-2378) -> `toSocSettingsPatch`
  (forgecentral/packages/contracts/src/soc.ts:1795-1853) -> `resolveSocSettingsCommit`
  (forgecentral/apps/bff/src/engine/soc.ts:430-441).
- Engine op: `SocSettingsCommit` `{request_id, tiers:{p_low_milli, p_high_milli}, operator}`
  (forgecentral/packages/wire/src/payload.ts:809-830).
- Fields:
  - p_low, p_high: HTML number inputs, `min 0`, `max 1000`, no `step` (so browser constraint validation
    on submit enforces 0..1000 integers) (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:134-157).
  - SPA check: `Number.isInteger(Number(value))` for both (96). An EMPTY field passes it (`Number('')`
    is 0) but is then sent as `parseInt('')` = NaN, which JSON-encodes to null; the BFF refuses it (400)
    and the tab shows "The commit could not be sent" (derived from 92-94, 96 and
    forgecentral/packages/contracts/src/soc.ts:1809-1820; untested).
  - BFF: both integers in 0..65535; no ordering check (forgecentral/packages/contracts/src/soc.ts:1807-1821);
    a patch with neither tiers nor SIEM is 400 (forgecentral/apps/bff/src/server.ts:2373-2376).
  - Engine bound (as the registry states it): "0 <= p_low <= p_high <= 1000 else SocTiersInvalid"
    (crucible/crates/cdb-admin/src/config_registry.rs:816). Default "p_low=0, p_high=1000 (milli): the
    fail-closed extreme, nothing is noise and nothing licenses containment" (815).
- Applies: confirm text says "The change applies live." Registry: live, "the detect pass reads the
  committed pair each cycle (no cache) when it proposes a response"
  (crucible/crates/cdb-admin/src/config_registry.rs:817-819). Visible as `plan_withheld` audit acts
  (SOC-09).
- Gating: confirm "Commit these SOC settings?" / "The engine validates the candidate and commits it to
  the governed configuration under your principal. The change applies live." / "Commit", tone critical
  (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:269-284). Settings tier (SET-00).
- Preconditions and disabled states: disabled under dual control (SET-SOC-02) or while `tiersValid` is
  false (158). The drafts reset to the committed values on every re-read (85-89).
- Failure states: receipt (50-76): "Committed" + "Committed at version N"; "Refused" + "Refused:
  tenant-config is under dual control. Propose and approve on the admin plane." / "Refused:
  <explanation>" / "Refused by the engine", each followed by the engine's violations verbatim. Transport
  or HTTP error: "The commit could not be sent" + Retry (reset only) (252-255). BFF 400 malformed, 403
  engine refusal, 503 unavailable, 502 other (forgecentral/apps/bff/src/server.ts:2365-2388).
- Evidence: as cited.
- TRD drift: 9.2 SOC row LIVE (matches). 9.4 "labelled with its source and ... its version": the tier
  inputs carry no source/version label of their own.

### SET-SOC-04 SIEM enrichment write-back
- Location: Settings > SOC > form "SIEM write-back" (heading "SIEM enrichment write-back") > "Enabled",
  "Vendor", "Host", "Stream", "Case URL base", "Ceiling" > "Commit write-back"
- Configures: whether the incident enrichment row is written to a SIEM, where, the Console case URL it
  links back to, and the classification ceiling. Hint verbatim: "Whether the incident enrichment row is
  written, to which vendor and stream, the Console case URL base the row links back to, and the
  classification ceiling an incident may not exceed. The credential reference stays in the node's boot
  configuration." (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:172-175)
- Binding: NONE registered.
- BFF route: `POST /api/settings/soc` body `{siemWriteback:{enabled, vendor, host, stream, caseUrlBase,
  ceiling}}` (the whole object every time) -> as SET-SOC-03.
- Engine op: `SocSettingsCommit` `{request_id, siem_writeback:{enabled, vendor, host, stream,
  case_url_base, ceiling}, operator}` (forgecentral/packages/wire/src/payload.ts:817-827).
- Fields:
  - Enabled: checkbox (boolean).
  - Vendor: select `splunk` | `sentinel` | `qradar` | `elastic` | `chronicle`
    (forgecentral/packages/contracts/src/soc.ts:1638).
  - Host, Stream, Case URL base: free text; no SPA validation; the BFF only checks they are strings
    (empty allowed) (forgecentral/packages/contracts/src/soc.ts:1823-1851).
  - Ceiling: select `unclassified` | `internal` | `confidential` | `restricted` | `secret`
    (forgecentral/packages/contracts/src/soc.ts:1642-1648).
  - Engine bound (registry text): "enabled requires a host, a stream in the vendor's shape
    (sentinel/chronicle: two-part `a/b`) and an https:// case_url_base, else SiemWritebackIncomplete"
    (crucible/crates/cdb-admin/src/config_registry.rs:830). Default "disabled; vendor=splunk,
    host/stream/case_url_base empty, ceiling=Unclassified (fail closed)" (829). The SIEM credential
    reference is boot configuration and has no field here.
- Applies: live: "the write-back worker re-reads the committed section per job (C.8b); the credential
  reference in the boot stanza is boot-bound" (crucible/crates/cdb-admin/src/config_registry.rs:831-833).
  Visible as `siem_enriched` audit acts (SOC-09).
- Gating: same confirm as SET-SOC-03 (one dialog for both forms).
- Preconditions and disabled states: disabled only under dual control (247); no validity gate.
- Failure states: as SET-SOC-03.
- Evidence: forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:163-250.
- TRD drift: matches the 9.2 SOC row.

### SET-SOC-05 "What these settings are"
- Location: Settings > SOC > section "Setting definitions", heading "What these settings are"
- Configures: nothing; one line per registry row bound to `console:settings/soc/*`: "`<key>` --
  <summary> Bound: <bound>. Applies: <live_apply>." (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:258-267).
  The engine selects rows by the prefix `console:settings/soc/`
  (crucible/crates/cdb-server/src/handler.rs:4116), i.e. `soc.tiers` and `siem_writeback`
  (crucible/crates/cdb-admin/src/config_registry.rs:821, 835).
- Binding: NONE registered. BFF route / Engine op: the tab read.
- Fields / Applies / Gating / Preconditions: n/a.
- Failure states: tab read states.
- Evidence: as cited. TRD drift: none found.

## Tab 2 -- Configuration

All Configuration items read `GET /api/settings` -> `handleGovernedSettings`
(forgecentral/apps/bff/src/server.ts:2000-2053) -> `resolveSettings`
(forgecentral/apps/bff/src/engine/settings.ts:48-65); engine op `SettingsRead`
`{request_id, surface?, operator}` (forgecentral/packages/wire/src/payload.ts:707-712). The SPA never
sends `surface` (forgecentral/apps/console/src/surfaces/useSettings.ts:81-90); the BFF would require
`^[a-z_]{1,64}$` (forgecentral/apps/bff/src/server.ts:2026-2031). Read states
(forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:459-481): loading "Reading the committed
configuration"; error "The configuration could not be read" + Retry; 403 "Admin or SecurityAudit tier
required" / "The engine serves the governed configuration to Admin and SecurityAudit operators only.". A
row whose origin this build does not know nulls the WHOLE view -> 503 -> the error state
(forgecentral/packages/contracts/src/settings.ts:193-196, 259-270;
forgecentral/apps/bff/src/engine/settings.ts:57-63); the engine emits origin `unknown` for a future
origin (crucible/crates/cdb-server/src/handler.rs:4172-4175).

### SET-CFG-01 Version line, surface picker and the settings table (source and apply labels)
- Location: Settings > Configuration (panel "Configuration") > version line; "Surface" select; table
  captioned "The <surface> settings as the engine renders them" with columns "Setting", "Value",
  "Source", "Applies", "Change", "Definition"
- Configures: nothing (display and navigation).
- Binding: NONE registered.
- BFF route / Engine op: as the tab header.
- Fields and labels:
  - Version line: version 0 -> "Nothing is committed: every value is the fail-closed default."; else
    "Committed configuration at version N."; under dual control add " Tenant-config is under dual
    control: every change here is a proposal a different Admin approves on the Changes tab."
    (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:358-365). Engine: the version is the
    store's latest version at read time, and at version 0 the engine renders the Federal-profile
    document (crucible/crates/cdb-server/src/handler.rs:4261-4266).
  - Surface: the engine's surface list (sorted alphabetically engine-side,
    crucible/crates/cdb-server/src/handler.rs:4250-4255), filtered to surfaces that have rows
    (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:304); initial selection = the first
    (`admin_endpoint`). 24 surfaces carry rows (Appendix A).
  - Value: the engine's own rendering, or "not in the committed document" (null) (385-393).
  - Source (forgecentral/packages/contracts/src/settings.ts:286-298): knob or section -> "committed at
    version N" (version 0: "fail-closed default (nothing committed)"); env -> "node environment at
    boot"; const -> "compile-time constant".
  - Applies (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:290-301, from
    forgecentral/packages/contracts/src/settings.ts:305-316): "live" / "boot-bound: changes need a
    restart" / "pending: no live consumer yet" / "fixed at boot" (env and const). Derived from the
    registry's `live_apply` text prefix.
  - Change: "read-only" unless the row is key-editable (SET-CFG-02). Editable SECTION rows (for
    example `egress.destinations`) also read "read-only" here, because they are edited by the section
    forms below the table.
  - Definition: "<summary> Bound: <bound>." (398-401), the registry's words (Appendix A).
- Applies / Gating: n/a (read); SET-00 gating.
- Preconditions and disabled states: n/a.
- Failure states: tab read states.
- Evidence: forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:303-457.
- TRD drift: TRD-CONSOLE-11 9.2 marks Configuration "PENDING engine, then LIVE"
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:154) -- LIVE. Plan ST.1 route `GET
  /api/settings/:surface` (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings.md:63) -- code
  uses `GET /api/settings?surface=`.

### SET-CFG-02 Knob edit: Edit / Stage / Commit or Propose N changes / Discard staged
- Location: Settings > Configuration > (Surface) > row > "Edit" (aria "Edit <key>") -> text input
  (aria "New value for <key>") + "Stage" / "Cancel"; a staged row's button reads "Staged: <value>"; the
  staged bar "N staged change(s); the engine applies them together or not at all." + "Commit N
  change(s)" (or "Propose N change(s)") + "Discard staged"
- Configures: an atomic batch of scalar knob values. Which rows get "Edit": engine `editable` AND
  origin `knob` AND value type not `CapabilitySet` (forgecentral/packages/contracts/src/settings.ts:693-696);
  the engine marks a row editable when it applies live and is a knob or a patchable section
  (crucible/crates/cdb-server/src/handler.rs:4177-4186). From the registry that is 19 knobs:
  `sessions.standard_lifetime_secs`, `sessions.break_glass_lifetime_secs`, `maintenance.cadence_secs`,
  `maintenance.artifact_spot_check_limit`, `retention.time_travel_window_secs`,
  `retention.log_observation_window_secs`, `leases.cursor_secs`, `leases.session_secs`,
  `leases.prepared_secs`, `workspace_quota.per_principal`, `workspace_quota.per_tenant`,
  `query_surface.enabled`, `query_surface.per_tenant_result_limit`, `query_surface.result_chunk_rows`,
  `query_surface.max_cursors_per_tenant`, `query_surface.max_retained_tail_bytes`,
  `detection_posture.wake_specificity_floor_milli`, `observability.otlp_ingest_bytes_per_window`,
  `cognition.max_connections` (defaults and bounds in Appendix A).
- Binding: NONE registered.
- BFF route: direct commit `POST /api/settings` body `{edits:[{key, value}]}` -> `commitGovernedSettings`
  (forgecentral/apps/bff/src/server.ts:2060-2095) -> `resolveSettingsCommit`
  (forgecentral/apps/bff/src/engine/settings.ts:72-83); under dual control `POST /api/settings/propose`
  (same body) -> `handleSettingsGovernance` (forgecentral/apps/bff/src/server.ts:2275-2281) ->
  `resolveSettingsPropose` (forgecentral/apps/bff/src/engine/settings.ts:103-114). The SPA picks by
  `dualControlRequired` (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:309-311;
  forgecentral/apps/console/src/surfaces/useSettings.ts:230-246).
- Engine op: `SettingsCommit` or `SettingsPropose`, both `{request_id, edits:[{key, value}], sections?,
  operator}` (forgecentral/packages/wire/src/payload.ts:759-799, 1091-1100).
- Fields:
  - value: free text, prefilled with the staged value or the engine's rendering
    (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:349); no SPA validation.
  - Contracts/BFF (forgecentral/packages/contracts/src/settings.ts:430-476): at most 64 edits; key matches
    `^[a-z_][a-z0-9_.]{0,127}$`; value is a string of at most 256 characters; body must hold edits
    and/or sections; body <= 8192 bytes.
  - Engine refusal causes, as the Console words them (forgecentral/packages/contracts/src/settings.ts:363-371,
    672-691): `unknown_key` "not a governed setting"; `not_a_knob` "a section: change it through its
    form"; `boot_bound` "boot-bound: needs a restart, not editable here"; `pending_subsystem` "pending:
    nothing applies it yet"; `unparseable` "not a valid value for this setting"; `kind_mismatch` "the
    wrong kind of value"; `duplicate` "listed twice in one commit"; any other tag "refused (<tag>)".
  - Staging survives switching the Surface picker (state held by the table, 305-308), so one batch
    can span surfaces. No base version travels with the batch (no version field in
    forgecentral/packages/contracts/src/generated/wire-dto.ts:1148-1153): a change another admin committed
    between this read and the commit is not detected by the Console (engine merge semantics UNVERIFIED).
- Applies: commit receipt (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:25-57):
  "Committed" + "Committed at version N." + " Applied live." or " Committed but not applied until a
  restart: <keys>."; refused: "Tenant-config is under dual control: propose and approve instead." or the
  engine's explanation or "Refused by the engine; nothing was committed.", then each refused edit as
  "<key>: <cause> (<detail>)" and each violation. Proposal receipt (60-92): "Proposed" + "Proposal N
  recorded. Nothing is committed until a different Admin approves it on the Changes tab."; refused: the
  explanation or "Refused by the engine; nothing was proposed." plus the same lists. Staged edits are
  cleared only when the receipt is not refused (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:440-448).
- Gating: confirm "Commit these settings?" / "Propose these settings?"; description = "<key>: <old> ->
  <new>; ..." (old from this read, or "(unset)") followed by ". The engine validates the batch and
  commits it under your principal." or ". Tenant-config is under dual control: the engine validates the
  batch and records it as a proposal a different Admin must approve."; button "Commit" / "Propose";
  tone critical (426-453). Settings tier (SET-00).
- Preconditions and disabled states: rows that are not key-editable show "read-only" (316-318).
- Failure states: "The change could not be sent" + Retry (reset only) (421-424); BFF 400
  `malformed_request` before the engine, 403 on an engine refusal, 502 otherwise
  (forgecentral/apps/bff/src/server.ts:2070-2094).
- Evidence: as cited.
- TRD drift: TRD 9.2 "PENDING engine" (D-11). Plan ST.2 route `POST /api/settings/:surface`
  (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings.md:64) -- code `POST /api/settings`.
  TRD 9.5 "a conflicting concurrent commit is surfaced by the version change, never silently
  overwritten" (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:194-196) -- no precondition exists.

### Section forms (SET-CFG-03 .. SET-CFG-08): shared behaviour
- Location: Settings > Configuration > below the table: section "Section settings", one collapsible
  `<details>` per section whose governing registry row the engine marks editable
  (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:104-121, 432-463). Absent entirely
  when the read carries no section values (429-431).
- Commit path: the form posts `{edits: [], sections: <that section only>}` to `/api/settings` (or
  `/api/settings/propose` under dual control) (484); wire `SettingsCommit` / `SettingsPropose` with
  `sections` (forgecentral/packages/wire/src/payload.ts:764-796); the section REPLACES the committed
  section.
- Button text is always "Commit <label>" even under dual control (`Submit`, 125-137); only the confirm
  switches: title "Commit <Title>?" or "Propose <Title>?"; description (commit) "The engine validates
  this section and commits it to the governed configuration under your principal. The change applies
  live." or (propose) "Tenant-config is under dual control. The engine validates this section and records
  it as a proposal under your principal; a different Admin must approve it before it applies."; tone
  critical (469-488).
- Receipts as SET-CFG-02; failure "The change could not be sent" + Retry (reset only) (464-468). Each form
  re-mounts on a new committed version, discarding unsent edits (456-457).
- BFF section narrowing: `toSectionPatch` (forgecentral/packages/contracts/src/settings.ts:500-602),
  lists at most 256 entries (479).
- Binding: NONE registered for any form.

### SET-CFG-03 Section form: Dual control
- Location: Settings > Configuration > Section settings > "Dual control"
- Configures: which admin capabilities require two-person approval (registry row `governance.dual_control`,
  a live knob of type `CapabilitySet`, edited only through this form).
- Binding: NONE. BFF route: as the shared behaviour. Engine op: `SettingsCommit`/`SettingsPropose`
  with `sections.dual_control`.
- Fields: twelve checkboxes, `read-status`, `server-lifecycle`, `storage-manage`, `maintenance-manage`,
  `security-policy-change`, `key-issue`, `identity-manage`, `artifact-approve`, `tenant-config`,
  `config-read`, `audit-read`, `audit-export` (forgecentral/packages/contracts/src/settings.ts:330-343),
  sent as the checked subset in that order (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:150-153).
  BFF: strings <= 256 characters. The engine refuses an unknown name (settings.ts:326-329). Hint: "The
  capabilities whose operations require two people. Adding tenant-config puts these settings themselves
  under dual control: after it, changes are proposed and approved." (155-158). Registry default
  "per-profile (Evaluation empty; Enterprise KeyIssue+SecurityPolicyChange; AirGapped/Federal
  +AuditExport)" (crucible/crates/cdb-admin/src/config_registry.rs:348).
- Applies: live, "commit-path dual-control gate consults the committed set"
  (crucible/crates/cdb-admin/src/config_registry.rs:350). Checking `tenant-config` switches the whole
  Settings surface into propose mode and locks the SOC tab; removing it again is itself a proposal.
- Gating / Preconditions / Failure states: shared behaviour.
- Evidence: forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:139-177.
- TRD drift: none found (9.2 Configuration covers it).

### SET-CFG-04 Section form: Egress destinations
- Location: Settings > Configuration > Section settings > "Egress destinations"
- Configures: the registered cognition egress destinations and each one's classification ceiling
  (row `egress.destinations`). Hint: "The registered cognition egress destinations and the highest
  classification each may carry."
- Binding: NONE. Engine op: `SettingsCommit`/`SettingsPropose` with `sections.egress_destinations
  [{id, ceiling}]`.
- Fields: per row "Destination N id" (text) + "Destination N ceiling" (select over the five
  classification tags) + "Remove"; "Add destination" appends `{id: '', ceiling: 'unclassified'}`. SPA:
  commit disabled while any id is blank (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:187, 238).
  BFF: id non-blank, <= 128 characters; ceiling one of the five tags (forgecentral/packages/contracts/src/settings.ts:518-539).
  Engine bound "unique destination id else DuplicateEgressDestination"; default "empty"
  (crucible/crates/cdb-admin/src/config_registry.rs:632-643). Note: the env row
  `cognition.add_destinations` is "merged into egress.destinations" (crucible/crates/cdb-admin/src/config_registry.rs:949-958).
- Applies / Gating / Failure states: shared behaviour.
- Evidence: forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:179-241.
- TRD drift: TRD 9.2 lists egress destinations under the Security tab (edited via Configuration ops);
  consistent with the code's split.

### SET-CFG-05 Section form: LUG exposure
- Location: Settings > Configuration > Section settings > "LUG exposure"
- Configures: the Local User Graph ingest and identity-resolution posture and its caps (row `lug.exposure`).
- Binding: NONE. Engine op: `SettingsCommit`/`SettingsPropose` with `sections.lug_exposure`.
- Fields: checkboxes "LUG ingest enabled", "Identity resolution enabled"; number inputs (min 0) "Max
  accounts per namespace", "Max groups per namespace", "Max sessions per device", "Last-seen bucket
  (hours)", "Binding confirm threshold (permille)", "Snapshot cadence (hours)"
  (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:243-295). SPA: every number an
  integer >= 0, else commit disabled (260). BFF: integers 0..4294967295; the threshold 0..65535
  (forgecentral/packages/contracts/src/settings.ts:540-571). Engine bound "if enabled, caps and bucket >
  0 else LugExposureUnbounded; threshold <= 1000 permille"; default "disabled"
  (crucible/crates/cdb-admin/src/config_registry.rs:668-681).
- Applies / Gating / Failure states: shared behaviour.
- Evidence: as cited. TRD drift: none found.

### SET-CFG-06 Section form: Disabled decoder families
- Location: Settings > Configuration > Section settings > "Disabled decoder families"
- Configures: which decoder families normalization skips (row `normalization.disabled_decoder_families`).
- Binding: NONE. Engine op: `SettingsCommit`/`SettingsPropose` with `sections.disabled_decoder_families`.
- Fields: textarea, label "One decoder family per line; the engine refuses a family it does not have.";
  lines trimmed, blank lines dropped (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:301-334).
  BFF: <= 256 entries, each <= 256 characters. Engine bound "each is a known SourceFormat family else
  UnknownDecoderFamily"; default "empty (all families enabled)"
  (crucible/crates/cdb-admin/src/config_registry.rs:708-720). The Console lists no valid family names.
- Applies / Gating / Failure states: shared behaviour.
- Evidence: as cited. TRD drift: none found.

### SET-CFG-07 Section form: Source-format overrides
- Location: Settings > Configuration > Section settings > "Source-format overrides"
- Configures: source -> decoder format overrides (row `normalization.source_format_map`).
- Binding: NONE. Engine op: `SettingsCommit`/`SettingsPropose` with `sections.source_format_map
  [{source, format}]`.
- Fields: textarea, label "One source=format per line; the engine refuses a format it does not have."; a
  line splits at its FIRST `=` and is invalid when `=` is first or last; invalid lines show "Every line
  needs a source and a format around one =." and disable commit
  (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:337-377). BFF: <= 256 entries; source
  and format non-blank (forgecentral/packages/contracts/src/settings.ts:577-595). Engine bound "each
  format is a known SourceFormat label else UnknownSourceFormat"; default "{tetragon: tetragon}"
  (crucible/crates/cdb-admin/src/config_registry.rs:722-733).
- Applies / Gating / Failure states: shared behaviour.
- Evidence: as cited. TRD drift: none found.

### SET-CFG-08 Section form: Narrative model
- Location: Settings > Configuration > Section settings > "Narrative model"
- Configures: which registered model writes SOC verdict narratives (row `soc_narrative.model_ref`).
  Label: "The registered model that writes verdict narratives, as id@version; empty unbinds it. The
  engine refuses a model that is not registered."
- Binding: NONE. Engine op: `SettingsCommit`/`SettingsPropose` with `sections.soc_narrative_model_ref`
  (empty string unbinds).
- Fields: text "Narrative model ref", submitted trimmed
  (forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:379-408). BFF: string <= 256
  characters (forgecentral/packages/contracts/src/settings.ts:596-600). Engine bound "must resolve
  against served_models as a TextGeneration model else SocNarrativeModelUnresolvable"; default "unbound
  (the narrative refuses)" (crucible/crates/cdb-admin/src/config_registry.rs:797-810). The model
  registry itself (`served_models.registry`) is a pending section and read-only in the Console
  (crucible/crates/cdb-admin/src/config_registry.rs:760-770), so registering a model is not possible
  from the Console.
- Applies: live, "resolved per narrative request from the committed document"
  (crucible/crates/cdb-admin/src/config_registry.rs:803-805). Visible on SOC Ops (SOC-09), Settings >
  SOC (SET-SOC-01) and Reports (REP-01).
- Gating / Failure states: shared behaviour.
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-11 9.2 places the editable model ref on a "Policy" tab
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:159); code has it here and there is no Policy tab.

## Tab 3 -- RBAC

### SET-RBAC-01 Engine admin assignments
- Location: Settings > RBAC > panel "Engine admin assignments"
- Configures: nothing (read-only by construction: `identity.admins` is boot-bound).
- Binding: NONE registered.
- BFF route: `GET /api/settings` (the governed read, shared with Configuration) ->
  `resolveSettings`; typed `identity_values.admins` (forgecentral/packages/contracts/src/settings.ts:87-130).
- Engine op: `SettingsRead`.
- Fields (display): source line "Source: committed at version N. Read-only here: boot-bound (a change
  needs a restart). Change it with `config-commit / config-apply`, then restart the node."
  (forgecentral/apps/console/src/surfaces/SettingsIdentityTabs.tsx:44-61; the `live_apply` and
  `change_via` texts come from crucible/crates/cdb-admin/src/config_registry.rs:1095, 1102). Table "The
  engine admin assignments": "Identity" (verbatim, never parsed from text), "Roles" (badges: `operator`
  Operator, `securityadmin` Security admin, `tenantadmin` Tenant admin, `auditor` Auditor, `root` Root;
  an unknown role verbatim, forgecentral/packages/contracts/src/settings.ts:101-113), "Clearance"; empty
  "No admin assignments are committed." (SettingsIdentityTabs.tsx:172-185). Registry bound "each admin
  has a non-empty role set else AdminWithoutRole" (crucible/crates/cdb-admin/src/config_registry.rs:620-630).
- Applies: n/a (changing it is `cdb-actl` on the node plus a restart).
- Gating: Settings tier (SET-00).
- Preconditions and disabled states: 403 "Admin or SecurityAudit tier required" / "The engine serves
  the identity configuration to Admin and SecurityAudit operators only."; an engine without typed
  identity values: "The engine did not send its identity values" / "This engine predates the typed
  identity read (crdb SET.1b); nothing is shown in their place." (SettingsIdentityTabs.tsx:64-100).
- Failure states: "The RBAC settings could not be read" + Retry (75-81).
- Evidence: as cited. The tab closes with "Tenant operators and their groups are managed on the Users
  surface." (link to `/users`, 190-192).
- TRD drift: TRD-CONSOLE-11 Section 3 describes RBAC as the engine RBAC with a `settings.setRbac`
  command (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:39, 55); 9.2 corrects it to read-only
  (155) -- matches, except that 9.2 also puts `sso_group_roles` on this tab (see SET-FED-04).

### SET-RBAC-02 Console operator roles
- Location: Settings > RBAC > panel "Console operator roles"
- Configures: nothing; shows the BFF's own role map (installer configuration `FC_RBAC_CONFIG`, read at
  BFF start). Text: "Installer configuration, read at BFF start. It changes with a Console re-install,
  never from here. Default tenant for a global admin: <tenant or 'none configured'>."
  (forgecentral/apps/console/src/surfaces/SettingsIdentityTabs.tsx:142-145).
- Binding: NONE (not an engine read).
- BFF route: `GET /api/settings/console-rbac` -> `handleConsoleRbac`
  (forgecentral/apps/bff/src/server.ts:2102-2121) -> `rbacConfigView`
  (forgecentral/apps/bff/src/auth/rbac.ts:109-119).
- Engine op: none.
- Fields (display): table "Console roles granted by IdP group" ("IdP group", "Console role", "Tenant" --
  "every tenant" when null); table "Console roles granted by subject (used only when the token carries no
  group)" ("OIDC subject", "Console role", "Tenant"); empty "None configured."
  (SettingsIdentityTabs.tsx:102-116, 146-151). Roles: `global-admin`, `tenant-admin`, `tenant-user`
  (forgecentral/packages/contracts/src/settings.ts:133). Resolution rule the map feeds: IdP groups win,
  the subject map is used only when the token has no group, highest role wins, a global admin acts in the
  default tenant (forgecentral/apps/bff/src/auth/rbac.ts:45-82).
- Applies: only on a Console re-install / BFF restart.
- Gating: BFF 401 without a session; 403 `{class:"Role"}` unless the session role is `global-admin`
  (forgecentral/apps/bff/src/server.ts:2110-2118).
- Preconditions and disabled states: non-global-admin: "Global admin required" / "The Console role map
  names every tenant it grants, so only a global admin sees it." (SettingsIdentityTabs.tsx:131-137).
- Failure states: an unrecognized body shape is an error, "The Console role map could not be read" +
  Retry (forgecentral/apps/console/src/surfaces/useSettings.ts:137-150; SettingsIdentityTabs.tsx:124-130).
- Evidence: as cited.
- TRD drift: matches 9.2 ("shown read-only with their source").

## Tab 4 -- Federation

The tab mounts the same `IdamConnectorsPanel` as Users > External IDAM (one component, one fetch path)
under panel "Identity providers", plus the SSO map (forgecentral/apps/console/src/surfaces/SettingsIdentityTabs.tsx:198-225).
The file header calls both identity tabs "READ-ONLY" (SettingsIdentityTabs.tsx:4-6); the connector panel
is not read-only.

### SET-FED-01 Onboard Auth0 / Configure (connector connectivity, secret and cadences)
- Location: Settings > Federation > "Identity providers" > "External Identity & Access Management":
  with no connector, empty state "No IdAM connector configured" / "No external identity connector is
  configured on this node yet." + "Onboard Auth0"; with a connector, its card > "Configure". Both open the
  form "Configure <provider>": "Provider Domain", "Client ID", "Audience", "Client Secret", "Delta poll
  interval (seconds)", "Full directory sync (hours)", "Save connector" / "Cancel"
  (forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:88-216, 243-256, 305-313).
- Configures: writes the connector's client secret to the node's protected store, sets its connectivity
  (the engine re-spawns the connector fail-closed), then enables it with the two sync cadences.
- Binding: `idam.connect` (LIVE, forgecentral/packages/bindings/src/manifest.ts:526-538) and
  `idam.configure` (LIVE, 515-525), both audited, authz `operator:users.manage`. The secret write has no
  binding (it goes to the crypto sidecar, not the engine).
- BFF route: three sequential calls (forgecentral/apps/console/src/surfaces/useIdam.ts:108-152):
  1. `POST /api/idam/secret` `{provider, secret}` -> `handleIdamSecret`
     (forgecentral/apps/bff/src/server.ts:2392-2444) -> sidecar `setConnectorSecret` on `FC_IDAM_SECRET_PORT`
     (forgecentral/apps/bff/src/config.ts:211);
  2. `POST /api/idam/connect` `{provider, domain, clientId, audience}` -> `handleIdamConnect`
     (forgecentral/apps/bff/src/server.ts:2446-2509) -> `resolveIdamConnect` with the secret reference
     `/etc/cdb/secrets/auth0-management.secret` (forgecentral/apps/bff/src/server.ts:1921-1926;
     forgecentral/apps/bff/src/engine/idam.ts:80-94);
  3. `POST /api/idam/configure` `{provider, enabled: true, pollIntervalSecs, fullSyncCadenceHours}` ->
     `handleIdamConfigure` (forgecentral/apps/bff/src/server.ts:1928-1986) -> `resolveIdamConfigure`
     (forgecentral/apps/bff/src/engine/idam.ts:102-114).
- Engine op: step 1 none (sidecar); step 2 `IdamConnect`; step 3 `IdamConfigure`
  (forgecentral/apps/bff/src/engine/wire-client.ts:774, 785; forgecentral/packages/wire/src/payload.ts:237-265).
- Fields:
  - Provider: fixed -- `auth0` when onboarding, the card's `connectorId` when configuring (251, 309).
  - Provider Domain: required text, placeholder "dev-xxxx.us.auth0.com", prefilled with the card's
    tenant (130-139). BFF: non-blank after trim (2482-2485).
  - Client ID: required text, NOT prefilled (140-148). BFF: non-blank.
  - Audience: optional, placeholder "(defaults to the Management API)" (149-157); empty allowed, the
    engine derives the conventional audience (forgecentral/apps/bff/src/server.ts:2480-2481).
  - Client Secret: password, required, write-only, never shown back (158-168). BFF: non-empty.
  - Delta poll interval (seconds): number, min 60, max 86400, form default 300 (169-179).
  - Full directory sync (hours): number, min 1, max 168, form default 24 (180-190).
  - BFF (configure): enabled boolean, both cadences integers (forgecentral/apps/bff/src/server.ts:1952-1966);
    the engine enforces the ranges (`IdamCadenceOutOfRange`, crucible/crates/cdb-admin/src/config_registry.rs:686;
    bounds mirrored at forgecentral/apps/console/src/surfaces/useIdam.ts:84-88).
  - Save is disabled until domain, client id and secret are non-empty (200-202).
- Behaviour notes: "Configure" re-runs the whole onboarding: it does not prefill Client ID, Audience or
  the cadences (the cadences reset to 300 s / 24 h unless changed) and it requires the secret again
  (97-103). It always sends `enabled: true` (useIdam.ts:139-144): no Console control can disable a
  connector. The secret reference is the Auth0 path for any provider (server.ts:1921-1926). The three
  calls are not atomic: a failure in step 2 or 3 leaves the new secret already written.
- Applies: connectivity is applied live via a fail-closed re-spawn; cadences without restart (manifest
  comments, forgecentral/packages/bindings/src/manifest.ts:516-534). On success the connector list
  re-reads and the form closes (useIdam.ts:150; IdamConnectorsPanel.tsx:117).
- Gating: NO confirm dialog. The IdAM ops use the plain delegation (no `settings_tier`), so they are
  governed by the operator's normal tier, not the Settings tier (forgecentral/apps/bff/src/engine/operator-engine.ts:739-748);
  no BFF role check.
- Preconditions and disabled states: the secret route answers 503 `secret_plane_unprovisioned` when the
  sidecar secret port is not configured (forgecentral/apps/bff/src/server.ts:2405-2409).
- Failure states: SPA (IdamConnectorsPanel.tsx:71-80): 409 "The engine rejected the connectivity or the
  secret."; 403 "You do not have permission to configure connectors."; 503 "The secret store is not
  available on this node." (also shown for a 503 `engine_unavailable` from steps 2 or 3); any other
  status (for example 400 for an out-of-range cadence) "The connector could not be configured."; network
  failure "The request could not reach the server." BFF: secret 400 / 409 refused / 503; connect and
  configure 409 Conflict / 400 Framing / 403 / 502 (server.ts:1974-1983, 2434-2441, 2497-2506).
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-11 9.2 Federation "LIVE for connectors" (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:156)
  -- matches. TRD Section 4 names `settings.configureFederation` / `settings.syncFederation` bindings
  (54-55) -- the code uses `idam.*` bindings. The panel's own comment "Configure (ID.4) stays a labelled
  non-live control" (IdamConnectorsPanel.tsx:62-69) is stale.

### SET-FED-02 Sync Now
- Location: Settings > Federation > connector card > "Sync Now" (reads "Syncing..." while running)
- Configures: queues an audited directory sync against the provider (an ACK, not a result).
- Binding: `idam.sync`, command, LIVE, audited (forgecentral/packages/bindings/src/manifest.ts:539-549).
- BFF route: `POST /api/idam/sync` `{provider}` -> `handleIdamCommand`
  (forgecentral/apps/bff/src/server.ts:2511-2557) -> `resolveIdamSync`
  (forgecentral/apps/bff/src/engine/idam.ts:62-71).
- Engine op: `IdamSync` `{request_id, provider, operator}` (forgecentral/apps/bff/src/engine/wire-client.ts:763).
- Fields: provider = the card's connector id.
- Applies: the list polls every 3 s while any connector reports `running`
  (forgecentral/apps/console/src/surfaces/useIdam.ts:35-41).
- Gating: confirm "Run a federation sync for <connectorId>?" / "This runs a real audited directory sync
  against the provider." / "Sync" (default tone) (forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:320-332).
  Plain delegation (as SET-FED-01).
- Preconditions and disabled states: disabled while the card is running or this sync is in flight (261-263, 300).
- Failure states: (IdamConnectorsPanel.tsx:52-60) 409 "The connector is disabled or not configured."; 403
  "You do not have permission to run a sync."; other statuses "The engine refused the sync."; network
  "The sync could not reach the engine."
- Evidence: as cited. TRD drift: as SET-FED-01.

### SET-FED-03 Connector cards
- Location: Settings > Federation > one card per connector
- Configures: nothing; shows the connector's name, state badge ("Connected", "Syncing", "Never synced",
  "Disabled", "Partial sync", "Unknown", "Error"), provider tenant or "No tenant configured", "Last sync"
  (UTC or "Never"), "Objects synced", "Poll interval" ("<n>s"), and the last error
  (forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:24-49, 259-290). The full-sync cadence
  is not displayed.
- Binding: `idam.connectors`, read, LIVE (forgecentral/packages/bindings/src/manifest.ts:444-453).
- BFF route: `GET /api/idam/connectors` -> `handleIdam` (forgecentral/apps/bff/src/server.ts:2559-2589).
- Engine op: `IdamConnectors` (forgecentral/apps/bff/src/engine/wire-client.ts:753).
- Fields / Applies: n/a. Gating: session; plain delegation.
- Failure states: "Could not load identity connectors." + Retry (238-242).
- Evidence: as cited. TRD drift: none found.

### SET-FED-04 SSO group to admin role map
- Location: Settings > Federation > panel "SSO group to admin role map"
- Configures: nothing (boot-bound, read-only).
- Binding: NONE registered.
- BFF route / Engine op: `GET /api/settings` / `SettingsRead`, typed `identity_values.sso_group_roles`.
- Fields (display): source line as SET-RBAC-01 for `identity.sso_group_roles`; table "The SSO group to
  admin role map": "SSO group", "Admin roles" (role badges); empty "No SSO groups are mapped."
  (forgecentral/apps/console/src/surfaces/SettingsIdentityTabs.tsx:204-221). Registry bound "each group
  maps to a non-empty role set else SsoGroupWithoutRole" (crucible/crates/cdb-admin/src/config_registry.rs:608-618).
- Applies: `cdb-actl` plus restart.
- Gating / Preconditions / Failure states: as SET-RBAC-01 (label "Federation").
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-11 9.2 lists the SSO map under RBAC AND Federation
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:155-156); code shows it only on Federation.

## Tab 5 -- Changes

### SET-CHG-01 Pending approvals + Approve
- Location: Settings > Changes > panel "Pending approvals" > table "Configuration proposals awaiting a
  second Admin" ("Proposal", "Proposed by", "When (UTC)", "Changes", "Approve") > "Approve <id>"
- Configures: approves a pending configuration proposal as a second Admin; the engine then commits it
  under both principals. Lists proposals made in the Console OR on the engine's admin plane (one store)
  (forgecentral/apps/console/src/surfaces/SettingsChangesTab.tsx:4-7).
- Binding: NONE registered.
- BFF route: `GET /api/settings/approvals` -> `resolveSettingsApprovals`; `POST
  /api/settings/approvals/<id>/approve` (id `[0-9]{1,15}`, positive safe integer) ->
  `resolveSettingsApprove` (forgecentral/apps/bff/src/server.ts:2227-2295;
  forgecentral/apps/bff/src/engine/settings.ts:117-137).
- Engine op: `SettingsApprovals` `{request_id, operator}`; `SettingsApprove` `{request_id, proposal,
  operator}` (forgecentral/packages/wire/src/payload.ts:724-739).
- Fields: none (the proposal id from the row). "Changes" lists changed registry keys only (or "no
  registry value changed"), not values (35-48).
- Applies: receipt (51-68): a refused approval shows "Refused" + one of "You proposed this change; a
  different Admin must approve it." / "That proposal no longer exists (it was approved, discarded, or the
  node restarted)." / "The configuration changed after this was proposed, so approving it would undo
  that change. The proposal was discarded; propose again." / "The engine refused the approval."
  (forgecentral/packages/contracts/src/settings.ts:397-412); otherwise the commit receipt (SET-CFG-02).
- Gating: confirm "Approve proposal <id>?" / "Proposed by <proposer>; it changes <keys, or 'no registry
  value'>. The engine commits it under both principals. You cannot approve your own proposal." /
  "Approve", tone critical (127-144). No client-side self-approval check; the engine refuses.
- Preconditions and disabled states: a stale proposal shows the badge "Stale: the configuration changed
  since" instead of a button (104-110). There is no Reject / Withdraw control.
- Failure states: 403 "Admin or SecurityAudit tier required" / "The engine serves pending approvals to
  Admin and SecurityAudit operators only."; read error "The pending approvals could not be read" +
  Retry; send error "The approval could not be sent" + Retry (reset only) (75-126).
- Evidence: as cited.
- TRD drift: 9.2 puts propose / approve inside the Configuration tab
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:154); the code has a separate Changes tab that
  neither Section 3 nor 9.2 lists.

### SET-CHG-02 Configuration history
- Location: Settings > Changes > panel "Configuration history" > table "Committed configuration
  versions, newest first" ("Version", "Committed by", "When (UTC)", "Changes", "Rollback")
- Configures: nothing (read-only).
- Binding: NONE registered.
- BFF route: `GET /api/settings/history?limit=50` -> `resolveSettingsHistory`
  (forgecentral/apps/bff/src/server.ts:2296-2309; forgecentral/apps/bff/src/engine/settings.ts:140-149).
  The SPA hard-codes `limit=50` (forgecentral/apps/console/src/surfaces/useSettings.ts:278); the BFF
  accepts 1..100 (absent = engine default) (forgecentral/packages/contracts/src/settings.ts:949-965).
- Engine op: `SettingsHistory` `{request_id, limit, operator}` (forgecentral/packages/wire/src/payload.ts:741-749).
- Fields (display): committer or "not recorded"; time or "not recorded"; changed KEYS only (no values, no
  diff); the newest row reads "current"; "Older versions exist beyond this page or were reclaimed by the
  retention window." when incomplete; empty "No configuration has been committed."
  (forgecentral/apps/console/src/surfaces/SettingsChangesTab.tsx:149-209). No paging control.
- Applies / Gating: Settings tier.
- Failure states: 403 "Admin or SecurityAudit tier required" / "The engine serves the configuration
  history to Admin and SecurityAudit operators only."; error "The configuration history could not be
  read" + Retry.
- Evidence: as cited.
- TRD drift: TRD-CONSOLE-11 9.1 / 9.2 promise "diff and rollback by version" (121, 154): there is no
  diff view.

### SET-CHG-03 Roll back to version N
- Location: Settings > Changes > Configuration history > row > "Roll back to <N>"
- Configures: restores that version's WHOLE configuration through the governed commit (validated,
  applied live, recorded as a rollback); under dual control it becomes a proposal.
- Binding: NONE registered.
- BFF route: `POST /api/settings/rollback` `{to}` (positive integer, else 400) ->
  `resolveSettingsRollback` (forgecentral/apps/bff/src/server.ts:2310-2320;
  forgecentral/apps/bff/src/engine/settings.ts:155-164).
- Engine op: `SettingsRollback` `{request_id, to, operator}` (forgecentral/packages/wire/src/payload.ts:751-756).
- Fields: the version from the row.
- Applies: receipt (SettingsChangesTab.tsx:51-68): under dual control "Proposed" + "Tenant-config is
  under dual control: the rollback is proposal <id>, and a different Admin must approve it."; otherwise
  the commit receipt (which lists any keys that need a restart). How a rollback treats boot-bound or
  pending sections: UNVERIFIED (engine side).
- Gating: confirm "Roll back to version <N>?" / "The engine restores that version's whole configuration
  through its governed commit: it is validated and applied live, and recorded as a rollback under your
  principal. Under dual control it becomes a proposal a different Admin approves." / "Roll back", tone
  critical (218-229).
- Preconditions and disabled states: no button on the newest history row ("current") -- that row is the
  head of the history read, not the configuration read's version (171, 189-190).
- Failure states: "The rollback could not be sent" + Retry (reset only) (213-217).
- Evidence: as cited.
- TRD drift: see SET-CHG-01 (tab placement).

## Tab 6 -- Security

Report tabs (Security, KeyLock, Observability, HA & Topology, FIPS Mode) read `GET
/api/settings/reports?names=<list>` -> `handleSettingsReports` (forgecentral/apps/bff/src/server.ts:2128-2176;
names must be known, non-empty, de-duplicated, else 400: forgecentral/packages/contracts/src/settings.ts:698-776)
-> `resolveSettingsReports` (forgecentral/apps/bff/src/engine/settings.ts:89-97); engine op
`SettingsReports` `{request_id, reports:[...], operator}` (forgecentral/packages/wire/src/payload.ts:714-722).
Shared states (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:57-93): loading "Reading the
admin plane reports"; error "The admin plane reports could not be read" + Retry; 403 "Admin or
SecurityAudit tier required" / "The engine serves its admin plane reports to Admin and SecurityAudit
operators only."; no admin endpoint "This node runs no admin endpoint" / "The reports come from the
engine's admin plane, which is not enabled on this node; nothing is shown in their place." Every report
tab is read-only; none has a binding.

### SET-SEC-01 Admin endpoint (connectivity report)
- Location: Settings > Security > table "Admin endpoint (the engine connectivity report)"
- Configures: nothing. Facts: "Listen address", "Mutual TLS required" (Yes/No), "Admin identities
  bound", "Post-quantum hybrid key exchange" ("Offered"/"Not offered")
  (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:154-167).
- Binding: NONE. BFF route: `...?names=connectivity,security,egress` (151). Engine op: `SettingsReports`.
- Fields / Applies: n/a. Gating: Settings tier. Failure states: shared.
- Evidence: as cited.
- TRD drift: 9.2 Security "reports over the wire (PENDING engine) ... PENDING, then LIVE"
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:157) -- LIVE. 9.2 also lists "the admin endpoint
  knobs" on this tab; they appear only on Configuration > admin_endpoint (boot-bound, read-only).

### SET-SEC-02 Server security (security report)
- Location: Settings > Security > table "Server security (the engine security report)"
- Configures: nothing. Facts: "Operating classification", "Audit chain" (badge "Verified" or "Failed
  verification"), "Audit entries", "Audit head version", "Artifacts spot-checked", "Spot-check
  failures", "Template-era artifacts" (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:168-188).
  Per the SPA's own comment, the security report verifies the audit chain when read
  (forgecentral/apps/console/src/surfaces/useSettings.ts:179), so opening this tab triggers a chain
  verification (cost UNVERIFIED).
- Binding: NONE. BFF / Engine op: as SET-SEC-01.
- Fields / Applies: n/a. Gating: Settings tier. Failure states: shared.
- Evidence: as cited.
- TRD drift: 9.2 lists "retention" in the security report (157); no retention fact exists in the
  contract (forgecentral/packages/contracts/src/settings.ts:733-741).

### SET-SEC-03 Registered egress destinations (egress report)
- Location: Settings > Security > table "Registered egress destinations (the engine egress report)"
  ("Destination", "Classification ceiling"; empty "No egress destination is registered.")
- Configures: nothing. Hint below it: "Egress destinations and the key-issuing section are edited on
  the Configuration tab." (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:189-203) -- only
  half true: egress destinations are (SET-CFG-04), but `key_issuing.exposure` is a pending section
  (crucible/crates/cdb-admin/src/config_registry.rs:696-707), not engine-editable, with no Console form.
- Binding: NONE. BFF / Engine op: as SET-SEC-01.
- Gating: Settings tier. Failure states: shared.
- Evidence: as cited. TRD drift: none beyond the hint.

### SET-SEC-04 This browser session key exchange
- Location: Settings > Security > table "This browser session (the Console sidecar's admin TLS
  terminator)" > "Key exchange negotiated"
- Configures: nothing; reports the key-exchange group the admin TLS terminator negotiated for this
  browser's connection.
- Binding: NONE.
- BFF route: `GET /api/settings/security-session` -> `handleSecuritySession`
  (forgecentral/apps/bff/src/server.ts:2183-2225): the BFF asks the sidecar's session lookup
  (`FC_SIDECAR_SESSION_PORT`, forgecentral/apps/bff/src/config.ts:212) by the request's loopback source port.
- Engine op: none (sidecar lookup, forgecentral/apps/bff/src/engine/session-client.ts).
- Fields (display): badge "Hybrid post-quantum (X25519MLKEM768)" (good) / "Classical P-384 floor (CNSA
  1.0)" (caution) / "Other (<group>)" (forgecentral/packages/contracts/src/settings.ts:860-870;
  forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:130-144).
- Applies: n/a.
- Gating: session only (no tier; not a Settings engine op).
- Preconditions and disabled states: lookup not provisioned -> "Not available" + "The key exchange
  negotiated for this browser session is not shown on this install. The engine has no verb or read for
  it yet: the Console sidecar's session lookup is not provisioned (re-run the Console installer)."
  (114-121; the shared `Pending` wording "The engine has no verb or read for it yet" is inaccurate here --
  this is a Console install gap); request not through the terminator -> "This request did not arrive
  through the admin TLS terminator, so there is no admin-plane session to describe." (122-129).
- Failure states: lookup failure 503 -> "This session's key exchange could not be read" + Retry
  (105-112; server.ts:2217-2223).
- Evidence: as cited.
- TRD drift: 9.2 Security "the sidecar must surface the negotiated group to the BFF (PENDING Console)"
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:157) -- done, via a lookup rather than the header
  the plan specified (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings.md:67 says `GET
  /api/settings/security` and a header; code is `GET /api/settings/security-session` and a port lookup).

## Tab 7 -- KeyLock

### SET-KEY-01 Agent key issuing (key-issuing report)
- Location: Settings > KeyLock > table "Agent key issuing (the engine key-issuing report)"
- Configures: nothing. Facts: "Key issuing enabled" (Yes/No), "Dual control for enroll, issue, rotate
  and revoke" (Yes/No), "Issued-key validity" ("N d" / "N h" / "N s")
  (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:212-240).
- Binding: NONE. BFF route: `...?names=key_issuing` (222). Engine op: `SettingsReports`.
- Gating: Settings tier. Failure states: shared.
- Evidence: as cited.
- TRD drift: 9.2 KeyLock "the key-issuing report and section" (158): the section
  (`key_issuing.exposure`) is not shown on this tab (it appears only as a pending row on
  Configuration > key_issuing).

### SET-KEY-02 Signing-key rotation (PENDING)
- Location: Settings > KeyLock > "Not available" note
- Configures: nothing; states the absence verbatim: "Signing-key rotation and the signing key ids the
  audit chain names are not shown, and there is no Rotate control. The engine has no verb or read for
  it yet: TRD-04 signing-key rotation as an admin verb (crdb IP-CONSOLE-SETTINGS-WIRE SET.6c)."
  (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:241-244)
- Binding: NONE (TRD Section 4's `settings.rotateKey` does not exist). Gating task: crdb SET.6c;
  Console ST.11 BLOCKED (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings-LEDGER.md:32).
- BFF route / Engine op: none.
- Evidence: as cited.
- TRD drift: TRD Section 3 KeyLock "rotation status/history" (42) and 9.2 "the signing key ids the
  audit chain names" read-only (158): neither is shown.

## Tab 8 -- Observability

### SET-OBS-01 Telemetry ingest (telemetry report)
- Location: Settings > Observability > table "Telemetry ingest (the engine telemetry report)"
- Configures: nothing. Facts: "OTLP receiver running", "gRPC address", "HTTP address", "Ingest queue
  capacity", "Tenants bound" (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:275-295).
- Binding: NONE. BFF route: `...?names=telemetry`. Engine op: `SettingsReports`.
- Gating: Settings tier. Failure states: shared.
- Evidence: as cited.
- TRD drift: 9.2 Observability "OTLP / flow planes, bound tenants, datagram counts" (160): no flow
  plane or datagram facts exist.

### SET-OBS-02 Observability settings mirror
- Location: Settings > Observability > table "Observability settings (committed configuration; edit on
  the Configuration tab)" ("Setting", "Value", "Applies")
- Configures: nothing here; mirrors the governed rows whose surface is `observability`
  (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:253-272): `observability.telemetry_enabled`
  (env, fixed) and `observability.otlp_ingest_bytes_per_window` (live knob, editable on Configuration >
  observability, SET-CFG-02) (crucible/crates/cdb-admin/src/config_registry.rs:889-911).
- Binding: NONE. BFF route: `GET /api/settings`. Engine op: `SettingsRead`.
- Fields (display): the "Applies" column shows the raw class word (`live`, `boot-bound`, `pending`,
  `fixed`), not the Configuration tab's phrasing (265). Value or "not in the committed document".
- Gating: Settings tier. Preconditions: renders nothing while loading, on error, or when refused (255-257).
- Evidence: as cited. TRD drift: matches 9.2 ("the two observability knobs").

### SET-OBS-03 Telemetry exporter configuration (PENDING)
- Location: Settings > Observability > "Not available" note
- Configures: nothing; "The telemetry exporter configuration is set at boot and is not shown or editable
  here. The engine has no verb or read for it yet: a runtime exporter configuration (crdb
  IP-CONSOLE-SETTINGS-WIRE SET.6d)." (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:297-300)
- Binding: NONE (TRD's `settings.setObservability` does not exist). Gating task: crdb SET.6d.
- Evidence: as cited.
- TRD drift: TRD Section 3 "telemetry config (exporters, sampling, retention)" (44); plan ST.8 promised
  "the boot values shown as boot configuration" (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings.md:70)
  -- not shown.

## Tab 9 -- HA & Topology

### SET-HA-01 This node (server report)
- Location: Settings > HA & Topology > table "This node (the engine server report)"
- Configures: nothing. Facts: "Shards hosted", "Serving", "Durable storage", "Maintenance" ("every
  <duration>" or "off"), "Admin frame ceiling (bytes)", "Engine version"
  (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:306-331). The maintenance cadence itself
  is the live knob `maintenance.cadence_secs` (Configuration > maintenance).
- Binding: NONE. BFF route: `...?names=server`. Engine op: `SettingsReports`.
- Gating: Settings tier. Failure states: shared.
- Evidence: as cited. TRD drift: see SET-HA-02.

### SET-HA-02 Cluster leader / lag / Rotate Leadership / Test Quorum Loss / regions (PENDING)
- Location: Settings > HA & Topology > "Not available" note
- Configures: nothing; "The cluster leader, per-node lag, Rotate Leadership and Test Quorum Loss are not
  available; the configured regions and shard placement are boot configuration the engine does not
  serve. The engine has no verb or read for it yet: TRD-07 cluster status and leadership as admin verbs
  (crdb IP-CONSOLE-SETTINGS-WIRE SET.6a)." (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:333-336)
- Binding: NONE (`settings.cluster`, `settings.rotateLeadership`, `settings.testQuorumLoss` from TRD
  Section 4 do not exist). Gating task: crdb SET.6a.
- Evidence: as cited.
- TRD drift: 9.2 HA row shows "the configured regions and shard placement" (161); code states the
  engine does not serve them.

## Tab 10 -- FIPS Mode

### SET-FIPS-01 Crypto build posture (no toggle by construction)
- Location: Settings > FIPS Mode > table "Crypto build posture (the engine connectivity report)"
- Configures: nothing. Facts: "Crypto provider", "FIPS-validated module linked" (badge Yes/No); note
  "FIPS mode is chosen when the engine is built (its fips feature links the FIPS-validated AWS-LC
  module). It cannot be switched on a running node, so this tab has no toggle."
  (forgecentral/apps/console/src/surfaces/SettingsReportTabs.tsx:342-376)
- Binding: NONE. BFF route: `...?names=connectivity`. Engine op: `SettingsReports`.
- Gating: Settings tier. Failure states: shared.
- Evidence: as cited.
- TRD drift: TRD Section 3 "FIPS 140-3 mode status + toggle" and `settings.setFips`
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:45, 55) -- removed by 9.2 (163); the code matches 9.2.

---

# Part 5 -- Cross-cutting findings

### X-01 Binding-manifest coverage gaps (INV-CONSOLE-NO-STUB registry)
- The manifest registers only `entity.*`, `logs.*`, `overview.*`, `vtz.*`, `users.*` / `groups.*` /
  `idam.*`, `objects.*`, `policies.*`, `soc.*` (forgecentral/packages/bindings/src/manifest.ts:947-961).
- NOT registered, although each is a live BFF route over a live wire op:
  - every Settings operation: `SocSettingsRead`, `SocSettingsCommit`, `SettingsRead`, `SettingsCommit`,
    `SettingsPropose`, `SettingsApprovals`, `SettingsApprove`, `SettingsHistory`, `SettingsRollback`,
    `SettingsReports` (and the BFF-only `/api/settings/console-rbac`, `/api/settings/security-session`);
  - the SOC KPI strip's `DetectSummary` (the manifest comment says it is "already registered by the
    detection work", forgecentral/packages/bindings/src/manifest.ts:747; no such entry exists);
  - the Reports reads `SocReport` and `SocWeekly`.
- The no-stub test's prefix list has no `settings.` (forgecentral/apps/console/src/test/contract/no-stub.test.tsx:18-29),
  and the binding contract test has describe blocks for entity, logs, overview, vtz, idam and policies
  only -- none for soc or settings (forgecentral/packages/bindings/test/contract.test.ts:17, 39, 116, 150,
  180, 245, 284, 357).
- `logs.export` (an audited write) is registered as kind `read`, so it has no `authz` and escapes the
  audited-command rule (forgecentral/packages/bindings/src/manifest.ts:195-205;
  forgecentral/packages/bindings/src/validate.ts:39-41).
- `soc.plan.propose` is LIVE in its entry (forgecentral/packages/bindings/src/manifest.ts:788-794) while
  the block comment above says it is registered PENDING (749-753).
- `SocUeba` is encodable on the wire (forgecentral/packages/wire/src/dispatch.ts:138;
  forgecentral/packages/wire/src/payload.ts:686-693) but no BFF client method, route or surface uses it.
- The manifest's `authz` strings (for example `operator:soc.respond`, `operator:users.manage`) are
  never read by the BFF (no reference to `authz` in forgecentral/apps/bff/src); they are documentation.
- TRD-CONSOLE-11 Section 4's `settings.*` ids and TRD-CONSOLE-08 Section 3's `report.*` ids
  (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:47-56; forgecentral/docs/spec/TRD-CONSOLE-08-reports.md:31-39)
  do not exist anywhere in code.

### X-02 BFF gating model (session only; one role check; the Settings tier)
- Every SOC, Logs, Reports and Settings route requires a session (401) and a wired engine (503), then
  forwards to the engine under the operator delegation; the ONLY Console-role check in these routes is
  `global-admin` on `/api/settings/console-rbac` (forgecentral/apps/bff/src/server.ts:2115-2118; no other
  `session.role` test in forgecentral/apps/bff/src/server.ts).
- Tiers from Console roles: `global-admin` and `tenant-admin` -> `Admin`, `tenant-user` -> `User`, raised by
  IdP groups mapped in the default role-tier table (`console-security-audit` -> `SecurityAudit`)
  (forgecentral/apps/bff/src/auth/tier.ts:19-37; forgecentral/apps/bff/src/auth/oidc.ts:139).
- Settings ops alone carry `settings_tier`, only for a `global-admin` (SET-00). The SPA hides nothing by
  role; refusals render as empty states.
- Confirm dialogs are the SPA's only "are you sure" gate; they exist for SOC-02, SOC-04..08, SET-SOC-03/04,
  SET-CFG-02..08, SET-CHG-01, SET-CHG-03 and SET-FED-02, and are ABSENT for SOC-01 (Generate), SOC-03
  (Modify plan), LOG-01 (Export) and SET-FED-01 (Save connector). The dialog focuses Cancel and Escape
  cancels (forgecentral/packages/design/src/components/ConfirmDialog.tsx:34-60).

### X-03 Tenant scoping
- The BFF honours an `x-active-tenant` header only for a `global-admin`
  (forgecentral/apps/bff/src/server.ts:187-192; forgecentral/apps/bff/src/engine/principal.ts:48-54), but
  the SPA never sends it (no occurrence in forgecentral/apps/console/src), so every call runs in the
  session's resolved tenant -- for a global admin, the installer's default tenant
  (forgecentral/apps/bff/src/auth/rbac.ts:76-78). Whether the governed configuration the Settings tabs
  edit is per-tenant or node-wide is engine-side and UNVERIFIED here.

### X-04 "Retry" on a failed commit does not resend
- The error states after a failed SOC-settings commit, knob/section change, approval or rollback wire
  "Retry" to the mutation's `reset()` (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:254, 423;
  forgecentral/apps/console/src/surfaces/SettingsSectionForms.tsx:466;
  forgecentral/apps/console/src/surfaces/SettingsChangesTab.tsx:124, 215): it clears the message; the
  operator must submit again. Read errors' "Retry" does refetch.

---

# Part 6 -- TRD drift and ledger discrepancies

### D-11 TRD-CONSOLE-11 (Settings) -- enumerated drift
1. Tab set. Code (in order): SOC, Configuration, RBAC, Federation, Changes, Security, KeyLock,
   Observability, HA & Topology, FIPS Mode (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:508-519).
   Section 3 (forgecentral/docs/spec/TRD-CONSOLE-11-settings.md:35-45): HA & Topology, Failover & DR,
   RBAC, Federation, Security, KeyLock, Policy, Observability, FIPS Mode. Section 9.2 (151-163): SOC,
   Configuration, RBAC, Federation, Security, KeyLock, Policy, Observability, HA & Topology, Failover &
   DR, FIPS Mode. Code ADDS "Changes" (in neither table) and LACKS "Policy" and "Failover & DR" (in both).
2. Bindings (Section 4, 47-56): none of `settings.cluster`, `settings.dr`, `settings.rbac`,
   `settings.federation`, `settings.security`, `settings.keylock`, `settings.policyDefaults`,
   `settings.observability`, `settings.fips`, `settings.rotateLeadership`, `settings.testQuorumLoss`,
   `settings.testFailover`, `settings.rotateKey`, `settings.setRbac`, `settings.configureFederation`,
   `settings.syncFederation`, `settings.setFips`, `settings.setObservability`, `settings.setPolicyDefaults`
   exists; no Settings binding exists at all (X-01). Federation uses `idam.*`.
3. States in 9.2 that are stale (all LIVE in code): Configuration "PENDING engine, then LIVE" (154);
   Security "reports over the wire (PENDING engine)... PENDING, then LIVE" (157); KeyLock "key-issuing
   report over the wire (PENDING engine)" (158); Observability "telemetry report over the wire (PENDING
   engine)... PENDING, then LIVE" (160); HA "node-status over the wire (PENDING engine)" (161).
4. Row-content drift in 9.2:
   - Configuration (154): "version history, diff and rollback; propose / approve under dual control" --
     history, rollback and approve live on the separate Changes tab; there is no diff; edits exist only
     for 19 knobs and six section forms (Appendix A).
   - RBAC (155): includes `sso_group_roles` -- code shows it only on Federation (SET-FED-04).
   - Security (157): "the security report (classification, audit chain verified, artifact spot checks,
     retention)" -- no retention; "`key_issuing` and `egress_destinations`, the admin endpoint knobs" -- the
     admin endpoint knobs are not on this tab, `key_issuing` is only on KeyLock, and the tab's hint wrongly
     says the key-issuing section is edited on Configuration (SET-SEC-03).
   - KeyLock (158): "the key-issuing report and section ..., the signing key ids" -- section and key ids
     not shown; rotation stated pending (SET-KEY-02, crdb SET.6c).
   - Policy (159): ABSENT. Its content is scattered: the narrative model ref is editable on
     Configuration (SET-CFG-08); detection watermarks, detection retention, served models and credibility
     weights appear only as read-only rows on Configuration (surfaces `detection_posture`, `retention`,
     `served_models`); there is no tiers link.
   - Observability (160): no "flow planes" or "datagram counts"; exporter configuration stated pending
     (crdb SET.6d).
   - HA & Topology (161): "the configured regions and shard placement" -- stated not served (SET-HA-02).
   - Failover & DR (162): ABSENT (ledger ST.10 keeps it absent until the engine serves regions / DR).
   - FIPS Mode (163): matches.
5. 9.3 (168-170) "A tab whose engine binding has not landed is ABSENT from the strip": the strip is a
   fixed list, not binding-driven.
6. 9.4 (174-188): "Under dual control the Console offers PROPOSE ... never commits directly" -- true on
   Configuration, false on the SOC tab (locked, no propose, and tiers / SIEM cannot be proposed anywhere
   in the Console: SET-SOC-02). "Every value ... labelled with its source and, for a committed value, its
   version" -- the SOC tab's tier and SIEM fields carry no per-value source label; the Observability
   mirror table has no Source column.
7. 9.5 (192-196): "the commit control is replaced by Propose" -- section-form buttons still read "Commit
   <section>" under dual control (only the confirm says Propose); "a conflicting concurrent commit is ...
   never silently overwritten" -- no base version travels with a commit (SET-CFG-02).
8. Sections 2 and 7 (22-31, 86-87): "served only on the 8443 node-IP admin plane ... reaching it over a
   non-admin path is refused" -- the BFF serves every `/api/settings*` route to any authenticated session
   and explicitly handles a request that did not come through the admin terminator ("not-tunnelled",
   SET-SEC-04). Whether any non-terminator path to the BFF exists in deployment is UNVERIFIED here.
9. Section 6 (74-75): "unauthorized tabs/actions absent for a non-admin operator" -- all tabs render for
   every operator (SET-00).
10. 9.1 (111-137): "20 committed sections plus 27 scalar knobs ... (REGISTRY, 56 settings)" -- the
    registry has 56 rows but they are 31 knob-origin, 20 section-origin, 5 env-origin (Appendix A); the "27"
    does not match a count visible in the registry (engine-side, UNVERIFIED which count the TRD meant).
    9.1 lists fourteen status reports; the wire (and the Console) carry six: server, connectivity,
    security, telemetry, key_issuing, egress (forgecentral/packages/contracts/src/settings.ts:698-706).
11. Plan drift (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings.md): routes `GET/POST
    /api/settings/:surface` (63-64) are `GET /api/settings?surface=` and `POST /api/settings`; `GET
    /api/settings/security` + a sidecar header (67) is `GET /api/settings/security-session` + a port lookup;
    ST.8 "boot values shown as boot configuration" (70) not done; ST.10 "Failover & DR (regions and
    residency tags, boot)" (72) absent.

### D-03 TRD-CONSOLE-03 (SOC Ops) -- drift
1. Section 2 regions (58-68): header lacks tenant/shift line, `ELEVATED` pill, global search and shift-lead
   readout; KPI strip has six tiles, not five (adds "Rules Evaluable"); the dock has six tabs, not five
   (adds "Notes").
2. Section 3 (79-85): cards carry no 0-100 score and no exposure; the engine's order is rendered as
   returned; cards show credibility and, only when calibrated, a probability (SocDecisionQueue.tsx:127-140);
   authority chips are the four engine states, not "Transfer blocked" / "Identity challenged".
3. Section 4.1 (99-100) six semantic columns: deliberately not drawn (SocLineageGraph.tsx:19-22). 4.2
   (104-106) node kinds identity / agent / asset / device and state chips: code kinds are subject,
   network, process, evidence, decision, response (forgecentral/packages/contracts/src/soc.ts:108-115).
   4.4 (133-134) SIMULATE CONTAINMENT: absent.
4. Section 5.2 (155-157) fixes the narrative model to Gemma 4; the code uses the configurable
   `soc_narrative.model_ref` (SET-CFG-08) and adds an explicit Generate control (SOC-01). R-SOC-3 (169-173)
   `output_hash`, `model_version`, `policy_version` are not shown; the panel shows `modelRef` and `inputHash`.
5. Section 7 table (219-237): Decision Queue bound to "`LOG_QUERY` episode working set (SQ.8a)" -- code
   `SocIncidentList`; "Queue score ... LIVE" -- no score exists; "Evidence dock ... `LOG_EXPLAIN`" -- code
   uses the incident detail's evidence and `SocTelemetry`; "Verdict narrative ... PENDING", "Coordinated
   response ... PENDING", "Approve Full Response ... PENDING" -- all LIVE. Missing rows: Modify plan,
   Generate, the four case acts, disposition, notes, business impact, coverage tile.
6. Section 8 (248-252): no first-card auto-select; no node -> "Open entity" -> drawer path.
7. Section 9 deferrals 1 (authority state), 3 (plan record), 4 (governed model serving) and 6
   (events-analyzed counter) are resolved in code; 2 (exposure / blast radius) and 5 (simulate) remain
   absent; 7 (multi-model consensus) remains deferred.
8. Section 10 A11 (292): Modify is not confirm-gated (SOC-03).

### D-08 TRD-CONSOLE-08 (Reports) -- drift
1. Model (20-27): seven report tabs (Operational, AI Governance, VTZ & Apps, Reflex & Autonomy,
   Zero-Trust Impact, Compliance & Audit, Exec Summary), Trust Score Distribution, Reflex Actions Summary,
   High-Risk Events with a Rationale button, Identity Attestation Report, a Time range (Last 7d default)
   and Share/Export: NONE exist. Code: one page with "Weekly volume and coverage" (fixed 12 weeks) and
   "Incident report" (REP-01..03).
2. Bindings (31-41): no `report.*` binding exists; `entity.fullReport` is still PENDING on "IP-CONSOLE-08
   Reports surface" (forgecentral/packages/bindings/src/manifest.ts:139-151) although a Reports surface now
   exists, built under IP-CONSOLE-03 S3.16 / S3.17.
3. Export (38-39, 48): required audited engine export (PDF/CSV/JSON) and a tier-respecting share link;
   code: an unaudited client-side text/JSON download, no share (REP-02).

### D-09 TRD-CONSOLE-09 (Logs) -- drift
1. Columns (24-32): Entity, Category, Decision (Allowed / Warned / Blocked / Downgraded / Isolated), Trust
   Delta, VTZ, Confidence % -- code: "Time (UTC)", "Decision" (summary + rule id), "ATT&CK", "Confidence"
   (tier tag), "Outcome" (posture tag) (forgecentral/apps/console/src/surfaces/LogsSurface.tsx:126-167).
2. Row colors (34-35) -- code: `denied` critical, `flagged` caution, else good (36-40).
3. Paging and rendering (39-43, 81): cursor-paged and virtualized -- code: one bounded page of 100 plus
   an offset-paged background cache; not virtualized (Logs ledger
   forgecentral/docs/implementation-plans/IP-CONSOLE-09-LOGS-LEDGER.md:18).
4. `logs.tail` stream (44-46) -- PENDING; 2 s polling (LOG-03).
5. Filters (57-63): entity, category, decision, VTZ, confidence threshold, tag; default Last 24h;
   URL-encoded, Crucible-stored preference -- none of these (LOG-02).
6. Export (49-51, 77, 101-102): a command binding with confirm, exactly the filtered set -- a read
   binding, no confirm, capped at the 100-row page (LOG-01).
7. Replay link to AIOps Rewind (68-69) -- absent. Rows are described as "signed" (15-17) -- the contract
   notes the engine stores no signature on a decision (forgecentral/packages/contracts/src/logs.ts:61-63).

### L-11 IP-CONSOLE-11-settings-LEDGER vs code
1. Resume-here (forgecentral/docs/implementation-plans/IP-CONSOLE-11-settings-LEDGER.md:10) says the
   build-out "IS COMPLETE ... except ST.11 ... and the Failover & DR tab", while ST.7 (the Policy tab) is
   still "PLANNED (waits crdb SET.2b)" (27) although SET.2b landed (21). No Policy tab exists; ST.7 was
   neither built nor recorded as dropped.
2. ST.9 note (29): "its tiers are editable as `soc.*` knobs on Configuration, which propose" -- false:
   `soc.tiers` is a section-origin row outside the patchable set and renders read-only (SET-SOC-02).
3. ST.1 (19): "the Settings TabStrip shows only tabs with LIVE bindings" -- the strip is a hard-coded list;
   there are no Settings bindings.
4. ST.2a (20) "read-only ... everywhere under dual control" and ST.2b (21) "no forms under dual control" --
   superseded by ST.9 (both now propose); the rows were not amended.
5. Deferred list (37-38): "The admin-plane negotiated-group header (sidecar -> BFF) ... rides with ST.5" --
   stale; ST.5b (25) replaced the header with a port lookup.
6. ST.N-fix (31): `settings_tier` on "the ten Settings calls only" -- correct (ten ops), but unstated that the
   Federation tab's IdAM calls run without it.
7. ST.N (33): "RBAC and Federation ... offer no edit / commit / propose control" -- the Federation tab's
   connector panel offers Onboard / Configure / Sync Now (SET-FED-01/02); only the SSO map is control-free.

### L-03 IP-CONSOLE-03-soc-ops-LEDGER vs code
1. Resume-here (forgecentral/docs/implementation-plans/IP-CONSOLE-03-soc-ops-LEDGER.md:30-35) still says a
   live drive shows "`Raw Telemetry` and `Audit Trail` as explicit not-availables" -- both are live panes
   since S3.8c (94).
2. The ledger contradicts itself on the plan proposer: "The proposer (crdb SS.6) made the approval path
   real" (23-24) and S3.8b (93) vs "nothing in crdb PROPOSES a plan" (56-61) and the prerequisite row "NOT
   BUILT" (114). The SPA's empty-plan copy still says "nothing proposes one yet"
   (forgecentral/apps/console/src/surfaces/SocVerdictPanel.tsx:392-396).
3. S3.1 (85): "6 `soc.*` bindings (5 LIVE, `soc.plan.propose` PENDING)" -- the manifest now has 16
   `soc.*` bindings, all LIVE (forgecentral/packages/bindings/src/manifest.ts:755-939).
4. "TRD-CONSOLE-03 Section 7 has been corrected accordingly" (38-39) -- only the KPI rows were; the
   narrative, plan and approve rows still read PENDING (D-03 item 5).
5. Prerequisite (118) "Subject display label + series destination ... NOT BUILT" -- built:
   `subjectName` / `destination` on `SocIncidentRow` (forgecentral/packages/contracts/src/soc.ts:165-169),
   rendered by the queue (forgecentral/apps/console/src/surfaces/SocDecisionQueue.tsx:169-183).
6. Prerequisite (120): the disposition BFF route "NOT in this PR (no consumer shipped yet)" -- built in S3.11.
7. S3.18 (103): "TRD-CONSOLE-11's nine tabs stay ABSENT" -- superseded (ten tabs).
8. S3.14 (plan-step reversibility / rollback display, noted as owed at 12): not in code and no roster row.
9. S3.N capstone (104): PLANNED; not done.
10. "the SQ.8a episode working set backs the queue, `LOG_EXPLAIN` backs the dock" (67-69) -- stale (see D-03 item 5).

---

## Appendix A -- the Configuration tab rows (engine registry cross-check)

Source: crucible/crates/cdb-admin/src/config_registry.rs (REGISTRY, 56 rows: 31 knob-origin, 20
section-origin, 5 env-origin; no const-origin rows). The Console renders whatever SETTINGS_READ returns;
this table applies the Console rules to the registry as of crucible d0ace55a. "Change cell" = what the
Configuration table shows (Edit only for an engine-editable, live, knob-origin, non-CapabilitySet row:
forgecentral/packages/contracts/src/settings.ts:693-696; crucible/crates/cdb-server/src/handler.rs:4177-4186).
"Applies" = the Console label (forgecentral/apps/console/src/surfaces/SettingsSurface.tsx:290-301). "Default"
and "Bound" are the registry texts the Console shows in the Definition column (Bound) and does not show
(Default). Surfaces are listed in the picker order (alphabetical); the `enrollment` surface has no rows and
is not offered.


### Surface `admin_endpoint`

- `admin_endpoint.classification` (config_registry.rs:321) -- origin knob, type Classification; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: nowhere in the Console. Default: Unclassified. Bound: none.
- `admin_endpoint.max_payload_bytes` (config_registry.rs:333) -- origin knob, type Bytes; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: nowhere in the Console. Default: 65536. Bound: >= 1024 else MaxPayloadTooSmall.

### Surface `aig`

- `aig.exposure` (config_registry.rs:656) -- origin section, type Struct; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: disabled. Bound: if enabled, retention > 0 else AigRetentionUnbounded.

### Surface `api`

- `api.exposure` (config_registry.rs:644) -- origin section, type Struct; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: closed (empty origin, rate 0). Bound: non-empty origin requires rate > 0 else ApiExposureUnbounded.

### Surface `build_search`

- `build_search.posture` (config_registry.rs:748) -- origin section, type Struct; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: model=local-deterministic, dim=1024, cadence=0 (on-demand), search/entity/finding off. Bound: non-blank pinned model; dim != 0; cadence >= maintenance cadence; enabled search needs an index; must match the live embedder.

### Surface `cognition`

- `cognition.context_sources` (config_registry.rs:913) -- origin env, type Text; Applies "fixed at boot"; Change cell "read-only"; edited via: nowhere in the Console. Default: profile-seeded. Bound: each is a known CognitionSourceKind (file_tree/agent_vectors/memory).
- `cognition.frontier_providers` (config_registry.rs:925) -- origin env, type Text; Applies "fixed at boot"; Change cell "read-only"; edited via: nowhere in the Console. Default: profile-seeded. Bound: each is a well-formed dest:provider:cred_file triple.
- `cognition.admit_enrolled_devices` (config_registry.rs:937) -- origin knob, type Bool; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: nowhere in the Console. Default: false (fail closed); seeded from the boot NodeConfig. Bound: none.
- `cognition.max_connections` (config_registry.rs:998) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 64. Bound: none.

### Surface `detection_posture`

- `detection_posture.wake_specificity_floor_milli` (config_registry.rs:772) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 1000 (milli-nats; one nat). Bound: != 0 else ZeroWakeSpecificityFloor.
- `detection_posture.watermarks` (config_registry.rs:786) -- origin section, type Struct; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: max_skew=300, allowed_lateness=120, idle_timeout=600 (seconds). Bound: each bound > 0 else NonPositiveDetectionBound.
- `credibility_weights.weight_set` (config_registry.rs:852) -- origin section, type Struct; Applies "live"; Change cell "read-only"; edited via: nowhere in the Console. Default: the shipped v1 seeds (version 1). Bound: version >= 1; a modified set needs version >= 2; evidence rows >= 0; fp step <= 0; 0 < candidate <= urgent, else CredibilityWeightSetInvalid.

### Surface `egress`

- `egress.destinations` (config_registry.rs:632) -- origin section, type RecordList; Applies "live"; Change cell "read-only"; edited via: section form "Egress destinations" (SET-CFG-04). Default: empty. Bound: unique destination id else DuplicateEgressDestination.
- `siem_writeback` (config_registry.rs:826) -- origin section, type Struct; Applies "live"; Change cell "read-only"; edited via: Settings > SOC "SIEM write-back" (SET-SOC-04); direct commit only, no propose. Default: disabled; vendor=splunk, host/stream/case_url_base empty, ceiling=Unclassified (fail closed). Bound: enabled requires a host, a stream in the vendor's shape (sentinel/chronicle: two-part `a/b`) and an https:// case_url_base, else SiemWritebackIncomplete.
- `cognition.add_destinations` (config_registry.rs:949) -- origin env, type Text; Applies "fixed at boot"; Change cell "read-only"; edited via: nowhere in the Console. Default: profile-seeded. Bound: each is an id=ceiling pair; merged into egress.destinations.

### Surface `embedder`

- `embedder.binding` (config_registry.rs:877) -- origin section, type Struct; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: nowhere in the Console. Default: empty endpoint (in-process ReferenceEmbedder), pipeline width 0 (default). Bound: none.

### Surface `governance`

- `governance.dual_control` (config_registry.rs:345) -- origin knob, type CapabilitySet; Applies "live"; Change cell "read-only"; edited via: section form "Dual control" (SET-CFG-03). Default: per-profile (Evaluation empty; Enterprise KeyIssue+SecurityPolicyChange; AirGapped/Federal +AuditExport). Bound: none.

### Surface `graph_budgets`

- `graph_budgets.expand` (config_registry.rs:571) -- origin knob, type Count; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: 0 (closed until graph traversal is wired). Bound: if graph enabled, > 0 else GraphTraversalUnbounded.
- `graph_budgets.fanout` (config_registry.rs:583) -- origin knob, type Count; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: 0 (closed until graph traversal is wired). Bound: if graph enabled, > 0 else GraphTraversalUnbounded.
- `graph_budgets.as_of` (config_registry.rs:595) -- origin knob, type Count; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: 0 (closed until graph traversal is wired). Bound: if graph enabled, > 0 else GraphTraversalUnbounded.

### Surface `identity`

- `identity.sso_group_roles` (config_registry.rs:608) -- origin section, type StringMap; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: not in the Console: cdb-actl + restart (shown on Federation, SET-FED-04). Default: empty. Bound: each group maps to a non-empty role set else SsoGroupWithoutRole.
- `identity.admins` (config_registry.rs:620) -- origin section, type RecordList; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: not in the Console: cdb-actl + restart (shown on RBAC, SET-RBAC-01). Default: empty. Bound: each admin has a non-empty role set else AdminWithoutRole.

### Surface `key_issuing`

- `key_issuing.exposure` (config_registry.rs:696) -- origin section, type Struct; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: disabled. Bound: if enabled, dual control required else KeyIssuingNotDualControlled.

### Surface `leases`

- `leases.cursor_secs` (config_registry.rs:429) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 60. Bound: != 0 else ZeroCursorLease.
- `leases.session_secs` (config_registry.rs:443) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 60. Bound: != 0 else ZeroSessionLease.
- `leases.prepared_secs` (config_registry.rs:457) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 300. Bound: != 0 else ZeroPreparedLease.

### Surface `lug`

- `lug.exposure` (config_registry.rs:668) -- origin section, type Struct; Applies "live"; Change cell "read-only"; edited via: section form "LUG exposure" (SET-CFG-05). Default: disabled. Bound: if enabled, caps and bucket > 0 else LugExposureUnbounded; threshold <= 1000 permille.
- `idam.connector` (config_registry.rs:682) -- origin section, type Struct; Applies "live"; Change cell "read-only"; edited via: Settings > Federation (or Users > External IDAM) "Configure" (SET-FED-01) via the `IdamConfigure` op. Default: disabled; poll 300s, full sync 24h. Bound: if enabled, poll 60..=86400s and full sync 1..=168h else IdamCadenceOutOfRange.

### Surface `maintenance`

- `maintenance.cadence_secs` (config_registry.rs:381) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 60. Bound: != 0 else ZeroMaintenanceCadence.
- `maintenance.artifact_spot_check_limit` (config_registry.rs:1014) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 32. Bound: none.

### Surface `normalization`

- `normalization.disabled_decoder_families` (config_registry.rs:708) -- origin section, type StringSet; Applies "live"; Change cell "read-only"; edited via: section form "Disabled decoder families" (SET-CFG-06). Default: empty (all families enabled). Bound: each is a known SourceFormat family else UnknownDecoderFamily.
- `normalization.source_format_map` (config_registry.rs:722) -- origin section, type StringMap; Applies "live"; Change cell "read-only"; edited via: section form "Source-format overrides" (SET-CFG-07). Default: {tetragon: tetragon}. Bound: each format is a known SourceFormat label else UnknownSourceFormat.
- `normalization.searchable_attributes` (config_registry.rs:734) -- origin section, type StringSet; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: empty (core fields only). Bound: each key is non-blank else BlankSearchableAttribute.

### Surface `observability`

- `observability.telemetry_enabled` (config_registry.rs:889) -- origin env, type TriState; Applies "fixed at boot"; Change cell "read-only"; edited via: nowhere in the Console. Default: on (unset or 1); off on 0. Bound: none.
- `observability.otlp_ingest_bytes_per_window` (config_registry.rs:901) -- origin knob, type Bytes; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 67108864 (64 MiB). Bound: none (0 sheds all OTLP-plane ingest).

### Surface `query_surface`

- `query_surface.enabled` (config_registry.rs:499) -- origin knob, type Bool; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: true. Bound: if enabled, query & result limits must be > 0 else QuerySurfaceUnbounded.
- `query_surface.vector_search_enabled` (config_registry.rs:511) -- origin knob, type Bool; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: false. Bound: none.
- `query_surface.bm25_search_enabled` (config_registry.rs:523) -- origin knob, type Bool; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: false. Bound: none.
- `query_surface.graph_traversal_enabled` (config_registry.rs:535) -- origin knob, type Bool; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: false. Bound: if enabled, all graph budgets must be > 0 else GraphTraversalUnbounded.
- `query_surface.per_tenant_query_limit` (config_registry.rs:547) -- origin knob, type Count; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: 100000. Bound: if query enabled, > 0 else QuerySurfaceUnbounded.
- `query_surface.per_tenant_result_limit` (config_registry.rs:559) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 10000. Bound: if query enabled, > 0 else QuerySurfaceUnbounded.
- `query_surface.result_chunk_rows` (config_registry.rs:962) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 256. Bound: none.
- `query_surface.max_cursors_per_tenant` (config_registry.rs:974) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 128. Bound: none.
- `query_surface.max_retained_tail_bytes` (config_registry.rs:986) -- origin knob, type Bytes; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 268435456 (256 MiB). Bound: none.

### Surface `retention`

- `retention.time_travel_window_secs` (config_registry.rs:393) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 604800 (7 days). Bound: != 0 else ZeroRetentionWindow.
- `retention.log_observation_window_secs` (config_registry.rs:405) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 2592000 (30 days). Bound: != 0 else ZeroLogRetentionWindow.
- `retention.raw_days` (config_registry.rs:417) -- origin env, type Count; Applies "fixed at boot"; Change cell "read-only"; edited via: nowhere in the Console. Default: 5 (days; plan D12 operator ruling 2026-09-14). Bound: != 0 else the ingest stanza is refused (unbounded raw retention).
- `detection_retention.horizons` (config_registry.rs:840) -- origin section, type Struct; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: disabled (keep forever). Bound: if enabled, each horizon > 0 else DetectionRetentionUnbounded.

### Surface `served_models`

- `served_models.registry` (config_registry.rs:760) -- origin section, type RecordList; Applies "pending: no live consumer yet"; Change cell "read-only"; edited via: nowhere in the Console. Default: empty. Bound: complete id/version/region else IncompleteServedModel; unique (id,version) else DuplicateServedModel.

### Surface `sessions`

- `sessions.standard_lifetime_secs` (config_registry.rs:357) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 28800 (Evaluation); tighter per profile. Bound: != 0 else ZeroSessionLifetime.
- `sessions.break_glass_lifetime_secs` (config_registry.rs:369) -- origin knob, type DurationSecs; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 3600 (Evaluation); tighter per profile. Bound: != 0 else ZeroSessionLifetime; <= standard else BreakGlassExceedsStandard.

### Surface `soc_narrative`

- `soc_narrative.model_ref` (config_registry.rs:798) -- origin section, type Text; Applies "live"; Change cell "read-only"; edited via: section form "Narrative model" (SET-CFG-08). Default: unbound (the narrative refuses). Bound: must resolve against served_models as a TextGeneration model else SocNarrativeModelUnresolvable.
- `soc.tiers` (config_registry.rs:812) -- origin section, type Struct; Applies "live"; Change cell "read-only"; edited via: Settings > SOC "Response tiers" (SET-SOC-03); direct commit only, no propose. Default: p_low=0, p_high=1000 (milli): the fail-closed extreme, nothing is noise and nothing licenses containment. Bound: 0 <= p_low <= p_high <= 1000 else SocTiersInvalid.

### Surface `workers`

- `workers.max` (config_registry.rs:865) -- origin knob, type Count; Applies "boot-bound: changes need a restart"; Change cell "read-only"; edited via: nowhere in the Console. Default: 0 = auto (max(8 x cores, 64)); an operator commits an explicit ceiling. Bound: none.

### Surface `workspace_quota`

- `workspace_quota.per_principal` (config_registry.rs:471) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 64. Bound: != 0 else ZeroWorkspaceQuota; <= per_tenant else WorkspaceQuotaPrincipalExceedsTenant.
- `workspace_quota.per_tenant` (config_registry.rs:485) -- origin knob, type Count; Applies "live"; Change cell "Edit"; edited via: this row (SET-CFG-02). Default: 256. Bound: != 0 else ZeroWorkspaceQuota.

---

## Appendix B -- control -> BFF route -> wire request map

Every wire request below rides the `QuerySubmit` frame opcode; the CBOR enum tag discriminates it
(forgecentral/packages/wire/src/dispatch.ts:19-159). Client dispatch sites:
forgecentral/apps/bff/src/engine/wire-client.ts:753-1097, 1237-1258.

| Item | Method + route | BFF resolver | Wire request (reply tag) |
|------|----------------|--------------|--------------------------|
| SOC-01 | POST /api/soc/generate | resolveCognitionRun | `SocCognitionRun` (`SocRunState`) |
| SOC-02 | POST /api/soc/plan/approve | resolveApprovePlan | `SocPlanApprove` (`SocPlanMutated`) |
| SOC-03 | POST /api/soc/plan/modify | resolveModifyPlan | `SocPlanModify` (`SocPlanMutated`) |
| SOC-04/05/06/08 | POST /api/soc/act | resolveCaseAct | `SocIncidentAct` act assigned / acked / closed / noted (`SocActed`) |
| SOC-07 | POST /api/soc/disposition | resolveDisposition | `SocDisposition` (`SocDispositioned`) |
| SOC-09 KPIs | GET /api/soc/kpis | resolveSocKpis | `DetectSummary` + `SocIncidentList` |
| SOC queue / REP-01 list | GET /api/soc/incidents | resolveIncidentQueue | `SocIncidentList` (`SocIncidentList`) |
| SOC detail | GET /api/soc/incident?id= | resolveIncidentDetail | `SocIncidentDetail` |
| SOC narrative | GET /api/soc/narrative?id= | resolveNarrative | `SocNarrative` |
| SOC dock | GET /api/soc/telemetry, /audit, /notes, /impact ?id= | resolveIncidentTelemetry / resolveAuditTrail / resolveIncidentNotes / resolveBusinessImpact | `SocTelemetry` / `SocAudit` / `SocNotes` / `SocImpact` |
| REP-01 report | GET /api/soc/report?id= | resolveIncidentReport | `SocReport` |
| REP-03 | GET /api/soc/weekly?weeks=12 | resolveWeekly | `SocWeekly` |
| LOG-01 | POST /api/logs/export | resolveLogExport | `LogExport` (`LogExported`) |
| LOG-02/03 | GET /api/logs?... | resolveLogQuery | `LogQuery` |
| LOG-04 | GET /api/logs/explain/<id> | resolveLogExplain | `LogExplain` |
| SET-SOC-01/02/05 | GET /api/settings/soc | resolveSocSettings | `SocSettingsRead` (`SocSettings`) |
| SET-SOC-03/04 | POST /api/settings/soc | resolveSocSettingsCommit | `SocSettingsCommit` (`SocSettingsCommitted`) |
| SET-CFG-01, SET-RBAC-01, SET-FED-04, SET-OBS-02 | GET /api/settings | resolveSettings | `SettingsRead` (`Settings`) |
| SET-CFG-02..08 (commit) | POST /api/settings | resolveSettingsCommit | `SettingsCommit` (`SettingsCommitted`) |
| SET-CFG-02..08 (dual control) | POST /api/settings/propose | resolveSettingsPropose | `SettingsPropose` (`SettingsProposed`) |
| SET-CHG-01 list | GET /api/settings/approvals | resolveSettingsApprovals | `SettingsApprovals` (`SettingsApprovals`) |
| SET-CHG-01 approve | POST /api/settings/approvals/<id>/approve | resolveSettingsApprove | `SettingsApprove` (`SettingsCommitted`) |
| SET-CHG-02 | GET /api/settings/history?limit=50 | resolveSettingsHistory | `SettingsHistory` (`SettingsHistory`) |
| SET-CHG-03 | POST /api/settings/rollback | resolveSettingsRollback | `SettingsRollback` (`SettingsCommitted`) |
| SET-SEC-01..03, SET-KEY-01, SET-OBS-01, SET-HA-01, SET-FIPS-01 | GET /api/settings/reports?names= | resolveSettingsReports | `SettingsReports` (`SettingsReports`) |
| SET-SEC-04 | GET /api/settings/security-session | lookupSessionGroup | none (crypto-sidecar session lookup) |
| SET-RBAC-02 | GET /api/settings/console-rbac | rbacConfigView | none (BFF installer config) |
| SET-FED-01 | POST /api/idam/secret, then /api/idam/connect, then /api/idam/configure | setConnectorSecret / resolveIdamConnect / resolveIdamConfigure | none (sidecar) / `IdamConnect` / `IdamConfigure` |
| SET-FED-02 | POST /api/idam/sync | resolveIdamSync | `IdamSync` |
| SET-FED-03 | GET /api/idam/connectors | resolveIdamConnectors | `IdamConnectors` |

Reply-tag evidence: forgecentral/apps/bff/src/engine/wire-client.ts:192-353, 441. The ten Settings wire
requests carry `operator.settings_tier` for a global admin; all others carry `{principal, tenant}` only
(forgecentral/apps/bff/src/engine/operator-engine.ts:676-686, 799-848).

---

## Open questions

1. LOG_EXPORT and `limit`: the Console always sends the 100-row page limit with an export (LOG-01). Does
   the engine apply it (so "Export" exports one page), and is that intended versus the TRD's "exactly the
   filtered set"?
2. Response tiers and SIEM write-back under dual control: no Console path exists (not proposable on the
   SOC tab, read-only on Configuration). Should the engine add them to the patchable sections (or a SOC
   propose op), or should the manual send operators to `cdb-actl`? The ledger's ST.9 note claims the
   opposite of the code.
3. Settings access for non-global-admins: with no `settings_tier`, the engine uses the Console peer's own
   tier (crucible/crates/cdb-server/src/handler.rs:4205-4224). What tier is the Console peer provisioned
   at on the box? If Admin, tenant-admins can read and commit Settings despite the FC comment.
4. Is the governed configuration node-wide or per-tenant (Settings ops carry a tenant; the SPA never
   changes it)?
5. `SETTINGS_READ.version` is the store's latest version at read time
   (crucible/crates/cdb-server/src/handler.rs:4262-4264), which the Console labels "committed at version
   N". Is that the intended meaning, given it moves with any store write?
6. The Policy tab (ST.7) and Failover & DR: dropped, or still owed? The ledger calls the build-out complete
   while ST.7 is PLANNED, and TRD 9.2 still lists both tabs.
7. Generate verdict: is the missing poll (`RUN_POLL_INTERVAL_MS` unused) a known gap? The on-screen copy
   promises re-reads.
8. Plan proposer: on the live box, does SOC_INCIDENT_DETAIL return proposed plans (crdb SS.6)? If yes, the
   empty-plan copy "nothing proposes one yet" and the manifest header comment are stale.
9. Should the Settings, KPI, report and weekly operations be registered in the binding manifest (the
   no-stub contract's premise), and should `logs.export` be a command binding?
10. Rollback of a version whose document differs in boot-bound or pending sections: what does the engine
    do, and does the receipt's restart list cover it?
11. Assignee ids: where is an operator expected to find a principal id to paste into "Assign to"? No
    Console screen lists them.
12. The Console role map (`FC_RBAC_CONFIG`) and the engine admin map are both read-only here; the
    manual needs the install-time procedure for each (outside this slice).
