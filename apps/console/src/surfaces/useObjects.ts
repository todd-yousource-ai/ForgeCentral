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

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ObjectCard, ObjectDetailView, ObjectDraft, ObjectMutation } from '@forge/contracts';

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
 * mutation invalidates it rather than on a timer.
 */
export function useObjects(): UseQueryResult<readonly ObjectCard[]> {
  return useQuery({ queryKey: ['objects'], queryFn: fetchObjects });
}

/** An object command refusal, typed for the form (409 duplicate vs 400 malformed vs a denial). */
export class ObjectCommandError extends Error {
  constructor(readonly status: number) {
    super(`object command failed: ${String(status)}`);
    this.name = 'ObjectCommandError';
  }
}

async function postCommand(url: string, body: unknown): Promise<ObjectMutation> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ObjectCommandError(res.status);
  }
  return (await res.json()) as ObjectMutation;
}

/** Create/edit a named object (audited; the card that appears is the ENGINE's record). */
export function useObjectWrite(
  mode: 'create' | 'edit',
): UseMutationResult<ObjectMutation, Error, ObjectDraft> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft) =>
      postCommand(mode === 'create' ? '/api/objects' : '/api/objects/edit', draft),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['objects'] }),
  });
}

/** Delete a named object (tombstoned engine-side; the catalog refetches without it). */
export function useDeleteObject(): UseMutationResult<ObjectMutation, Error, { name: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => postCommand('/api/objects/delete', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['objects'] }),
  });
}
