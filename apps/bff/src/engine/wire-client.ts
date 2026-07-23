// apps/bff/src/engine/wire-client.ts -- the engine wire client over the crypto sidecar (F0.3b, revised CS.4).
//
// The production `CrucibleClient`: a native client of the Crucible wire protocol, built on @forge/wire (the
// frame/CBOR/handshake/transport stack proven byte-exact against crdb). It dials the AWS-LC crypto sidecar
// over a plaintext LOOPBACK socket; the sidecar originates the mTLS to the engine on :7878, so Node performs
// no TLS (INV-CONSOLE-CRYPTO-AWSLC). It connects lazily (on the first call), completes the reactor
// handshake, and dispatches operations.
//
// INV-CONSOLE-ENGINE-KEEPALIVE: the connection ACTIVELY stays live, and never fails open. A background
// heartbeat sends a PING within the engine session-lease window (TRD-04a 3.1: a client that does not
// heartbeat within the window has its connection closed by the engine); any transport failure (a lapsed
// lease, an engine restart, a dropped socket) INVALIDATES the cached transport so the next call transparently
// reconnects and retries once; and `ping` performs a real PING/PONG round-trip, so readiness reflects true
// reachability and fails CLOSED (a dead link reads not-ready, never a stale "ready"). All transport ops
// (dispatch + heartbeat) are serialized so frames never interleave on stream 0.

import {
  type FrameTransport,
  connectLoopback,
  dispatch,
  heartbeat,
  wireHandshake,
} from '@forge/wire';
import type {
  WireAgentList,
  WireGroupList,
  WireIdamConnectorList,
  WireIdamSyncStarted,
  WireLugProvisioned,
  WireObjectCatalog,
  WireObjectDetail,
  WireObjectMutated,
  WirePrincipalList,
  WireConnectionList,
  WireConnectivityGraph,
  WireContainEffect,
  WireDecisionDetail,
  WireDecisionList,
  WireLogExportEffect,
  WireError,
  WireMemberList,
  WireQueryRows,
  WireReply,
  WireVtzDetail,
  WireBundleCommitted,
  WireBundleConvergence,
  WireVtzMutation,
  WireVtzTree,
} from '@forge/contracts';

import type { BffConfig } from '../config.js';
import type { CrucibleClient, EngineCallOptions, EngineHandle } from './client.js';

/** Thrown when the engine refuses an operation (a decoded `WireReply::Refused`). */
export class EngineRefusedError extends Error {
  constructor(readonly wireError: WireError) {
    super(`engine refused the operation (${wireError.class}, code ${String(wireError.code)})`);
    this.name = 'EngineRefusedError';
  }
}

/** Establish a ready (post-handshake) transport to the engine. Injectable for tests. */
export type EngineConnector = (config: BffConfig) => Promise<FrameTransport>;

/** The production connector: a plaintext loopback dial to the sidecar egress + the reactor handshake. The
 * sidecar originates the mTLS to the engine on :7878 (Node performs no TLS; INV-CONSOLE-CRYPTO-AWSLC). */
async function connectEngine(config: BffConfig): Promise<FrameTransport> {
  const transport = await connectLoopback({
    host: config.engineHost,
    port: config.enginePort,
  });
  await wireHandshake(transport);
  return transport;
}

/** Map an engine `WireReply` to `WireQueryRows`, throwing a typed error on a refusal or other reply. */
export function replyToQueryRows(reply: WireReply): WireQueryRows {
  if (typeof reply === 'object' && 'QueryRows' in reply) return reply.QueryRows;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a query');
}

/** Map an engine `WireReply` to `WireAgentList` (LIST_AGENTS), throwing a typed error on a refusal. */
export function replyToAgentList(reply: WireReply): WireAgentList {
  if (typeof reply === 'object' && 'AgentList' in reply) return reply.AgentList;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a list-agents read');
}

/** Map an engine `WireReply` to `WirePrincipalList` (LIST_PRINCIPALS, crdb ER.6). */
export function replyToPrincipalList(reply: WireReply): WirePrincipalList {
  if (typeof reply === 'object' && 'PrincipalList' in reply) return reply.PrincipalList;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a list-principals read');
}

/** Map an engine `WireReply` to `WireGroupList` (LIST_GROUPS, crdb ER.6). */
export function replyToGroupList(reply: WireReply): WireGroupList {
  if (typeof reply === 'object' && 'GroupList' in reply) return reply.GroupList;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a list-groups read');
}

