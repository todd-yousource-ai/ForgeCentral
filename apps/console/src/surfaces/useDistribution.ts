// apps/console/src/surfaces/useDistribution.ts -- the policy distribution hooks (FD.7c).
//
// Reads a zone's distribution convergence (GET /api/vtz/convergence) and commits a re-distribution
// (POST /api/vtz/<id>/distribute) through the BFF, which brokers them to the crdb carrier and the
// crypto sidecar signer. The convergence read is LIVE (never cached): endpoints report continuously,
// so a stale reading could tell an operator a box holds a policy it has since lost. These hooks carry
// only the engine's real result, so nothing on the surface is fabricated (INV-CONSOLE-NO-STUB).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { BundleConvergenceView } from '@forge/contracts';

/** The cache key for one zone's convergence, so an invalidation after a re-distribute hits the slot. */
export function convergenceQueryKey(id: string): readonly [string, string] {
  return ['vtzConvergence', id];
}

/** Fetch a zone's endpoint convergence. Throws on a non-2xx so the panel shows a load error. */
async function fetchConvergence(id: string): Promise<BundleConvergenceView> {
  const res = await fetch(`/api/vtz/convergence?id=${encodeURIComponent(id)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`convergence read failed: ${String(res.status)}`);
  }
  return (await res.json()) as BundleConvergenceView;
}

/**
 * The live convergence of a zone's distributed bundle: which endpoints have it (applied), which
 * refused it (rejected, with the reason), and which have not confirmed (silent). `null` id disables
 * the query (no zone selected). Not cached across a window -- refetched on mount and after a
 * re-distribute, so the operator always sees the current picture.
 */
export function useBundleConvergence(id: string | null): UseQueryResult<BundleConvergenceView> {
  return useQuery({
    queryKey: convergenceQueryKey(id ?? ''),
    queryFn: () => fetchConvergence(id ?? ''),
    enabled: id !== null,
    // Live surface: never serve a stale convergence (a box's state changes continuously).
    staleTime: 0,
    gcTime: 0,
  });
}

/** What a distribute returns: the carried version plus the honest record of the unexpressed domains. */
export interface DistributeResult {
  readonly version: number;
  readonly commitVersion: number;
  readonly unexpressedDomains: readonly { domain: string; posture: string | null }[];
  readonly unexpressedFields: readonly string[];
}

/**
 * Re-distribute a zone's policy to a set of endpoints (`members`, by bound FQDN). The caller passes
 * the zone's CURRENT bundle scope -- the endpoints the convergence view already lists -- so this is a
 * re-push of the freshly composed policy to the same boxes after a zone edit. Establishing the initial
 * scope (choosing endpoints for a zone with no bundle yet) is deferred, gated on a device directory.
 *
 * No auto-retry: the operator re-triggers, and the carrier's monotonic version makes a re-submit safe.
 */
export function useDistribute(
  id: string | null,
): UseMutationResult<DistributeResult, Error, readonly string[]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (members: readonly string[]): Promise<DistributeResult> => {
      if (id === null) {
        throw new Error('no zone selected');
      }
      if (members.length === 0) {
        // A re-distribute to no one is not a real command; the caller guards, this is defense.
        throw new Error('no endpoints to distribute to');
      }
      const res = await fetch(`/api/vtz/${encodeURIComponent(id)}/distribute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ members }),
      });
      if (!res.ok) {
        throw new Error(`distribute failed: ${String(res.status)}`);
      }
      return (await res.json()) as DistributeResult;
    },
    retry: false,
    onSuccess: () => {
      // The re-push landed a new bundle version; the convergence view is now stale.
      void queryClient.invalidateQueries({ queryKey: convergenceQueryKey(id ?? '') });
    },
  });
}
