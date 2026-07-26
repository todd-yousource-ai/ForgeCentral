// apps/console/src/surfaces/usePlanCommand.ts -- the SOC plan commands (IP-CONSOLE-03 S3.8).
//
// `Approve Full Response` and `Modify Plan` over crdb SS.5, through the BFF (which mounts them ABOVE
// the read-only 405 gate and commits them audited under the operator's principal).
//
// A REFUSAL IS TYPED AND SURFACED, never a silent no-op. The engine refuses for reasons an operator
// needs told apart:
//   * 409 -- a stale revision (the plan moved under them), a second approval, an edit after
//     approval, or NO PLAN TO ACT ON. All are "your view is out of date, re-read".
//   * 400 -- a step the engine will not accept.
//   * 403 -- the operator may not do this.
// The surface renders the reason; it never reports success it did not get.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ResponseStepDraft, SocPlanEffect } from '@forge/contracts';

/** A typed command refusal, carrying the HTTP status so the surface can say WHY. */
export class PlanCommandError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'PlanCommandError';
  }
}

/** The operator-facing reason for a refusal status. */
export function planRefusalReason(status: number): string {
  switch (status) {
    case 409:
      return 'The plan changed, was already approved, or does not exist yet. Re-read the incident and try again.';
    case 400:
      return 'The engine would not accept this plan.';
    case 403:
      return 'This operator is not permitted to act on this plan.';
    case 503:
      return 'The engine answered with something the Console will not render.';
    default:
      return 'The command did not reach the engine.';
  }
}

async function post(path: string, body: unknown): Promise<SocPlanEffect> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new PlanCommandError(res.status, planRefusalReason(res.status));
  }
  return (await res.json()) as SocPlanEffect;
}

export interface ApprovePlanInput {
  readonly incidentId: string;
  /** The revision the operator was SHOWN. A stale one is refused rather than applied. */
  readonly atRevision: number;
}

export interface ModifyPlanInput {
  readonly incidentId: string;
  readonly steps: readonly ResponseStepDraft[];
}

/**
 * Approve an incident's response plan.
 *
 * On success the incident's cached reads are dropped so the operator's own act is never masked by a
 * stale projection -- the plan they see next is the one the engine now holds.
 */
export function useApprovePlan(): UseMutationResult<SocPlanEffect, Error, ApprovePlanInput> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: ApprovePlanInput) =>
      post('/api/soc/plan/approve', {
        incident: input.incidentId,
        atRevision: input.atRevision,
      }),
    onSuccess: (_effect, input) => {
      void queries.invalidateQueries({ queryKey: ['soc', 'incident', input.incidentId] });
      void queries.invalidateQueries({ queryKey: ['soc', 'incidents'] });
    },
  });
}

/** Replace an unapproved plan's steps. Refused once approved. */
export function useModifyPlan(): UseMutationResult<SocPlanEffect, Error, ModifyPlanInput> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: ModifyPlanInput) =>
      post('/api/soc/plan/modify', { incident: input.incidentId, steps: input.steps }),
    onSuccess: (_effect, input) => {
      void queries.invalidateQueries({ queryKey: ['soc', 'incident', input.incidentId] });
    },
  });
}
