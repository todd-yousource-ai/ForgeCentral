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
import { useEffect, useState } from 'react';
import type { OverviewQuery, OverviewSankey } from '@forge/contracts';

// TUNE(IP-CONSOLE-01 O1.7): the live re-poll interval. v1 re-reads the tenant-wide Sankey so a committed
// connection appears within ~1 interval (the crdb live overlay `07c6c77a` makes the read scan-free ~300ms).
// The engine push-stream (`overview.live`, crdb Part B) swaps in behind this same hook without touching the
// surface. 2 s matches the "< 2 s" freshness bar and the Logs live-tail precedent.
export const OVERVIEW_LIVE_POLL_MS = 2000;

// TUNE(IP-CONSOLE-01): the first-paint node budget. The FIRST read is capped small so the connectivity
// graph paints fast, then {@link useOverview} escalates to the caller's full limit in the background
// (`keepPreviousData` keeps the first paint on screen during the upgrade, so it "continues to build"
// without a wipe). 50 is the "first 50 identities" first-paint target; a caller whose full limit is already
// <= 50 skips the escalation entirely. Progressive paint only -- it never changes what the engine returns
// at the full limit (INV-CONSOLE-NO-STUB), only the order in which the operator sees it.
export const OVERVIEW_FIRST_PAINT_LIMIT = 50;

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
  const fullLimit = query.limit;
  const firstPaintLimit = Math.min(OVERVIEW_FIRST_PAINT_LIMIT, fullLimit);
  // The window identity: a bounds/limit change restarts the progression from the fast first paint.
  const boundsKey = `${String(query.since ?? '')}:${String(query.until ?? '')}:${String(fullLimit)}`;

  // The limit the current read uses: the small first-paint budget until the first read lands, then the
  // caller's full limit. Reset during render when the window changes (React's documented adjust-state-on-
  // prop-change pattern -- guarded by the boundsKey compare so it cannot loop).
  const [progress, setProgress] = useState({ boundsKey, limit: firstPaintLimit });
  let activeLimit = progress.limit;
  if (progress.boundsKey !== boundsKey) {
    setProgress({ boundsKey, limit: firstPaintLimit });
    activeLimit = firstPaintLimit;
  }

  const activeQuery: OverviewQuery = { ...query, limit: activeLimit };
  const result = useQuery({
    // The active limit is part of the key, so the first-paint read and the full read are distinct cache
    // entries; keepPreviousData keeps the first paint on screen while the full graph loads.
    queryKey: ['overview-sankey', activeQuery],
    queryFn: () => fetchOverview(activeQuery),
    // Re-poll in place: the last successful graph stays while a tick refetches (no wipe/flash), so counts,
    // VTZ risk, and edge weights update live and a failed poll keeps the last-known graph visible.
    placeholderData: keepPreviousData,
    refetchInterval: live ? OVERVIEW_LIVE_POLL_MS : false,
  });

  // Once the fast first paint has landed, escalate to the full limit ONCE, in the background. From then on
  // the steady poll runs at the full limit; a window change resets activeLimit above and this fires again.
  useEffect(() => {
    if (result.isSuccess && activeLimit < fullLimit) {
      setProgress({ boundsKey, limit: fullLimit });
    }
  }, [result.isSuccess, activeLimit, fullLimit, boundsKey]);

  return result;
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
