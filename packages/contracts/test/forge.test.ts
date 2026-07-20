// packages/contracts/test/forge.test.ts -- FD.1 tier-1 + tier-4 tests for zone -> policy composition.
//
// Proves INV-CONSOLE-FORGE-COMPOSED-FROM-RECORD: the policy an endpoint applies is composed from the
// zone the operator authored and from nothing else; every gap resolves to the most restrictive value;
// and what a v1 bundle cannot carry is recorded rather than dropped.
//
// The tier-4 vector is the field-order test. The bundle signature is over a CBOR preimage whose maps
// carry keys in struct declaration order, so a reordered object literal produces a signature the
// endpoint refuses. That test pins the order against FORGE_FIELD_ORDER, which is generated from crdb's
// emitted contract -- so a reorder upstream fails here rather than in the field.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderForgeDtoTypes } from '../scripts/generate.mjs';
import {
  FORGE_DTO_SCHEMA_ID,
  FORGE_FIELD_ORDER,
  UNEXPRESSIBLE_ZONE_FIELDS,
  VTZ_OBJECT_DOMAINS,
  composeEndpointPolicy,
  toBundleConvergence,
  unexpressibleDomains,
  type DomainPosture,
  type VtzObjectDomain,
  type VtzPosture,
  type VtzZone,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'schema', 'forge-dto.schema.json');
const generatedPath = join(here, '..', 'src', 'generated', 'forge-dto.ts');

/** A posture row for one domain. */
function posture(domain: VtzObjectDomain, value: VtzPosture): DomainPosture {
  return { domain, posture: value, floor: domain === 'execution' };
}

/** A zone whose effective postures are exactly the given rows (any domain not listed is unstated). */
function zoneWith(effectivePostures: readonly DomainPosture[]): VtzZone {
  return {
    id: 'YouSource.Corp' as VtzZone['id'],
    name: 'YouSource.Corp',
    parent: null,
    zoneType: 'standard',
    lifecycle: 'published',
    microSegmentation: true,
    telemetry: 'full',
    reauthIntervalHours: 8,
    ownPostures: effectivePostures,
    effectivePostures,
    subZoneCount: 0,
  };
}

describe('FD.1 zone -> EndpointPolicy composition', () => {
  it('permits ordinary egress only on an explicit permit', () => {
    const { policy } = composeEndpointPolicy(
      zoneWith([posture('ordinary-network', 'permit-deny-risky')]),
    );
    expect(policy.allow_ordinary_internet).toBe(true);
  });

  it('denies ordinary egress when the zone denies the domain', () => {
    const { policy } = composeEndpointPolicy(zoneWith([posture('ordinary-network', 'deny')]));
    expect(policy.allow_ordinary_internet).toBe(false);
  });

  it('denies ordinary egress when the zone states no posture for the domain', () => {
    // A zone that never stated `ordinary-network` must not compose to a permissive bundle. This is the
    // unknown/absent path: fail closed, never a permissive default.
    const { policy } = composeEndpointPolicy(zoneWith([posture('memory', 'permit-deny-risky')]));
    expect(policy.allow_ordinary_internet).toBe(false);
  });

  it('composes closed for a zone with no effective postures at all', () => {
    const { policy } = composeEndpointPolicy(zoneWith([]));
    expect(policy.allow_ordinary_internet).toBe(false);
    expect(policy.exec).toBe('DenyUnwrappedExec');
  });

  it('preserves the execution floor regardless of what the zone authored', () => {
    // `execution` is a read-only catastrophic-floor domain. Even if a posture row claimed otherwise,
    // the composed disposition is the floor constant.
    const { policy } = composeEndpointPolicy(zoneWith([posture('execution', 'permit-deny-risky')]));
    expect(policy.exec).toBe('DenyUnwrappedExec');
  });

  it('takes the most restrictive value for every field no zone field supplies', () => {
    const { policy } = composeEndpointPolicy(
      zoneWith([posture('ordinary-network', 'permit-deny-risky')]),
    );
    // Empty destination sets are what make the one authored bit total: with both empty, egress_class
    // classifies every destination by allow_ordinary_internet alone.
    expect(policy.brokered).toEqual({ destinations: [] });
    expect(policy.restricted).toEqual([]);
    // The lowest ceiling, since a policy's max classification never widens (R-FRG-7).
    expect(policy.max_classification).toBe('Unclassified');
    // Zero on every ceiling: no capability grant supplies one, so the fail-closed value is nothing.
    expect(Object.values(policy.resource_bound).every((value) => value === 0)).toBe(true);
  });
});

