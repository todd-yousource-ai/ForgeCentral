// apps/console/src/surfaces/useObjects.ts -- the Objects-surface read hooks (IP-CONSOLE-10 O10.2).
//
// Reads the object catalog and one object's detail from the BFF (GET /api/objects,
// GET /api/objects/detail), which brokers them to the crdb named-object registry (OBJECT_LIST /
// OBJECT_DETAIL over :7878). The engine owns every object; the BFF projects and fails closed on an
// unknown tag; these hooks only carry the result, so nothing on the surface is fabricated
// (INV-CONSOLE-OBJECTS-NOUN-ONLY). Same-origin with the session cookie; the SPA never holds a token.
//
// The catalog read is engine-BOUNDED AND COMPLETE (the per-tenant ceiling refuses rather than
// truncating), so the surface's search/kind filters narrow a complete dataset client-side.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ObjectCard, ObjectDetailView } from '@forge/contracts';

/** Fetch the complete object catalog. Throws on a non-2xx so the surface shows a load error. */
export async function fetchObjects(): Promise<readonly ObjectCard[]> {
  const res = await fetch('/api/objects', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`objects list failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly ObjectCard[];
}

/** Fetch one object's detail + its read-time members. Throws on a non-2xx. */
export async function fetchObjectDetail(name: string): Promise<ObjectDetailView> {
  const res = await fetch(`/api/objects/detail?name=${encodeURIComponent(name)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`object detail failed: ${String(res.status)}`);
  }
  return (await res.json()) as ObjectDetailView;
}

/**
 * The object catalog. Not polled: the catalog changes on operator commands, so it refetches when a
 * mutation invalidates it (O10.3) rather than on a timer.
 */
export function useObjects(): UseQueryResult<readonly ObjectCard[]> {
  return useQuery({ queryKey: ['objects'], queryFn: fetchObjects });
}
