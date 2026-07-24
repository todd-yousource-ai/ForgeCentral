// apps/console/src/surfaces/usePolicies.ts -- the Policies-surface read hook (IP-CONSOLE-05 P5.3).
//
// Reads the tenant's policies grouped by VTZ from the BFF (GET /api/policies), which brokers
// POLICY_LIST_BY_ZONE to the crdb policy store (PS.5) over :7878. The engine owns every policy; the BFF
// projects and fails closed on an unknown tag; this hook only carries the result, so nothing on the
// surface is fabricated (INV-CONSOLE-POLICIES-REAL). Same-origin with the session cookie; the SPA never
// holds a token. TanStack Query owns caching + the loading/error states.
//
// The grouped list is engine-BOUNDED AND COMPLETE (the per-tenant ceiling refuses rather than
// truncating), so the surface's search/zone filters narrow a complete dataset client-side. Not polled:
// policies change on operator commands (authored on the Policy tab, P5.4), so the list refetches when a
// mutation invalidates it rather than on a timer.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PolicyZoneGroup } from '@forge/contracts';

/** Fetch the tenant's policies grouped by zone. Throws on a non-2xx so the surface shows a load error. */
export async function fetchPolicyZones(): Promise<readonly PolicyZoneGroup[]> {
  const res = await fetch('/api/policies', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`policies list failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly PolicyZoneGroup[];
}

/** The tenant's policies grouped by VTZ (the grouped read-only surface reads this). */
export function usePolicies(): UseQueryResult<readonly PolicyZoneGroup[]> {
  return useQuery({ queryKey: ['policies'], queryFn: fetchPolicyZones });
}
