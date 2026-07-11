// apps/bff/src/engine/wire-client.ts -- the engine wire client over the crypto sidecar (F0.3b, revised CS.4).
//
// The production `CrucibleClient`: a native client of the Crucible wire protocol, built on @forge/wire (the
// frame/CBOR/handshake/transport stack proven byte-exact against crdb). It dials the AWS-LC crypto sidecar
// over a plaintext LOOPBACK socket; the sidecar originates the mTLS to the engine on :7878, so Node performs
// no TLS (INV-CONSOLE-CRYPTO-AWSLC). It connects lazily (on the first call), completes the reactor
// handshake, and dispatches operations; `ping` is the readiness probe (a live connection + handshake means
// the sidecar and engine are reachable).

import { type FrameTransport, connectLoopback, dispatch, wireHandshake } from '@forge/wire';
import type {
  WireAgentList,
  WireConnectionList,
  WireDecisionList,
  WireError,
  WireQueryRows,
  WireReply,
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

  constructor(
    private readonly config: BffConfig,
    private readonly connect: EngineConnector = connectEngine,
  ) {}

  private async ensure(): Promise<FrameTransport> {
    this.transport ??= await this.connect(this.config);
    return this.transport;
  }

  private timeoutFor(opts?: EngineCallOptions): number {
    return opts?.timeoutMs ?? this.config.requestTimeoutMs;
  }

  async ping(opts?: EngineCallOptions): Promise<void> {
    // Establishing the transport completes the mTLS handshake + the wire handshake; that IS reachability.
    await withTimeout(this.ensure(), this.timeoutFor(opts));
  }

  async querySubmit(
    request: Parameters<CrucibleClient['querySubmit']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireQueryRows> {
    const transport = await this.ensure();
    const reply = await withTimeout(
      dispatch(transport, { QuerySubmit: request }),
      this.timeoutFor(opts),
    );
    return replyToQueryRows(reply);
  }

  async cursorFetch(handle: EngineHandle, opts?: EngineCallOptions): Promise<WireQueryRows> {
    const transport = await this.ensure();
    const reply = await withTimeout(
      dispatch(transport, { CursorFetch: { handle: [...handle] } }),
      this.timeoutFor(opts),
    );
    return replyToQueryRows(reply);
  }

  async cursorClose(handle: EngineHandle, opts?: EngineCallOptions): Promise<void> {
    const transport = await this.ensure();
    await withTimeout(
      dispatch(transport, { CursorClose: { handle: [...handle] } }),
      this.timeoutFor(opts),
    );
  }

  async listAgents(
    request: Parameters<CrucibleClient['listAgents']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireAgentList> {
    const transport = await this.ensure();
    const reply = await withTimeout(
      dispatch(transport, { ListAgents: request }),
      this.timeoutFor(opts),
    );
    return replyToAgentList(reply);
  }

  async entityDecisions(
    request: Parameters<CrucibleClient['entityDecisions']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireDecisionList> {
    const transport = await this.ensure();
    const reply = await withTimeout(
      dispatch(transport, { EntityDecisions: request }),
      this.timeoutFor(opts),
    );
    return replyToDecisionList(reply);
  }

  async entityConnections(
    request: Parameters<CrucibleClient['entityConnections']>[0],
    opts?: EngineCallOptions,
  ): Promise<WireConnectionList> {
    const transport = await this.ensure();
    const reply = await withTimeout(
      dispatch(transport, { EntityConnections: request }),
      this.timeoutFor(opts),
    );
    return replyToConnectionList(reply);
  }

  async close(): Promise<void> {
    if (this.transport) {
      const transport = this.transport;
      this.transport = null;
      await transport.close();
    }
  }
}

/** Construct the engine client from config (the real mTLS wire transport). */
export function createEngineClient(config: BffConfig): CrucibleClient {
  return new WireCrucibleClient(config);
}
