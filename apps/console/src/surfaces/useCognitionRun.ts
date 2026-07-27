// apps/console/src/surfaces/useCognitionRun.ts -- the Generate control (IP-CONSOLE-03 S3.8c).
//
// The ONE control on this surface that spends model time: POST /api/soc/generate over crdb
// SOC_COGNITION_RUN, explicit and audited under the operator. The reply is what the engine DID --
// started / running / recorded / refused -- never the run's result. A real narrative is minutes of
// sidecar time, so after `started` the surface POLLS the narrative and impact READS until the
// records land; the reads never trigger generation themselves.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { CognitionRunState } from '@forge/contracts';

/** A typed command refusal, carrying the HTTP status so the surface can say why. */
export class CognitionRunError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'CognitionRunError';
  }
}

/** The operator-facing reason for a refusal status. */
export function runRefusalReason(status: number): string {
  switch (status) {
    case 403:
      return 'This operator is not permitted to start a run.';
    case 503:
      return 'The engine answered with something the Console will not render.';
    default:
      return 'The run request did not reach the engine.';
  }
}

/**
 * How often the surface re-reads the narrative and impact while a run is in flight.
 *
 * A narrative is `1 + 2N` model calls at a few verdicts per minute, so seconds-scale polling is
 * responsive without hammering the BFF; the engine is never touched by the poll itself when the BFF
 * cache is warm, and the run's landing drops that cache.
 */
export const RUN_POLL_INTERVAL_MS = 5_000;

async function postGenerate(incidentId: string): Promise<CognitionRunState> {
  const res = await fetch('/api/soc/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ incident: incidentId }),
  });
  if (!res.ok) {
    throw new CognitionRunError(res.status, runRefusalReason(res.status));
  }
  return (await res.json()) as CognitionRunState;
}

/**
 * Start a cognition run for one incident.
 *
 * On any acknowledged state the narrative and impact queries are invalidated so the panels re-read:
 * `recorded` means the records already exist (the reuse keys are the idempotency), and `started` /
 * `running` mean they will -- the panels' own polling picks the landing up.
 */
export function useCognitionRun(): UseMutationResult<CognitionRunState, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postGenerate,
    onSuccess: (_state, incidentId) => {
      void queryClient.invalidateQueries({ queryKey: ['soc', 'narrative', incidentId] });
      void queryClient.invalidateQueries({ queryKey: ['soc', 'impact', incidentId] });
    },
  });
}
