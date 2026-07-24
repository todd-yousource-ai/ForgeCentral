// apps/console/src/surfaces/usePolicyMutation.ts -- the Policies-surface authoring hooks (P5.4).
//
// Brokers the audited policy commands to the BFF (POST /api/policies[/edit|/publish|/delete]), which
// delegate them to the crdb policy store (POLICY_CREATE/EDIT/PUBLISH/DELETE over :7878, PS.6). The engine
// mints the version + owns the audit entry; these hooks only carry the typed result + refetch the list, so
// the row that appears is the ENGINE's record (INV-CONSOLE-POLICIES-REAL). Same-origin session cookie.
//
// Save-&-Publish is a two-step: author the draft (create/edit) to mint the version, then publish THAT
// version -- so the operator publishes exactly what they authored, and the engine's breaking flag comes
// back on the publish ack (surfaced, never guessed client-side).

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { PolicyDraft, PolicyMutation } from '@forge/contracts';

/** A policy command refusal, typed for the form (409 conflict vs 400 malformed vs a denial). */
export class PolicyCommandError extends Error {
  constructor(readonly status: number) {
    super(`policy command failed: ${String(status)}`);
    this.name = 'PolicyCommandError';
  }
}

async function post(url: string, body: unknown): Promise<PolicyMutation> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new PolicyCommandError(res.status);
  }
  return (await res.json()) as PolicyMutation;
}

/** What the form asks the hook to do: author (create/edit) and optionally publish the minted version. */
export interface SavePolicyInput {
  readonly mode: 'create' | 'edit';
  /** The policy id, required for an edit (the store names the version off it). */
  readonly id: string | null;
  /** The zone the policy scopes (needed to publish the minted version). */
  readonly vtz: string;
  readonly draft: PolicyDraft;
  /** When true, publish the just-authored version after creating/editing it. */
  readonly publish: boolean;
}

/**
 * Author a policy draft and optionally publish it. Create/edit mints a Draft version; publish is a second
 * atomic step over that version (so the operator publishes exactly what they authored). The list refetches
 * on success, so the row that appears is the engine's record.
 */
export function useSavePolicy(): UseMutationResult<PolicyMutation, Error, SavePolicyInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const authored =
        input.mode === 'create'
          ? await post('/api/policies', input.draft)
          : await post('/api/policies/edit', { id: input.id, ...input.draft });
      if (!input.publish) {
        return authored;
      }
      return post('/api/policies/publish', {
        vtz: input.vtz,
        id: authored.id,
        version: authored.version,
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
}

/** Delete a policy (tombstoned engine-side; the list refetches without it). */
export function useDeletePolicy(): UseMutationResult<
  PolicyMutation,
  Error,
  { vtz: string; id: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => post('/api/policies/delete', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
}
