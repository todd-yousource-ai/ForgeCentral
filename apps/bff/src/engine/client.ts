// apps/bff/src/engine/client.ts -- the Crucible engine seam (F0.3).
//
// The one typed boundary the BFF uses to reach the Crucible engine, expressed over the shared wire DTOs
// (`@forge/contracts`). Every call is bounded: it takes a timeout and/or an AbortSignal, so no engine
// call can hang the BFF (CRAFTED "Timeouts are required on every operation that contacts an external
// system"). The concrete implementation is the enrolled mTLS `:7878` wire client (F0.3b); handlers and
// tests depend on this interface, not on a transport.

import type {
  WireAgentList,
  WireConnectionList,
  WireConnectivityGraph,
  WireConnectivityMembers,
  WireConnectivityQuery,
  WireContain,
  WireContainEffect,
  WireDecisionDetail,
  WireDecisionList,
  WireEntityConnections,
  WireEntityDecisions,
  WireGroupList,
  WireGroupSetMembers,
  WireGroupWrite,
  WireListAgents,
  WireListGroups,
  WireListPrincipals,
  WireIdamConfigure,
  WireIdamConnect,
  WireIdamConnectorList,
  WireIdamConnectors,
  WireIdamSync,
  WireIdamSyncStarted,
  WireObjectCatalog,
  WireObjectCreate,
  WireObjectDelete,
  WireObjectDetail,
  WireObjectDetailQuery,
  WireObjectEdit,
  WireObjectList,
  WireObjectMutated,
  WirePolicyCreate,
  WirePolicyDelete,
  WirePolicyDetail,
  WireDetectSummary,
  WireDetectSummaryQuery,
  WirePolicyDetailQuery,
  WireSocIncidentDetail,
  WireSocIncidentDetailQuery,
  WireSocIncidentList,
  WireSocIncidentListQuery,
  WireSocNarrative,
  WireSocNarrativeQuery,
  WirePolicyEdit,
  WirePolicyEffective,
  WirePolicyEffectiveQuery,
  WirePolicyList,
  WirePolicyListQuery,
  WirePolicyMutated,
  WirePolicyPublish,
  WireLugProvisioned,
  WirePrincipalCreate,
  WirePrincipalEdit,
  WirePrincipalList,
  WirePrincipalSetStatus,
  WireLogExplain,
  WireLogExport,
  WireLogExportEffect,
  WireLogQuery,
  WireMemberList,
  WireQueryRows,
  WireQuerySubmit,
  WireBundleCommit,
  WireBundleCommitted,
  WireBundleConvergence,
  WireBundleConvergenceQuery,
  WireVtzCreate,
  WireVtzDelete,
  WireVtzDetail,
  WireVtzDetailQuery,
  WireVtzEdit,
  WireVtzMutation,
  WireVtzRescope,
  WireVtzTree,
  WireVtzTreeQuery,
} from '@forge/contracts';

/** Per-call bounds. At least one of `timeoutMs`/`signal` should be set; the caller passes the config default. */
export interface EngineCallOptions {
  /** Abort the call after this many milliseconds. */
  readonly timeoutMs?: number;
  /** An external abort signal (e.g. the inbound request was cancelled). */
  readonly signal?: AbortSignal;
}

/** An opaque engine cursor/statement handle (a 32-byte value, carried as bytes). */
export type EngineHandle = readonly number[];