/** Map an engine `WireReply` to `WireLugProvisioned` (the E3 provisioning ack). */
export function replyToLugProvisioned(reply: WireReply): WireLugProvisioned {
  if (typeof reply === 'object' && 'LugProvisioned' in reply) return reply.LugProvisioned;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a provisioning command');
}

/** Map an engine `WireReply` to `WireObjectCatalog` (OBJECT_LIST, crdb OB.3). */
export function replyToObjectCatalog(reply: WireReply): WireObjectCatalog {
  if (typeof reply === 'object' && 'ObjectCatalog' in reply) return reply.ObjectCatalog;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an object-list read');
}

/** Map an engine `WireReply` to `WireIdamConnectorList` (IDAM_CONNECTORS, crdb IA.8). */
export function replyToIdamConnectors(reply: WireReply): WireIdamConnectorList {
  if (typeof reply === 'object' && 'IdamConnectors' in reply) return reply.IdamConnectors;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an idam-connectors read');
}

/** Map an engine `WireReply` to `WireIdamSyncStarted` (IDAM_SYNC, crdb IA.8). */
export function replyToIdamSyncStarted(reply: WireReply): WireIdamSyncStarted {
  if (typeof reply === 'object' && 'IdamSyncStarted' in reply) return reply.IdamSyncStarted;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an idam-sync command');
}

/** Map an engine `WireReply` to `WireObjectMutated` (an OB.4 object command ack). */
export function replyToObjectMutated(reply: WireReply): WireObjectMutated {
  if (typeof reply === 'object' && 'ObjectMutated' in reply) return reply.ObjectMutated;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an object command');
}

/** Map an engine `WireReply` to `WireObjectDetail` (OBJECT_DETAIL, crdb OB.3). */
export function replyToObjectDetail(reply: WireReply): WireObjectDetail {
  if (typeof reply === 'object' && 'ObjectDetail' in reply) return reply.ObjectDetail;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an object-detail read');
}

/** Map an engine `WireReply` to `WireDecisionList` (ENTITY_DECISIONS), throwing a typed error on a refusal. */
export function replyToDecisionList(reply: WireReply): WireDecisionList {
  if (typeof reply === 'object' && 'DecisionList' in reply) return reply.DecisionList;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an entity-decisions read');
}

/** Map an engine `WireReply` to `WireConnectionList` (ENTITY_CONNECTIONS), throwing a typed error on a refusal. */
export function replyToConnectionList(reply: WireReply): WireConnectionList {
  if (typeof reply === 'object' && 'ConnectionList' in reply) return reply.ConnectionList;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for an entity-connections read');
}

/** Map an engine `WireReply` to `WireConnectivityGraph` (CONNECTIVITY_GRAPH), throwing a typed error on a refusal. */
export function replyToConnectivityGraph(reply: WireReply): WireConnectivityGraph {
  if (typeof reply === 'object' && 'ConnectivityGraph' in reply) return reply.ConnectivityGraph;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a connectivity-graph read');
}

/** Map an engine `WireReply` to `WireMemberList` (CONNECTIVITY_MEMBERS), throwing a typed error on a refusal. */
export function replyToMemberList(reply: WireReply): WireMemberList {
  if (typeof reply === 'object' && 'MemberList' in reply) return reply.MemberList;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a connectivity-members read');
}

/** Map an engine `WireReply` to `WireContainEffect` (CONTAIN), throwing a typed error on a refusal. */
export function replyToContainEffect(reply: WireReply): WireContainEffect {
  if (typeof reply === 'object' && 'Contained' in reply) return reply.Contained;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a contain command');
}

/** Map an engine `WireReply` to `WireDecisionDetail` (LOG_EXPLAIN), throwing a typed error on a refusal. */
export function replyToDecisionDetail(reply: WireReply): WireDecisionDetail {
  if (typeof reply === 'object' && 'DecisionDetail' in reply) return reply.DecisionDetail;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a log-explain read');
}

/** Map an engine `WireReply` to `WireLogExportEffect` (LOG_EXPORT), throwing a typed error on a refusal. */
export function replyToLogExported(reply: WireReply): WireLogExportEffect {
  if (typeof reply === 'object' && 'LogExported' in reply) return reply.LogExported;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a log-export command');
}

/** Map an engine `WireReply` to `WireVtzTree` (VTZ_TREE), throwing a typed error on a refusal. */
export function replyToVtzTree(reply: WireReply): WireVtzTree {
  if (typeof reply === 'object' && 'VtzTree' in reply) return reply.VtzTree;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a vtz-tree read');
}

