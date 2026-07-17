// apps/console/src/surfaces/useClassMembers.ts -- the container-members read (IP-CONSOLE-01 O1.6b).
//
// Fetches one clicked Overview container's member entities from the BFF
// (GET /api/overview/members?container=<...>), which brokers the live crdb CONNECTIVITY_MEMBERS read as the
// operator (source lane -> engine class direct; destination ring -> engine `network` re-bucketed). Same
// origin with the session cookie; the SPA never holds a token. TanStack Query owns caching/loading, keyed
// by the container, so re-opening the same container serves the cache and a different container refetches.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OverviewMemberList } from '@forge/contracts';

/** The cache key for a container's member list (its identity), keyed by the container id. */
export function membersQueryKey(container: string): readonly [string, string] {
  return ['overview-members', container];
}

/** Fetch the members of `container` from the BFF. Throws on a non-2xx (the caller shows a load error). */
export async function fetchClassMembers(container: string): Promise<OverviewMemberList> {
  const res = await fetch(`/api/overview/members?container=${encodeURIComponent(container)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`container members failed: ${String(res.status)}`);
  }
  // The BFF already projects the wire reply to the OverviewMemberList view model (the shared toMemberList
  // seam runs server-side), so the JSON is the view-model shape directly.
  return (await res.json()) as OverviewMemberList;
}

/**
 * The live member list for `container`, or an idle query when `container` is null (no list open). The query
 * key is the container id, so re-opening the same container serves the cache and a different one refetches.
 */
export function useClassMembers(container: string | null): UseQueryResult<OverviewMemberList> {
  return useQuery({
    queryKey: container === null ? ['overview-members', null] : membersQueryKey(container),
    queryFn: () => {
      if (container === null) throw new Error('no container');
      return fetchClassMembers(container);
    },
    enabled: container !== null,
  });
}
