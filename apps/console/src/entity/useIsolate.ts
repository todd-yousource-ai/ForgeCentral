// apps/console/src/entity/useIsolate.ts -- the Isolate quick-action command (IP-CONSOLE-12 DR.5d).
//
// Posts the confirm-gated "Isolate from network" action to the BFF (POST
// /api/entity/<kind>/<id>/isolate), which brokers the live crdb Contain verb as the operator: it records
// an audited, operator-attributed Quarantine/Deny disposition. Same-origin with the session cookie; the
// SPA never holds a token. The returned IsolateEffect is honest -- `enforcementActive` is false today
// (AG.7), so the command records intent and audits it, never fabricated enforcement. Idempotent by the
// caller-supplied commandId (a retried confirm does not double-record).

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ContainmentPosture, EntityRef, IsolateEffect } from '@forge/contracts';

/** The confirm-gated inputs for one isolate command. */
export interface IsolateVars {
  readonly posture: ContainmentPosture;
  readonly commandId: string;
}

/** A failed isolate command with its HTTP status, so the drawer can say what happened. */
export class IsolateError extends Error {
  constructor(readonly status: number) {
    super(`isolate failed: ${String(status)}`);
    this.name = 'IsolateError';
  }
}

/** The operator-facing line for a failed isolate. */
export function isolateFailure(error: Error): string {
  if (!(error instanceof IsolateError)) return 'Isolation could not reach ForgeCentral.';
  switch (error.status) {
    case 401:
      return 'Your session has expired. Sign in again; nothing was recorded.';
    case 403:
      return 'The engine refused the isolation.';
    case 400:
    case 405:
      return 'Isolation is not available for this entity as sent.';
    case 503:
      return 'The engine is unavailable; nothing was recorded.';
    default:
      return 'The engine could not complete the isolation; check the entity before retrying.';
  }
}

/** The operator-facing line for a recorded isolation: the effect as the engine reported it. */
export function isolateRecorded(effect: IsolateEffect): string {
  return effect.enforcementActive
    ? `Isolation recorded (${effect.posture}) and enforced.`
    : `Isolation recorded (${effect.posture}) and audited. Enforcement is off: nothing is sent to an endpoint.`;
}

async function postIsolate(ref: EntityRef, vars: IsolateVars): Promise<IsolateEffect> {
  const res = await fetch(`/api/entity/${ref.kind}/${encodeURIComponent(ref.id)}/isolate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commandId: vars.commandId, posture: vars.posture }),
  });
  if (!res.ok) {
    throw new IsolateError(res.status);
  }
  return (await res.json()) as IsolateEffect;
}

/**
 * The Isolate command mutation for `ref`. The caller (the drawer) confirms first, then mutates; a null
 * `ref` rejects (no drawer open). No auto-retry -- the operator re-confirms, and the stable commandId keeps
 * a re-submit idempotent server-side.
 */
export function useIsolate(
  ref: EntityRef | null,
): UseMutationResult<IsolateEffect, Error, IsolateVars> {
  return useMutation({
    mutationFn: (vars: IsolateVars) => {
      if (ref === null) throw new Error('no entity ref');
      return postIsolate(ref, vars);
    },
  });
}
