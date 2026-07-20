// apps/bff/test/distribute.test.ts -- FD.2 producer orchestration (tier 1 + the signing seam).
//
// Proves the draft is composed from the record and nothing else: the version IS the zone read's
// commit version, the one authored bit crosses, the scope is exactly the operator's chosen
// endpoints, and the sidecar seam's refusal/absence both fail closed.

import { createServer } from 'node:net';

import { describe, expect, it } from 'vitest';

import { LEASE_WINDOW_MS, draftForZone } from '../src/engine/distribute.js';
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

describe('draftForZone (FD.2)', () => {
  it('derives the version from the zone read and stamps the lease window', () => {
    const { draft } = draftForZone(zone(), 42, ['box-1.crucible'], 1_000_000);
    expect(draft.version).toBe(42);
    expect(draft.lease).toEqual({ issued_at: 1_000_000, not_after: 1_000_000 + LEASE_WINDOW_MS });
    expect(draft.contributors).toEqual([]);
  });

  it('carries the one authored bit and the operator-chosen scope, nothing invented', () => {
    const { draft, record } = draftForZone(zone(), 7, ['box-1.crucible', 'box-2.crucible'], 0);
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

describe('signBundle (the sidecar seam)', () => {
  const draft = (): BundleDraft => draftForZone(zone(), 1, ['box-1.crucible'], 0).draft;

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

  it('returns the signed bundle and echoes the draft to the signer verbatim', async () => {
    await withServer(
      (line) => {
        const parsed = JSON.parse(line) as BundleDraft;
        return JSON.stringify({
          signed: {
            ...parsed,
            signing_key_id: 'k1',
            signature_algorithm: 'MlDsa87',
            signature: [1, 2, 3],
          },
        });
      },
      async (port) => {
        const signed = await signBundle('127.0.0.1', port, draft(), 2000);
        expect(signed.version).toBe(1);
        expect(signed.signing_key_id).toBe('k1');
        expect(signed.signature).toEqual([1, 2, 3]);
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
