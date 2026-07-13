// apps/console/src/surfaces/useLogs.ts -- the live Logs read hook (IP-CONSOLE-09 LG.3).
//
// Fetches a page of the decision LOG from the BFF (GET /api/logs) for the current filter. The engine
// applies every filter/time-range/search (INV-CONSOLE-LOGS-REAL: never a client-side filter), so the
// query key is the filter -- changing a control refetches with the engine-compiled predicate. Same-origin
// with the session cookie; the SPA never holds a token. TanStack Query owns caching/loading/error.

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { LogDetailView, LogPage, LogQueryFilter } from '@forge/contracts';

// TUNE(IP-CONSOLE-09 LG.4): the live-tail poll interval. v1 polls the recent window so a new decision
// appears within ~1 interval; the real push-stream (crdb Part B / F0.6 SSE) gives true < 2 s and swaps in
// behind this same hook without touching the surface. 2 s balances freshness against engine read load.
const LIVE_POLL_MS = 2000;

/** Serialize a `LogQueryFilter` into the `/api/logs` query string (only the set fields). */
export function logsQueryString(filter: LogQueryFilter): string {
  const params = new URLSearchParams();
  if (filter.since !== undefined) params.set('since', String(filter.since));
  if (filter.until !== undefined) params.set('until', String(filter.until));
  if (filter.technique !== undefined) params.set('technique', filter.technique);
  if (filter.tactic !== undefined) params.set('tactic', filter.tactic);
  if (filter.ruleId !== undefined) params.set('ruleId', filter.ruleId);
  if (filter.confidence !== undefined) params.set('confidence', filter.confidence);
  if (filter.action !== undefined) params.set('action', filter.action);
  if (filter.search !== undefined) params.set('search', filter.search);
  params.set('limit', String(filter.limit));
  return params.toString();
}

/** Fetch a page of the LOG for `filter`. Throws on a non-2xx (the surface shows a load error). */
export async function fetchLogs(filter: LogQueryFilter): Promise<LogPage> {
  const res = await fetch(`/api/logs?${logsQueryString(filter)}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`logs query failed: ${String(res.status)}`);
  }
  return (await res.json()) as LogPage;
}

/**
 * The live LOG page for `filter`. The query key carries the filter, so a control change refetches with the
 * engine-compiled predicate. When `live` (the range includes "now"), it polls the recent window so new
 * decisions appear at the top in place; `keepPreviousData` holds the current rows across a refetch (no
 * flash on a tick, and stale rows stay visible while a failed poll reconnects). `live=false` pauses the
 * poll for a historical view.
 */
export function useLogs(filter: LogQueryFilter, live = true): UseQueryResult<LogPage> {
  return useQuery({
    queryKey: ['logs', filter],
    queryFn: () => fetchLogs(filter),
    placeholderData: keepPreviousData,
    refetchInterval: live ? LIVE_POLL_MS : false,
  });
}

/** The cache key for one decision's EXPLAIN detail (its id), shared by the query + the imperative fetch. */
export function logExplainQueryKey(decisionId: string): readonly [string, string] {
  return ['logExplain', decisionId];
}

/** Fetch one decision's full detail from the BFF (GET /api/logs/explain/<id>). Throws on a non-2xx. */
export async function fetchLogExplain(decisionId: string): Promise<LogDetailView> {
  const res = await fetch(`/api/logs/explain/${encodeURIComponent(decisionId)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`log explain failed: ${String(res.status)}`);
  }
  return (await res.json()) as LogDetailView;
}

/**
 * The EXPLAIN detail for `decisionId`, or an idle query when null (no row expanded). The key is the
 * decision id, so a row hover-prefetched into this cache opens its EXPLAIN + acting-entity instantly.
 */
export function useLogExplain(decisionId: string | null): UseQueryResult<LogDetailView> {
  return useQuery({
    queryKey: decisionId === null ? ['logExplain', null] : logExplainQueryKey(decisionId),
    queryFn: () => {
      if (decisionId === null) throw new Error('no decision id');
      return fetchLogExplain(decisionId);
    },
    enabled: decisionId !== null,
  });
}