/** The engine operations the BFF brokers. Reads are CrucibleQL over `QuerySubmit`; paging via cursors. */
export interface CrucibleClient {
  /** Liveness/readiness probe: resolves iff the engine is reachable and the session is valid. */
  ping(opts?: EngineCallOptions): Promise<void>;
  /** Submit a parameterized CrucibleQL read; returns the first page (with a cursor if more remains). */
  querySubmit(request: WireQuerySubmit, opts?: EngineCallOptions): Promise<WireQueryRows>;
  /** List the agent-directory records for the session tenant (LIST_AGENTS, crdb ER.1). */
  listAgents(request: WireListAgents, opts?: EngineCallOptions): Promise<WireAgentList>;
  /** List the LUG principal directory for the session tenant (LIST_PRINCIPALS, crdb ER.6). */
  listPrincipals(request: WireListPrincipals, opts?: EngineCallOptions): Promise<WirePrincipalList>;
  /** List the LUG group directory for the session tenant (LIST_GROUPS, crdb ER.6). */
  listGroups(request: WireListGroups, opts?: EngineCallOptions): Promise<WireGroupList>;
  /** Create an enterprise group (GROUP_CREATE, crdb E3), audited. */
  groupCreate(request: WireGroupWrite, opts?: EngineCallOptions): Promise<WireLugProvisioned>;
  /** Edit an enterprise group's description (GROUP_EDIT, crdb E3), audited. */
  groupEdit(request: WireGroupWrite, opts?: EngineCallOptions): Promise<WireLugProvisioned>;
  /** Set an enterprise group's DIRECT subject membership (GROUP_SET_MEMBERS, crdb E3), audited. */
  groupSetMembers(
    request: WireGroupSetMembers,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Provision a local enterprise principal (PRINCIPAL_CREATE, crdb E3), audited. */
  principalCreate(
    request: WirePrincipalCreate,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Edit a local principal's enterprise fields (PRINCIPAL_EDIT, crdb E3), audited. */
  principalEdit(request: WirePrincipalEdit, opts?: EngineCallOptions): Promise<WireLugProvisioned>;
  /** Transition a local principal's lifecycle (PRINCIPAL_SET_STATUS, crdb E3), audited. */
  principalSetStatus(
    request: WirePrincipalSetStatus,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** List the tenant's named-object catalog (OBJECT_LIST, crdb OB.3). */
  objectList(request: WireObjectList, opts?: EngineCallOptions): Promise<WireObjectCatalog>;
  /** List the tenant's External IDAM connectors (IDAM_CONNECTORS, crdb IA.8). */
  idamConnectors(
    request: WireIdamConnectors,
    opts?: EngineCallOptions,
  ): Promise<WireIdamConnectorList>;
  /** Trigger a federation sync for one connector (IDAM_SYNC, crdb IA.8); an ACK, not a result. */
  idamSync(request: WireIdamSync, opts?: EngineCallOptions): Promise<WireIdamSyncStarted>;
  /** Set a connector's connectivity + secret reference (IDAM_CONNECT, crdb CO.1); audited, applied live. */
  idamConnect(request: WireIdamConnect, opts?: EngineCallOptions): Promise<WireLugProvisioned>;
  /** Set a connector's runtime knobs -- enabled + the two cadences (IDAM_CONFIGURE, crdb IA.8); audited. */
  idamConfigure(request: WireIdamConfigure, opts?: EngineCallOptions): Promise<WireLugProvisioned>;
  /** Read one named object + its resolved members (OBJECT_DETAIL, crdb OB.3). */
  objectDetail(request: WireObjectDetailQuery, opts?: EngineCallOptions): Promise<WireObjectDetail>;
  /** Read the tenant's SOC detection summary (DETECT_SUMMARY, crdb FV.6): the KPI totals + the
   * per-technique ATT&CK breakdown, projected from the same assembly the admin surface serves. */
  detectSummary(
    request: WireDetectSummaryQuery,
    opts?: EngineCallOptions,
  ): Promise<WireDetectSummary>;
  /** Read the ranked SOC decision queue (SOC_INCIDENT_LIST, crdb SS.4b): ordered by what an incident
   * needs from a human, refuse-not-truncate at its ceiling, tenant-private. */
  socIncidentList(
    request: WireSocIncidentListQuery,
    opts?: EngineCallOptions,
  ): Promise<WireSocIncidentList>;
  /** Read one incident assembled (SOC_INCIDENT_DETAIL, crdb SS.4b): lineage + evidence + plan +
   * narrative reference in ONE answer, so no two panels can disagree. An unknown, foreign, or
   * over-clearance incident returns the SAME refusal flag. */
  socIncidentDetail(
    request: WireSocIncidentDetailQuery,
    opts?: EngineCallOptions,
  ): Promise<WireSocIncidentDetail>;
  /** Read one incident's recorded verdict narrative (SOC_NARRATIVE, crdb VN.7b). A READ, never a
   * trigger: opening an incident must not cause generation. */
  socNarrative(request: WireSocNarrativeQuery, opts?: EngineCallOptions): Promise<WireSocNarrative>;
  /** Read the tenant's authored policies grouped by zone (POLICY_LIST_BY_ZONE, crdb PS.5): draft +
   * published, each at its newest version, bounded and tenant-private. */
  policyListByZone(request: WirePolicyListQuery, opts?: EngineCallOptions): Promise<WirePolicyList>;
  /** Read one policy's full definition + version history (POLICY_DETAIL, crdb PS.5). An unknown id
   * returns an empty detail (no record, no versions), never an error. */
  policyDetail(request: WirePolicyDetailQuery, opts?: EngineCallOptions): Promise<WirePolicyDetail>;
  /** Read the zone's effective published policies (POLICY_EFFECTIVE, crdb P5.5 = the PS.7 composer
   * seam): newest published per policy, producer-expiry-admitted engine-side. The distribution
   * producer's read. */
  policyEffective(
    request: WirePolicyEffectiveQuery,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyEffective>;
  /** Author a new policy (POLICY_CREATE, crdb PS.6): the store mints v1.0.0 as a Draft. Audited. */
  policyCreate(request: WirePolicyCreate, opts?: EngineCallOptions): Promise<WirePolicyMutated>;
  /** Edit a policy into a new Draft version without mutating a published one (POLICY_EDIT, PS.6). Audited. */
  policyEdit(request: WirePolicyEdit, opts?: EngineCallOptions): Promise<WirePolicyMutated>;
  /** Publish a version atomically; a breaking publish is flagged (POLICY_PUBLISH, PS.6). Audited. */
  policyPublish(request: WirePolicyPublish, opts?: EngineCallOptions): Promise<WirePolicyMutated>;
  /** Delete a policy (tombstone; history preserved) (POLICY_DELETE, PS.6). Audited. */
  policyDelete(request: WirePolicyDelete, opts?: EngineCallOptions): Promise<WirePolicyMutated>;
  /** Register a named object (OBJECT_CREATE, crdb OB.4), audited. */
  objectCreate(request: WireObjectCreate, opts?: EngineCallOptions): Promise<WireObjectMutated>;
  /** Edit a named object's definition (OBJECT_EDIT, crdb OB.4), audited. */
  objectEdit(request: WireObjectEdit, opts?: EngineCallOptions): Promise<WireObjectMutated>;
  /** Delete a named object (OBJECT_DELETE, crdb OB.4), audited. */
  objectDelete(request: WireObjectDelete, opts?: EngineCallOptions): Promise<WireObjectMutated>;
  /** List an entity's recent governed decisions (ENTITY_DECISIONS, crdb ER.2c). */
  entityDecisions(
    request: WireEntityDecisions,
    opts?: EngineCallOptions,
  ): Promise<WireDecisionList>;
  /** List a subject's outbound network connections (ENTITY_CONNECTIONS, crdb ER.5). */
  entityConnections(
    request: WireEntityConnections,
    opts?: EngineCallOptions,
  ): Promise<WireConnectionList>;
  /** Read the tenant-wide connectivity aggregation (CONNECTIVITY_GRAPH, crdb IP-CONSOLE-CONNECTIVITY
   * CN.2): a bounded, tenant-wide roll-up of the LEG `ConnectsTo` graph into source-class/destination-class
   * nodes + weighted edges + a risk band, aggregated engine-side. */
  connectivityGraph(
    request: WireConnectivityQuery,
    opts?: EngineCallOptions,
  ): Promise<WireConnectivityGraph>;
  /** List the distinct member entities of one connectivity class (CONNECTIVITY_MEMBERS, crdb
   * IP-CONSOLE-01 O1.6b): the members of a clicked Sankey container, each with its outbound-connection
   * count, bounded top-N engine-side. */
  connectivityMembers(
    request: WireConnectivityMembers,
    opts?: EngineCallOptions,
  ): Promise<WireMemberList>;
  /** Issue an operator containment disposition (CONTAIN, crdb IP-CONTAIN-COMMAND): record a
   * `Quarantine`/`Deny` on a subject through the audited path. Returns the honest effect
   * (`enforcement_active` is `false` today, AG.7). A data-plane write, honored under the peer's
   * Delegation grant. */
  contain(request: WireContain, opts?: EngineCallOptions): Promise<WireContainEffect>;
  /** Read the tenant-wide decision LOG (LOG_QUERY, crdb IP-CONSOLE-LOG-QUERY LQ.2): a filtered,
   * time-ranged, searchable read, newest-first and bounded, filtered engine-side. */
  logQuery(request: WireLogQuery, opts?: EngineCallOptions): Promise<WireDecisionList>;
  /** Explain one governed decision by id (LOG_EXPLAIN, crdb LQ.3): the full decision detail. */
  logExplain(request: WireLogExplain, opts?: EngineCallOptions): Promise<WireDecisionDetail>;
  /** Export the filtered decision LOG (LOG_EXPORT, crdb LQ.4): the rows + an audited receipt (an
   * audited data-plane write; the receipt lands on the TRD-04 audit chain). */
  logExport(request: WireLogExport, opts?: EngineCallOptions): Promise<WireLogExportEffect>;
  /** Read the tenant's Virtual Trust Zone tree (VTZ_TREE, crdb IP-CONSOLE-VTZ-SUBSTRATE VZ.3b): every
   * zone with its own + effective (tighten-only composed) per-domain postures, archetype, lifecycle, and
   * direct-child count, bounded engine-side. The VTZ store is the system of record; the Console reads it. */
  vtzTree(request: WireVtzTreeQuery, opts?: EngineCallOptions): Promise<WireVtzTree>;
  /** Read one zone plus the ancestor chain contributing to its effective posture (VTZ_DETAIL, crdb
   * VZ.3b). An id naming no zone in the tenant returns an absent zone, not an error. */
  vtzDetail(request: WireVtzDetailQuery, opts?: EngineCallOptions): Promise<WireVtzDetail>;
  /** Author a new trust zone (VTZ_CREATE, crdb VZ.4b). An audited write: the engine re-validates the
   * name, the catastrophic floor, and tighten-only inheritance, commits through the Committer, and
   * refuses rather than silently correcting. */
  /** Commit a signed policy bundle for carriage (BUNDLE_COMMIT, FD.2). Audited engine-side. */
  bundleCommit(request: WireBundleCommit, opts?: EngineCallOptions): Promise<WireBundleCommitted>;
  /** Read a zone bundle's endpoint convergence (BUNDLE_CONVERGENCE, FD.7c). Tenant-scoped read. */
  bundleConvergence(
    request: WireBundleConvergenceQuery,
    opts?: EngineCallOptions,
  ): Promise<WireBundleConvergence>;
  vtzCreate(request: WireVtzCreate, opts?: EngineCallOptions): Promise<WireVtzMutation>;
  /** Edit a zone's own postures + settings, incl. the draft -> published transition (VTZ_EDIT). Audited. */
  vtzEdit(request: WireVtzEdit, opts?: EngineCallOptions): Promise<WireVtzMutation>;
  /** Re-scope a zone: a rename, since the dotted name IS the hierarchy (VTZ_RESCOPE). Audited. */
  vtzRescope(request: WireVtzRescope, opts?: EngineCallOptions): Promise<WireVtzMutation>;
  /** Delete a zone (VTZ_DELETE). Audited; the engine refuses a zone that still has children. */
  vtzDelete(request: WireVtzDelete, opts?: EngineCallOptions): Promise<WireVtzMutation>;
  /** Fetch the next page for an open cursor. */
  cursorFetch(handle: EngineHandle, opts?: EngineCallOptions): Promise<WireQueryRows>;
  /** Close an open cursor (releases engine-side resources). */
  cursorClose(handle: EngineHandle, opts?: EngineCallOptions): Promise<void>;
  /** Close the underlying transport (graceful shutdown). */
  close(): Promise<void>;
}
