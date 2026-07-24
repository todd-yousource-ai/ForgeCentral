// apps/bff/test/distribute.test.ts -- FD.2 producer orchestration (tier 1 + the signing seam).
//
// Proves the draft is composed from the record and nothing else: the version IS the zone read's
// commit version, the one authored bit crosses, the scope is exactly the operator's chosen
// endpoints, and the sidecar seam's refusal/absence both fail closed.

import { createServer } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  DistributeCompositionError,
  LEASE_WINDOW_MS,
  draftForZone,
  resolveDistribute,
} from '../src/engine/distribute.js';
import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import type { ComposedBundleRules } from '@forge/contracts';
import {
  SigningRefusedError,
  SigningUnavailableError,
  signBundle,
} from '../src/engine/sign-client.js';
import type { BundleDraft } from '../src/engine/sign-client.js';
import { vtzId } from '@forge/contracts';
import type { VtzZone } from '@forge/contracts';

function zone(overrides?: Partial<VtzZone>): VtzZone {
  return {
    id: vtzId('YouSource.Corp'),
    name: 'YouSource.Corp',
    parent: null,
    zoneType: 'standard',
    lifecycle: 'published',
    microSegmentation: true,
    telemetry: 'full',
    reauthIntervalHours: 8,
    ownPostures: [],
    effectivePostures: [{ domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false }],
    subZoneCount: 0,
    ...overrides,
  };
}

const NO_RULES: ComposedBundleRules = { rules: [], contributors: [] };

const PRINCIPAL: OperatorPrincipal = {
  principalId: 'op-1',
  tenant: 'tenant-1',
  tier: 'Admin',
} as unknown as OperatorPrincipal;

/** One composed authored rule + its contributor, as composeBundleRules produces them (P5.5). */
const CARRIED: ComposedBundleRules = {
  rules: [
    {
      policy_id: '11111111-1111-1111-1111-111111111111',
      policy_version: '1.0.0',
      source_kind: 'agent',
      source_selector_kind: 'exact',
      source_selector_value: 'demo-agent',
      destination_kind: 'network',
      destination_selector_kind: 'cidr',
      destination_selector_value: '10.8.0.0/16',
      action: 'quarantine',
      protocols: ['https'],
      ports: '443',
      logging: 'full',
    },
  ],
  contributors: [
    { policy: '11111111-1111-1111-1111-111111111111', version: { major: 1, minor: 0, patch: 0 } },
  ],
};

describe('draftForZone (FD.2 + P5.5)', () => {
  it('derives the version from the zone read and stamps the lease window', () => {
    const { draft } = draftForZone(zone(), 42, ['box-1.crucible'], NO_RULES, 1_000_000);
    expect(draft.version).toBe(42);
    expect(draft.lease).toEqual({ issued_at: 1_000_000, not_after: 1_000_000 + LEASE_WINDOW_MS });
    expect(draft.contributors).toEqual([]);
    // A zone with nothing published carries no rules (the bundle signs the unchanged v1 preimage).
    expect(draft.rules).toEqual([]);
  });

  it('carries the composed authored rules + contributors verbatim (P5.5)', () => {
    const { draft } = draftForZone(zone(), 9, ['box-1.crucible'], CARRIED, 0);
    expect(draft.rules).toEqual(CARRIED.rules);
    expect(draft.contributors).toEqual(CARRIED.contributors);
  });

  it('carries the one authored bit and the operator-chosen scope, nothing invented', () => {
    const { draft, record } = draftForZone(
      zone(),
      7,
      ['box-1.crucible', 'box-2.crucible'],
      NO_RULES,
      0,
    );
    expect(draft.policy.allow_ordinary_internet).toBe(true);
    expect(draft.policy.exec).toBe('DenyUnwrappedExec');
    expect(draft.scope.vtz).toBe('YouSource.Corp');
    expect(draft.scope.members).toEqual([
      { endpoint: { cn: 'box-1.crucible', sans: ['box-1.crucible'] }, agent: null },
      { endpoint: { cn: 'box-2.crucible', sans: ['box-2.crucible'] }, agent: null },
    ]);
    // The composition record travels with the draft so the response can surface the gap.
    expect(record.unexpressedDomains.length).toBe(9);
    expect(record.unexpressedFields).toContain('telemetry');
  });
});

