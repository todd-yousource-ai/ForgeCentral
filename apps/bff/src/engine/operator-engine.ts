// apps/bff/src/engine/operator-engine.ts -- the authenticated engine facade (F0.5b).
//
// Surfaces reach the engine ONLY through this facade, and every method requires an `OperatorPrincipal`:
// the BFF cannot broker a read without naming the operator it is for (INV-CONSOLE-ENGINE-AUTHZ, enforced
// at the type level). Each brokered call is recorded as a delegation -- who acted, at what tier, doing
// what -- before it runs, so an attempt is always traced even if the engine refuses it.
//
// Scope note (INV-CROSS, design decision D3): this facade injects `OperatorDelegation { principal, tenant }`
// onto every wire request, and the engine narrows the read to that operator + tenant -- gated by the
// console peer's `Delegation` grant, and refusing a reserved service tenant (IP-CONSOLE-CONTROL-PLANE C4).
// Per D3 the operator -> tenant mapping stays OWNED BY ForgeCentral (resolved at login by its RBAC): the
// engine trusts the Delegation-granted broker rather than verifying a signed per-operator assertion. This
// facade is the BFF's mandatory delegation boundary + trace, and the source of the wire delegation.

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
  WirePolicyDetailQuery,
  WirePolicyEdit,
  WirePolicyEffective,
  WirePolicyEffectiveQuery,
  WirePolicyList,
  WirePolicyListQuery,
  WirePolicyMutated,
  WirePolicyPublish,
  WireListGroups,
  WireListPrincipals,
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

import type { ExplainTier } from '../auth/tier.js';
import type { CrucibleClient, EngineCallOptions, EngineHandle } from './client.js';
import type { OperatorPrincipal } from './principal.js';

/** The engine actions a surface brokers on behalf of an operator. */
export type EngineAction =
  | 'querySubmit'
  | 'listAgents'
  | 'listPrincipals'
  | 'listGroups'
  | 'objectList'
  | 'objectDetail'
  | 'policyListByZone'
  | 'policyDetail'
  | 'policyEffective'
  | 'policyCreate'
  | 'policyEdit'
  | 'policyPublish'
  | 'policyDelete'
  | 'idamConnectors'
  | 'idamSync'
  | 'idamConnect'
  | 'idamConfigure'
  | 'objectCreate'
  | 'objectEdit'
  | 'objectDelete'
  | 'groupCreate'
  | 'groupEdit'
  | 'groupSetMembers'
  | 'principalCreate'
  | 'principalEdit'
  | 'principalSetStatus'
  | 'entityDecisions'
  | 'entityConnections'
  | 'connectivityGraph'
  | 'connectivityMembers'
  | 'contain'
  | 'logQuery'
  | 'logExplain'
  | 'logExport'
  | 'vtzTree'
  | 'vtzDetail'
  | 'vtzCreate'
  | 'bundleCommit'
  | 'bundleConvergence'
  | 'vtzEdit'
  | 'vtzRescope'
  | 'vtzDelete'
  | 'cursorFetch'
  | 'cursorClose';

/** A record of one engine call the BFF made on behalf of an operator. */
export interface EngineDelegation {
  readonly operator: string;
  readonly tier: ExplainTier;
  readonly action: EngineAction;
  /** The CrucibleQL request id, for a querySubmit. */
  readonly requestId?: number;
  /** The operator's resolved tenant the delegation scopes the read to. */
  readonly tenant?: string;
}

/** Where delegations are recorded. The default writes a structured line to the logger. */
export interface DelegationSink {
  record(delegation: EngineDelegation): void;
}

/** A structural view of the logger the default sink needs. */
export interface DelegationLogger {
  info: (obj: unknown, msg?: string) => void;
}

/** A delegation sink that writes a structured `engine delegation` line to the logger. */
export function loggerDelegationSink(log: DelegationLogger): DelegationSink {
  return {
    record: (delegation) => {
      log.info({ delegation }, 'engine delegation');
    },
  };
}

