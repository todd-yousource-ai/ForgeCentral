// apps/console/src/surfaces/useOverview.ts -- the live Overview connectivity read hook (IP-CONSOLE-01 O1.5).
//
// Fetches the tenant-wide connectivity graph from the BFF (GET /api/overview/graph) for the current query
// bounds. The engine aggregates + bounds + risk-bands the graph (crdb CONNECTIVITY_GRAPH); the BFF projects
// it to an `OverviewGraph` and this hook only carries it, so nothing is fabricated (INV-CONSOLE-NO-STUB).
// Same-origin with the session cookie; the SPA never holds a token. TanStack Query owns caching + the
// loading/error states. The live poll (deltas in place) is O1.7 and swaps in behind this same hook; O1.5
// reads once per query.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OverviewGraph, OverviewQuery } from '@forge/contracts';

/** Serialize an `OverviewQuery` into the `/api/overview/graph` query string (only the set bounds). */
export function overviewQueryString(query: OverviewQuery): string {
  const params = new URLSearchParams();
  if (query.since !== undefined) params.set('since', String(query.since));
  if (query.until !== undefined) params.set('until', String(query.until));
  params.set('limit', String(query.limit));
  return params.toString();
}

/** Fetch the connectivity graph for `query`. Throws on a non-2xx so the surface shows a load error. */
export async function fetchOverview(query: OverviewQuery): Promise<OverviewGraph> {
  const res = await fetch(`/api/overview/graph?${overviewQueryString(query)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`overview graph failed: ${String(res.status)}`);
  }
  return (await res.json()) as OverviewGraph;
}

/**
 * The tenant-wide connectivity graph for `query`. The query key carries the bounds, so changing the window
 * refetches. The engine cannot filter by source class (CONNECTIVITY_GRAPH has no lane parameter), so the
 * surface's lane tabs are a client-side VIEW filter over this already-real graph, never a data filter.
 */
export function useOverview(query: OverviewQuery): UseQueryResult<OverviewGraph> {
  return useQuery({
    queryKey: ['overview', query],
    queryFn: () => fetchOverview(query),
  });
}
