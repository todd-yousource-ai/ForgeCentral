// apps/bff/src/engine/policies.ts -- the Policies-surface read resolvers (IP-CONSOLE-05 P5.2).
//
// Projects the crdb policy store reads into the Console view models: `policies.byZone` is the tenant's
// authored policies grouped by VTZ (POLICY_LIST_BY_ZONE, crdb PS.5); `policies.detail` is one policy's
// full definition plus its version history (POLICY_DETAIL, PS.5). Both are engine-bounded (the per-tenant
// ceiling refuses rather than truncating), tenant-private, and operator-delegated via `OperatorEngine`
// (INV-CONSOLE-ENGINE-AUTHZ).
//
// FAIL-CLOSED: a record carrying an engine tag the contract cannot narrow collapses the WHOLE response to
// `PoliciesUnavailableError` -- a list silently missing policies, or a mis-rendered action/logging, is
// exactly the lie the no-stub rule forbids on a governance surface (INV-CONSOLE-POLICIES-REAL). An empty
// tenant is an honest empty zone list, never an error.

import type {
  PolicyDetailView,
  PolicyDraft,
  PolicyMutation,
  PolicyZoneGroup,
  WirePolicyDetailQuery,
  WirePolicyListQuery,
} from '@forge/contracts';
import {
  toPolicyDetail,
  toPolicyMutation,
  toPolicyZones,
  toWirePolicySpec,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** The engine returned a policy the Console cannot render honestly; the route surfaces 503. */
export class PoliciesUnavailableError extends Error {
  constructor(what: string) {
    super(`policies read cannot be rendered honestly: ${what}`);
    this.name = 'PoliciesUnavailableError';
  }
}

let nextRequestId = 1n;
function requestId(): number {
  nextRequestId += 1n;
  return Number(nextRequestId % 1_000_000_000n);
}

/** Resolve the tenant's policies grouped by zone (the grouped read-only surface reads this). */
export async function resolvePolicyZones(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly PolicyZoneGroup[]> {
  const request: WirePolicyListQuery = { request_id: requestId() };
  const list = await engine.policyListByZone(principal, request, opts);
  const zones = toPolicyZones(list);
  if (zones === null) {
    throw new PoliciesUnavailableError('a policy record carries an unknown engine tag');
  }
  return zones;
}

/** Resolve one policy's full definition + version history (the editor/view drawer). */
export async function resolvePolicyDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  vtz: string,
  id: string,
  opts?: EngineCallOptions,
): Promise<PolicyDetailView> {
  const request: WirePolicyDetailQuery = { request_id: requestId(), vtz, id };
  const detail = await engine.policyDetail(principal, request, opts);
  const view = toPolicyDetail(detail);
  if (view === null) {
    throw new PoliciesUnavailableError('the policy record carries an unknown engine tag');
  }
  return view;
}

/** Project a policy command ack into the view mutation, failing closed on an unrenderable ack. */
function mutation(reply: import('@forge/contracts').WirePolicyMutated): PolicyMutation {
  const view = toPolicyMutation(reply);
  if (view === null) {
    throw new PoliciesUnavailableError('the command ack carries an unknown lifecycle');
  }
  return view;
}

/**
 * Author a new policy draft (`policies.create` -> crdb POLICY_CREATE, PS.6, audited). The store mints
 * v1.0.0 as a Draft; a duplicate name in the zone is a typed refusal the route maps to 409. A refusal
 * (`EngineRefusedError`) propagates unchanged for the route to classify (409/400/403).
 */
export async function resolveCreatePolicy(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: PolicyDraft,
  opts?: EngineCallOptions,
): Promise<PolicyMutation> {
  const reply = await engine.policyCreate(
    principal,
    { request_id: requestId(), spec: toWirePolicySpec(draft) },
    opts,
  );
  return mutation(reply);
}

/** Edit a policy into a new Draft version (`policies.edit` -> crdb POLICY_EDIT, PS.6, audited). */
export async function resolveEditPolicy(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  id: string,
  draft: PolicyDraft,
  opts?: EngineCallOptions,
): Promise<PolicyMutation> {
  const reply = await engine.policyEdit(
    principal,
    { request_id: requestId(), id, spec: toWirePolicySpec(draft) },
    opts,
  );
  return mutation(reply);
}

/** Publish a policy version (`policies.publish` -> crdb POLICY_PUBLISH, PS.6, audited; breaking flagged). */
export async function resolvePublishPolicy(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  vtz: string,
  id: string,
  version: string,
  opts?: EngineCallOptions,
): Promise<PolicyMutation> {
  const reply = await engine.policyPublish(
    principal,
    { request_id: requestId(), vtz, id, version },
    opts,
  );
  return mutation(reply);
}

/** Delete a policy (`policies.delete` -> crdb POLICY_DELETE, PS.6, tombstoned; history preserved). */
export async function resolveDeletePolicy(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  vtz: string,
  id: string,
  opts?: EngineCallOptions,
): Promise<PolicyMutation> {
  const reply = await engine.policyDelete(principal, { request_id: requestId(), vtz, id }, opts);
  return mutation(reply);
}
