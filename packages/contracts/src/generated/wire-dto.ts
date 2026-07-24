// GENERATED FILE -- DO NOT EDIT BY HAND.
//
// The TypeScript projection of the Crucible wire DTO contract, emitted from the vendored schema
// schema/wire-dto.schema.json (https://schema.yousource.ai/crucible/wire/dto/v1) by scripts/generate.mjs.
// The engine is the single source of truth (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE); regenerate with
//   node scripts/generate.mjs
// A codegen round-trip test asserts this file equals the emitter output, so an un-regenerated wire
// change fails the gate. Edit the schema (upstream, in crdb), not this file.

export type Action = 'Permit' | 'Monitor' | 'Quarantine' | 'Deny';

export interface AiAssist {
  confidence_pct: number;
  proposed_policy_digest: string;
  verdict: string;
}

export interface ContainmentRequest {
  action: Action;
  ai_assist?: AiAssist | null;
  command_id: string;
  derived_from_decision_id?: string | null;
  issued_at: number;
  reason: string;
  subject: string;
}

export interface OperatorDelegation {
  principal: string;
  tenant: string;
}

export type RetryClass = 'Never' | 'SafeSameRequest' | 'SafeAfterRefresh' | 'CallerDecision';

export type StreamKind = 'Decision' | 'Audit';

export interface WireAgentList {
  agents: Array<WireAgentRecord>;
}

export interface WireAgentRecord {
  agent_id: string;
  attributes: Array<[string, string]>;
  enrolled_at: number;
  status: string;
}

export interface WireAuditEntry {
  action: string;
  commit_version: number;
  effect: string;
  principal_id: string;
  resource: string;
  seq: number;
  timestamp: number;
}

