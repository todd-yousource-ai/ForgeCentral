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
  WireListAgents,
  WireLogExplain,
  WireLogExport,
  WireLogExportEffect,
  WireLogQuery,
  WireMemberList,
  WireQueryRows,
  WireQuerySubmit,
  WireBundleCommit,
  WireBundleCommitted,
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
