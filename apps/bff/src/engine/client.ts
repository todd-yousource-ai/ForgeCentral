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
  WireContain,
  WireContainEffect,
  WireDecisionList,
  WireEntityConnections,
  WireEntityDecisions,
  WireListAgents,
  WireQueryRows,
  WireQuerySubmit,
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
  /** Issue an operator containment disposition (CONTAIN, crdb IP-CONTAIN-COMMAND): record a
   * `Quarantine`/`Deny` on a subject through the audited path. Returns the honest effect
   * (`enforcement_active` is `false` today, AG.7). A data-plane write, honored under the peer's
   * Delegation grant. */
  contain(request: WireContain, opts?: EngineCallOptions): Promise<WireContainEffect>;
  /** Fetch the next page for an open cursor. */
  cursorFetch(handle: EngineHandle, opts?: EngineCallOptions): Promise<WireQueryRows>;
  /** Close an open cursor (releases engine-side resources). */
  cursorClose(handle: EngineHandle, opts?: EngineCallOptions): Promise<void>;
  /** Close the underlying transport (graceful shutdown). */
  close(): Promise<void>;
}
