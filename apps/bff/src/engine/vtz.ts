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

import { toVtzDetail, toVtzTree } from '@forge/contracts';
import type {
  VtzDetailView,
  VtzTree,
  WireVtzDetailQuery,
  WireVtzTreeQuery,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

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