async function withServer(
  reply: (line: string) => string,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline >= 0) socket.write(`${reply(buffer.slice(0, newline))}\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  try {
    await run(address.port);
  } finally {
    server.close();
  }
}

describe('signBundle (the sidecar seam)', () => {
  const draft = (): BundleDraft => draftForZone(zone(), 1, ['box-1.crucible'], NO_RULES, 0).draft;

  it('returns the typed bundle AND the canonical cbor bytes, echoing the draft verbatim', async () => {
    await withServer(
      (line) => {
        const parsed = JSON.parse(line) as BundleDraft;
        return JSON.stringify({
          signed: {
            bundle: {
              ...parsed,
              signing_key_id: 'k1',
              signature_algorithm: 'MlDsa87',
              signature: [1, 2, 3],
            },
            cbor: [0xa1, 0x01, 0x02],
          },
        });
      },
      async (port) => {
        const signed = await signBundle('127.0.0.1', port, draft(), 2000);
        expect(signed.bundle.version).toBe(1);
        expect(signed.bundle.signing_key_id).toBe('k1');
        expect(signed.bundle.signature).toEqual([1, 2, 3]);
        // The canonical bytes are surfaced verbatim (what the producer commits, never a re-encode).
        expect(signed.cbor).toEqual([0xa1, 0x01, 0x02]);
      },
    );
  });

  it('a signed response missing the canonical cbor bytes fails closed', async () => {
    await withServer(
      (line) => {
        const parsed = JSON.parse(line) as BundleDraft;
        // No `cbor` field: the producer must never fall back to re-encoding the lossy JSON bundle.
        return JSON.stringify({ signed: { bundle: { ...parsed, signature: [1] } } });
      },
      async (port) => {
        await expect(signBundle('127.0.0.1', port, draft(), 2000)).rejects.toBeInstanceOf(
          SigningUnavailableError,
        );
      },
    );
  });

  it('a refusal is typed and never yields a bundle', async () => {
    await withServer(
      () => JSON.stringify({ refused: { reason: 'malformed sign request' } }),
      async (port) => {
        await expect(signBundle('127.0.0.1', port, draft(), 2000)).rejects.toBeInstanceOf(
          SigningRefusedError,
        );
      },
    );
  });

  it('an unreachable signer fails closed as unavailable', async () => {
    // Port 1 on loopback: nothing listens; the connection is refused immediately.
    await expect(signBundle('127.0.0.1', 1, draft(), 2000)).rejects.toBeInstanceOf(
      SigningUnavailableError,
    );
  });
});

describe('resolveDistribute composes the authored rules from POLICY_EFFECTIVE (P5.5)', () => {
  const wireRecord = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: '11111111-1111-1111-1111-111111111111',
    vtz: 'YouSource.Corp',
    name: 'contain-egress',
    version: '1.0.0',
    lifecycle: 'published',
    description: '',
    rules: [
      {
        source_kind: 'agent',
        source_selector_kind: 'exact',
        source_selector_value: 'demo-agent',
        destination_kind: 'network',
        destination_selector_kind: 'cidr',
        destination_selector_value: '10.8.0.0/16',
        action: 'quarantine',
      },
    ],
    protocols: ['https'],
    ports: '443',
    logging: 'full',
    max_classification: 'confidential',
    ...over,
  });

  function engineWith(effective: unknown): {
    engine: OperatorEngine;
    committed: number[][];
  } {
    const committed: number[][] = [];
    return {
      committed,
      engine: {
        vtzDetail: () =>
          Promise.resolve({
            zone: {
              id: 'YouSource.Corp',
              name: 'YouSource.Corp',
              parent: null,
              zone_type: 'standard',
              lifecycle: 'published',
              micro_segmentation: true,
              telemetry: 'full',
              reauth_interval_hours: 8,
              own_postures: [],
              effective_postures: [],
              sub_zone_count: 0,
            },
            ancestors: [],
            commit_version: 42,
          }),
        policyEffective: () => Promise.resolve(effective),
        bundleCommit: (_p: unknown, req: { bundle: number[] }) => {
          committed.push(req.bundle);
          return Promise.resolve({ version: 42, commit_version: 42 });
        },
      } as unknown as OperatorEngine,
    };
  }

  it('signs a draft carrying the composed rules + contributors and reports the carriage', async () => {
    const { engine, committed } = engineWith({ policies: [wireRecord()] });
    let signedDraft: BundleDraft | null = null;
    const canonicalBytes = [0xa2, 0x11, 0x22, 0x33];
    await withServer(
      (line) => {
        signedDraft = JSON.parse(line) as BundleDraft;
        return JSON.stringify({
          signed: {
            bundle: {
              ...signedDraft,
              signing_key_id: 'k1',
              signature_algorithm: 'MlDsa87',
              signature: [1],
            },
            // The sidecar's canonical ciborium bytes; the producer forwards THESE to the carrier.
            cbor: canonicalBytes,
          },
        });
      },
      async (port) => {
        const result = await resolveDistribute(
          engine,
          { host: '127.0.0.1', port, timeoutMs: 2000 },
          PRINCIPAL,
          { zoneId: 'YouSource.Corp', members: ['box-1.crucible'] },
        );
        expect(result.carriedRules).toBe(1);
        expect(result.carriedPolicies).toBe(1);
        // The carrier received the sidecar's canonical bytes VERBATIM, not a re-encode of the JSON.
        expect(committed).toEqual([canonicalBytes]);
      },
    );
    // The draft the SIDECAR signed carries the authored rule (the signature binds it, v2 domain).
    expect(signedDraft).not.toBeNull();
    const draft = signedDraft as unknown as BundleDraft;
    expect(draft.rules).toHaveLength(1);
    expect(draft.rules[0]?.action).toBe('quarantine');
    expect(draft.contributors).toEqual([
      {
        policy: '11111111-1111-1111-1111-111111111111',
        version: { major: 1, minor: 0, patch: 0 },
      },
    ]);
    expect(committed).toHaveLength(1);
  });

  it('fails the WHOLE distribute closed when an effective record cannot be narrowed', async () => {
    const { engine, committed } = engineWith({ policies: [wireRecord({ logging: 'verbose' })] });
    await expect(
      resolveDistribute(engine, { host: '127.0.0.1', port: 1, timeoutMs: 200 }, PRINCIPAL, {
        zoneId: 'YouSource.Corp',
        members: ['box-1.crucible'],
      }),
    ).rejects.toBeInstanceOf(DistributeCompositionError);
    // Nothing reached the signer or the carrier.
    expect(committed).toHaveLength(0);
  });
});
