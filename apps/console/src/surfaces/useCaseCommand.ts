// apps/console/src/surfaces/useCaseCommand.ts -- the SOC case commands (IP-CONSOLE-03 S3.12).
//
// Assign / Acknowledge / Note / Close (crdb IP-AISOC-STEP1 C.1, `SOC_INCIDENT_ACT`) and the
// disposition verdict (SC.7, `SOC_INCIDENT_DISPOSITION`), through the BFF routes S3.11 mounted above
// the read-only 405 gate. Each is committed audited under the operator's principal.
//
// INV-SOC-CASE-ACT-HONEST: the surface reports an act ONLY as what the engine returned -- `recorded`
// with the fields the engine stated (which act, whether THIS act closed the incident, the note's
// reference) or `refused` with the engine's reason verbatim. It never infers an outcome, and on
// success it drops the trail, notes, detail and queue reads so the operator's own act is re-READ
// from the engine, never appended locally.
//
// The refusal statuses the BFF maps (S3.11):
//   * 409 -- the engine refused in-band and SAID WHY (already closed, a blank note, a duplicate
//            predecessor that does not resolve, an expiry in the past). The reason is carried.
//   * 404 -- the engine's one indistinguishable refusal: unknown, another tenant's, or above this
//            session's clearance.
//   * 400 -- the body did not name exactly the field the act takes (the controls prevent this).
//   * 403 -- this operator may not act on cases.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type {
  CaseActDraft,
  CaseActRecorded,
  DispositionDraft,
  DispositionRecorded,
} from '@forge/contracts';

/** A typed command refusal: the HTTP status plus the operator-facing reason (the engine's own on 409). */
export class CaseCommandError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'CaseCommandError';
  }
}

/** The operator-facing reason for a refusal status; a 409 carries the engine's explanation verbatim. */
export function caseRefusalReason(status: number, explanation: string | null): string {
  switch (status) {
    case 409:
      return explanation === null || explanation === ''
        ? 'The engine refused the act and recorded no reason.'
        : `The engine refused it: ${explanation}`;
    case 404:
      return 'The incident is unknown, another tenant’s, or above this session’s clearance.';
    case 400:
      return 'The engine would not accept the request as sent.';
    case 403:
      return 'This operator is not permitted to act on cases.';
    case 503:
      return 'The engine answered with something the Console will not render.';
    default:
      return 'The command did not reach the engine.';
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let explanation: string | null = null;
    if (res.status === 409) {
      // The reason is the whole point of a 409; a body that cannot be read is reported as no reason,
      // never as success.
      try {
        const refusal = (await res.json()) as { readonly explanation?: unknown };
        explanation = typeof refusal.explanation === 'string' ? refusal.explanation : null;
      } catch {
        explanation = null;
      }
    }
    throw new CaseCommandError(res.status, caseRefusalReason(res.status, explanation));
  }
  return (await res.json()) as T;
}

export interface CaseActInput {
  readonly incidentId: string;
  readonly draft: CaseActDraft;
}

export interface DispositionInput {
  readonly incidentId: string;
  readonly draft: DispositionDraft;
}

/** Drop every read the act can have changed, so the surface re-reads the engine's record of it. */
function invalidateIncident(queries: ReturnType<typeof useQueryClient>, incidentId: string): void {
  void queries.invalidateQueries({ queryKey: ['soc', 'audit', incidentId] });
  void queries.invalidateQueries({ queryKey: ['soc', 'notes', incidentId] });
  void queries.invalidateQueries({ queryKey: ['soc', 'incident', incidentId] });
  void queries.invalidateQueries({ queryKey: ['soc', 'incidents'] });
  void queries.invalidateQueries({ queryKey: ['soc', 'kpis'] });
}

/**
 * Submit one case act. The body is exactly the draft's fields plus the incident -- the same shape
 * `toCaseActDraft` admits on the BFF, so a stray field can never be recorded.
 */
export function useCaseAct(): UseMutationResult<CaseActRecorded, Error, CaseActInput> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: CaseActInput) =>
      post<CaseActRecorded>('/api/soc/act', { incident: input.incidentId, ...input.draft }),
    onSuccess: (_recorded, input) => {
      invalidateIncident(queries, input.incidentId);
    },
  });
}

/** Submit the disposition verdict with exactly its one required field. */
export function useDisposition(): UseMutationResult<DispositionRecorded, Error, DispositionInput> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: DispositionInput) =>
      post<DispositionRecorded>('/api/soc/disposition', {
        incident: input.incidentId,
        ...input.draft,
      }),
    onSuccess: (_recorded, input) => {
      invalidateIncident(queries, input.incidentId);
    },
  });
}