describe('FD.1 the unexpressible gap is recorded', () => {
  it('counts every domain a v1 bundle cannot express', () => {
    // Nine, not eight: `governed-egress` is unexpressible too. A posture is a disposition and
    // `brokered` is a destination set, so the domain has no v1 field despite the name suggesting one.
    const unexpressible = unexpressibleDomains();
    expect(unexpressible).toHaveLength(VTZ_OBJECT_DOMAINS.length - 2);
    expect(unexpressible).toContain('governed-egress');
    expect(unexpressible).not.toContain('ordinary-network');
    expect(unexpressible).not.toContain('execution');
  });

  it('records the authored posture that was lost, not merely the domain name', () => {
    const { unexpressedDomains } = composeEndpointPolicy(
      zoneWith([posture('credential-store', 'deny'), posture('memory', 'permit-deny-risky')]),
    );
    const byDomain = new Map(unexpressedDomains.map((entry) => [entry.domain, entry.posture]));
    expect(byDomain.get('credential-store')).toBe('deny');
    expect(byDomain.get('memory')).toBe('permit-deny-risky');
    // A domain the zone never stated is recorded as unstated, not silently omitted from the record.
    expect(byDomain.has('device')).toBe(true);
    expect(byDomain.get('device')).toBeNull();
  });

  it('records the authored zone fields no v1 field carries', () => {
    const { unexpressedFields } = composeEndpointPolicy(zoneWith([]));
    expect(unexpressedFields).toEqual(UNEXPRESSIBLE_ZONE_FIELDS);
    expect(unexpressedFields).toContain('microSegmentation');
    expect(unexpressedFields).toContain('telemetry');
    expect(unexpressedFields).toContain('reauthIntervalHours');
    expect(unexpressedFields).toContain('zoneType');
  });
});

describe('FD.1 the signed preimage layout', () => {
  it('emits policy fields in the exact order the signature binds', () => {
    // TIER 4 VECTOR. The CBOR preimage encodes struct maps in declaration order (serde + ciborium do
    // NOT sort keys, so this is deterministic but not RFC 8949 canonical form). Reordering the object
    // literal in composeEndpointPolicy silently invalidates every signature, and would otherwise
    // surface only in FD.2 against torch's real applier.
    const { policy } = composeEndpointPolicy(zoneWith([]));
    expect(Object.keys(policy)).toEqual([...FORGE_FIELD_ORDER.EndpointPolicy]);
  });

  it('carries a field order for every struct the bundle contains', () => {
    for (const name of ['SignedPolicyBundle', 'EndpointPolicy', 'ResourceBound'] as const) {
      expect(FORGE_FIELD_ORDER[name].length).toBeGreaterThan(0);
    }
  });
});

describe('Forge DTO codegen (drift gate)', () => {
  it('the committed generated file equals the emitter output', () => {
    const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const committed = readFileSync(generatedPath, 'utf8');
    expect(renderForgeDtoTypes(schema)).toBe(committed);
  });

  it('the vendored schema carries exactly the pinned contract version', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as { $id?: string };
    expect(schema.$id).toBe(FORGE_DTO_SCHEMA_ID);
  });
});

describe('FD.7c toBundleConvergence', () => {
  const member = (endpoint_cn: string, state: string, reason?: string | null) => ({
    endpoint_cn,
    state,
    ...(reason === undefined ? {} : { reason }),
  });

  it('projects the three states, carrying the rejected reason', () => {
    const view = toBundleConvergence({
      has_bundle: true,
      version: 7,
      members: [
        member('a.box', 'applied'),
        member('b.box', 'rejected', 'SignatureInvalid'),
        member('c.box', 'silent'),
      ],
    });
    expect(view).not.toBeNull();
    expect(view?.hasBundle).toBe(true);
    expect(view?.version).toBe(7);
    expect(view?.members).toEqual([
      { endpointCn: 'a.box', state: 'applied', reason: null },
      { endpointCn: 'b.box', state: 'rejected', reason: 'SignatureInvalid' },
      { endpointCn: 'c.box', state: 'silent', reason: null },
    ]);
  });

  it('is the honest empty state when no bundle is distributed', () => {
    const view = toBundleConvergence({ has_bundle: false, version: 0, members: [] });
    expect(view).toEqual({ hasBundle: false, version: 0, members: [] });
  });

  it('fails closed on an unknown state, or a mislabelled reason', () => {
    expect(
      toBundleConvergence({ has_bundle: true, version: 1, members: [member('x', 'pending')] }),
    ).toBeNull();
    expect(
      toBundleConvergence({ has_bundle: true, version: 1, members: [member('x', 'rejected')] }),
    ).toBeNull();
    expect(
      toBundleConvergence({
        has_bundle: true,
        version: 1,
        members: [member('x', 'applied', 'oops')],
      }),
    ).toBeNull();
  });
});
