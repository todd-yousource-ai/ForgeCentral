// packages/contracts/src/forge.ts -- zone -> EndpointPolicy composition (FD.1).
//
// INV-CONSOLE-FORGE-COMPOSED-FROM-RECORD: a bundle's policy is composed from the live crdb zone store
// and from nothing else. This module is the pure, deterministic half: it takes a zone as read from
// `vtz.tree` / `vtz.detail` and produces the flat TRD-32 v1 `EndpointPolicy` an endpoint applies, plus
// an honest record of everything the operator authored that a v1 bundle cannot carry.
//
// It performs no IO, holds no state, and never reaches for a default that is more permissive than the
// zone said. Signing is FD.2; serving is FD.3.
//
// # What a zone-only bundle actually carries
//
// A v2 `TrustZoneRecord` carries eleven `ObjectDomain` postures plus metadata; `EndpointPolicy` is the
// TRD-32 v1 disposition. Verified field by field against `cdb-types`, exactly one authored bit crosses:
//
//   allow_ordinary_internet <- the `ordinary-network` effective posture   (the one real mapping)
//   exec                    <- `execution`, a catastrophic-floor domain   (constant DenyUnwrappedExec)
//   brokered                <- nothing: a destination SET, not a posture  (empty)
//   restricted              <- nothing, likewise                          (empty)
//   resource_bound          <- nothing: grant-derived (R-FRG-4)           (fail-closed zeros)
//   max_classification      <- nothing: not a field on TrustZoneRecord    (fail-closed Unclassified)
//
// `governed-egress` does NOT map to `brokered`: a posture is a disposition, a `ModelMcpDestSet` is a
// list of destinations, and a zone holds no destinations. Destinations and resource ceilings arrive
// from policy rules (TRD-CONSOLE-05) and capability grants, neither of which is built.
//
// That single bit is still a real, total disposition. With `brokered` and `restricted` empty,
// `EndpointPolicy::egress_class` classifies EVERY destination as restricted unless ordinary internet
// is permitted, so a zone denying `ordinary-network` yields a bundle that denies all egress, and a
// zone permitting it yields one that allows direct ordinary egress.
//
// # The gap is recorded, never dropped
//
// The bundle itself cannot hold the record: `contributors` is `PolicyVersionRef[]`, which is a
// `{policy, version}` pair with no free-text field. So composition returns the gap alongside the
// policy, and the caller writes it to the audited composition record and the bundle detail view
// (FD.2/FD.3). See `FD-DEFER-V2-POSTURE-BUNDLE`, which lands with the Objects IP (TRD-CONSOLE-10).

import {
  type Classification,
  type EndpointPolicy,
  type ExecDisposition,
  type ResourceBound,
} from './generated/forge-dto.js';
import { VTZ_OBJECT_DOMAINS, type VtzObjectDomain, type VtzZone } from './vtz.js';

export {
  FORGE_FIELD_ORDER,
  type ApplyError,
  type ApplyOutcome,
  type BundleVersion,
  type CertIdentity,
  type Classification,
  type EndpointPolicy,
  type ExecDisposition,
  type FreshnessLease,
  type IdentityScope,
  type ModelMcpDestSet,
  type ResourceBound,
  type ScopeMember,
  type SignatureAlgorithm,
  type SignedPolicyBundle,
} from './generated/forge-dto.js';
// `VtzId` and `PolicyId` are deliberately NOT re-exported here: `./ids.js` already owns those names as
// branded Console ids. The generated projections are plain strings, so they remain assignable either
// way; keeping one name per concept is INV-CONSOLE-CONTRACTS-SINGLE-SOURCE.

/**
 * The object domains a v1 `EndpointPolicy` can express, and the field each one reaches.
 *
 * Derived, not hardcoded: {@link unexpressibleDomains} is every other domain, so teaching the bundle a
 * new domain updates the gap record automatically instead of leaving a stale list behind.
 */
const EXPRESSIBLE_DOMAINS = {
  'ordinary-network': 'allow_ordinary_internet',
  execution: 'exec',
} as const satisfies Partial<Record<VtzObjectDomain, keyof EndpointPolicy>>;

/**
 * The authored `VtzZone` fields no v1 bundle field carries.
 *
 * These are operator-visible on the VTZ surface, so they belong in the gap record for the same reason
 * the unexpressible domains do: a bundle that silently drops them reads as though it carried them.
 */
export const UNEXPRESSIBLE_ZONE_FIELDS = [
  'microSegmentation',
  'telemetry',
  'reauthIntervalHours',
  'zoneType',
] as const satisfies readonly (keyof VtzZone)[];

/** Every object domain a v1 `EndpointPolicy` cannot express, in {@link VTZ_OBJECT_DOMAINS} order. */
export function unexpressibleDomains(): readonly VtzObjectDomain[] {
  return VTZ_OBJECT_DOMAINS.filter((domain) => !(domain in EXPRESSIBLE_DOMAINS));
}

/**
 * What the operator authored that this bundle does not carry, paired with the posture they authored so
 * the record states the lost disposition rather than only its name.
 */
export interface UnexpressedDomain {
  readonly domain: VtzObjectDomain;
  /** The effective posture the zone authored, or `null` when the zone stated none for this domain. */
  readonly posture: VtzZone['effectivePostures'][number]['posture'] | null;
}

/** A composed policy together with the honest record of what the v1 bundle could not carry. */
export interface ComposedEndpointPolicy {
  readonly policy: EndpointPolicy;
  /** Domains the operator authored that no v1 field expresses. Never empty for a real zone. */
  readonly unexpressedDomains: readonly UnexpressedDomain[];
  /** Authored zone fields no v1 field expresses. */
  readonly unexpressedFields: readonly (keyof VtzZone)[];
}

