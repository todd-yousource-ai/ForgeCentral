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
  IdamConnectDraft,
  IdamConnector,
  IdamConnectorDraft,
  ProvisionReceipt,
  SyncReceipt,
  WireIdamConfigure,
  WireIdamConnect,
  WireIdamConnectors,
  WireIdamSync,
} from '@forge/contracts';
import {
  toIdamConnectors,
  toProvisionReceipt,
  toSyncReceipt,
  toWireIdamConfigureFields,
  toWireIdamConnectFields,
} from '@forge/contracts';

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

/**
 * Set a connector's connectivity live (IDAM_CONNECT, crdb CO.1/CO.2). Carries the connectivity from
 * the draft plus the `secretRef` PATH -- never the secret value, which the on-node crypto-sidecar
 * writes to that path out of band. The engine re-spawns the connector fail-closed; a bad secret file
 * or a spawn failure surfaces as an `EngineRefusedError` (`Conflict`) for the route to map. Returns the
 * audited commit version.
 */
export async function resolveIdamConnect(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: IdamConnectDraft,
  secretRef: string,
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const request: WireIdamConnect = {
    request_id: requestId(),
    ...toWireIdamConnectFields(draft),
    client_secret_ref: secretRef,
  };
  const reply = await engine.idamConnect(principal, request, opts);
  return toProvisionReceipt(reply);
}

/**
 * Set a connector's runtime knobs -- enabled + the two cadences (IDAM_CONFIGURE, crdb IA.8), applied
 * live with no restart. The cadence BOUNDS are engine-side: an out-of-range value passes through this
 * resolver and is refused by the engine (`EngineRefusedError`, `Framing`), so the form's range hints
 * are UX, never the enforcement point. Returns the audited commit version.
 */
export async function resolveIdamConfigure(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: IdamConnectorDraft,
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const request: WireIdamConfigure = {
    request_id: requestId(),
    ...toWireIdamConfigureFields(draft),
  };
  const reply = await engine.idamConfigure(principal, request, opts);
  return toProvisionReceipt(reply);
}
