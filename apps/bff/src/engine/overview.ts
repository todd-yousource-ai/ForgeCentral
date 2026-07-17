// apps/bff/src/engine/overview.ts -- the Overview (connectivity graph) read resolver (RD.4; the O1.3
// flat-graph resolver retired with its route).
//
// Brokers the flagship Overview surface's tenant-wide connectivity read to crdb's CONNECTIVITY_GRAPH verb
// over the OperatorEngine (crdb IP-CONSOLE-CONNECTIVITY): the VTZ-routed two-stage nodes + weighted edges
// + per-VTZ detection-driven risk, aggregated + bounded + tenant-private engine-side. The OperatorEngine
// injects the operator delegation server-side; this resolver only PROJECTS the returned DTO into the
// `OverviewSankey` view model via the ONE shared `toOverviewSankey` projection (INV-CONSOLE-NO-STUB: the
// nodes/edges/risk are real engine facts, never fabricated). It fails CLOSED to the unavailable state: if
// the engine emits a risk-band tag the Console does not know, the projection returns null and this raises
// `OverviewUnavailableError` rather than mis-coloring a zone.

import {
  OVERVIEW_DEST_CATEGORIES,
  OVERVIEW_SOURCE_CATEGORIES,
  toConnectionList,
  toMemberList,
  toOverviewSankey,
} from '@forge/contracts';
import type {
  OverviewConnectionList,
  OverviewMember,
  OverviewMemberList,
  OverviewQuery,
  OverviewSankey,
  WireConnectivityMembers,
  WireConnectivityQuery,
  WireEntityConnections,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import { classifyDestination } from './destination-classifier.js';
import type { DestCategory } from './destination-classifier.js';
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

/** The largest connection list a single entity read returns (the engine clamps further per-tenant). */
const MAX_CONNECTIONS_LIMIT = 500;

/**
 * Resolve one subject entity's outbound connections (`overview.entityConnections`, O1.6a), brokered on
 * behalf of `principal`. The engine bounds + tier-redacts the set (`ENTITY_CONNECTIONS`); this only
 * projects the DTO into the {@link OverviewConnectionList} view model via the shared `toConnectionList`.
 * `subjectKind` is the Sankey node's entity kind; the OperatorEngine injects the operator delegation.
 * This is the PR-1 DATA PATH -- the PR-2 hover prefetch + click-through to the drawer consume it.
 */
export async function resolveEntityConnections(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  subjectId: string,
  subjectKind: string,
  opts?: EngineCallOptions,
): Promise<OverviewConnectionList> {
  const request: WireEntityConnections = {
    request_id: 0,
    operator: null,
    subject_id: subjectId,
    subject_kind: subjectKind,
    limit: MAX_CONNECTIONS_LIMIT,
  };
  const reply = await engine.entityConnections(principal, request, opts);
  return toConnectionList(reply);
}

/** The largest member list a single class read returns (the engine clamps further per-tenant). */
const MAX_MEMBERS_LIMIT = 500;

/** The engine class the four destination rings are re-bucketed from (all network endpoints, RD.5). */
const NETWORK_DEST_CLASS = 'network';

/** A clicked Overview container: a source-class lane (left) or a destination-category ring (right). */
export type OverviewContainer =
  (typeof OVERVIEW_SOURCE_CATEGORIES)[number] | (typeof OVERVIEW_DEST_CATEGORIES)[number];

/** Raised when a `container` is not one of the seven known Overview containers (the route maps it to 400). */
export class UnknownContainerError extends Error {
  constructor(readonly container: string) {
    super(`unknown overview container: ${container}`);
    this.name = 'UnknownContainerError';
  }
}

/** True when `value` is a source-class lane (agents/users/devices). */
function isSourceContainer(value: string): value is (typeof OVERVIEW_SOURCE_CATEGORIES)[number] {
  return (OVERVIEW_SOURCE_CATEGORIES as readonly string[]).includes(value);
}

/** True when `value` is a destination-category ring (network/saas/private-apps/data-stores). */
function isDestContainer(value: string): value is DestCategory {
  return (OVERVIEW_DEST_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Resolve the member entities of one clicked Overview container (`overview.connectivityMembers`, O1.6b),
 * brokered on behalf of `principal`, so the drawer can list a container and open one member.
 *
 * A SOURCE lane (agents/users/devices) maps to the engine class directly. A DESTINATION ring
 * (network/saas/private-apps/data-stores) is a BFF re-bucket, not an engine class (RD.5): the engine is
 * asked for its flat `network` members, each endpoint is reclassified via {@link classifyDestination}
 * (using reverse-DNS names, cached + background) and kept only when it lands in the requested ring, with
 * its display name relabeled to the ring's simple brand (`GitHub`, `Postgres`...). The engine already
 * bounded + tier-redacted + ordered the set; the re-bucket preserves that order. Fails to
 * {@link UnknownContainerError} for an unknown container (the route maps it to 400).
 */
export async function resolveClassMembers(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  container: string,
  opts?: EngineCallOptions,
  reverseDns?: ReverseDnsResolver,
): Promise<OverviewMemberList> {
  if (isSourceContainer(container)) {
    const reply = await engine.connectivityMembers(principal, membersRequest(container), opts);
    return toMemberList(reply);
  }
  if (isDestContainer(container)) {
    const reply = await engine.connectivityMembers(
      principal,
      membersRequest(NETWORK_DEST_CLASS),
      opts,
    );
    return rebucketDestMembers(toMemberList(reply), container, reverseDns);
  }
  throw new UnknownContainerError(container);
}

/** A `WireConnectivityMembers` for one engine class; the OperatorEngine injects the operator delegation. */
function membersRequest(engineClass: string): WireConnectivityMembers {
  return {
    request_id: 0,
    operator: null,
    class: engineClass,
    limit: MAX_MEMBERS_LIMIT,
  };
}

/**
 * Reclassify the engine's flat `network` members into the four destination rings and keep only those in
 * `ring`, relabeling each kept member's name to its simple brand. Order is preserved (the engine's
 * connection-count desc), so the drawer list mirrors the ring's ranking.
 */
function rebucketDestMembers(
  list: OverviewMemberList,
  ring: DestCategory,
  reverseDns?: ReverseDnsResolver,
): OverviewMemberList {
  const names = reverseDns?.namesFor(list.members.map((m) => m.id));
  const members: OverviewMember[] = [];
  for (const member of list.members) {
    const resolved = names?.get(member.id);
    const classified = classifyDestination(member.id, resolved);
    if (classified.category === ring) {
      members.push({ ...member, name: classified.name });
    }
  }
  return { members };
}
