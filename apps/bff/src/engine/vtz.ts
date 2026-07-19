// apps/bff/src/engine/vtz.ts -- the Virtual Trust Zones read resolvers (IP-CONSOLE-02 V2.2).
//
// Brokers the VTZ governance surface's reads to crdb's VTZ_TREE / VTZ_DETAIL verbs over the
// OperatorEngine (crdb IP-CONSOLE-VTZ-SUBSTRATE VZ.3a/VZ.3b): the tenant's zone tree with each zone's own
// + effective (tighten-only composed) per-domain postures, and one zone plus the ancestor chain that
// contributed to its effective posture. The VTZ store is the SYSTEM OF RECORD; the Console reads it and
// never keeps its own copy (INV-CONSOLE-NO-2ND-DB). The OperatorEngine injects the operator delegation
// server-side; these resolvers only PROJECT the returned DTOs into the shared `VtzTree` / `VtzDetailView`
// view models via the ONE shared projection in `@forge/contracts` (INV-CONSOLE-VTZ-REAL: every zone,
// posture, and count is a real engine fact, never fabricated).
//
// Both fail CLOSED: if the engine emits a posture, lifecycle, archetype, telemetry, or object-domain tag
// the Console does not know, the projection returns null and the resolver raises
// {@link VtzUnavailableError} rather than rendering a zone whose posture it had to guess. On a governance
// surface a mis-rendered posture is a security-relevant lie, so the route reports unavailability instead.

import { toVtzDetail, toVtzMutation, toVtzTree, toWireVtzSpec } from '@forge/contracts';
import type {
  VtzDetailView,
  VtzMutationResult,
  VtzSpecInput,
  VtzTree,
  WireVtzDetailQuery,
  WireVtzTreeQuery,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';
import { EngineRefusedError } from './wire-client.js';

/**
 * Raised when a VTZ read cannot be projected to a well-formed view model -- the engine emitted an enum tag
 * the Console does not know. The route maps this to the unavailable state (a 503), never a defaulted
 * posture (fail-closed, TRD-CONSOLE-02).
 */
export class VtzUnavailableError extends Error {
  constructor() {
    super('the VTZ read carried an enum tag the Console does not know');
    this.name = 'VtzUnavailableError';
  }
}

/**
 * The largest zone tree a single read returns (the engine clamps further per-tenant and flags
 * `truncated` when its own scan ceiling is hit, so a prefix is always badged rather than passed off as
 * the whole store).
 */
export const MAX_VTZ_TREE_LIMIT = 500;

/** The default zone-tree bound when the caller names none. */
export const DEFAULT_VTZ_TREE_LIMIT = 200;

/**
 * Resolve the tenant's VTZ tree (`vtz.tree`), brokered on behalf of `principal`. `limit` bounds the read
 * (clamped to {@link MAX_VTZ_TREE_LIMIT}); the engine bounds it further and sets `truncated`. Fails closed
 * to {@link VtzUnavailableError} when any zone carries an unknown enum tag.
 */
export async function resolveVtzTree(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  limit: number,
  opts?: EngineCallOptions,
): Promise<VtzTree> {
  const request: WireVtzTreeQuery = {
    request_id: 0,
    operator: null,
    limit: Math.min(Math.max(1, limit), MAX_VTZ_TREE_LIMIT),
  };
  const view = toVtzTree(await engine.vtzTree(principal, request, opts));
  if (view === null) {
    throw new VtzUnavailableError();
  }
  return view;
}

/**
 * Resolve one zone plus its effective-posture ancestor chain (`vtz.detail`), brokered on behalf of
 * `principal`. An id naming no zone in the tenant is NOT an error: the engine returns an absent zone and
 * this projects to `{ zone: null }`, the honest not-found state the editor renders as such. Fails closed
 * to {@link VtzUnavailableError} only when a PRESENT zone carries an unknown enum tag.
 */
export async function resolveVtzDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  id: string,
  opts?: EngineCallOptions,
): Promise<VtzDetailView> {
  const request: WireVtzDetailQuery = {
    request_id: 0,
    operator: null,
    vtz_id: id,
  };
  const view = toVtzDetail(await engine.vtzDetail(principal, request, opts));
  if (view === null) {
    throw new VtzUnavailableError();
  }
  return view;
}

