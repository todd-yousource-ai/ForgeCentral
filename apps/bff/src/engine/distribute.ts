// apps/bff/src/engine/distribute.ts -- the FD.2 producer orchestration (P5.5: the Policy-tab producer).
//
// The one place a policy bundle is born: read the zone from the system of record, compose the flat
// EndpointPolicy from its EFFECTIVE postures (FD.1), read the zone's EFFECTIVE PUBLISHED POLICIES
// (POLICY_EFFECTIVE -- the crdb PS.7 composer seam: newest published per policy, producer-expiry
// admitted ENGINE-side with the server clock), compose the authored-ruleset carriage (`rules` +
// `contributors`), assemble the draft, have the sidecar sign it (the key never enters this tier; a
// rules-carrying bundle signs in the v2 preimage domain), and commit the signed bytes to the crdb
// carrier (FD.3) under the operator's delegation. The response carries the version AND the composition
// record -- what the operator authored that the flat v1 policy could not express -- so the gap is
// visible, never dropped.

import {
  composeBundleRules,
  composeEndpointPolicy,
  toPolicyRow,
  toVtzDetail,
} from '@forge/contracts';
import type { ComposedBundleRules, VtzZone } from '@forge/contracts';
import { encode as encodeCbor } from '@forge/wire';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';
import { signBundle } from './sign-client.js';
import type { BundleDraft } from './sign-client.js';

/**
 * The freshness-lease window, in milliseconds of the unix-ms Hlc convention this producer stamps.
 *
 * TUNE: 24h matches the fleet's daily ZTP rotation cadence -- an endpoint partitioned longer than its
 * identity would survive anyway fails closed on the lease. Tighten with operational data once FD.7
 * shows real convergence latencies.
 */
export const LEASE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The distribution target set: the enrolled endpoints the operator chose, by bound FQDN. */
export interface DistributeRequest {
  readonly zoneId: string;
  readonly members: readonly string[];
}

/** What a distribute returns: the carried version plus the honest composition record. */
export interface DistributeResult {
  readonly version: number;
  readonly commitVersion: number;
  /** How many authored rules the bundle carries (P5.5); 0 = a zone with nothing published. */
  readonly carriedRules: number;
  /** How many published policy versions contributed them (the contributor list length). */
  readonly carriedPolicies: number;
  readonly unexpressedDomains: ReturnType<typeof composeEndpointPolicy>['unexpressedDomains'];
  readonly unexpressedFields: ReturnType<typeof composeEndpointPolicy>['unexpressedFields'];
}

/** The zone named by a distribute does not exist for this tenant. */
export class DistributeZoneUnknownError extends Error {
  constructor(zoneId: string) {
    super(`no such zone: ${zoneId}`);
    this.name = 'DistributeZoneUnknownError';
  }
}

/** The effective policies could not be composed honestly (an unknown tag or unparseable version). */
export class DistributeCompositionError extends Error {
  constructor(what: string) {
    super(`bundle composition failed closed: ${what}`);
    this.name = 'DistributeCompositionError';
  }
}

/** Compose the draft the sidecar signs. Exported for the tier-1 tests; pure. */
export function draftForZone(
  zone: VtzZone,
  commitVersion: number,
  members: readonly string[],
  composed: ComposedBundleRules,
  nowMs: number,
): { draft: BundleDraft; record: ReturnType<typeof composeEndpointPolicy> } {
  const record = composeEndpointPolicy(zone);
  const draft: BundleDraft = {
    // The system of record's own commit counter (finding 2): replicas agree, an unchanged store
    // re-reads to an equal version, a zone edit strictly advances it.
    version: commitVersion,
    policy: record.policy,
    // The authored-ruleset carriage (P5.5): the zone's effective published policies, flattened.
    // Empty when the zone has none published -- the bundle then signs the unchanged v1 preimage.
    rules: [...composed.rules],
    // The authored policy versions the rules came from (the R-FRG-84 audit trail).
    contributors: [...composed.contributors],
    scope: {
      vtz: zone.id,
      // FC is 1Source: the operator CHOSE these endpoints; the carrier re-gates each fetch against
      // the verified peer, and the endpoint's own scope check runs on-device regardless.
      members: members.map((cn) => ({ endpoint: { cn, sans: [cn] }, agent: null })),
    },
    lease: { issued_at: nowMs, not_after: nowMs + LEASE_WINDOW_MS },
  };
  return { draft, record };
}

/**
 * The full producer path: read -> compose -> sign -> commit.
 *
 * Fail-closed end to end: an unknown zone, a projection failure, a signer refusal, and an engine
 * refusal each surface typed; nothing half-signed or unsigned ever reaches the carrier.
 */
export async function resolveDistribute(
  engine: OperatorEngine,
  signer: { host: string; port: number; timeoutMs: number },
  principal: OperatorPrincipal,
  request: DistributeRequest,
  opts?: EngineCallOptions,
): Promise<DistributeResult> {
  const wire = await engine.vtzDetail(
    principal,
    { request_id: 0, vtz_id: request.zoneId, operator: null },
    opts,
  );
  const detail = toVtzDetail(wire);
  if (detail === null || detail.zone === null) {
    throw new DistributeZoneUnknownError(request.zoneId);
  }
  // The authored half: the zone's effective published policies (POLICY_EFFECTIVE; drafts and
  // producer-expired policies were already excluded engine-side). Fail-closed end to end: a record
  // the contract cannot narrow, or a version it cannot parse, refuses the WHOLE distribute -- a
  // bundle silently missing an authored rule is a lie on the signing path.
  const effective = await engine.policyEffective(
    principal,
    { request_id: 0, vtz: request.zoneId },
    opts,
  );
  const policies = [];
  for (const record of effective.policies) {
    const row = toPolicyRow(record);
    if (row === null) {
      throw new DistributeCompositionError('an effective policy carries an unknown engine tag');
    }
    policies.push(row);
  }
  const composed = composeBundleRules(policies);
  if (composed === null) {
    throw new DistributeCompositionError('an effective policy version is unparseable');
  }
  const { draft, record } = draftForZone(
    detail.zone,
    detail.commitVersion,
    request.members,
    composed,
    Date.now(),
  );
  const signed = await signBundle(signer.host, signer.port, draft, signer.timeoutMs);
  // The carrier stores these bytes verbatim and the endpoint re-derives the signed preimage from the
  // DECODED bundle, so this encoding only has to decode correctly -- key order is not signature-bearing.
  const bytes = Array.from(encodeCbor(signed));
  const ack = await engine.bundleCommit(
    principal,
    { request_id: 0, bundle: bytes, operator: null },
    opts,
  );
  return {
    version: ack.version,
    commitVersion: ack.commit_version,
    carriedRules: composed.rules.length,
    carriedPolicies: composed.contributors.length,
    unexpressedDomains: record.unexpressedDomains,
    unexpressedFields: record.unexpressedFields,
  };
}
