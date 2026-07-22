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
  WireObjectCatalog,
  WireObjectDetail,
  WireObjectDetailQuery,
  WireObjectList,
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
  /** Read one named object + its resolved members (OBJECT_DETAIL, crdb OB.3). */
  objectDetail(request: WireObjectDetailQuery, opts?: EngineCallOptions): Promise<WireObjectDetail>;
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