export interface WireBundleCommit {
  bundle: Array<number>;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireBundleCommitted {
  commit_version: number;
  version: number;
}

export interface WireBundleConvergence {
  has_bundle: boolean;
  members: Array<WireConvergenceMember>;
  version: number;
}

export interface WireBundleConvergenceQuery {
  request_id: number;
  vtz_id: string;
}

export interface WireBundleDelivered {
  bundle?: Array<number> | null;
  version: number;
}

export interface WireBundleFetch {
  have?: number | null;
  request_id: number;
}

export interface WireBundleReport {
  rejected_reason?: string | null;
  request_id: number;
  version: number;
  vtz_id: string;
}

export interface WireBundleReported {
  commit_version: number;
}

export interface WireClassUsage {
  class: string;
  octets: number;
}

export interface WireConnClass {
  class: string;
  count: number;
}

export interface WireConnEdge {
  dest_class: string;
  source_class: string;
  weight: number;
}

export interface WireConnection {
  destination_id: string;
  destination_kind: string;
  observed_at: number;
}

export interface WireConnectionList {
  connections: Array<WireConnection>;
}

export interface WireConnectivityGraph {
  dest_edges: Array<WireVtzDestEdge>;
  destinations: Array<WireConnClass>;
  edges: Array<WireConnEdge>;
  risk: WireRiskBand;
  source_edges: Array<WireSourceVtzEdge>;
  sources: Array<WireConnClass>;
  top_destinations: Array<WireNamedDest>;
  truncated: boolean;
  vtzs: Array<WireVtzNode>;
}

export interface WireConnectivityMember {
  connection_count: number;
  display_name: string;
  id: string;
  kind: string;
}

export interface WireConnectivityMembers {
  class: string;
  limit: number;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireConnectivityQuery {
  limit: number;
  operator?: OperatorDelegation | null;
  request_id: number;
  since?: number | null;
  until?: number | null;
}

export interface WireContain {
  operator?: OperatorDelegation | null;
  request: ContainmentRequest;
}

export interface WireContainEffect {
  action: Action;
  enforcement_active: boolean;
  summary: string;
}

export interface WireConvergenceMember {
  endpoint_cn: string;
  reason?: string | null;
  state: string;
}

export interface WireDecision {
  anchor: string;
  confidence: string;
  decision_id: string;
  finding: string;
  recommended_action: string;
  rule_id: string;
  scope: string;
  source_subjects: Array<string>;
  tactics: Array<string>;
}

export interface WireDecisionDetail {
  confidence: string;
  correlation_id: string;
  created_at: number;
  decision_id: string;
  evidence: Array<string>;
  finding: string;
  recommended_action: string;
  replay_as_of: number;
  replay_digest: string;
  rule_id: string;
  scope: string;
  source_context: Array<string>;
  source_hosts: Array<string>;
  source_observations: Array<string>;
  source_subjects: Array<string>;
  tactics: Array<string>;
  technique: string;
  watermark_seconds: number;
  window_seconds: number;
}

export interface WireDecisionList {
  decisions: Array<WireDecisionRow>;
}

export interface WireDecisionRow {
  confidence: string;
  created_at: number;
  decision_id: string;
  evidence: Array<string>;
  finding: string;
  recommended_action: string;
  rule_id: string;
  tactics: Array<string>;
  technique: string;
}

export interface WireDomainPosture {
  domain: string;
  floor: boolean;
  posture: string;
}

export type WireDriftTrigger = 'Schema' | 'Policy' | 'Statistics' | 'Model' | 'AsOf' | 'Workspace';

export interface WireEntityConnections {
  limit: number;
  operator?: OperatorDelegation | null;
  request_id: number;
  subject_id: string;
  subject_kind: string;
}

export interface WireEntityDecisions {
  entity_type: string;
  entity_value: string;
  limit: number;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireError {
  class: WireErrorClass;
  code: number;
  correlation_id: number;
  retry: RetryClass;
}

export type WireErrorClass = 'Unauthenticated' | 'Denied' | 'VersionUnsupported' | 'Conflict' | 'IdempotencyConflict' | 'AsOfUnavailable' | 'StorageUnavailable' | 'AuditFailure' | 'IntegrityFailure' | 'LimitExceeded' | 'Framing' | 'Internal';

export interface WireGroupList {
  groups: Array<WireGroupRecord>;
}

export interface WireGroupRecord {
  built_in: boolean;
  description: string;
  group_id: string;
  member_count: number;
  name: string;
  namespace: string;
}

export interface WireGroupSetMembers {
  members: Array<string>;
  name: string;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireGroupWrite {
  description: string;
  name: string;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireIdamConfigure {
  enabled: boolean;
  full_sync_cadence_hours: number;
  operator?: OperatorDelegation | null;
  poll_interval_secs: number;
  provider: string;
  request_id: number;
}

export interface WireIdamConnect {
  audience: string;
  client_id: string;
  client_secret_ref: string;
  domain: string;
  operator?: OperatorDelegation | null;
  provider: string;
  request_id: number;
}

export interface WireIdamConnectorList {
  connectors: Array<WireIdamConnectorRecord>;
}

export interface WireIdamConnectorRecord {
  display_name: string;
  enabled: boolean;
  full_sync_cadence_hours: number;
  last_completeness?: string | null;
  last_error?: string | null;
  last_sync_unix_ms?: number | null;
  objects_synced: number;
  poll_interval_secs: number;
  provider: string;
  provider_tenant: string;
  running: boolean;
}

export interface WireIdamConnectors {
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireIdamSync {
  operator?: OperatorDelegation | null;
  provider: string;
  request_id: number;
}

export interface WireIdamSyncStarted {
  provider: string;
}

export interface WireListAgents {
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireListGroups {
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireListPrincipals {
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireLogExplain {
  decision_id: string;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireLogExport {
  command_id: string;
  issued_at: number;
  operator?: OperatorDelegation | null;
  query: WireLogQuery;
}

export interface WireLogExportEffect {
  commit_version: number;
  export_id: string;
  row_count: number;
  rows: Array<WireDecisionRow>;
}

export interface WireLogQuery {
  action?: string | null;
  confidence?: string | null;
  limit: number;
  offset?: number;
  operator?: OperatorDelegation | null;
  request_id: number;
  rule_id?: string | null;
  search?: string | null;
  since?: number | null;
  tactic?: string | null;
  technique?: string | null;
  until?: number | null;
}

export interface WireLugEdgeFact {
  dst_id: string;
  dst_kind: string;
  membership_kind?: string | null;
  relation: string;
  src_id: string;
  src_kind: string;
}

export interface WireLugEvents {
  events: Array<WireLugIdentityEvent>;
  namespace: string;
  request_id: number;
}

export interface WireLugEventsApplied {
  buckets_advanced: number;
  counters_bumped: number;
  deduped: number;
  observations_written: number;
  sessions_unchanged: number;
  sessions_written: number;
}

export interface WireLugIdentityEvent {
  account_source_id?: string | null;
  attempted_username?: string | null;
  detail: Array<[string, string]>;
  kind: string;
  occurred_at: number;
  raw_event_hash: string;
  session_source_id?: string | null;
  session_state: Array<[string, string]>;
}

export interface WireLugNodeFact {
  kind: string;
  source_id: string;
  state: Array<[string, string]>;
}

export interface WireLugProvisioned {
  commit_version: number;
}

export interface WireLugSnapshot {
  collector_version: string;
  completeness: string;
  edges: Array<WireLugEdgeFact>;
  namespace: string;
  nodes: Array<WireLugNodeFact>;
  observed_at: number;
  request_id: number;
}

export interface WireLugSnapshotApplied {
  closed: number;
  derived_closed?: number;
  derived_written?: number;
  edges_written: number;
  nodes_written: number;
  replay: boolean;
  unchanged: number;
}

export interface WireMemberList {
  members: Array<WireConnectivityMember>;
}

export interface WireNamedDest {
  address: string;
  count: number;
}

export interface WireObjectCatalog {
  objects: Array<WireObjectRecord>;
}

export interface WireObjectCreate {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WireObjectSpec;
}

export interface WireObjectDelete {
  name: string;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireObjectDetail {
  members: Array<string>;
  record?: WireObjectRecord | null;
}

export interface WireObjectDetailQuery {
  name: string;
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireObjectEdit {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WireObjectSpec;
}

export interface WireObjectList {
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WireObjectMutated {
  name: string;
}

export interface WireObjectRecord {
  attributes: Array<string>;
  description: string;
  kind: string;
  lifecycle: string;
  name: string;
  selector_kind: string;
  selector_value: string;
  tags: Array<string>;
}

export interface WireObjectSpec {
  attributes?: Array<string>;
  description: string;
  kind: string;
  lifecycle: string;
  name: string;
  selector_kind: string;
  selector_value: string;
  tags?: Array<string>;
}

export interface WirePolicyCreate {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WirePolicySpec;
}

export interface WirePolicyDelete {
  id: string;
  operator?: OperatorDelegation | null;
  request_id: number;
  vtz: string;
}

export interface WirePolicyDetail {
  record?: WirePolicyRecord | null;
  versions: Array<WirePolicyVersionRow>;
}

export interface WirePolicyDetailQuery {
  id: string;
  operator?: OperatorDelegation | null;
  request_id: number;
  vtz: string;
}

export interface WirePolicyEdit {
  id: string;
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WirePolicySpec;
}

export interface WirePolicyList {
  zones: Array<WirePolicyZone>;
}

export interface WirePolicyListQuery {
  operator?: OperatorDelegation | null;
  request_id: number;
}

export interface WirePolicyMutated {
  breaking?: boolean | null;
  id: string;
  lifecycle: string;
  version: string;
}

export interface WirePolicyPublish {
  id: string;
  operator?: OperatorDelegation | null;
  request_id: number;
  version: string;
  vtz: string;
}

export interface WirePolicyRecord {
  active_from?: number | null;
  active_until?: number | null;
  applied_to?: Array<WireScopeMember>;
  default_postures?: Array<WireDomainPosture>;
  description: string;
  geo?: Array<string>;
  id: string;
  lifecycle: string;
  logging: string;
  max_classification: string;
  name: string;
  ports?: string;
  protocols?: Array<string>;
  restriction_tags?: Array<string>;
  rules: Array<WirePolicyRule>;
  schedule_days?: Array<string>;
  schedule_end_minute?: number | null;
  schedule_start_minute?: number | null;
  version: string;
  vtz: string;
}

export interface WirePolicyRule {
  action: string;
  destination_kind: string;
  destination_selector_kind: string;
  destination_selector_value: string;
  source_kind: string;
  source_selector_kind: string;
  source_selector_value: string;
}

export interface WirePolicySpec {
  active_from?: number | null;
  active_until?: number | null;
  applied_to?: Array<WireScopeMember>;
  default_postures?: Array<WireDomainPosture>;
  description: string;
  geo?: Array<string>;
  logging: string;
  max_classification: string;
  name: string;
  ports?: string;
  protocols?: Array<string>;
  restriction_tags?: Array<string>;
  rules: Array<WirePolicyRule>;
  schedule_days?: Array<string>;
  schedule_end_minute?: number | null;
  schedule_start_minute?: number | null;
  vtz: string;
}

export interface WirePolicyVersionRow {
  lifecycle: string;
  version: string;
}

export interface WirePolicyZone {
  policies: Array<WirePolicyRecord>;
  vtz: string;
}

export interface WirePrincipalCreate {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WirePrincipalSpec;
}

export interface WirePrincipalEdit {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WirePrincipalSpec;
}

export interface WirePrincipalList {
  principals: Array<WirePrincipalRecord>;
}

export interface WirePrincipalRecord {
  account_type: string;
  binding_status?: string | null;
  bound_connector?: string | null;
  email: string;
  enabled: boolean;
  first_seen: number;
  groups: Array<string>;
  last_seen_bucket?: number | null;
  namespace: string;
  org: string;
  origin: string;
  owned_fields: Array<string>;
  principal_id: string;
  privileges: Array<string>;
  status: string;
  subject_id?: string | null;
  username: string;
}

export interface WirePrincipalSetStatus {
  operator?: OperatorDelegation | null;
  request_id: number;
  status: string;
  username: string;
}

export interface WirePrincipalSpec {
  email?: string | null;
  org?: string | null;
  subject_type: string;
  username: string;
}

export interface WireQueryRows {
  cursor: Array<number> | null;
  redacted_fields: Array<string>;
  rows: Array<Array<[string, WireValue]>>;
}

export interface WireQuerySubmit {
  operator?: OperatorDelegation | null;
  params: Array<[string, WireValue]>;
  request_id: number;
  text: string;
}

export type WireReply =
  | { QueryRows: WireQueryRows; }
  | { AgentList: WireAgentList; }
  | { PrincipalList: WirePrincipalList; }
  | { GroupList: WireGroupList; }
  | { ObjectCatalog: WireObjectCatalog; }
  | { ObjectDetail: WireObjectDetail; }
  | { ObjectMutated: WireObjectMutated; }
  | { LugProvisioned: WireLugProvisioned; }
  | { IdamConnectors: WireIdamConnectorList; }
  | { IdamSyncStarted: WireIdamSyncStarted; }
  | { DecisionList: WireDecisionList; }
  | { ConnectionList: WireConnectionList; }
  | 'CursorClosed'
  | { TxnBegun: { txn: Array<number>; }; }
  | { Staged: { affected: number; }; }
  | { TxnCommitted: { version: number; }; }
  | 'TxnAborted'
  | { WorkspaceForked: { txn: Array<number>; }; }
  | { WorkspacePromoted: { version: number; }; }
  | { Remembered: { memory_id: number; }; }
  | { Prepared: { handle: Array<number>; plan_id: string; statement_hash: string; }; }
  | { ReprepareRequired: { trigger: WireDriftTrigger; }; }
  | { NotYetWired: { verb: string; }; }
  | { Refused: { error: WireError; }; }
  | { Contained: WireContainEffect; }
  | { DecisionDetail: WireDecisionDetail; }
  | { LogExported: WireLogExportEffect; }
  | { ConnectivityGraph: WireConnectivityGraph; }
  | { MemberList: WireMemberList; }
  | { BundleCommitted: WireBundleCommitted; }
  | { BundleDelivered: WireBundleDelivered; }
  | { BundleReported: WireBundleReported; }
  | { BundleConvergence: WireBundleConvergence; }
  | { LugSnapshotApplied: WireLugSnapshotApplied; }
  | { LugEventsApplied: WireLugEventsApplied; }
  | { UsageOverview: WireUsageOverviewResult; }
  | { VtzTree: WireVtzTree; }
  | { VtzDetail: WireVtzDetail; }
  | { VtzMutated: WireVtzMutation; }
  | { PolicyList: WirePolicyList; }
  | { PolicyDetail: WirePolicyDetail; }
  | { PolicyMutated: WirePolicyMutated; };

export type WireRequest =
  | { QuerySubmit: WireQuerySubmit; }
  | { Prepare: { params: Array<[string, WireValue]>; text: string; }; }
  | { ExecutePrepared: { handle: Array<number>; params: Array<[string, WireValue]>; }; }
  | { CursorFetch: { handle: Array<number>; }; }
  | { CursorClose: { handle: Array<number>; }; }
  | 'TxnBegin'
  | { TxnWrite: { params: Array<[string, WireValue]>; text: string; txn: Array<number>; }; }
  | { TxnCommit: { request_id: number; txn: Array<number>; }; }
  | { TxnAbort: { txn: Array<number>; }; }
  | { SubmitMemoryWrite: WireQuerySubmit; }
  | { ListAgents: WireListAgents; }
  | { ListPrincipals: WireListPrincipals; }
  | { ListGroups: WireListGroups; }
  | { ObjectList: WireObjectList; }
  | { ObjectDetail: WireObjectDetailQuery; }
  | { ObjectCreate: WireObjectCreate; }
  | { ObjectEdit: WireObjectEdit; }
  | { ObjectDelete: WireObjectDelete; }
  | { IdamConnectors: WireIdamConnectors; }
  | { IdamSync: WireIdamSync; }
  | { IdamConfigure: WireIdamConfigure; }
  | { IdamConnect: WireIdamConnect; }
  | { PrincipalCreate: WirePrincipalCreate; }
  | { PrincipalEdit: WirePrincipalEdit; }
  | { PrincipalSetStatus: WirePrincipalSetStatus; }
  | { GroupCreate: WireGroupWrite; }
  | { GroupEdit: WireGroupWrite; }
  | { GroupSetMembers: WireGroupSetMembers; }
  | { EntityDecisions: WireEntityDecisions; }
  | { EntityConnections: WireEntityConnections; }
  | { Contain: WireContain; }
  | { LogQuery: WireLogQuery; }
  | { LogExplain: WireLogExplain; }
  | { LogExport: WireLogExport; }
  | { ConnectivityGraph: WireConnectivityQuery; }
  | { ConnectivityMembers: WireConnectivityMembers; }
  | { UsageOverview: WireUsageOverview; }
  | { VtzTree: WireVtzTreeQuery; }
  | { VtzDetail: WireVtzDetailQuery; }
  | { VtzCreate: WireVtzCreate; }
  | { VtzEdit: WireVtzEdit; }
  | { VtzRescope: WireVtzRescope; }
  | { VtzDelete: WireVtzDelete; }
  | { PolicyListByZone: WirePolicyListQuery; }
  | { PolicyDetail: WirePolicyDetailQuery; }
  | { PolicyCreate: WirePolicyCreate; }
  | { PolicyEdit: WirePolicyEdit; }
  | { PolicyPublish: WirePolicyPublish; }
  | { PolicyDelete: WirePolicyDelete; }
  | { BundleCommit: WireBundleCommit; }
  | { BundleFetch: WireBundleFetch; }
  | { BundleReport: WireBundleReport; }
  | { BundleConvergence: WireBundleConvergenceQuery; }
  | { LugSnapshot: WireLugSnapshot; }
  | { LugEvents: WireLugEvents; };

export interface WireRiskBand {
  candidate: number;
  escalate: number;
  level: string;
  observe: number;
}

export interface WireScopeMember {
  agent?: string | null;
  endpoint_cn: string;
}

export interface WireSourceVtzEdge {
  source_class: string;
  vtz_id: string;
  weight: number;
}

export type WireStreamDelta =
  | { Decision: WireDecision; }
  | { Audit: WireAuditEntry; };

export interface WireStreamEvent {
  delta: WireStreamDelta;
  watermark: number;
}

export interface WireStreamSubscribe {
  from_watermark: number | null;
  kinds: Array<StreamKind>;
}

export interface WireTalkerUsage {
  flows: number;
  host: string;
  octets: number;
}

export interface WireUsageOverview {
  operator?: OperatorDelegation | null;
  request_id: number;
  since?: number | null;
  until?: number | null;
}

export interface WireUsageOverviewResult {
  active_endpoints: number;
  class_octets: Array<WireClassUsage>;
  top_talkers: Array<WireTalkerUsage>;
  total_octets: number;
}

export type WireValue =
  | { Bool: boolean; }
  | { Int: number; }
  | { Float: number; }
  | { Text: string; }
  | { Bytes: Array<number>; }
  | { Timestamp: number; }
  | { Vector: Array<number>; };

export interface WireVtzAncestor {
  id: string;
  name: string;
}

export interface WireVtzCreate {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WireVtzSpec;
}

export interface WireVtzDelete {
  operator?: OperatorDelegation | null;
  request_id: number;
  vtz_id: string;
}

export interface WireVtzDestEdge {
  dest_class: string;
  vtz_id: string;
  weight: number;
}

export interface WireVtzDetail {
  ancestors: Array<WireVtzAncestor>;
  commit_version: number;
  zone?: WireVtzTreeNode | null;
}

export interface WireVtzDetailQuery {
  operator?: OperatorDelegation | null;
  request_id: number;
  vtz_id: string;
}

export interface WireVtzEdit {
  operator?: OperatorDelegation | null;
  request_id: number;
  spec: WireVtzSpec;
}

export interface WireVtzMutation {
  id: string;
  lifecycle: string;
}

export interface WireVtzNode {
  id: string;
  name: string;
  profile: string;
  risk: WireRiskBand;
}

export interface WireVtzRescope {
  new_name: string;
  operator?: OperatorDelegation | null;
  request_id: number;
  vtz_id: string;
}

export interface WireVtzSpec {
  description: string;
  lifecycle: string;
  micro_segmentation: boolean;
  name: string;
  own_postures: Array<WireDomainPosture>;
  reauth_interval_hours: number;
  telemetry: string;
  zone_type: string;
}

export interface WireVtzTree {
  nodes: Array<WireVtzTreeNode>;
  truncated: boolean;
}

export interface WireVtzTreeNode {
  effective_postures: Array<WireDomainPosture>;
  id: string;
  lifecycle: string;
  micro_segmentation: boolean;
  name: string;
  own_postures: Array<WireDomainPosture>;
  parent?: string | null;
  reauth_interval_hours: number;
  sub_zone_count: number;
  telemetry: string;
  zone_type: string;
}

export interface WireVtzTreeQuery {
  limit: number;
  operator?: OperatorDelegation | null;
  request_id: number;
}
