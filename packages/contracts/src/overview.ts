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
// Each view model is a camelCase projection of the generated `WireConnectivityGraph` family; the DTO ->
// view-model mapping lives in the BFF resolver, and the contract test proves the projection is well-typed
// against the generated DTOs. (The O1.1/O1.3 flat `OverviewGraph` view model + `toOverviewGraph` were
// retired with the pre-redesign `/api/overview/graph` route after RD.4b migrated the surface to the
// Sankey below -- an unconsumed projection is a stub in reverse, INV-CONSOLE-NO-STUB.)

import type { WireConnectivityGraph, WireRiskBand } from './generated/wire-dto.js';

/**
 * The risk level a zone is colored by, derived from detected alerts (the decision LOG): `red` if any
 * `escalate`, else `yellow` if any `candidate`, else `green`. Replaces the removed trust score. Narrowed
 * from the engine's open `WireRiskBand.level` string in the BFF resolver (an unknown tag is a resolver
 * error, never a silently-mis-colored zone).
 */
export type RiskLevel = 'green' | 'yellow' | 'red';

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
 * The filter for a tenant-wide connectivity read (crdb `CONNECTIVITY_GRAPH`). The time
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
 * Narrow the engine's open `WireRiskBand.level` string to a {@link RiskLevel}, or `null` if the engine
 * emitted a tag the Console does not know (the BFF resolver treats that as an error rather than
 * mis-coloring).
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
 * Narrow the wire's `profile` string to a {@link VtzProfile} (PR-3b). A recognized tag maps through; an
 * unknown or empty value (e.g. a graph from an engine that predates the field) projects to `observe`, the
 * safe learning default -- never a fabricated stricter posture. Unlike {@link toRiskBand}, an unknown
 * profile does not fail the whole graph: the zone still renders, just in its default posture.
 */
export function toVtzProfile(profile: string): VtzProfile {
  return profile === 'standard' || profile === 'quarantine' ? profile : 'observe';
}

// ---------------------------------------------------------------------------------------------------------
// Overview REDESIGN (Sankey) view model -- the locked 2026-07-14 design (the pre-redesign flat
// `OverviewGraph` is retired; the Sankey is THE Overview view model). The graphic is a true three-column
// Sankey: source-class nodes -> up to 3 VTZ nodes (each with its OWN detection-driven risk band) ->
// destination-category nodes (each carrying its top named apps). Flows are two-stage and weighted:
// source -> VTZ (`OverviewSourceEdge`) and VTZ -> destination (`OverviewDestEdge`). Every value is a real
// engine fact (INV-CONSOLE-NO-STUB): VTZ risk is COMPUTED FROM DETECTIONS, never hardcoded; app names come
// from DNS resolution (a fast-follow -- until then `apps` is empty and only the category count shows).

/** One source-class node (left column): `users` / `devices` / `agents`, with its connection count. */
export interface OverviewSourceNode {
  readonly class: string;
  readonly count: number;
}

/**
 * One Virtual Trust Zone node (center column). `risk` is its OWN band, computed from the detections on the
 * entities assigned to it (green Nominal / yellow Elevated / red Critical) -- it shifts live and is never a
 * fixed property of the zone. At most 3 render per page (the surface pages the rest, "swipe for more").
 */
/**
 * A VTZ's enforcement posture (IP-CONSOLE-AGENT-CONNECTIVITY PR-3b): the profile the operator applies to
 * the zone. `observe` (the default) permits any + mandates a record -- the safe learning on-ramp, so an
 * agent placed in the zone is only watched; `standard` is the domain default posture; `quarantine`
 * denies/isolates. For this IP it is a carried, operator-shown attribute the Console displays (the flip
 * affordance lands later). Narrowed from the wire's `profile` string; an unknown/empty value from an
 * older engine projects to `observe` (never a fabricated stricter posture).
 */
export type VtzProfile = 'observe' | 'standard' | 'quarantine';

export interface OverviewVtzNode {
  /** Stable zone id (e.g. the seeded demo VTZ id). */
  readonly id: string;
  /** Display name, dotted (e.g. `Demo.Users.Public`); the renderer stacks it at the first dot. */
  readonly name: string;
  /** The zone's enforcement posture, shown by the Console (PR-3b). */
  readonly profile: VtzProfile;
  /** The detection-driven risk band coloring the zone. */
  readonly risk: OverviewRiskBand;
}

/** One named destination inside a category: a common DNS name (e.g. `github.com`) or, unresolved, its IP. */
export interface OverviewApp {
  /** The display name: the reverse-DNS resolution of {@link address}, or the raw IP when unresolved. */
  readonly name: string;
  /** The raw destination endpoint identity (the IP, or IP:port) the engine returned. */
  readonly address: string;
  /** Connection count to this destination. */
  readonly count: number;
}

