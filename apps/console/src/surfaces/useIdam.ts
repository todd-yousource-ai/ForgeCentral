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

/** A connect refusal, typed for the form (409 bad secret / connectivity, 403 tier, 503 sidecar). */
export class IdamConnectError extends Error {
  constructor(readonly status: number) {
    super(`idam connect failed: ${String(status)}`);
    this.name = 'IdamConnectError';
  }
}

/** The engine-enforced cadence bounds (crdb IA.7); the form's hints are UX, the engine holds the bound. */
export const IDAM_POLL_INTERVAL_SECS_MIN = 60;
export const IDAM_POLL_INTERVAL_SECS_MAX = 86_400;
export const IDAM_FULL_SYNC_HOURS_MIN = 1;
export const IDAM_FULL_SYNC_HOURS_MAX = 168;

/** The onboarding form's input: connectivity, the write-only secret, and the two cadences (ID.4a). */
export interface IdamConnectInput {
  readonly provider: string;
  readonly domain: string;
  readonly clientId: string;
  readonly audience: string;
  readonly secret: string;
  readonly pollIntervalSecs: number;
  readonly fullSyncCadenceHours: number;
}

/**
 * Onboard a connector: write the secret to the node's mode-protected store via the sidecar
 * (`/api/idam/secret`), set the connectivity live (`/api/idam/connect`), then apply the enabled state
 * + the two cadences (`/api/idam/configure`, ID.4a). The secret is sent write-only and never read back;
 * the connectivity apply re-spawns the connector fail-closed; the cadence bounds are engine-enforced. On
 * success the connector list is invalidated so the card reflects the new state.
 */
export function useIdamConnect(): UseMutationResult<void, Error, IdamConnectInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const { provider, domain, clientId, audience, secret } = input;
      // 1. The secret goes to the on-node sidecar first (browser -> BFF passthrough -> sidecar file).
      const secretRes = await fetch('/api/idam/secret', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, secret }),
      });
      if (!secretRes.ok) {
        throw new IdamConnectError(secretRes.status);
      }
      // 2. Then the connectivity (no secret) sets + re-spawns the connector on the engine.
      const connectRes = await fetch('/api/idam/connect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, domain, clientId, audience }),
      });
      if (!connectRes.ok) {
        throw new IdamConnectError(connectRes.status);
      }
      // 3. Finally the runtime knobs: enable the connector + set the two cadences (ID.4a). The engine
      // re-validates the bounds and refuses an out-of-range value regardless of the form's hints.
      const configureRes = await fetch('/api/idam/configure', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          enabled: true,
          pollIntervalSecs: input.pollIntervalSecs,
          fullSyncCadenceHours: input.fullSyncCadenceHours,
        }),
      });
      if (!configureRes.ok) {
        throw new IdamConnectError(configureRes.status);
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CONNECTORS_KEY }),
  });
}