/**
 * The fail-closed resource ceiling used when no capability grant supplies one (R-FRG-4).
 *
 * Every ceiling is zero: the most restrictive value the type can hold. This is deliberate and it is
 * NOT a placeholder -- a permissive default here would be a bundle granting resources the operator
 * never authorized. Real ceilings arrive with the capability-grant substrate, which is not built;
 * enforcement is OFF (AG.7-OFF) so no endpoint realizes this today.
 */
const FAIL_CLOSED_RESOURCE_BOUND: ResourceBound = {
  cpu_millicores: 0,
  memory_bytes: 0,
  pids: 0,
  io_bytes_per_sec: 0,
  cost_micros: 0,
  storage_bytes: 0,
  rate_per_sec: 0,
};

/** The catastrophic-floor execution disposition. `execution` is pinned `deny`; this is its v1 form. */
const EXEC_FLOOR: ExecDisposition = 'DenyUnwrappedExec';

/** The most restrictive classification ceiling. A policy's max never widens (R-FRG-7). */
const FAIL_CLOSED_CLASSIFICATION: Classification = 'Unclassified';

/**
 * Compose the flat `EndpointPolicy` an endpoint applies from one zone's EFFECTIVE postures.
 *
 * Effective, not own: the endpoint applies a single resolved policy and never walks the hierarchy
 * (TRD-32 Section 7), so the tighten-only composition up the ancestor chain is what must travel.
 *
 * Fail-closed at every gap. A domain the zone did not state, a posture that is anything other than an
 * explicit permit, and every field with no zone source all resolve to the most restrictive value. The
 * only way `allow_ordinary_internet` becomes true is an explicit `permit-deny-risky` on
 * `ordinary-network`.
 *
 * The returned object's key order matches `FORGE_FIELD_ORDER.EndpointPolicy`, which is the order the
 * CBOR preimage encodes and the signature binds. Do not reorder these properties.
 */
export function composeEndpointPolicy(zone: VtzZone): ComposedEndpointPolicy {
  const effective = new Map(zone.effectivePostures.map((entry) => [entry.domain, entry.posture]));

  // The one real mapping. Absent or denied both yield false; only an explicit permit opens it.
  const ordinary = effective.get('ordinary-network');
  const allowOrdinaryInternet = ordinary === 'permit-deny-risky';

  const policy: EndpointPolicy = {
    max_classification: FAIL_CLOSED_CLASSIFICATION,
    brokered: { destinations: [] },
    restricted: [],
    allow_ordinary_internet: allowOrdinaryInternet,
    exec: EXEC_FLOOR,
    resource_bound: FAIL_CLOSED_RESOURCE_BOUND,
  };

  const unexpressedDomains = unexpressibleDomains().map((domain) => ({
    domain,
    posture: effective.get(domain) ?? null,
  }));

  return {
    policy,
    unexpressedDomains,
    unexpressedFields: UNEXPRESSIBLE_ZONE_FIELDS,
  };
}

// -- FD.7c: the distribution convergence ledger (a projection over BUNDLE_CONVERGENCE) ----------------

import type { WireBundleConvergence } from './generated/wire-dto.js';

/**
 * One endpoint's convergence state for a zone's newest bundle. The three states an operator must tell
 * apart -- applied, rejected (with a typed reason), or silent (no confirmation). `silent` is never
 * read as converged: absence of evidence is not delivery.
 */
export type EndpointConvergenceState = 'applied' | 'rejected' | 'silent';

/** The wire state tags this projection accepts; an unknown tag fails the projection closed. */
const CONVERGENCE_STATES: readonly EndpointConvergenceState[] = ['applied', 'rejected', 'silent'];

/** One scope member with its convergence state, projected from a `WireConvergenceMember`. */
export interface ConvergenceMemberView {
  readonly endpointCn: string;
  readonly state: EndpointConvergenceState;
  /** The `ApplyError` variant name for a `rejected` state; `null` otherwise. Never a generic "failed". */
  readonly reason: string | null;
}

/**
 * A zone bundle's convergence, projected from `BUNDLE_CONVERGENCE`. `hasBundle` is false when no bundle
 * has been distributed for the zone (then `members` is empty) -- the honest "nothing to converge on"
 * state, distinct from a bundle every endpoint is silent about.
 */
export interface BundleConvergenceView {
  readonly hasBundle: boolean;
  readonly version: number;
  readonly members: readonly ConvergenceMemberView[];
}

/**
 * Project a `WireBundleConvergence` to the view model. Fail-closed: an unknown member state, or a
 * `rejected` member with no reason, collapses the whole projection to `null` (the resolver then
 * surfaces unavailability rather than rendering a mislabelled convergence state on a governance
 * surface). A `rejected` state MUST carry its reason; `applied`/`silent` MUST NOT.
 */
export function toBundleConvergence(reply: WireBundleConvergence): BundleConvergenceView | null {
  const members: ConvergenceMemberView[] = [];
  for (const member of reply.members) {
    const state = CONVERGENCE_STATES.find((s) => s === member.state);
    if (state === undefined) {
      return null;
    }
    const reason = member.reason ?? null;
    if (state === 'rejected' && reason === null) {
      return null;
    }
    if (state !== 'rejected' && reason !== null) {
      return null;
    }
    members.push({ endpointCn: member.endpoint_cn, state, reason });
  }
  return { hasBundle: reply.has_bundle, version: reply.version, members };
}
