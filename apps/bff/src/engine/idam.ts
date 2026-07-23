// apps/bff/src/engine/idam.ts -- the External IDAM connector read resolver (IP-CONSOLE-04 ID.2).
//
// Projects the crdb IdAM connector read (IDAM_CONNECTORS, crdb IA.8) into the Console view model:
// `idam.connectors` is the External IDAM tab's connector-card list. The read is tenant-private and
// operator-delegated via `OperatorEngine` (INV-CONSOLE-ENGINE-AUTHZ).
//
// FAIL-CLOSED note: unlike the Objects/Users directory reads, a connector record carries NO closed
// enum tag that could be un-narrowable -- its fields are booleans/ints/strings, and `last_completeness`
// narrows per-card to `unknown` (never `healthy`) rather than dropping the card (see
// `toIdamConnector`). So `toIdamConnectors` is TOTAL and there is no partial-directory lie to collapse
// the whole read for; the fail-closed discipline lives at the card level, in the contract. An
// unfederated node returns an EMPTY list, which projects to `[]` and renders "no connector configured"
// -- honest, not an error.

import type {
  IdamConnector,
  SyncReceipt,
  WireIdamConnectors,
  WireIdamSync,
} from '@forge/contracts';
import { toIdamConnectors, toSyncReceipt } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

let nextRequestId = 1n;
function requestId(): number {
  nextRequestId += 1n;
  return Number(nextRequestId % 1_000_000_000n);
}

/** Resolve the External IDAM connector list on behalf of `principal`. */
export async function resolveIdamConnectors(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly IdamConnector[]> {
  const request: WireIdamConnectors = { request_id: requestId() };
  const list = await engine.idamConnectors(principal, request, opts);
  return toIdamConnectors(list);
}

/**
 * Trigger a federation sync for one connector. An ACK, not a result: the engine marks the sync DUE
 * and returns immediately (the poll loop picks it up), so the caller re-reads `idam.connectors` for
 * progress. An `EngineRefusedError` propagates for the route to map (a disabled or unconfigured
 * connector is `Conflict`; a tier/delegation refusal is `Denied`). There is no "already running"
 * refusal -- the engine accepts the request idempotently.
 */
export async function resolveIdamSync(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  provider: string,
  opts?: EngineCallOptions,
): Promise<SyncReceipt> {
  const request: WireIdamSync = { request_id: requestId(), provider };
  const started = await engine.idamSync(principal, request, opts);
  return toSyncReceipt(started);
}
