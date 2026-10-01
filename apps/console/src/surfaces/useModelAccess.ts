// apps/console/src/surfaces/useModelAccess.ts -- the Model access tab's reads and the grant toggle
// (IP-FRONTIER-GATEWAY GW.10 over crdb GW.10a, `GET /api/model-access`, `PUT /api/model-access/grant`).
//
// A 403 is a refusal (the operator is not a global admin, or the engine's tier gate) and resolves to
// `null`; a 409 is the engine's conflict (the grant changed since the page read it) and resolves to
// the conflict outcome carrying the grant as stored now. Nothing is cached past a write.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { AgentGrantChange, AgentGrantOutcome, ModelAccessView } from '@forge/contracts';

/** Read the page over the last `days` UTC days (1..31). */
export async function fetchModelAccess(days: number): Promise<ModelAccessView | null> {
  const res = await fetch(`/api/model-access?days=${String(days)}`, { credentials: 'include' });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`model access read failed: ${String(res.status)}`);
  }
  return (await res.json()) as ModelAccessView;
}

export function useModelAccess(days: number): UseQueryResult<ModelAccessView | null> {
  return useQuery({
    queryKey: ['model-access', days],
    queryFn: () => fetchModelAccess(days),
    staleTime: 0,
  });
}

/** Send one agent's change; `null` is a refusal. */
export async function putAgentGrant(change: AgentGrantChange): Promise<AgentGrantOutcome | null> {
  const res = await fetch('/api/model-access/grant', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(change),
  });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok && res.status !== 409) {
    throw new Error(`agent grant change failed: ${String(res.status)}`);
  }
  return (await res.json()) as AgentGrantOutcome;
}

/** The toggle; any outcome re-reads the page, so the matrix always shows what is stored. */
export function useAgentGrantChange(): UseMutationResult<
  AgentGrantOutcome | null,
  Error,
  AgentGrantChange
> {
  const client = useQueryClient();
  return useMutation<AgentGrantOutcome | null, Error, AgentGrantChange>({
    mutationFn: putAgentGrant,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['model-access'] });
    },
  });
}
