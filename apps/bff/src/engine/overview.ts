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

import { toOverviewGraph, toOverviewSankey } from '@forge/contracts';
import type {
  OverviewGraph,
  OverviewQuery,
  OverviewSankey,
  WireConnectivityQuery,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import { classifyDestination } from './destination-classifier.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';
import type { ReverseDnsResolver } from './reverse-dns.js';

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

/**
 * Resolve the tenant-wide VTZ-routed connectivity graph (RD.4) for `query`, brokered on behalf of
 * `principal`. Same engine read (CONNECTIVITY_GRAPH), projected to the redesigned {@link OverviewSankey}
 * two-stage view model (source -> VTZ -> destination, each VTZ with its own detection-driven risk). Fails
 * closed to {@link OverviewUnavailableError} when a VTZ risk-band level is unknown.
 */
export async function resolveOverviewSankey(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  query: OverviewQuery,
  opts?: EngineCallOptions,
  reverseDns?: ReverseDnsResolver,
): Promise<OverviewSankey> {
  const graph = await engine.connectivityGraph(principal, queryToWire(query), opts);
  // Resolve the engine's destination IPs to common names (reverse-DNS, cached + background); an
  // unresolved IP falls back to itself inside toOverviewSankey (never a fabricated name). The rich
  // classifier then re-buckets the flat network class into the four category rings with simple
  // merged brand names (GitHub, Google DNS, Postgres...).
  const names = reverseDns?.namesFor(graph.top_destinations.map((d) => d.address));
  const view = toOverviewSankey(
    graph,
    names ? (address) => names.get(address) : undefined,
    classifyDestination,
  );
  if (view === null) {
    throw new OverviewUnavailableError();
  }
  return view;
}
