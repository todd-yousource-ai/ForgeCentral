// apps/console/src/surfaces/useOverview.ts -- the live Overview connectivity read hook (IP-CONSOLE-01 RD.4b).
//
// Fetches the tenant-wide, VTZ-routed connectivity graph from the BFF (GET /api/overview/sankey) for the
// current query bounds. The engine aggregates + bounds + risk-bands the graph (crdb CONNECTIVITY_GRAPH,
// zoned into the demo VTZs); the BFF projects it to an `OverviewSankey` (source -> VTZ -> destination, each
// VTZ with its own detection-driven risk) and this hook only carries it, so nothing is fabricated
// (INV-CONSOLE-NO-STUB). Same-origin with the session cookie; the SPA never holds a token. TanStack Query
// owns caching + the loading/error states. The live poll (deltas in place) is O1.7 and swaps in behind this
// same hook; RD.4b reads once per query.

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OverviewQuery, OverviewSankey } from '@forge/contracts';

// TUNE(IP-CONSOLE-01 O1.7): the live re-poll interval. v1 re-reads the tenant-wide Sankey so a committed
// connection appears within ~1 interval (the crdb live overlay `07c6c77a` makes the read scan-free ~300ms).
// The engine push-stream (`overview.live`, crdb Part B) swaps in behind this same hook without touching the
// surface. 2 s matches the "< 2 s" freshness bar and the Logs live-tail precedent.
export const OVERVIEW_LIVE_POLL_MS = 2000;

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
export function useOverview(query: OverviewQuery, live = true): UseQueryResult<OverviewSankey> {
  return useQuery({
    queryKey: ['overview-sankey', query],
    queryFn: () => fetchOverview(query),
    // Re-poll in place: the last successful graph stays while a tick refetches (no wipe/flash), so counts,
    // VTZ risk, and edge weights update live and a failed poll keeps the last-known graph visible.
    placeholderData: keepPreviousData,
    refetchInterval: live ? OVERVIEW_LIVE_POLL_MS : false,
  });
}

/** The Overview's freshness, derived from its poll (drives the shared live-store; O1.7 INV-CONSOLE-LIVE). */
export type OverviewLiveness = 'connecting' | 'live' | 'reconnecting';

/**
 * Map the poll's query state to a freshness status: no data yet is `connecting` (the first read is in
 * flight); last-known data with a failed latest poll is `reconnecting` (the graph stays, the marker shows);
 * otherwise `live`. Pure so the surface can drive the live-store deterministically.
 */
export function overviewLiveness(part: {
  readonly hasData: boolean;
  readonly isError: boolean;
}): OverviewLiveness {
  if (!part.hasData) return 'connecting';
  if (part.isError) return 'reconnecting';
  return 'live';
}
