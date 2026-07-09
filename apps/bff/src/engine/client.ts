// apps/bff/src/engine/client.ts -- the Crucible engine seam (F0.3).
//
// The one typed boundary the BFF uses to reach the Crucible engine, expressed over the shared wire DTOs
// (`@forge/contracts`). Every call is bounded: it takes a timeout and/or an AbortSignal, so no engine
// call can hang the BFF (CRAFTED "Timeouts are required on every operation that contacts an external
// system"). The concrete implementation is the enrolled mTLS `:7878` wire client (F0.3b); handlers and
// tests depend on this interface, not on a transport.

import type { WireQueryRows, WireQuerySubmit } from '@forge/contracts';

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
  /** Fetch the next page for an open cursor. */
  cursorFetch(handle: EngineHandle, opts?: EngineCallOptions): Promise<WireQueryRows>;
  /** Close an open cursor (releases engine-side resources). */
  cursorClose(handle: EngineHandle, opts?: EngineCallOptions): Promise<void>;
  /** Close the underlying transport (graceful shutdown). */
  close(): Promise<void>;
}
