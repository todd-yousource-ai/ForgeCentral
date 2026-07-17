// apps/console/src/surfaces/useEntityConnections.ts -- the entity outbound-connections read (O1.6a/PR-1).
//
// Fetches one entity's outbound connections from the BFF (GET /api/overview/entity-connections?id=&kind=),
// which brokers the live crdb ENTITY_CONNECTIONS read as the operator (the LEG `ConnectsTo` edges out of
// the subject node, bounded + tier-redacted). Same origin with the session cookie; the SPA never holds a
// token. The `kind` is the entity's LEG node kind tag (e.g. `agent_instance`, `endpoint`, `process`) --
// the connectivity subject, distinct from the drawer's principal/object EntityRef kind. A subject with no
// outbound connections (a network SINK, or an unknown kind) yields an empty list, the honest empty state.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OverviewConnectionList } from '@forge/contracts';

/** The LEG-node subject an entity's connections are read for (kind = the connectivity kind tag, not the ref kind). */
export interface ConnectionSubject {
  readonly id: string;
  readonly kind: string;
}

/** The cache key for one subject's connections (its connectivity identity). */
export function entityConnectionsQueryKey(
  subject: ConnectionSubject,
): readonly [string, string, string] {
  return ['entity-connections', subject.kind, subject.id];
}

/** Fetch a subject's outbound connections from the BFF. Throws on a non-2xx (the section shows an error). */
export async function fetchEntityConnections(
  subject: ConnectionSubject,
): Promise<OverviewConnectionList> {
  const params = new URLSearchParams({ id: subject.id, kind: subject.kind });
  const res = await fetch(`/api/overview/entity-connections?${params.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`entity connections failed: ${String(res.status)}`);
  }
  // The BFF already projects the wire reply to the OverviewConnectionList view model (shared toConnectionList).
  return (await res.json()) as OverviewConnectionList;
}

/**
 * The outbound connections for `subject`, or an idle query when `subject` is null (no connectivity entity
 * open). Keyed by the connectivity identity, so re-opening the same entity serves the cache and a different
 * one refetches. The drawer renders the returned list as the entity's Connections section.
 */
export function useEntityConnections(
  subject: ConnectionSubject | null,
): UseQueryResult<OverviewConnectionList> {
  return useQuery({
    queryKey:
      subject === null ? ['entity-connections', null, null] : entityConnectionsQueryKey(subject),
    queryFn: () => {
      if (subject === null) throw new Error('no connection subject');
      return fetchEntityConnections(subject);
    },
    enabled: subject !== null,
  });
}
