// apps/console/src/surfaces/useIdam.ts -- the External IDAM read hooks (IP-CONSOLE-04 ID.2).
//
// Reads the External IDAM connector list from the BFF (GET /api/idam/connectors), which brokers it to
// the crdb IdAM connector read (IDAM_CONNECTORS over :7878, crdb IA.8). The engine owns every
// connector record; the BFF projects it fail-closed (an unrecognized completeness renders `unknown`,
// never a green card); this hook only carries the result, so nothing on the tab is fabricated
// (INV-CONSOLE-IDAM-CONNECTORS-REAL). Same-origin with the session cookie; the SPA never holds a token.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { IdamConnector, SyncReceipt } from '@forge/contracts';

const CONNECTORS_KEY = ['idam', 'connectors'] as const;

/** Fetch the tenant's External IDAM connectors. Throws on a non-2xx so the tab shows a load error. */
export async function fetchIdamConnectors(): Promise<readonly IdamConnector[]> {
  const res = await fetch('/api/idam/connectors', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`idam connectors list failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly IdamConnector[];
}

/**
 * The External IDAM connector list. Refetches on invalidation (a sync/configure command); while any
 * connector is actively running a sync it polls every 3s so the card reflects the engine's `running`
 * flag through to completion -- driven by engine truth, never a client-side timer. An unfederated node
 * returns an empty list (rendered "no connector configured").
 */
export function useIdamConnectors(): UseQueryResult<readonly IdamConnector[]> {
  return useQuery({
    queryKey: CONNECTORS_KEY,
    queryFn: fetchIdamConnectors,
    refetchInterval: (query) => ((query.state.data ?? []).some((c) => c.running) ? 3000 : false),
  });
}

/** A sync command refusal, typed for the tab (409 disabled/unconfigured, 403 tier, else engine). */
export class IdamSyncError extends Error {
  constructor(readonly status: number) {
    super(`idam sync failed: ${String(status)}`);
    this.name = 'IdamSyncError';
  }
}

/**
 * Trigger a real federation sync for one connector (audited engine command). The engine ACKs
 * immediately and marks the sync DUE; progress is read back through {@link useIdamConnectors} (the
 * `running` flag), never a client timer. On success the connector list is invalidated so it refetches
 * and begins polling.
 */
export function useIdamSync(): UseMutationResult<SyncReceipt, Error, { provider: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider }) => {
      const res = await fetch('/api/idam/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        throw new IdamSyncError(res.status);
      }
      return (await res.json()) as SyncReceipt;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CONNECTORS_KEY }),
  });
}
