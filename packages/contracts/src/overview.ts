// packages/contracts/src/overview.ts -- the Overview (connectivity graph) contract (IP-CONSOLE-01 O1.1).
//
// The Overview surface (TRD-CONSOLE-01) is the product's flagship: a live, three-column flow of the actual
// connectivity across the platform -- a projection of the Crucible connectivity graph, not a drawn diagram.
// This module is the ONE home for its data contract (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE): the view models
// the SPA renders and the BFF resolver produces. Both tiers import it -- the BFF (O1.3) projects these from
// the crdb `CONNECTIVITY_GRAPH` read, the SPA (O1.5) renders them -- so a drifted field fails compilation on
// both sides (the cross-module gap guard, AI Quality Guide bug category 3).
//
// GROUNDED-DESIGN NOTE (INV-CONSOLE-OVERVIEW-LIVE, steer 2026-07-13). The mock's middle column was per-VTZ
// Trust-Score rings; grounded against engine reality, this is REPLACED:
//   * Trust score is REMOVED (a legacy of the old architecture, dropped in the drawer's DR.1).
//   * The middle column is a single Console-side "Public" placeholder VTZ (all non-agent traffic routes
//     through it; real Forge VTZ + agent zones land later -- a named cross-repo deferral), colored by the
//     {@link OverviewRiskBand} (green/yellow/red) derived from DETECTED ALERTS, not a trust score.
//   * The nodes + edges are the tenant-wide roll-up of the LEG `ConnectsTo` graph fed by torch's 4-octet
//     TCP/IP capture (netflow enriches later). The engine aggregates; the browser never gets raw edges.
//
// O1.1 lands the TYPES only; no renderer, no live data. Each view model is a camelCase projection of the
// generated `WireConnectivityGraph` family (`WireConnClass` / `WireConnEdge` / `WireRiskBand`); the DTO ->
// view-model mapping lives in the O1.3 resolver, and the contract test proves the projection is well-typed
// against the generated DTOs.

import type {
  WireConnClass,
  WireConnEdge,
  WireConnectivityGraph,
  WireRiskBand,
} from './generated/wire-dto.js';

/**
 * The risk level a zone is colored by, derived from detected alerts (the decision LOG): `red` if any
 * `escalate`, else `yellow` if any `candidate`, else `green`. Replaces the removed trust score. Narrowed
 * from the engine's open `WireRiskBand.level` string in the O1.3 resolver (an unknown tag is a resolver
 * error, never a silently-mis-colored zone).
 */
export type RiskLevel = 'green' | 'yellow' | 'red';

/**
 * One source-class or destination-class node of the connectivity flow, projected from a `WireConnClass`.
 * `count` is the number of classified connection edges that touch the class (the column node's weight).
 */
export interface OverviewClassNode {
  /**
   * The class tag. Source classes: `users` / `devices` / `agents`. Destination classes: `network` / `saas`
   * / `private-apps` / `servers` / `data-stores`. Derived engine-side from the LEG node kind.
   */
  readonly class: string;
  /** How many classified `ConnectsTo` edges touch this class. */
  readonly count: number;
}

/**
 * One weighted source-class -> destination-class flow, projected from a `WireConnEdge`. `weight` is the
 * count of classified `ConnectsTo` edges from `sourceClass` to `destClass` (the flow's thickness).
 */
export interface OverviewEdge {
  readonly sourceClass: string;
  readonly destClass: string;
  readonly weight: number;
}

/**
 * The risk band the Console colors the "Public" zone by, projected from a `WireRiskBand`. The counts are
 * the driving recent-decision tallies; `level` is the resulting color.
 */
export interface OverviewRiskBand {
  readonly level: RiskLevel;
  /** Recent decisions recommending `escalate` (drive `red`). */
  readonly escalate: number;
  /** Recent decisions recommending `candidate` (drive `yellow`). */
  readonly candidate: number;
  /** Recent decisions recommending `observe-only`. */
  readonly observe: number;
}

/**
 * The tenant-wide connectivity flow (`overview.graph`), projected from a `WireConnectivityGraph`. The
 * source + destination class nodes and the weighted edges are REAL engine facts; the "Public" placeholder
 * VTZ is a Console render concept inserted between the columns and colored by {@link risk}. An empty
 * platform yields empty `sources`/`destinations`/`edges` and a green {@link risk} ("no connectivity
 * observed"), never a fabricated node (INV-CONSOLE-NO-STUB).
 */
export interface OverviewGraph {
  readonly sources: readonly OverviewClassNode[];
  readonly destinations: readonly OverviewClassNode[];
  readonly edges: readonly OverviewEdge[];
  readonly risk: OverviewRiskBand;
}

/**
 * The filter for a tenant-wide connectivity read (`overview.graph` -> crdb `CONNECTIVITY_GRAPH`). The time
 * bounds scope the risk-window decisions; `limit` bounds the aggregation scan (further clamped by the
 * engine's per-tenant ceiling). `since`/`until` are unix MILLISECONDS (the resolver converts to the
 * engine's unix seconds, matching {@link LogQueryFilter}).
 */
export interface OverviewQuery {
  readonly since?: number;
  readonly until?: number;
  readonly limit: number;
}

/**
 * Project a generated `WireConnClass` to the {@link OverviewClassNode} view model. The identity mapping the
 * O1.3 resolver applies; exported so the resolver and the contract test share ONE definition (a drifted DTO
 * field fails compilation here, the cross-module guard).
 */
export function toClassNode(node: WireConnClass): OverviewClassNode {
  return { class: node.class, count: node.count };
}

/** Project a generated `WireConnEdge` to the {@link OverviewEdge} view model. */
export function toEdge(edge: WireConnEdge): OverviewEdge {
  return { sourceClass: edge.source_class, destClass: edge.dest_class, weight: edge.weight };
}

/**
 * Narrow the engine's open `WireRiskBand.level` string to a {@link RiskLevel}, or `null` if the engine
 * emitted a tag the Console does not know (the resolver treats that as an error rather than mis-coloring).
 */
export function toRiskLevel(level: string): RiskLevel | null {
  return level === 'green' || level === 'yellow' || level === 'red' ? level : null;
}

/**
 * Project a generated `WireRiskBand` to the {@link OverviewRiskBand} view model, or `null` if its `level`
 * is unknown. The resolver maps `null` to the unavailable state (fail-closed), never a default color.
 */
export function toRiskBand(band: WireRiskBand): OverviewRiskBand | null {
  const level = toRiskLevel(band.level);
  if (level === null) {
    return null;
  }
  return {
    level,
    escalate: band.escalate,
    candidate: band.candidate,
    observe: band.observe,
  };
}

/**
 * Project a generated `WireConnectivityGraph` to the {@link OverviewGraph} view model, or `null` if the
 * risk band's level is unknown (fail-closed to the unavailable state). This is the whole O1.1 DTO ->
 * view-model projection; the O1.3 resolver calls it, and the contract test proves it is well-typed against
 * the generated DTO so a drifted wire field is a compile error on both tiers.
 */
export function toOverviewGraph(graph: WireConnectivityGraph): OverviewGraph | null {
  const risk = toRiskBand(graph.risk);
  if (risk === null) {
    return null;
  }
  return {
    sources: graph.sources.map(toClassNode),
    destinations: graph.destinations.map(toClassNode),
    edges: graph.edges.map(toEdge),
    risk,
  };
}
