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

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, OverviewSankeyFlow, type BadgeVariant } from '@forge/design';
import {
  overviewVtzPageCount,
  type OverviewQuery,
  type OverviewSankey,
  type RiskLevel,
} from '@forge/contracts';

import { ErrorState, StaleBanner } from '../states/States.js';
import { useLive, useLiveStore } from '../live/LiveProvider.js';
import { useDrawer } from '../shell/DrawerHost.js';
import { overviewLiveness, useOverview } from './useOverview.js';

// The human label for each container the graph can open (the drawer title). Source lanes + dest rings;
// an unknown tag (never expected) falls back to the raw class, never a fabricated name.
const CONTAINER_LABEL: Readonly<Record<string, string>> = {
  agents: 'AI Agents',
  users: 'Users',
  devices: 'Devices',
  network: 'Network',
  saas: 'SaaS Apps',
  'private-apps': 'Private Apps',
  'data-stores': 'Data Stores',
};

// TUNE(IP-CONSOLE-01 RD.4b, operator steer 2026-07-16): the request bound (the engine clamps to its
// per-tenant ceiling). Matches the BFF default (10k, raised to build out the current environment);
// RD.4b reads the full recent graph, no time window control yet.
const SCAN_LIMIT = 10_000;

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
  const [hoveredSource, setHoveredSource] = useState<string | null>(null);
  const query = useMemo<OverviewQuery>(() => ({ limit: SCAN_LIMIT }), []);
  const overview = useOverview(query);
  const live = useLive();
  const liveStore = useLiveStore();
  const drawer = useDrawer();
  const navigate = useNavigate();

  // O1.7 (INV-CONSOLE-LIVE): the poll drives the shared freshness store, so the shell indicator + this
  // surface read ONE source. A healthy tick is `live`; a failed tick with a last-known graph is
  // `reconnecting` (the graph stays); the first read is `connecting`. Reset to unavailable on unmount so
  // the shell honestly shows "not live" once no surface is driving freshness.
  const liveness = overviewLiveness({
    hasData: overview.data !== undefined,
    isError: overview.isError,
  });
  useEffect(() => {
    if (liveness === 'live') {
      liveStore.set({ status: 'live', reason: '' });
    } else if (liveness === 'reconnecting') {
      liveStore.set({ status: 'stale', reason: 'Reconnecting to the live graph' });
    } else {
      liveStore.set({ status: 'connecting', reason: 'Connecting to the live graph' });
    }
  }, [liveness, liveStore]);
  useEffect(() => () => liveStore.reset(), [liveStore]);

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
        {/* O1.7 (INV-CONSOLE-LIVE): the surface polls the Sankey in place, so a healthy tick reads as a
            real Live badge; a lagging/failed tick degrades to the reconnecting marker below (never a fake
            Live). The first read shows no badge until data arrives. */}
        {live.status === 'live' ? <Badge variant="good">Live</Badge> : null}
        {/* INV-CONNECTIVITY-SCAN-COMPLETE-OR-FLAGGED: the engine reports when its edge scan hit the
            ceiling; the surface says so rather than presenting a prefix of the graph as the whole. */}
        {graph?.truncated === true ? <Badge variant="caution">Partial graph</Badge> : null}
      </div>

      {/* A lagging/failed poll (with a last-known graph still shown) reads as reconnecting, not a wipe. */}
      {live.status === 'stale' ? <StaleBanner reason={live.reason} /> : null}

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
            hoveredSource={hoveredSource}
            onHoverSource={setHoveredSource}
            onSelectContainer={(container) =>
              drawer.openContainer(container, CONTAINER_LABEL[container] ?? container)
            }
            // A VTZ ring lands on that zone's governance surface (TRD-CONSOLE-02 acceptance; the leg
            // IP-CONSOLE-01 deferred until the VTZ surface existed). One click from the Overview graph.
            onSelectVtz={(zoneId) => {
              void navigate(`/vtz?zone=${encodeURIComponent(zoneId)}`);
            }}
          />
        </div>
      )}
    </section>
  );
}