/**
 * One destination-category node (right column). The four fixed categories are `network` / `saas` /
 * `private-apps` / `data-stores`. `apps` is the top named destinations to list (the engine's ranked
 * `top_destinations`, resolved to common names); `count` is the number of DISTINCT destinations the
 * ring holds (`INV-CONNECTIVITY-NODE-DISTINCT`: 2 SaaS apps read "2", however many connections they
 * received -- connection multiplicity/volume lives on the ribbon weights); `moreCount` is the "+N more"
 * tail of distinct destinations not in the listed apps. Only the `network` category carries apps today
 * (every captured `ConnectsTo` destination is a network endpoint); others list none.
 */
export interface OverviewDestNode {
  readonly class: string;
  readonly count: number;
  readonly apps: readonly OverviewApp[];
  readonly moreCount: number;
}

/** A weighted source-class -> VTZ flow (left stage). `weight` is the classified `ConnectsTo` edge count. */
export interface OverviewSourceEdge {
  readonly sourceClass: string;
  readonly vtzId: string;
  readonly weight: number;
}

/** A weighted VTZ -> destination-category flow (right stage). */
export interface OverviewDestEdge {
  readonly vtzId: string;
  readonly destClass: string;
  readonly weight: number;
}

/**
 * The redesigned Overview Sankey. Two-stage, VTZ-routed connectivity. An empty tenant yields empty arrays
 * (the renderer shows the honest "no connectivity observed" state); a VTZ with no detections is green.
 */
export interface OverviewSankey {
  readonly sources: readonly OverviewSourceNode[];
  readonly vtzs: readonly OverviewVtzNode[];
  readonly destinations: readonly OverviewDestNode[];
  readonly sourceEdges: readonly OverviewSourceEdge[];
  readonly destEdges: readonly OverviewDestEdge[];
  /**
   * True iff the engine's edge scan hit its ceiling (`INV-CONNECTIVITY-SCAN-COMPLETE-OR-FLAGGED`): the
   * Sankey shows a prefix of the connectivity graph, and the surface badges it rather than presenting
   * the prefix as the whole.
   */
  readonly truncated: boolean;
}

/** The home page shows at most this many VTZs; the rest are reachable by paging ("swipe for more"). */
export const OVERVIEW_VTZS_PER_PAGE = 3;

/** The number of VTZ pages for `count` zones (at least 1, so an empty tenant still has a page). */
export function overviewVtzPageCount(count: number): number {
  return Math.max(1, Math.ceil(count / OVERVIEW_VTZS_PER_PAGE));
}

/**
 * The VTZs visible on page `page` (0-based), at most {@link OVERVIEW_VTZS_PER_PAGE}. An out-of-range page
 * clamps into bounds so the surface never renders an empty page for a non-empty tenant.
 */
export function overviewVtzPage(
  vtzs: readonly OverviewVtzNode[],
  page: number,
): readonly OverviewVtzNode[] {
  const pages = overviewVtzPageCount(vtzs.length);
  const clamped = Math.max(0, Math.min(page, pages - 1));
  const start = clamped * OVERVIEW_VTZS_PER_PAGE;
  return vtzs.slice(start, start + OVERVIEW_VTZS_PER_PAGE);
}

/**
 * The set of edge endpoints to keep when a destination category is highlighted (the hover-to-filter
 * interaction): the VTZ->dest edges into `destClass`, plus the source->VTZ edges feeding those VTZs. A
 * caller dims every edge not returned here. `null` `destClass` means "nothing hovered" (keep all).
 */
export interface OverviewHighlight {
  readonly vtzIds: ReadonlySet<string>;
  readonly sourceEdgeKeys: ReadonlySet<string>;
  readonly destEdgeKeys: ReadonlySet<string>;
}

/** A stable key for a source edge (`sourceClass>vtzId`), matching {@link overviewHighlight}. */
export function sourceEdgeKey(edge: OverviewSourceEdge): string {
  return `${edge.sourceClass}>${edge.vtzId}`;
}

/** A stable key for a dest edge (`vtzId>destClass`). */
export function destEdgeKey(edge: OverviewDestEdge): string {
  return `${edge.vtzId}>${edge.destClass}`;
}

/**
 * Compute the highlight set for a hovered destination category. Returns the contributing VTZs + the edge
 * keys on the source->VTZ->`destClass` paths, so the renderer keeps those and dims the rest.
 */
