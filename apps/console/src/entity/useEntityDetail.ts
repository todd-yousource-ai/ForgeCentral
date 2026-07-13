// apps/console/src/entity/useEntityDetail.ts -- the live entity-drawer detail read (IP-CONSOLE-12 DR.3d).
//
// Fetches the aggregated drawer detail from the BFF (GET /api/entity/<kind>/<id>), which brokers the live
// engine reads (LIST_AGENTS / ENTITY_DECISIONS) as the operator. Same-origin with the session cookie; the
// SPA never holds a token. TanStack Query owns caching/loading; the drawer renders each section from the
// returned SectionState, so a per-section pending/error/empty is data, not a fetch failure.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EntityDetailView, EntityRef } from '@forge/contracts';

/** The cache key for an entity's drawer detail (its identity), shared by the query and the prefetch. */
export function entityQueryKey(ref: EntityRef): readonly [string, string, string] {
  return ['entity', ref.kind, ref.id];
}

/** Fetch the drawer detail for `ref` from the BFF. Throws on a non-2xx (the caller shows a load error). */
export async function fetchEntityDetail(ref: EntityRef): Promise<EntityDetailView> {
  const res = await fetch(`/api/entity/${ref.kind}/${encodeURIComponent(ref.id)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`entity detail failed: ${String(res.status)}`);
  }
  return (await res.json()) as EntityDetailView;
}

/**
 * The live drawer detail for `ref`, or an idle query when `ref` is null (no drawer open). The query key is
 * the entity identity, so re-opening the same entity serves the cache and a different entity refetches;
 * a hover-prefetched entity (DR.6) opens instantly off that same cache.
 */
export function useEntityDetail(ref: EntityRef | null): UseQueryResult<EntityDetailView> {
  return useQuery({
    queryKey: ref === null ? ['entity', null, null] : entityQueryKey(ref),
    queryFn: () => {
      if (ref === null) throw new Error('no entity ref');
      return fetchEntityDetail(ref);
    },
    enabled: ref !== null,
  });
}
