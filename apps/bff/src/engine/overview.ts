// apps/bff/src/engine/overview.ts -- the Overview (connectivity graph) read resolver (IP-CONSOLE-01 O1.3).
//
// Brokers the flagship Overview surface's tenant-wide connectivity read to crdb's CONNECTIVITY_GRAPH verb
// over the OperatorEngine (crdb IP-CONSOLE-CONNECTIVITY): the source-class/destination-class nodes +
// weighted edges + the risk band, aggregated + bounded + tenant-private engine-side. The OperatorEngine
// injects the operator delegation server-side; this resolver only PROJECTS the returned DTO into the
// `OverviewGraph` view model via the ONE shared `toOverviewGraph` projection (INV-CONSOLE-NO-STUB: the
// nodes/edges/risk are real engine facts, never fabricated). It fails CLOSED to the unavailable state: if
// the engine emits a risk-band tag the Console does not know, the projection returns null and this raises
// `OverviewUnavailableError` rather than mis-coloring the "Public" zone.

import { toOverviewGraph } from '@forge/contracts';
import type { OverviewGraph, OverviewQuery, WireConnectivityQuery } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/**
 * Raised when the connectivity graph cannot be projected to a well-formed view model -- specifically when
 * the engine emitted a risk-band level the Console does not know. The route maps this to the unavailable
 * state (a 503), never a defaulted color (fail-closed, TRD-CONSOLE-01).
 */
export class OverviewUnavailableError extends Error {
  constructor() {
    super('the connectivity graph carried an unknown risk-band level');
    this.name = 'OverviewUnavailableError';
  }
}

/** Compile an `OverviewQuery` (view-model, unix millis) into a `WireConnectivityQuery` (engine, unix seconds). */
function queryToWire(query: OverviewQuery): WireConnectivityQuery {
  return {
    request_id: 0,
    operator: null,
    since: query.since !== undefined ? Math.floor(query.since / 1000) : null,
    until: query.until !== undefined ? Math.floor(query.until / 1000) : null,
    limit: query.limit,
  };
}

/**
 * Resolve the tenant-wide connectivity graph for `query`, brokered on behalf of `principal`. The engine
 * aggregates + bounds + time-windows (CONNECTIVITY_GRAPH); this only projects the DTO into the view model.
 * Throws {@link OverviewUnavailableError} when the projection fails closed on an unknown risk-band tag.
 */
export async function resolveOverviewGraph(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  query: OverviewQuery,
  opts?: EngineCallOptions,
): Promise<OverviewGraph> {
  const graph = await engine.connectivityGraph(principal, queryToWire(query), opts);
  const view = toOverviewGraph(graph);
  if (view === null) {
    throw new OverviewUnavailableError();
  }
  return view;
}
