// apps/console/src/surfaces/useLogs.ts -- the live Logs read hook (IP-CONSOLE-09 LG.3).
//
// Fetches a page of the decision LOG from the BFF (GET /api/logs) for the current filter. The engine
// applies every filter/time-range/search (INV-CONSOLE-LOGS-REAL: never a client-side filter), so the
// query key is the filter -- changing a control refetches with the engine-compiled predicate. Same-origin
// with the session cookie; the SPA never holds a token. TanStack Query owns caching/loading/error.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { LogPage, LogQueryFilter } from '@forge/contracts';

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
 * engine-compiled predicate; TanStack keeps the previous page visible until the next resolves.
 */
export function useLogs(filter: LogQueryFilter): UseQueryResult<LogPage> {
  return useQuery({
    queryKey: ['logs', filter],
    queryFn: () => fetchLogs(filter),
  });
}