/** Map an engine `WireReply` to `WireVtzDetail` (VTZ_DETAIL), throwing a typed error on a refusal. */
export function replyToVtzDetail(reply: WireReply): WireVtzDetail {
  if (typeof reply === 'object' && 'VtzDetail' in reply) return reply.VtzDetail;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a vtz-detail read');
}

/**
 * Map an engine `WireReply` to `WireVtzMutation` (the audited VTZ writes), throwing a typed error on a
 * refusal. A refusal here is meaningful, not noise: the engine refuses a floor relaxation, an inheritance
 * contradiction, or a state conflict, and the resolver classifies it for the operator.
 */
export function replyToBundleConvergence(reply: WireReply): WireBundleConvergence {
  if (typeof reply === 'object' && 'BundleConvergence' in reply) return reply.BundleConvergence;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a bundle convergence read');
}

export function replyToBundleCommitted(reply: WireReply): WireBundleCommitted {
  if (typeof reply === 'object' && 'BundleCommitted' in reply) return reply.BundleCommitted;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a bundle commit');
}

export function replyToVtzMutation(reply: WireReply): WireVtzMutation {
  if (typeof reply === 'object' && 'VtzMutated' in reply) return reply.VtzMutated;
  if (typeof reply === 'object' && 'Refused' in reply)
    throw new EngineRefusedError(reply.Refused.error);
  throw new Error('engine returned an unexpected reply for a vtz mutation');
}

