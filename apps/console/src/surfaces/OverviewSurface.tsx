// apps/console/src/surfaces/OverviewSurface.tsx -- the Overview (connectivity) surface (IP-CONSOLE-01 O1.5).
//
// The Console's flagship home: the live, tenant-wide connectivity flow. The `useOverview` hook reads the
// real graph from the BFF (GET /api/overview/graph -> crdb CONNECTIVITY_GRAPH); this surface renders it with
// the shared `OverviewFlow` and the source-class lane tabs, and owns the honest states. The engine has no
// lane parameter (CONNECTIVITY_GRAPH is tenant-wide), so the tabs are a client-side VIEW filter over the
// already-real graph -- All shows every lane; a lane tab shows that source, its outbound ribbons, and only
// the destinations those ribbons reach (INV-CONSOLE-NO-STUB: a subset of real facts, never fabricated).
// Loading and empty are the flow's own honest states; only a hard engine failure degrades to an ErrorState.

import { useMemo, useState, type ReactElement } from 'react';
import { Badge, OverviewFlow, TabStrip, sourceClassLabel, type BadgeVariant } from '@forge/design';
import type { OverviewGraph, OverviewQuery, RiskLevel } from '@forge/contracts';

import { ErrorState, StaleBanner } from '../states/States.js';
import { useLive } from '../live/LiveProvider.js';
import { useOverview } from './useOverview.js';

// TUNE(IP-CONSOLE-01 O1.5): the aggregation scan bound requested (the engine clamps to its per-tenant
// ceiling). Matches the BFF default; O1.5 reads the full recent graph, no time window control yet.
const SCAN_LIMIT = 1000;

/** The lane tab that shows every source (the default view). */
const ALL_LANE = 'all';

/** The risk band -> the header badge label + its semantic variant (the zone color's glanceable summary). */
const RISK_BADGE: Readonly<Record<RiskLevel, { label: string; variant: BadgeVariant }>> = {
  green: { label: 'Risk: Nominal', variant: 'good' },
  yellow: { label: 'Risk: Elevated', variant: 'caution' },
  red: { label: 'Risk: Critical', variant: 'critical' },
};

/**
 * Project the graph to a single source lane: that source node, its outbound ribbons, and only the
 * destinations those ribbons reach. The risk band is tenant-wide, so it is carried through unchanged.
 * `all` returns the graph untouched.
 */
export function filterByLane(graph: OverviewGraph, lane: string): OverviewGraph {
  if (lane === ALL_LANE) return graph;
  const edges = graph.edges.filter((edge) => edge.sourceClass === lane);
  const reached = new Set(edges.map((edge) => edge.destClass));
  return {
    sources: graph.sources.filter((node) => node.class === lane),
    destinations: graph.destinations.filter((node) => reached.has(node.class)),
    edges,
    risk: graph.risk,
  };
}

/** The Overview surface: the live connectivity flow + source-class lane tabs + the risk summary + states. */
export function OverviewSurface(): ReactElement {
  const [lane, setLane] = useState(ALL_LANE);
  const query = useMemo<OverviewQuery>(() => ({ limit: SCAN_LIMIT }), []);
  const overview = useOverview(query);
  const live = useLive();

  const graph = overview.data;
  // The lane tabs, derived from the real source classes present (plus All). If the selected lane is not in
  // the current graph (data changed), fall through to All rather than showing an empty view.
  const tabs = useMemo(
    () => [
      { id: ALL_LANE, label: 'All' },
      ...(graph?.sources ?? []).map((node) => ({
        id: node.class,
        label: sourceClassLabel(node.class),
      })),
    ],
    [graph],
  );
  const activeLane = tabs.some((tab) => tab.id === lane) ? lane : ALL_LANE;
  const view = graph ? filterByLane(graph, activeLane) : null;
  const risk = graph ? RISK_BADGE[graph.risk.level] : null;
  const showFullError = overview.isError && graph === undefined;

  return (
    <section className="fcx-surface" aria-labelledby="surface-overview">
      <div className="fcx-surface__header">
        <h2 id="surface-overview" className="fcx-surface__heading">
          Overview
        </h2>
        {risk !== null ? <Badge variant={risk.variant}>{risk.label}</Badge> : null}
      </div>

      {/* The graph reads live, but the delta stream (O1.7) is not wired yet -- mark it honestly. */}
      {live.status !== 'live' ? <StaleBanner reason={live.reason} /> : null}

      {graph !== undefined && tabs.length > 1 ? (
        <TabStrip
          tabs={tabs}
          activeId={activeLane}
          onChange={setLane}
          ariaLabel="Filter the connectivity flow by source class"
        />
      ) : null}

      {showFullError ? (
        <ErrorState
          title="Could not load the connectivity graph."
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <div className="fcx-overview-canvas">
          <OverviewFlow graph={view} loading={overview.isLoading} />
        </div>
      )}
    </section>
  );
}
