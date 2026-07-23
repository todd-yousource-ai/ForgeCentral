// apps/console/src/surfaces/useIdam.ts -- the External IDAM read hooks (IP-CONSOLE-04 ID.2).
//
// Reads the External IDAM connector list from the BFF (GET /api/idam/connectors), which brokers it to
// the crdb IdAM connector read (IDAM_CONNECTORS over :7878, crdb IA.8). The engine owns every
// connector record; the BFF projects it fail-closed (an unrecognized completeness renders `unknown`,
// never a green card); this hook only carries the result, so nothing on the tab is fabricated
// (INV-CONSOLE-IDAM-CONNECTORS-REAL). Same-origin with the session cookie; the SPA never holds a token.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { IdamConnector } from '@forge/contracts';

/** Fetch the tenant's External IDAM connectors. Throws on a non-2xx so the tab shows a load error. */
export async function fetchIdamConnectors(): Promise<readonly IdamConnector[]> {
  const res = await fetch('/api/idam/connectors', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`idam connectors list failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly IdamConnector[];
}

/**
 * The External IDAM connector list. Not polled: the connector set changes on operator commands
 * (configure/sync land in ID.3/ID.4 and invalidate this key), so it refetches on invalidation rather
 * than on a timer. An unfederated node returns an empty list (rendered "no connector configured").
 */
export function useIdamConnectors(): UseQueryResult<readonly IdamConnector[]> {
  return useQuery({ queryKey: ['idam', 'connectors'], queryFn: fetchIdamConnectors });
}
