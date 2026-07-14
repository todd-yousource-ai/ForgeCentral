// apps/console/src/surfaces/useOverview.ts -- the live Overview connectivity read hook (IP-CONSOLE-01 RD.4b).
//
// Fetches the tenant-wide, VTZ-routed connectivity graph from the BFF (GET /api/overview/sankey) for the
// current query bounds. The engine aggregates + bounds + risk-bands the graph (crdb CONNECTIVITY_GRAPH,
// zoned into the demo VTZs); the BFF projects it to an `OverviewSankey` (source -> VTZ -> destination, each
// VTZ with its own detection-driven risk) and this hook only carries it, so nothing is fabricated
// (INV-CONSOLE-NO-STUB). Same-origin with the session cookie; the SPA never holds a token. TanStack Query
// owns caching + the loading/error states. The live poll (deltas in place) is O1.7 and swaps in behind this
// same hook; RD.4b reads once per query.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OverviewQuery, OverviewSankey } from '@forge/contracts';

/** Serialize an `OverviewQuery` into the `/api/overview/sankey` query string (only the set bounds). */
export function overviewQueryString(query: OverviewQuery): string {
  const params = new URLSearchParams();
  if (query.since !== undefined) params.set('since', String(query.since));
  if (query.until !== undefined) params.set('until', String(query.until));
  params.set('limit', String(query.limit));
  return params.toString();
}

/** Fetch the connectivity Sankey for `query`. Throws on a non-2xx so the surface shows a load error. */
export async function fetchOverview(query: OverviewQuery): Promise<OverviewSankey> {
  const res = await fetch(`/api/overview/sankey?${overviewQueryString(query)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`overview sankey failed: ${String(res.status)}`);
  }
  return (await res.json()) as OverviewSankey;
}

/**
 * The tenant-wide VTZ-routed connectivity Sankey for `query`. The query key carries the bounds, so changing
 * the window refetches. The engine routes every classified `ConnectsTo` edge through the demo VTZs and
 * time-windows the per-VTZ risk (CONNECTIVITY_GRAPH); this hook carries the already-real graph. The
 * hover-to-filter + VTZ paging the surface layers on top are client-side VIEWS over it, never data filters.
 */
export function useOverview(query: OverviewQuery): UseQueryResult<OverviewSankey> {
  return useQuery({
    queryKey: ['overview-sankey', query],
    queryFn: () => fetchOverview(query),
  });
}
