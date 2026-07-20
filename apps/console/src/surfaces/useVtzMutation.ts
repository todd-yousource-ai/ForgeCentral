// apps/console/src/surfaces/useVtzMutation.ts -- the audited zone authoring commands (V2.5).
//
// Posts the confirm-gated authoring actions to the BFF, which brokers them to the crdb VTZ system of
// record: create / edit / re-scope / delete. Every one is an AUDITED write -- a success means the engine
// already committed it through the Committer and recorded it on the audit chain attributed to this
// operator. Same-origin with the session cookie; the SPA never holds a token.
//
// REFUSALS ARE FIRST-CLASS. The engine re-validates the read-only catastrophic floor and tighten-only
// inheritance on every write and refuses rather than correcting, so a refusal is an expected outcome the
// operator must see, not an error to retry. The BFF maps it to 403 (`denied` -- a floor or inheritance
// rule) or 409 (`conflict` -- the zone exists, does not exist, or still has children) and names only the
// CLASS of rule, because the engine returns no message (it is not an oracle). {@link VtzCommandError}
// carries that class through so the surface can say what happened without inventing a cause.
//
// No auto-retry: an audited write is not something to replay behind the operator's back, and these verbs
// carry no engine-side idempotency key (unlike `contain` / `logExport`), so a silent retry could commit
// twice. The operator re-confirms.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { VtzMutationResult, VtzSpecInput } from '@forge/contracts';

import { vtzDetailQueryKey } from './useVtzTree.js';

/** Why an authoring command failed, as far as the Console can honestly tell. */
export type VtzCommandFailure =
  /** The engine refused: a catastrophic-floor relaxation, an inheritance contradiction, or a tenant guard. */
  | 'denied'
  /** The engine refused: the zone already exists, does not exist, or still has children. */
  | 'conflict'
  /** The Console rejected the spec at the boundary before the engine saw it. */
  | 'malformed'
  /** Anything else (transport, timeout, an engine error the Console cannot classify). */
  | 'unavailable';

/**
 * An authoring command that did not commit.
 *
 * `settingsCommitted` is the one case where something DID reach the store: a Save that both changed the
 * zone settings and moved the zone runs two audited engine verbs (there is no combined one), so an edit
 * that commits followed by a refused move leaves the settings written and the zone where it was. The
 * operator is told exactly that rather than "nothing was committed", which would be a lie.
 */
export class VtzCommandError extends Error {
  constructor(
    readonly failure: VtzCommandFailure,
    readonly settingsCommitted = false,
  ) {
    super(`the zone command did not commit (${failure})`);
    this.name = 'VtzCommandError';
  }
}

/** Map a BFF response to the typed failure, reading the refusal reason the route named. */
async function failureFor(res: Response): Promise<VtzCommandError> {
  if (res.status === 400) return new VtzCommandError('malformed');
  if (res.status === 409) return new VtzCommandError('conflict');
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    return new VtzCommandError(body.reason === 'conflict' ? 'conflict' : 'denied');
  }
  return new VtzCommandError('unavailable');
}

/** Send one authoring request and project the committed mutation, or throw the typed failure. */
async function send(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<VtzMutationResult> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) {
    throw await failureFor(res);
  }
  return (await res.json()) as VtzMutationResult;
}

/**
 * The authoring command to run.
 *
 * `save` is the operator's single act of configuring a zone, and it is the only one that may run more than
 * one engine verb: the zone's dotted name IS its place in the hierarchy, so changing the parent moves the
 * zone (`vtz.rescope`) while changing anything else edits it (`vtz.edit`). The operator authors one form
 * and confirms once; the Console does not make them perform the engine's decomposition by hand.
 */
export type VtzCommand =
  | { readonly kind: 'create'; readonly spec: VtzSpecInput }
  | {
      readonly kind: 'save';
      readonly id: string;
      readonly spec: VtzSpecInput;
      /** The dotted name to move to, or null to leave the zone where it is. */
      readonly moveTo: string | null;
    }
  | { readonly kind: 'delete'; readonly id: string };

/**
 * Run one authoring command against its route.
 *
 * A `save` that also moves commits the settings FIRST and then the move: `vtz.rescope` carries the stored
 * record forward to the new name, so editing first means the moved zone arrives with the operator's new
 * settings. The reverse order would edit a zone id that no longer exists.
 */
export async function runVtzCommand(command: VtzCommand): Promise<VtzMutationResult> {
  if (command.kind === 'create') {
    return send('/api/vtz', 'POST', command.spec);
  }
  const id = encodeURIComponent(command.id);
  if (command.kind === 'delete') {
    return send(`/api/vtz/${id}`, 'DELETE');
  }
  const edited = await send(`/api/vtz/${id}`, 'PUT', command.spec);
  if (command.moveTo === null) {
    return edited;
  }
  try {
    return await send(`/api/vtz/${id}/rescope`, 'POST', { newName: command.moveTo });
  } catch (error) {
    // The settings are already on the audit chain; only the move was refused. Re-throw carrying that
    // fact so the operator is not told nothing happened.
    if (error instanceof VtzCommandError) {
      throw new VtzCommandError(error.failure, true);
    }
    throw error;
  }
}

/**
 * The zone authoring mutation. On success it invalidates the zone tree and the touched zone's detail, so
 * the grid and the editor re-read the system of record rather than trusting an optimistic local edit --
 * the engine may have composed, re-scoped, or transitioned the zone differently than the form assumed,
 * and the store is the truth (INV-CONSOLE-NO-2ND-DB).
 */
export function useVtzMutation(): UseMutationResult<VtzMutationResult, Error, VtzCommand> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runVtzCommand,
    retry: false,
    onSuccess: (result, command) => {
      void queryClient.invalidateQueries({ queryKey: ['vtzTree'] });
      void queryClient.invalidateQueries({ queryKey: vtzDetailQueryKey(result.id) });
      if (command.kind !== 'create') {
        // A save that moved the zone lands it on a new id, so the OLD detail entry is stale too.
        void queryClient.invalidateQueries({ queryKey: vtzDetailQueryKey(command.id) });
      }
    },
  });
}