/** Reject `op` if it does not settle within `ms` (a per-call bound; every engine call is bounded). */
async function withTimeout<T>(op: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('engine call timed out'));
    }, ms);
  });
  try {
    return await Promise.race([op, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class WireCrucibleClient implements CrucibleClient {
  private transport: FrameTransport | null = null;
  /** Dedupes concurrent first-connects so a burst of calls shares one dial + handshake. */
  private connecting: Promise<FrameTransport> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** Serializes every transport op (dispatch + heartbeat) so frames never interleave on stream 0. */
  private opChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: BffConfig,
    private readonly connect: EngineConnector = connectEngine,
  ) {}

  /** Run `op` with exclusive access to the transport (one in-flight frame per connection, stream 0). */
  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    // Keep the chain alive across this op's outcome without swallowing the caller's own result/error.
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** The live transport, dialing + handshaking (and starting the heartbeat) once if absent. */
  private async ensureTransport(): Promise<FrameTransport> {
    if (this.transport) return this.transport;
    this.connecting ??= this.connect(this.config).then(
      (transport) => {
        this.transport = transport;
        this.connecting = null;
        this.startHeartbeat();
        return transport;
      },
      (error: unknown) => {
        this.connecting = null;
        throw error;
      },
    );
    return this.connecting;
  }

  /** Drop `dead` if it is still the current transport, so the next op reconnects. Idempotent. */
  private invalidate(dead: FrameTransport): void {
    if (dead !== this.transport) return; // already replaced by a newer transport
    this.stopHeartbeat();
    this.transport = null;
    void dead.close().catch(() => undefined);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      void this.beat();
    }, this.config.heartbeatIntervalMs);
    // The heartbeat must not by itself keep the Node process alive.
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** One heartbeat tick: PING/PONG on the live transport; a failure invalidates it so the next call reconnects. */
  private async beat(): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    try {
      await this.serialize(() => withTimeout(heartbeat(transport), this.config.requestTimeoutMs));
    } catch {
      this.invalidate(transport);
    }
  }

  private timeoutFor(opts?: EngineCallOptions): number {
    return opts?.timeoutMs ?? this.config.requestTimeoutMs;
  }

  /**
   * Run a serialized transport op, reconnecting once if the connection died. A transport-level failure (a
   * dead socket, a lapsed lease, an engine restart) invalidates the cached transport so it is never reused,
   * and the op is retried once on a fresh connection. A domain refusal (`EngineRefusedError`) is not a
   * transport failure and is rethrown immediately. Every verb here is an idempotent read, so a single retry
   * is safe.
   */
  private async call<T>(
    op: (transport: FrameTransport) => Promise<T>,
    opts?: EngineCallOptions,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const transport = await this.ensureTransport();
      try {
        return await this.serialize(() => withTimeout(op(transport), this.timeoutFor(opts)));
      } catch (error) {
        if (error instanceof EngineRefusedError) throw error;
        lastError = error;
        this.invalidate(transport);
      }
    }
    throw lastError;
  }

  async ping(opts?: EngineCallOptions): Promise<void> {
    // A real PING/PONG round-trip: readiness reflects true engine reachability, not a cached handle. Fail
    // closed -- a dead or unreachable link rejects here (and readiness reports not-ready).
    await this.call((transport) => heartbeat(transport), opts);
  }

  async querySubmit(
    request: Parameters<CrucibleClient['querySubmit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireQueryRows> {
    return this.call(
      async (transport) => replyToQueryRows(await dispatch(transport, { QuerySubmit: request })),
      opts,
    );
  }

  async cursorFetch(handle: EngineHandle, opts?: EngineCallOptions): Promise<WireQueryRows> {
    return this.call(
      async (transport) =>
        replyToQueryRows(await dispatch(transport, { CursorFetch: { handle: [...handle] } })),
      opts,
    );
  }

  async cursorClose(handle: EngineHandle, opts?: EngineCallOptions): Promise<void> {
    await this.call(
      (transport) => dispatch(transport, { CursorClose: { handle: [...handle] } }),
      opts,
    );
  }

  async listAgents(
    request: Parameters<CrucibleClient['listAgents']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireAgentList> {
    return this.call(
      async (transport) => replyToAgentList(await dispatch(transport, { ListAgents: request })),
      opts,
    );
  }

  async listPrincipals(
    request: Parameters<CrucibleClient['listPrincipals']>[0],
    opts?: EngineCallOptions,
  ): Promise<WirePrincipalList> {
    return this.call(
      async (transport) =>
        replyToPrincipalList(await dispatch(transport, { ListPrincipals: request })),
      opts,
    );
  }

  async listGroups(
    request: Parameters<CrucibleClient['listGroups']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireGroupList> {
    return this.call(
      async (transport) => replyToGroupList(await dispatch(transport, { ListGroups: request })),
      opts,
    );
  }

  async groupCreate(
    request: Parameters<CrucibleClient['groupCreate']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { GroupCreate: request })),
      opts,
    );
  }

  async principalCreate(
    request: Parameters<CrucibleClient['principalCreate']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { PrincipalCreate: request })),
      opts,
    );
  }

  async principalEdit(
    request: Parameters<CrucibleClient['principalEdit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { PrincipalEdit: request })),
      opts,
    );
  }

  async principalSetStatus(
    request: Parameters<CrucibleClient['principalSetStatus']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { PrincipalSetStatus: request })),
      opts,
    );
  }

  async groupEdit(
    request: Parameters<CrucibleClient['groupEdit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) => replyToLugProvisioned(await dispatch(transport, { GroupEdit: request })),
      opts,
    );
  }

  async groupSetMembers(
    request: Parameters<CrucibleClient['groupSetMembers']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { GroupSetMembers: request })),
      opts,
    );
  }

  async objectList(
    request: Parameters<CrucibleClient['objectList']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireObjectCatalog> {
    return this.call(
      async (transport) => replyToObjectCatalog(await dispatch(transport, { ObjectList: request })),
      opts,
    );
  }

  async idamConnectors(
    request: Parameters<CrucibleClient['idamConnectors']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireIdamConnectorList> {
    return this.call(
      async (transport) =>
        replyToIdamConnectors(await dispatch(transport, { IdamConnectors: request })),
      opts,
    );
  }

  async idamSync(
    request: Parameters<CrucibleClient['idamSync']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireIdamSyncStarted> {
    return this.call(
      async (transport) => replyToIdamSyncStarted(await dispatch(transport, { IdamSync: request })),
      opts,
    );
  }

  async idamConnect(
    request: Parameters<CrucibleClient['idamConnect']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { IdamConnect: request })),
      opts,
    );
  }

  async idamConfigure(
    request: Parameters<CrucibleClient['idamConfigure']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLugProvisioned> {
    return this.call(
      async (transport) =>
        replyToLugProvisioned(await dispatch(transport, { IdamConfigure: request })),
      opts,
    );
  }

  async objectDetail(
    request: Parameters<CrucibleClient['objectDetail']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireObjectDetail> {
    return this.call(
      async (transport) =>
        replyToObjectDetail(await dispatch(transport, { ObjectDetail: request })),
      opts,
    );
  }

  async objectCreate(
    request: Parameters<CrucibleClient['objectCreate']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireObjectMutated> {
    return this.call(
      async (transport) =>
        replyToObjectMutated(await dispatch(transport, { ObjectCreate: request })),
      opts,
    );
  }

  async objectEdit(
    request: Parameters<CrucibleClient['objectEdit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireObjectMutated> {
    return this.call(
      async (transport) => replyToObjectMutated(await dispatch(transport, { ObjectEdit: request })),
      opts,
    );
  }

  async objectDelete(
    request: Parameters<CrucibleClient['objectDelete']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireObjectMutated> {
    return this.call(
      async (transport) =>
        replyToObjectMutated(await dispatch(transport, { ObjectDelete: request })),
      opts,
    );
  }

  async entityDecisions(
    request: Parameters<CrucibleClient['entityDecisions']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireDecisionList> {
    return this.call(
      async (transport) =>
        replyToDecisionList(await dispatch(transport, { EntityDecisions: request })),
      opts,
    );
  }

  async entityConnections(
    request: Parameters<CrucibleClient['entityConnections']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireConnectionList> {
    return this.call(
      async (transport) =>
        replyToConnectionList(await dispatch(transport, { EntityConnections: request })),
      opts,
    );
  }

  async connectivityGraph(
    request: Parameters<CrucibleClient['connectivityGraph']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireConnectivityGraph> {
    return this.call(
      async (transport) =>
        replyToConnectivityGraph(await dispatch(transport, { ConnectivityGraph: request })),
      opts,
    );
  }

  async connectivityMembers(
    request: Parameters<CrucibleClient['connectivityMembers']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireMemberList> {
    return this.call(
      async (transport) =>
        replyToMemberList(await dispatch(transport, { ConnectivityMembers: request })),
      opts,
    );
  }

  async contain(
    request: Parameters<CrucibleClient['contain']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireContainEffect> {
    return this.call(
      async (transport) => replyToContainEffect(await dispatch(transport, { Contain: request })),
      opts,
    );
  }

  async logQuery(
    request: Parameters<CrucibleClient['logQuery']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireDecisionList> {
    return this.call(
      async (transport) => replyToDecisionList(await dispatch(transport, { LogQuery: request })),
      opts,
    );
  }

  async logExplain(
    request: Parameters<CrucibleClient['logExplain']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireDecisionDetail> {
    return this.call(
      async (transport) =>
        replyToDecisionDetail(await dispatch(transport, { LogExplain: request })),
      opts,
    );
  }

  async logExport(
    request: Parameters<CrucibleClient['logExport']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireLogExportEffect> {
    return this.call(
      async (transport) => replyToLogExported(await dispatch(transport, { LogExport: request })),
      opts,
    );
  }

  async vtzTree(
    request: Parameters<CrucibleClient['vtzTree']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireVtzTree> {
    return this.call(
      async (transport) => replyToVtzTree(await dispatch(transport, { VtzTree: request })),
      opts,
    );
  }

  async bundleConvergence(
    request: Parameters<CrucibleClient['bundleConvergence']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireBundleConvergence> {
    return this.call(
      async (transport) =>
        replyToBundleConvergence(await dispatch(transport, { BundleConvergence: request })),
      opts,
    );
  }

  async vtzDetail(
    request: Parameters<CrucibleClient['vtzDetail']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireVtzDetail> {
    return this.call(
      async (transport) => replyToVtzDetail(await dispatch(transport, { VtzDetail: request })),
      opts,
    );
  }

  async bundleCommit(
    request: Parameters<CrucibleClient['bundleCommit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireBundleCommitted> {
    return this.call(
      async (transport) =>
        replyToBundleCommitted(await dispatch(transport, { BundleCommit: request })),
      opts,
    );
  }

  async vtzCreate(
    request: Parameters<CrucibleClient['vtzCreate']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation> {
    return this.call(
      async (transport) => replyToVtzMutation(await dispatch(transport, { VtzCreate: request })),
      opts,
    );
  }

  async vtzEdit(
    request: Parameters<CrucibleClient['vtzEdit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation> {
    return this.call(
      async (transport) => replyToVtzMutation(await dispatch(transport, { VtzEdit: request })),
      opts,
    );
  }

  async vtzRescope(
    request: Parameters<CrucibleClient['vtzRescope']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation> {
    return this.call(
      async (transport) => replyToVtzMutation(await dispatch(transport, { VtzRescope: request })),
      opts,
    );
  }

  async vtzDelete(
    request: Parameters<CrucibleClient['vtzDelete']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireVtzMutation> {
    return this.call(
      async (transport) => replyToVtzMutation(await dispatch(transport, { VtzDelete: request })),
      opts,
    );
  }

  async close(): Promise<void> {
    this.stopHeartbeat();
    const transport = this.transport;
    this.transport = null;
    this.connecting = null;
    if (transport) await transport.close();
  }
}

/** Construct the engine client from config (the real mTLS wire transport). */
export function createEngineClient(config: BffConfig): CrucibleClient {
  return new WireCrucibleClient(config);
}
