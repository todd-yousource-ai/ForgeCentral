// apps/console/src/surfaces/useLogs.ts -- the live Logs read hook (IP-CONSOLE-09 LG.3).
//
// Fetches a page of the decision LOG from the BFF (GET /api/logs) for the current filter. The engine
// applies every filter/time-range/search (INV-CONSOLE-LOGS-REAL: never a client-side filter), so the
// query key is the filter -- changing a control refetches with the engine-compiled predicate. Same-origin
// with the session cookie; the SPA never holds a token. TanStack Query owns caching/loading/error.

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { LogDetailView, LogPage, LogQueryFilter, LogRow } from '@forge/contracts';

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
  if (filter.offset !== undefined && filter.offset > 0) params.set('offset', String(filter.offset));
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
  const backfill = useLogsBackfill(filter.limit);
  return useQuery({
    queryKey: ['logs', filter],
    queryFn: () => fetchLogs(filter),
    // SQ.8b (INV-CONSOLE-LOGS-INSTANT): a filter change answers INSTANTLY from the background-
    // loaded cache (client-filtered placeholder) while the engine's authoritative result loads and
    // replaces it -- the engine predicate remains the source of truth (INV-CONSOLE-LOGS-REAL); the
    // cache is only ever a complete, real, already-fetched superset shown early.
    placeholderData: (previous) => {
      if (previous !== undefined) return previous;
      if (!backfill.complete) return undefined;
      return { rows: backfill.rows.filter((row) => matchesFilter(row, filter)) };
    },
    refetchInterval: live ? LIVE_POLL_MS : false,
  });
}

// TUNE(SQ.8b): the background pager's page size and refresh cadence. Pages walk `offset` until a
// short page (the working set is bounded, so this converges fast); the cache refreshes on the slow
// interval -- freshness comes from the live page-0 poll above, not from re-walking the backfill.
const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_REFRESH_MS = 30_000;
const BACKFILL_MAX_PAGES = 50;

/** The background-loaded LOG cache: every row the engine holds, walked one page at a time. */
export interface LogsBackfill {
  /** Every cached row, newest-first (page order preserved). */
  readonly rows: LogPage['rows'];
  /** True once the walk hit a short page -- only then may filters answer from the cache. */
  readonly complete: boolean;
}

/**
 * Background-loads the whole LOG one page at a time (SQ.8b): page 0 is the working set the surface
 * already shows; subsequent pages walk `offset` until a short page. The result feeds `useLogs`'s
 * instant-filter placeholder; it never replaces the engine's filtered read.
 */
export function useLogsBackfill(pageSize: number = BACKFILL_PAGE_SIZE): LogsBackfill {
  const query = useQuery({
    queryKey: ['logsBackfill', pageSize],
    queryFn: async (): Promise<LogsBackfill> => {
      const rows: LogRow[] = [];
      for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
        // Sequential on purpose: one in-flight request, engine-friendly.
        // eslint-disable-next-line no-await-in-loop
        const fetched = await fetchLogs({ limit: pageSize, offset: page * pageSize });
        rows.push(...fetched.rows);
        if (fetched.rows.length < pageSize) {
          return { rows, complete: true };
        }
      }
      // The cap bound the walk (an unusually deep store): the cache is honest but incomplete, so
      // filters keep going to the engine.
      return { rows, complete: false };
    },
    refetchInterval: BACKFILL_REFRESH_MS,
    staleTime: BACKFILL_REFRESH_MS,
  });
  return query.data ?? { rows: [], complete: false };
}

/**
 * The client-side mirror of the engine's LOG predicate, used ONLY for the instant placeholder over a
 * COMPLETE cache (the engine's own filtered result replaces it). `search` matches the summary, rule
 * id, and technique (the row does not carry the evidence body).
 */
export function matchesFilter(row: LogPage['rows'][number], filter: LogQueryFilter): boolean {
  if (filter.since !== undefined && row.at < filter.since) return false;
  if (filter.until !== undefined && row.at > filter.until) return false;
  if (filter.technique !== undefined && row.technique !== filter.technique) return false;
  if (filter.tactic !== undefined && !row.tactics.includes(filter.tactic)) return false;
  if (filter.ruleId !== undefined && row.ruleId !== filter.ruleId) return false;
  if (filter.confidence !== undefined && row.confidence !== filter.confidence) return false;
  if (filter.action !== undefined && row.outcome !== filter.action) return false;
  if (filter.search !== undefined) {
    const needle = filter.search.toLowerCase();
    const hit =
      row.summary.toLowerCase().includes(needle) ||
      row.ruleId.toLowerCase().includes(needle) ||
      row.technique.toLowerCase().includes(needle);
    if (!hit) return false;
  }
  return true;
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