export function overviewHighlight(graph: OverviewSankey, destClass: string): OverviewHighlight {
  const destEdges = graph.destEdges.filter((e) => e.destClass === destClass);
  const vtzIds = new Set(destEdges.map((e) => e.vtzId));
  const sourceEdges = graph.sourceEdges.filter((e) => vtzIds.has(e.vtzId));
  return {
    vtzIds,
    sourceEdgeKeys: new Set(sourceEdges.map(sourceEdgeKey)),
    destEdgeKeys: new Set(destEdges.map(destEdgeKey)),
  };
}

/** The destination category the engine's `top_destinations` (all network endpoints) list under. */
const NETWORK_DEST_CLASS = 'network';

/** The four destination categories, in ring order (top to bottom of the right column). */
export const OVERVIEW_DEST_CATEGORIES = ['network', 'saas', 'private-apps', 'data-stores'] as const;
export type OverviewDestCategory = (typeof OVERVIEW_DEST_CATEGORIES)[number];

/** A classified destination: the ring it belongs to + the simple display name (`GitHub`, `Postgres`). */
export interface OverviewClassifiedDest {
  readonly category: OverviewDestCategory;
  readonly name: string;
}

/** Classify one destination endpoint (the BFF's rich classifier satisfies this shape). */
export type OverviewDestClassifier = (
  address: string,
  resolvedName?: string,
) => OverviewClassifiedDest;

/**
 * Re-bucket the engine's flat `network` destinations into the four category rings using `classify`,
 * merging same-named apps (two GitHub load-balancer IPs -> one `GitHub` with the summed connection
 * count). Ring `count`s are DISTINCT destinations (`INV-CONNECTIVITY-NODE-DISTINCT`, matching the
 * engine's distinct-entity node counts): a ring reads the number of apps it LISTS (merged: two GitHub
 * LB IPs are one app), and the network ring adds the distinct unlisted tail (engine distinct total
 * minus the listed addresses) as its `moreCount`. Each
 * VTZ -> network ribbon splits across the resulting rings proportionally to their listed CONNECTION
 * totals (the closest available traffic proxy; ribbons carry volume, so a distinct-count share would
 * distort them) -- exact when one VTZ feeds the network class, the common case.
 */
