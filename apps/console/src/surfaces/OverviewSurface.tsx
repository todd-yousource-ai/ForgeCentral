// apps/console/src/surfaces/OverviewSurface.tsx -- the Overview (connectivity) surface (IP-CONSOLE-01 RD.4b).
//
// The Console's flagship home: the live, tenant-wide connectivity flow, rendered as the redesigned Sankey.
// The `useOverview` hook reads the real VTZ-routed graph from the BFF (GET /api/overview/sankey -> crdb
// CONNECTIVITY_GRAPH, zoned); this surface renders it with the shared `OverviewSankeyFlow` and owns the
// honest states. The graphic shows at most three VTZs per page, so the surface pages the rest ("swipe for
// more"); hovering a destination category filters the left flows to only the paths that feed it (a
// client-side VIEW over the already-real graph, INV-CONSOLE-NO-STUB, never a data filter). The header badge
// summarizes the worst VTZ risk band as a glanceable. Loading and empty are the flow's own honest states;
// only a hard engine failure degrades to an ErrorState.

import { useMemo, useState, type ReactElement } from 'react';
import { Badge, OverviewSankeyFlow, type BadgeVariant } from '@forge/design';
import {
  overviewVtzPageCount,
  type OverviewQuery,
  type OverviewSankey,
  type RiskLevel,
} from '@forge/contracts';

import { ErrorState, StaleBanner } from '../states/States.js';
import { useLive } from '../live/LiveProvider.js';
import { useOverview } from './useOverview.js';

// TUNE(IP-CONSOLE-01 RD.4b): the aggregation scan bound requested (the engine clamps to its per-tenant
// ceiling). Matches the BFF default; RD.4b reads the full recent graph, no time window control yet.
const SCAN_LIMIT = 1000;

/** The risk band -> the header badge label + its semantic variant (the worst zone's glanceable summary). */
const RISK_BADGE: Readonly<Record<RiskLevel, { label: string; variant: BadgeVariant }>> = {
  green: { label: 'Risk: Nominal', variant: 'good' },
  yellow: { label: 'Risk: Elevated', variant: 'caution' },
  red: { label: 'Risk: Critical', variant: 'critical' },
};

/** Severity order so the header can summarize the tenant by its single worst zone. */
const RISK_RANK: Readonly<Record<RiskLevel, number>> = { green: 0, yellow: 1, red: 2 };

/**
 * The worst risk band across the graph's VTZs, or `null` when there are no zones (an empty tenant shows no
 * badge). The per-zone bands are the real detection-driven risk; this only picks the most severe to glance.
 */
export function worstRisk(graph: OverviewSankey): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const vtz of graph.vtzs) {
    if (worst === null || RISK_RANK[vtz.risk.level] > RISK_RANK[worst]) {
      worst = vtz.risk.level;
    }
  }
  return worst;
}

/** The Overview surface: the live connectivity Sankey + VTZ paging + hover-to-filter + the risk summary. */
export function OverviewSurface(): ReactElement {
  const [vtzPage, setVtzPage] = useState(0);
  const [hoveredDest, setHoveredDest] = useState<string | null>(null);
  const query = useMemo<OverviewQuery>(() => ({ limit: SCAN_LIMIT }), []);
  const overview = useOverview(query);
  const live = useLive();

  const graph = overview.data;
  const pageCount = graph ? overviewVtzPageCount(graph.vtzs.length) : 1;
  // Clamp the page if the graph shrank (data changed) so we never render an empty page for a live tenant.
  const activePage = Math.min(vtzPage, pageCount - 1);
  const risk = graph ? worstRisk(graph) : null;
  const badge = risk !== null ? RISK_BADGE[risk] : null;
  const showFullError = overview.isError && graph === undefined;

  return (
    <section className="fcx-surface" aria-labelledby="surface-overview">
      <div className="fcx-surface__header">
        <h2 id="surface-overview" className="fcx-surface__heading">
          Overview
        </h2>
        {badge !== null ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
        {/* INV-CONNECTIVITY-SCAN-COMPLETE-OR-FLAGGED: the engine reports when its edge scan hit the
            ceiling; the surface says so rather than presenting a prefix of the graph as the whole. */}
        {graph?.truncated === true ? <Badge variant="caution">Partial graph</Badge> : null}
      </div>

      {/* The graph reads live, but the delta stream (O1.7) is not wired yet -- mark it honestly. */}
      {live.status !== 'live' ? <StaleBanner reason={live.reason} /> : null}

      {graph !== undefined && pageCount > 1 ? (
        <nav className="fcx-ov-pager" aria-label="Trust zone pages">
          <button
            type="button"
            className="fcx-btn"
            onClick={() => setVtzPage((p) => Math.max(0, p - 1))}
            disabled={activePage === 0}
          >
            Previous zones
          </button>
          <span className="fcx-ov-pager__status" aria-live="polite">
            Zones {activePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="fcx-btn"
            onClick={() => setVtzPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={activePage >= pageCount - 1}
          >
            More zones
          </button>
        </nav>
      ) : null}

      {showFullError ? (
        <ErrorState
          title="Could not load the connectivity graph."
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <div className="fcx-overview-canvas">
          <OverviewSankeyFlow
            graph={graph ?? null}
            loading={overview.isLoading}
            vtzPage={activePage}
            hoveredDest={hoveredDest}
            onHoverDest={setHoveredDest}
          />
        </div>
      )}
    </section>
  );
}
