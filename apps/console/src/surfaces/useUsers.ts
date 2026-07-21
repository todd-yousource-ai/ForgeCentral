// apps/console/src/surfaces/useUsers.ts -- the Users-surface read hooks (IP-CONSOLE-04 UY.2/UY.3).
//
// Reads the principal directory and the group directory from the BFF (GET /api/users,
// GET /api/users/groups), which brokers them to the crdb TRD-35 reads (LIST_PRINCIPALS +
// the LIST_AGENTS cross-bind, LIST_GROUPS over :7878). The engine owns every row; the BFF merges
// and fails closed on an unknown tag; these hooks only carry the result, so nothing on the surface
// is fabricated (INV-CONSOLE-USERS-REAL). Same-origin with the session cookie; the SPA never holds
// a token. TanStack Query owns caching + the loading/error states.
//
// The directory reads are engine-BOUNDED AND COMPLETE: the per-tenant ceiling refuses (an error
// state) rather than truncating, so a successful response is the whole directory. The surface's
// search/filters therefore narrow a complete dataset client-side -- unlike the unbounded LOG,
// where narrowing must compile to the engine query.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { GroupCard, PrincipalRow, ProvisionReceipt } from '@forge/contracts';

/** Fetch the complete principal directory. Throws on a non-2xx so the surface shows a load error. */
export async function fetchUsers(): Promise<readonly PrincipalRow[]> {
  const res = await fetch('/api/users', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`users list failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly PrincipalRow[];
}

/** Fetch the complete group directory. Throws on a non-2xx. */
export async function fetchGroups(): Promise<readonly GroupCard[]> {
  const res = await fetch('/api/users/groups', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`groups list failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly GroupCard[];
}

/**
 * The principal directory. Not polled: identity inventory changes on the collector cadence and on
 * operator commands, so the list refetches when a mutation invalidates it (UY.6) rather than on a
 * timer.
 */
export function useUsers(): UseQueryResult<readonly PrincipalRow[]> {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}

/** The group directory (UY.3 renders it; the hook lives with its sibling). */
export function useGroups(): UseQueryResult<readonly GroupCard[]> {
  return useQuery({ queryKey: ['groups'], queryFn: fetchGroups });
}

/** A `groups.create` refusal, typed for the form (409 duplicate vs 400 malformed vs denial). */
export class GroupCreateError extends Error {
  constructor(readonly status: number) {
    super(`group create failed: ${String(status)}`);
    this.name = 'GroupCreateError';
  }
}

/**
 * Create an enterprise group (`groups.create` -> crdb GROUP_CREATE, audited, duplicate-refused).
 * On success the group directory refetches, so the new card is the ENGINE's record, never a
 * client-side insertion.
 */
export function useCreateGroup(): UseMutationResult<
  ProvisionReceipt,
  Error,
  { name: string; description: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const res = await fetch('/api/users/groups', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new GroupCreateError(res.status);
      }
      return (await res.json()) as ProvisionReceipt;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Membership chips on the principal rows can change with group edits later; keep them fresh.
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