function rebucketDestinations(
  graph: WireConnectivityGraph,
  apps: readonly { app: OverviewApp; resolvedName: string | undefined }[],
  classify: OverviewDestClassifier,
): { destinations: OverviewDestNode[]; destEdges: OverviewDestEdge[] } {
  // Merge classified apps by (category, name); the address kept is the highest-count contributor's.
  const merged = new Map<string, { category: OverviewDestCategory; app: OverviewApp }>();
  for (const { app, resolvedName } of apps) {
    const { category, name } = classify(app.address, resolvedName);
    const key = `${category} ${name}`;
    const prior = merged.get(key);
    if (prior) {
      merged.set(key, {
        category,
        app: { ...prior.app, count: prior.app.count + app.count },
      });
    } else {
      merged.set(key, { category, app: { name, address: app.address, count: app.count } });
    }
  }
  const byCategory = new Map<OverviewDestCategory, OverviewApp[]>();
  for (const { category, app } of merged.values()) {
    const list = byCategory.get(category) ?? [];
    list.push(app);
    byCategory.set(category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  // The engine's network count is DISTINCT endpoints; the distinct unlisted tail is that total minus
  // the listed addresses (the engine ranks top-N, so beyond-N endpoints have no per-app identity).
  const engineNetwork = graph.destinations.find((d) => d.class === NETWORK_DEST_CLASS);
  const networkTotal = engineNetwork?.count ?? 0;
  const tail = Math.max(0, networkTotal - apps.length);

  // An engine class that IS one of the four categories (e.g. an engine-side `saas` distinct count)
  // merges into that ring; those entities have no per-destination breakdown, so they land in moreCount.
  const engineExtra = (c: OverviewDestCategory): number =>
    c === NETWORK_DEST_CLASS ? 0 : (graph.destinations.find((d) => d.class === c)?.count ?? 0);
  // A ring's count matches what the operator sees: the merged apps LISTED on it (two GitHub LB IPs
  // are one app) plus, for network, the distinct unlisted endpoints (`moreCount`).
  const categoryCount = (c: OverviewDestCategory): number => {
    const listed = (byCategory.get(c) ?? []).length;
    return listed + (c === NETWORK_DEST_CLASS ? tail : engineExtra(c));
  };
  // ALL FOUR category rings always render (the same stability precedent as the VTZ column: every
  // configured zone appears, green when quiet). An empty ring is an honest zero, never omitted.
  const destinations: OverviewDestNode[] = OVERVIEW_DEST_CATEGORIES.map((c) => ({
    class: c,
    count: categoryCount(c),
    apps: byCategory.get(c) ?? [],
    moreCount: c === NETWORK_DEST_CLASS ? tail : engineExtra(c),
  }));
  // An engine class outside the four categories (none live today) passes through untouched.
  for (const d of graph.destinations) {
    if (d.class !== NETWORK_DEST_CLASS && !OVERVIEW_DEST_CATEGORIES.some((c) => c === d.class)) {
      destinations.push({ class: d.class, count: d.count, apps: [], moreCount: d.count });
    }
  }

  // Ribbon attribution: split each VTZ -> network ribbon by the rings' listed CONNECTION totals (the
  // ribbon weight is volume/connection mass; a distinct-count share would distort it). The unlisted
  // tail has no connection breakdown, so it follows the listed distribution; with nothing listed the
  // ribbon stays on the network ring (honest: no basis to split).
  const connByCategory = (c: OverviewDestCategory): number =>
    (byCategory.get(c) ?? []).reduce((s, a) => s + a.count, 0);
  const listedConnTotal = OVERVIEW_DEST_CATEGORIES.reduce((s, c) => s + connByCategory(c), 0);
  const destEdges: OverviewDestEdge[] = [];
  for (const e of graph.dest_edges) {
    if (e.dest_class !== NETWORK_DEST_CLASS || listedConnTotal === 0) {
      destEdges.push({ vtzId: e.vtz_id, destClass: e.dest_class, weight: e.weight });
      continue;
    }
    for (const c of OVERVIEW_DEST_CATEGORIES) {
      const share = connByCategory(c) / listedConnTotal;
      if (share > 0) {
        destEdges.push({ vtzId: e.vtz_id, destClass: c, weight: e.weight * share });
      }
    }
  }
  return { destinations, destEdges };
}

/**
 * Project a generated `WireConnectivityGraph` (the RD.3 two-stage shape) to the {@link OverviewSankey} view
 * model, or `null` if any VTZ risk band's level is unknown (fail-closed to the unavailable state).
 *
 * The engine returns the top specific destinations (`top_destinations`, ranked IPs). `resolveName` (the
 * BFF's reverse-DNS) maps an IP to a common name; an unresolved address falls back to the IP itself
 * (INV-CONSOLE-NO-STUB: never a fabricated name). `classify` (the BFF's rich classifier) re-buckets the
 * flat network class into the four category rings with simple merged names; without it every destination
 * lists under `network` unmerged. A drifted wire field is a compile error here (the cross-module guard);
 * the BFF resolver calls this.
 */
export function toOverviewSankey(
  graph: WireConnectivityGraph,
  resolveName?: (address: string) => string | undefined,
  classify?: OverviewDestClassifier,
): OverviewSankey | null {
  const vtzs: OverviewVtzNode[] = [];
  for (const v of graph.vtzs) {
    const risk = toRiskBand(v.risk);
    if (risk === null) {
      return null;
    }
    vtzs.push({ id: v.id, name: v.name, profile: toVtzProfile(v.profile), risk });
  }
  const resolved = graph.top_destinations.map((d) => {
    const resolvedName = resolveName?.(d.address)?.trim();
    return {
      resolvedName:
        resolvedName !== undefined && resolvedName.length > 0 ? resolvedName : undefined,
      app: {
        name: resolvedName !== undefined && resolvedName.length > 0 ? resolvedName : d.address,
        address: d.address,
        count: d.count,
      } satisfies OverviewApp,
    };
  });
  const bucketed = classify ? rebucketDestinations(graph, resolved, classify) : undefined;
  const destinations =
    bucketed?.destinations ??
    graph.destinations.map((d) => {
      // Without a classifier the engine classes pass through. `count` is DISTINCT destinations
      // (INV-CONNECTIVITY-NODE-DISTINCT), so the "+N more" tail is the distinct total minus the
      // LISTED addresses (each ranked top destination is one distinct endpoint).
      const apps = d.class === NETWORK_DEST_CLASS ? resolved.map((r) => r.app) : [];
      const listed = d.class === NETWORK_DEST_CLASS ? resolved.length : 0;
      return {
        class: d.class,
        count: d.count,
        apps,
        moreCount: Math.max(0, d.count - listed),
      };
    });
  const destEdges =
    bucketed?.destEdges ??
    graph.dest_edges.map((e) => ({
      vtzId: e.vtz_id,
      destClass: e.dest_class,
      weight: e.weight,
    }));

  return {
    sources: graph.sources.map((s) => ({ class: s.class, count: s.count })),
    vtzs,
    destinations,
    sourceEdges: graph.source_edges.map((e) => ({
      sourceClass: e.source_class,
      vtzId: e.vtz_id,
      weight: e.weight,
    })),
    destEdges,
    truncated: graph.truncated,
  };
}
