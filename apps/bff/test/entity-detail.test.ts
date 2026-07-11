// apps/bff/test/entity-detail.test.ts -- IP-CONSOLE-12 DR.3 the live drawer-detail resolver.

import type {
  EntityRef,
  WireAgentList,
  WireConnectionList,
  WireDecisionList,
} from '@forge/contracts';
import { principalId } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import { resolveEntityDetail } from '../src/engine/entity-detail.js';
import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';

const principal: OperatorPrincipal = {
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
};

/** A mock OperatorEngine returning scripted read results; the reads not exercised here reject. */
function engineWith(parts: {
  agents?: WireAgentList;
  decisions?: WireDecisionList;
  failDirectory?: boolean;
}): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: () =>
      parts.failDirectory
        ? Promise.reject(new Error('engine down'))
        : Promise.resolve(parts.agents ?? { agents: [] }),
    entityDecisions: () => Promise.resolve(parts.decisions ?? { decisions: [] }),
    entityConnections: (): Promise<WireConnectionList> => Promise.resolve({ connections: [] }),
  };
}

const ref: EntityRef = { kind: 'principal', id: principalId('aig:agent:a') };

describe('resolveEntityDetail', () => {
  it('projects the matching agent record into the header + info, and decisions newest-first', async () => {
    const engine = engineWith({
      agents: {
        agents: [
          {
            agent_id: 'aig:agent:a',
            status: 'active',
            enrolled_at: 1_720_600_000,
            attributes: [
              ['role', 'operator'],
              ['clearance', 'secret'],
              ['runtime', 'python'],
            ],
          },
        ],
      },
      decisions: {
        decisions: [
          {
            decision_id: 'sha512:d1',
            rule_id: 'LR-DB-002',
            finding: 'External DB Access',
            tactics: ['TA0002'],
            recommended_action: 'deny',
            created_at: 1_720_600_000,
          },
        ],
      },
    });

    const detail = await resolveEntityDetail(engine, principal, ref);

    expect(detail.header).toEqual({
      status: 'ok',
      data: { displayName: 'aig:agent:a', kindLabel: 'Agent', status: 'active' },
    });
    expect(detail.info).toEqual({
      status: 'ok',
      data: {
        role: 'operator',
        clearance: 'secret',
        enrolledAt: 1_720_600_000,
        tags: ['runtime=python'],
      },
    });
    // The decision projects newest (created_at seconds -> millis) with a semantic status from its action.
    expect(detail.recentDecisions.status).toBe('ok');
    if (detail.recentDecisions.status === 'ok') {
      const row = detail.recentDecisions.data.decisions[0];
      expect(row?.summary).toBe('External DB Access');
      expect(row?.status).toBe('denied');
      expect(row?.at).toBe(1_720_600_000_000);
    }
    // The cross-repo sections are honest pending, never fabricated.
    expect(detail.zones.status).toBe('pending');
    expect(detail.capabilities.status).toBe('pending');
    expect(detail.effectivePolicies.status).toBe('pending');
  });

  it('is empty when the entity is not in the directory, and for no decisions', async () => {
    const detail = await resolveEntityDetail(engineWith({}), principal, ref);
    expect(detail.header.status).toBe('empty');
    expect(detail.info.status).toBe('empty');
    expect(detail.recentDecisions.status).toBe('empty');
  });

  it('degrades the directory-backed sections to error when LIST_AGENTS fails, not the drawer', async () => {
    const detail = await resolveEntityDetail(engineWith({ failDirectory: true }), principal, ref);
    expect(detail.header.status).toBe('error');
    expect(detail.info.status).toBe('error');
    // The other sections still resolve (tolerant fan-out).
    expect(detail.recentDecisions.status).toBe('empty');
    expect(detail.capabilities.status).toBe('pending');
  });
});