/** The engine, brokered on behalf of an operator. Every call names the Principal it is for. */
export interface OperatorEngine {
  /** Submit a parameterized CrucibleQL read on behalf of `principal`. */
  querySubmit(
    principal: OperatorPrincipal,
    request: WireQuerySubmit,
    opts?: EngineCallOptions,
  ): Promise<WireQueryRows>;
  /** List the agent directory (LIST_AGENTS) on behalf of `principal`. */
  listAgents(
    principal: OperatorPrincipal,
    request: WireListAgents,
    opts?: EngineCallOptions,
  ): Promise<WireAgentList>;
  /** List the LUG principal directory (LIST_PRINCIPALS) on behalf of `principal`. */
  listPrincipals(
    principal: OperatorPrincipal,
    request: WireListPrincipals,
    opts?: EngineCallOptions,
  ): Promise<WirePrincipalList>;
  /** List the LUG group directory (LIST_GROUPS) on behalf of `principal`. */
  listGroups(
    principal: OperatorPrincipal,
    request: WireListGroups,
    opts?: EngineCallOptions,
  ): Promise<WireGroupList>;
  /** Create an enterprise group (GROUP_CREATE) on behalf of `principal`, audited. */
  groupCreate(
    principal: OperatorPrincipal,
    request: WireGroupWrite,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** List the named-object catalog (OBJECT_LIST) on behalf of `principal`. */
  objectList(
    principal: OperatorPrincipal,
    request: WireObjectList,
    opts?: EngineCallOptions,
  ): Promise<WireObjectCatalog>;
  /** List the External IDAM connectors (IDAM_CONNECTORS) on behalf of `principal`. */
  idamConnectors(
    principal: OperatorPrincipal,
    request: WireIdamConnectors,
    opts?: EngineCallOptions,
  ): Promise<WireIdamConnectorList>;
  /** Trigger a connector federation sync (IDAM_SYNC) on behalf of `principal`; audited. */
  idamSync(
    principal: OperatorPrincipal,
    request: WireIdamSync,
    opts?: EngineCallOptions,
  ): Promise<WireIdamSyncStarted>;
  /** Set a connector's connectivity + secret ref (IDAM_CONNECT) on behalf of `principal`; audited. */
  idamConnect(
    principal: OperatorPrincipal,
    request: WireIdamConnect,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Set a connector's enabled + cadences (IDAM_CONFIGURE) on behalf of `principal`; audited. */
  idamConfigure(
    principal: OperatorPrincipal,
    request: WireIdamConfigure,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Read one object + its members (OBJECT_DETAIL) on behalf of `principal`. */
  objectDetail(
    principal: OperatorPrincipal,
    request: WireObjectDetailQuery,
    opts?: EngineCallOptions,
  ): Promise<WireObjectDetail>;
  /** Read the tenant's policies grouped by zone (POLICY_LIST_BY_ZONE, PS.5) on behalf of `principal`. */
  policyListByZone(
    principal: OperatorPrincipal,
    request: WirePolicyListQuery,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyList>;
  /** Read one policy's definition + version history (POLICY_DETAIL, PS.5) on behalf of `principal`. */
  policyDetail(
    principal: OperatorPrincipal,
    request: WirePolicyDetailQuery,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyDetail>;
  /** Read the zone's effective published policies (POLICY_EFFECTIVE, P5.5) on behalf of `principal`. */
  policyEffective(
    principal: OperatorPrincipal,
    request: WirePolicyEffectiveQuery,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyEffective>;
  /** Author a new policy draft (POLICY_CREATE, PS.6) on behalf of `principal`, audited. */
  policyCreate(
    principal: OperatorPrincipal,
    request: WirePolicyCreate,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyMutated>;
  /** Edit a policy into a new draft version (POLICY_EDIT, PS.6) on behalf of `principal`, audited. */
  policyEdit(
    principal: OperatorPrincipal,
    request: WirePolicyEdit,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyMutated>;
  /** Publish a policy version (POLICY_PUBLISH, PS.6) on behalf of `principal`, audited. */
  policyPublish(
    principal: OperatorPrincipal,
    request: WirePolicyPublish,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyMutated>;
  /** Delete a policy (POLICY_DELETE, PS.6) on behalf of `principal`, audited. */
  policyDelete(
    principal: OperatorPrincipal,
    request: WirePolicyDelete,
    opts?: EngineCallOptions,
  ): Promise<WirePolicyMutated>;
  /** Register a named object (OBJECT_CREATE) on behalf of `principal`, audited. */
  objectCreate(
    principal: OperatorPrincipal,
    request: WireObjectCreate,
    opts?: EngineCallOptions,
  ): Promise<WireObjectMutated>;
  /** Edit a named object (OBJECT_EDIT) on behalf of `principal`, audited. */
  objectEdit(
    principal: OperatorPrincipal,
    request: WireObjectEdit,
    opts?: EngineCallOptions,
  ): Promise<WireObjectMutated>;
  /** Delete a named object (OBJECT_DELETE) on behalf of `principal`, audited. */
  objectDelete(
    principal: OperatorPrincipal,
    request: WireObjectDelete,
    opts?: EngineCallOptions,
  ): Promise<WireObjectMutated>;
  /** Edit an enterprise group (GROUP_EDIT) on behalf of `principal`, audited. */
  groupEdit(
    principal: OperatorPrincipal,
    request: WireGroupWrite,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Set an enterprise group's membership (GROUP_SET_MEMBERS) on behalf of `principal`, audited. */
  groupSetMembers(
    principal: OperatorPrincipal,
    request: WireGroupSetMembers,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Provision a local principal (PRINCIPAL_CREATE) on behalf of `principal`, audited. */
  principalCreate(
    principal: OperatorPrincipal,
    request: WirePrincipalCreate,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Edit a local principal (PRINCIPAL_EDIT) on behalf of `principal`, audited. */
  principalEdit(
    principal: OperatorPrincipal,
    request: WirePrincipalEdit,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** Transition a local principal's lifecycle (PRINCIPAL_SET_STATUS), audited. */
  principalSetStatus(
    principal: OperatorPrincipal,
    request: WirePrincipalSetStatus,
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned>;
  /** List an entity's recent decisions (ENTITY_DECISIONS) on behalf of `principal`. */
  entityDecisions(
    principal: OperatorPrincipal,
    request: WireEntityDecisions,
    opts?: EngineCallOptions,
  ): Promise<WireDecisionList>;
  /** List a subject's outbound connections (ENTITY_CONNECTIONS) on behalf of `principal`. */
  entityConnections(
    principal: OperatorPrincipal,
    request: WireEntityConnections,
    opts?: EngineCallOptions,
  ): Promise<WireConnectionList>;
  /** Read the tenant-wide connectivity aggregation (CONNECTIVITY_GRAPH) on behalf of `principal`. */
  connectivityGraph(
    principal: OperatorPrincipal,
    request: WireConnectivityQuery,
    opts?: EngineCallOptions,
  ): Promise<WireConnectivityGraph>;
  /** List the member entities of one connectivity class (CONNECTIVITY_MEMBERS) on behalf of `principal`. */
  connectivityMembers(
    principal: OperatorPrincipal,
    request: WireConnectivityMembers,
    opts?: EngineCallOptions,
  ): Promise<WireMemberList>;
  /** Issue an operator containment disposition (CONTAIN) on behalf of `principal`. The operator
   * delegation is set from `principal` server-side (never client-asserted), honored under the peer's
   * Delegation grant; returns the honest effect (`enforcement_active` false today). */
  contain(
    principal: OperatorPrincipal,
    request: WireContain,
    opts?: EngineCallOptions,
  ): Promise<WireContainEffect>;
  /** Read the tenant-wide decision LOG (LOG_QUERY) on behalf of `principal`. */
  logQuery(
    principal: OperatorPrincipal,
    request: WireLogQuery,
    opts?: EngineCallOptions,
  ): Promise<WireDecisionList>;
  /** Explain one governed decision by id (LOG_EXPLAIN) on behalf of `principal`. */
  logExplain(
    principal: OperatorPrincipal,
    request: WireLogExplain,
    opts?: EngineCallOptions,
  ): Promise<WireDecisionDetail>;
  /** Export the filtered decision LOG (LOG_EXPORT) on behalf of `principal` (an audited write). */
  logExport(
    principal: OperatorPrincipal,
    request: WireLogExport,
    opts?: EngineCallOptions,
  ): Promise<WireLogExportEffect>;
  /** Read the tenant's VTZ tree (VTZ_TREE) on behalf of `principal`. */
  vtzTree(
    principal: OperatorPrincipal,
    request: WireVtzTreeQuery,
    opts?: EngineCallOptions,
  ): Promise<WireVtzTree>;
  /** Read one zone + its effective-posture ancestors (VTZ_DETAIL) on behalf of `principal`. */
  vtzDetail(
    principal: OperatorPrincipal,
    request: WireVtzDetailQuery,
    opts?: EngineCallOptions,
  ): Promise<WireVtzDetail>;
  /** Commit a signed policy bundle for carriage (BUNDLE_COMMIT, FD.2) on behalf of `principal`. */
  bundleCommit(
    principal: OperatorPrincipal,
    request: WireBundleCommit,
    opts?: EngineCallOptions,
  ): Promise<WireBundleCommitted>;
  /** Read a zone bundle's endpoint convergence (BUNDLE_CONVERGENCE, FD.7c) on behalf of `principal`. */
  bundleConvergence(
    principal: OperatorPrincipal,
    request: WireBundleConvergenceQuery,
    opts?: EngineCallOptions,
  ): Promise<WireBundleConvergence>;
  /** Author a new zone (VTZ_CREATE) on behalf of `principal`. Audited engine-side. */
  vtzCreate(
    principal: OperatorPrincipal,
    request: WireVtzCreate,
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation>;
  /** Edit a zone (VTZ_EDIT) on behalf of `principal`. Audited engine-side. */
  vtzEdit(
    principal: OperatorPrincipal,
    request: WireVtzEdit,
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation>;
  /** Re-scope a zone (VTZ_RESCOPE) on behalf of `principal`. Audited engine-side. */
  vtzRescope(
    principal: OperatorPrincipal,
    request: WireVtzRescope,
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation>;
  /** Delete a zone (VTZ_DELETE) on behalf of `principal`. Audited engine-side. */
  vtzDelete(
    principal: OperatorPrincipal,
    request: WireVtzDelete,
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation>;
  /** Fetch the next page of an open cursor on behalf of `principal`. */
  cursorFetch(
    principal: OperatorPrincipal,
    handle: EngineHandle,
    opts?: EngineCallOptions,
  ): Promise<WireQueryRows>;
  /** Close an open cursor on behalf of `principal`. */
  cursorClose(
    principal: OperatorPrincipal,
    handle: EngineHandle,
    opts?: EngineCallOptions,
  ): Promise<void>;
}

function delegationFor(
  principal: OperatorPrincipal,
  action: EngineAction,
  requestId?: number,
): EngineDelegation {
  return {
    operator: principal.subject,
    tier: principal.tier,
    action,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(principal.tenant !== undefined ? { tenant: principal.tenant } : {}),
  };
}

/** Build the operator-scoped engine facade over the raw client + a delegation sink. */
export function createOperatorEngine(
  client: CrucibleClient,
  delegation: DelegationSink,
): OperatorEngine {
  return {
    querySubmit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'querySubmit', request.request_id));
      // Inject the operator delegation (F0.5c): the engine runs this read as the operator, in the
      // operator's tenant, honored under the peer's Delegation grant. Overrides any operator already on
      // the request -- the BFF, not the caller, is the authority on who the read is for.
      const delegated: WireQuerySubmit = {
        ...request,
        operator: { principal: principal.principalId, tenant: principal.tenant },
      };
      return client.querySubmit(delegated, opts);
    },
    listAgents: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'listAgents', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.listAgents({ ...request, operator }, opts);
    },
    listPrincipals: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'listPrincipals', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.listPrincipals({ ...request, operator }, opts);
    },
    listGroups: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'listGroups', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.listGroups({ ...request, operator }, opts);
    },
    groupCreate: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'groupCreate', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.groupCreate({ ...request, operator }, opts);
    },
    objectList: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'objectList', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.objectList({ ...request, operator }, opts);
    },
    idamConnectors: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'idamConnectors', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.idamConnectors({ ...request, operator }, opts);
    },
    idamSync: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'idamSync', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.idamSync({ ...request, operator }, opts);
    },
    idamConnect: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'idamConnect', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.idamConnect({ ...request, operator }, opts);
    },
    idamConfigure: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'idamConfigure', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.idamConfigure({ ...request, operator }, opts);
    },
    objectDetail: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'objectDetail', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.objectDetail({ ...request, operator }, opts);
    },
    policyListByZone: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyListByZone', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyListByZone({ ...request, operator }, opts);
    },
    policyDetail: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyDetail', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyDetail({ ...request, operator }, opts);
    },
    policyEffective: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyEffective', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyEffective({ ...request, operator }, opts);
    },
    // The four audited policy commands. The operator delegation is injected from the authenticated
    // principal (never client-asserted): the engine attributes the audit entry to THIS operator, in THIS
    // tenant, under the peer's Delegation grant.
    policyCreate: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyCreate', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyCreate({ ...request, operator }, opts);
    },
    policyEdit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyEdit', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyEdit({ ...request, operator }, opts);
    },
    policyPublish: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyPublish', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyPublish({ ...request, operator }, opts);
    },
    policyDelete: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'policyDelete', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.policyDelete({ ...request, operator }, opts);
    },
    objectCreate: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'objectCreate', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.objectCreate({ ...request, operator }, opts);
    },
    objectEdit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'objectEdit', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.objectEdit({ ...request, operator }, opts);
    },
    objectDelete: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'objectDelete', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.objectDelete({ ...request, operator }, opts);
    },
    groupEdit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'groupEdit', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.groupEdit({ ...request, operator }, opts);
    },
    groupSetMembers: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'groupSetMembers', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.groupSetMembers({ ...request, operator }, opts);
    },
    principalCreate: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'principalCreate', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.principalCreate({ ...request, operator }, opts);
    },
    principalEdit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'principalEdit', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.principalEdit({ ...request, operator }, opts);
    },
    principalSetStatus: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'principalSetStatus', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.principalSetStatus({ ...request, operator }, opts);
    },
    entityDecisions: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'entityDecisions', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.entityDecisions({ ...request, operator }, opts);
    },
    entityConnections: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'entityConnections', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.entityConnections({ ...request, operator }, opts);
    },
    connectivityGraph: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'connectivityGraph', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.connectivityGraph({ ...request, operator }, opts);
    },
    connectivityMembers: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'connectivityMembers', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.connectivityMembers({ ...request, operator }, opts);
    },
    contain: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'contain'));
      // Inject the operator delegation from the authenticated principal (never client-asserted): the
      // engine attributes the disposition to this operator, in this tenant, under the peer's Delegation
      // grant. Overrides any operator already on the request -- the BFF is the authority on who acts.
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.contain({ ...request, operator }, opts);
    },
    logQuery: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'logQuery', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.logQuery({ ...request, operator }, opts);
    },
    logExplain: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'logExplain', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.logExplain({ ...request, operator }, opts);
    },
    logExport: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'logExport', request.query.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.logExport({ ...request, operator }, opts);
    },
    vtzTree: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'vtzTree', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.vtzTree({ ...request, operator }, opts);
    },
    vtzDetail: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'vtzDetail', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.vtzDetail({ ...request, operator }, opts);
    },
    // The four audited zone mutations. The operator delegation is injected from the authenticated
    // principal, never client-asserted: the engine attributes the audit entry to THIS operator, in THIS
    // tenant, under the peer's Delegation grant.
    bundleCommit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'bundleCommit', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.bundleCommit({ ...request, operator }, opts);
    },
    // A tenant-scoped read: the operator delegation is injected server-side like every other read.
    bundleConvergence: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'bundleConvergence', request.request_id));
      return client.bundleConvergence(request, opts);
    },
    vtzCreate: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'vtzCreate', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.vtzCreate({ ...request, operator }, opts);
    },
    vtzEdit: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'vtzEdit', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.vtzEdit({ ...request, operator }, opts);
    },
    vtzRescope: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'vtzRescope', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.vtzRescope({ ...request, operator }, opts);
    },
    vtzDelete: (principal, request, opts) => {
      delegation.record(delegationFor(principal, 'vtzDelete', request.request_id));
      const operator = { principal: principal.principalId, tenant: principal.tenant };
      return client.vtzDelete({ ...request, operator }, opts);
    },
    cursorFetch: (principal, handle, opts) => {
      delegation.record(delegationFor(principal, 'cursorFetch'));
      return client.cursorFetch(handle, opts);
    },
    cursorClose: (principal, handle, opts) => {
      delegation.record(delegationFor(principal, 'cursorClose'));
      return client.cursorClose(handle, opts);
    },
  };
}
