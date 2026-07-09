// apps/bff/src/engine/wire-client.ts -- the enrolled mTLS :7878 transport (PENDING, F0.3b).
//
// This is the production `CrucibleClient`: a native TypeScript client of the Crucible wire protocol over
// mTLS on :7878 (framing + CBOR + request/reply correlation), exactly as Torch enrolls. It is NOT yet
// implemented: it needs (1) the crdb FRAME wire-format vendored the way the DTO payload schema was
// vendored for @forge/contracts (an IP-CONSOLE-READINESS follow-on), (2) the BFF's own enrolled client
// certificate (a service Principal), and (3) a live node to validate against. Those are tracked as F0.3b
// / INV-CROSS.
//
// Until then the transport FAILS CLOSED: every operation throws `EngineTransportPending` -- it never
// fabricates a result (INV-CONSOLE-NO-STUB). The BFF still runs (liveness is up); `/readyz` reports
// not-ready because `ping` throws, which is the truthful state of a BFF with no wired transport.

import type { BffConfig } from '../config.js';
import type { CrucibleClient, EngineCallOptions, EngineHandle } from './client.js';

/** Thrown by the placeholder transport until the mTLS wire client lands (F0.3b). */
export class EngineTransportPending extends Error {
  constructor() {
    super(
      'engine mTLS wire transport not implemented yet (F0.3b: vendor the crdb frame format, enroll the BFF cert)',
    );
    this.name = 'EngineTransportPending';
  }
}

/** The placeholder transport: fail-closed on every call. Replaced by the real wire client in F0.3b. */
export class PendingWireClient implements CrucibleClient {
  // The config is retained so the F0.3b implementation swaps in without changing the construction site.
  constructor(private readonly config: BffConfig) {}

  ping(_opts?: EngineCallOptions): Promise<void> {
    return Promise.reject(new EngineTransportPending());
  }

  querySubmit(_request: unknown, _opts?: EngineCallOptions): Promise<never> {
    return Promise.reject(new EngineTransportPending());
  }

  cursorFetch(_handle: EngineHandle, _opts?: EngineCallOptions): Promise<never> {
    return Promise.reject(new EngineTransportPending());
  }

  cursorClose(_handle: EngineHandle, _opts?: EngineCallOptions): Promise<never> {
    return Promise.reject(new EngineTransportPending());
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  /** The engine host:port this transport will connect to once implemented (F0.3b). */
  endpoint(): string {
    return `${this.config.engineHost}:${String(this.config.enginePort)}`;
  }
}

/** Construct the engine client from config. Returns the F0.3b transport (currently the pending one). */
export function createEngineClient(config: BffConfig): CrucibleClient {
  return new PendingWireClient(config);
}