// ---------------------------------------------------------------------------------------------------------
// The audited WRITE path (V2.3). Each verb commits through the crdb Committer, so a successful call has
// already landed on the audit chain attributed to this operator. The engine re-validates the catastrophic
// floor and tighten-only inheritance on every write and REFUSES rather than silently correcting -- which is
// the whole point of authoring against a system of record, so the refusal is surfaced honestly rather than
// swallowed or retried.

/**
 * Why a zone mutation was refused, derived from the engine's `WireError.class`. The engine deliberately
 * returns NO message (it is not an oracle: a detailed reason would leak the shape of a tenant's zone tree
 * to a caller who cannot read it), so this names the CLASS of refusal and nothing more specific. The
 * Console must not invent which zone conflicted or which domain was floored -- it says what class of rule
 * the engine applied and lets the operator re-read the tree.
 */
export type VtzRefusalKind =
  /** A state conflict: the zone already exists, does not exist, or still has children. */
  | 'conflict'
  /** A rule violation: a catastrophic-floor relaxation, an inheritance contradiction, or a tenant breach. */
  | 'denied';

/** Raised when the engine refused an audited zone mutation. Nothing was committed. */
export class VtzMutationRefusedError extends Error {
  constructor(readonly kind: VtzRefusalKind) {
    super(`the engine refused the zone mutation (${kind})`);
    this.name = 'VtzMutationRefusedError';
  }
}

/**
 * Classify an engine refusal, or return `null` if it is not one the Console can explain (the route then
 * treats it as an engine error, never as a refusal it understood). `Conflict` is a state clash;
 * `Denied` is the floor / inheritance / tenant guard.
 */
export function classifyVtzRefusal(error: unknown): VtzRefusalKind | null {
  if (!(error instanceof EngineRefusedError)) return null;
  if (error.wireError.class === 'Conflict') return 'conflict';
  if (error.wireError.class === 'Denied') return 'denied';
  return null;
}

/** Run an audited mutation, translating an engine refusal into the typed {@link VtzMutationRefusedError}. */
async function commit(
  run: () => Promise<Parameters<typeof toVtzMutation>[0]>,
): Promise<VtzMutationResult> {
  let reply;
  try {
    reply = await run();
  } catch (err) {
    const kind = classifyVtzRefusal(err);
    if (kind !== null) throw new VtzMutationRefusedError(kind);
    throw err;
  }
  const view = toVtzMutation(reply);
  if (view === null) {
    // The write landed but the engine named a lifecycle we do not know. Report unavailability rather
    // than claiming a state: the operator re-reads the zone to see what actually committed.
    throw new VtzUnavailableError();
  }
  return view;
}

/** Author a new zone (`vtz.create`), audited. Refusals surface as {@link VtzMutationRefusedError}. */
export async function resolveVtzCreate(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  spec: VtzSpecInput,
  opts?: EngineCallOptions,
): Promise<VtzMutationResult> {
  return commit(() =>
    engine.vtzCreate(principal, { request_id: 0, operator: null, spec: toWireVtzSpec(spec) }, opts),
  );
}

/** Edit a zone's own postures + settings (`vtz.edit`), audited. The spec's name identifies the zone. */
export async function resolveVtzEdit(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  spec: VtzSpecInput,
  opts?: EngineCallOptions,
): Promise<VtzMutationResult> {
  return commit(() =>
    engine.vtzEdit(principal, { request_id: 0, operator: null, spec: toWireVtzSpec(spec) }, opts),
  );
}

/**
 * Re-scope a zone (`vtz.rescope`), audited: a RENAME, because the dotted name is the hierarchy. The reply
 * carries the new id and no lifecycle (the Console re-reads the moved zone), which projects to
 * `lifecycle: null` rather than a guessed state.
 */
export async function resolveVtzRescope(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  id: string,
  newName: string,
  opts?: EngineCallOptions,
): Promise<VtzMutationResult> {
  return commit(() =>
    engine.vtzRescope(
      principal,
      { request_id: 0, operator: null, vtz_id: id, new_name: newName },
      opts,
    ),
  );
}

/** Delete a zone (`vtz.delete`), audited. A zone that still has children is refused as a conflict. */
export async function resolveVtzDelete(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  id: string,
  opts?: EngineCallOptions,
): Promise<VtzMutationResult> {
  return commit(() =>
    engine.vtzDelete(principal, { request_id: 0, operator: null, vtz_id: id }, opts),
  );
}
