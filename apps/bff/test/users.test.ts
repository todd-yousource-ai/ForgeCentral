// apps/bff/test/users.test.ts -- IP-CONSOLE-04 UY.2 tier-2 tests for the Users-surface resolvers.
//
// Proves the UY.2 slice of INV-CONSOLE-USERS-REAL: `users.list` merges the LUG principal directory
// with the AIG agent cross-bind (every actor the engine authorizes, sorted stably), `groups.list`
// projects the group directory, and an engine record the contract cannot narrow collapses the WHOLE
// read to `UsersUnavailableError` (never a silently-shorter directory).

import { describe, expect, it } from 'vitest';
import type {
  WireAgentList,
  WireGroupList,
  WirePrincipalList,
  WirePrincipalRecord,
} from '@forge/contracts';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import {
  resolveCreateGroup,
  resolveCreatePrincipal,
  resolveGroupsList,
  resolveSetGroupMembers,
  resolveSetPrincipalStatus,
  resolveUsersList,
  UsersUnavailableError,
} from '../src/engine/users.js';
import { resolveEntityDetail } from '../src/engine/entity-detail.js';

const PRINCIPAL: OperatorPrincipal = {
  principalId: 'op-1',
  tenant: 'tenant-1',
  tier: 'Admin',
} as unknown as OperatorPrincipal;

const human: WirePrincipalRecord = {
  principal_id: 'lug:local_account:ns:uid:1000',
  username: 'todd',
  namespace: 'ns',
  account_type: 'human',
  enabled: true,
  status: 'active',
  origin: 'observed',
  email: '',
  org: '',
  groups: ['sudo'],
  privileges: ['sudo_all'],
  first_seen: 100,
  owned_fields: [],
};

function engineWith(parts: {
  principals?: WirePrincipalList;
  agents?: WireAgentList;
  groups?: WireGroupList;
}): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    querySubmit: () => Promise.resolve({ rows: [], cursor: null, redacted_fields: [] }),
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: () => Promise.resolve(parts.agents ?? { agents: [] }),
    groupCreate: (_p: OperatorPrincipal, req: { name: string }) =>
      req.name === 'Engineering'
        ? Promise.reject(new Error('duplicate'))
        : Promise.resolve({ commit_version: 7 }),
    listPrincipals: () => Promise.resolve(parts.principals ?? { principals: [] }),
    listGroups: () => Promise.resolve(parts.groups ?? { groups: [] }),
    groupEdit: unused,
    groupSetMembers: (_p: OperatorPrincipal, req: { name: string; members: string[] }) =>
      Promise.resolve({ commit_version: req.members.length === 0 ? 0 : 5 }),
    principalCreate: (_p: OperatorPrincipal, req: { spec: { username: string } }) =>
      req.spec.username === 'sarah'
        ? Promise.reject(new Error('duplicate'))
        : Promise.resolve({ commit_version: 3 }),
    principalEdit: unused,
    principalSetStatus: (_p: OperatorPrincipal, req: { status: string }) =>
      Promise.resolve({ commit_version: req.status === 'revoked' ? 9 : 4 }),
    entityDecisions: () => Promise.resolve({ decisions: [] }),
    entityConnections: unused,
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    usageOverview: unused,
    vtzTree: unused,
    vtzDetail: unused,
    bundleConvergence: unused,
    distributeBundle: unused,
    vtzCreate: unused,
    vtzEdit: unused,
    vtzRescope: unused,
    vtzDelete: unused,
  } as unknown as OperatorEngine;
}

describe('resolveUsersList (the All Users merge)', () => {
  it('merges LUG principals with the AIG agent cross-bind, sorted by username', () => {
    const engine = engineWith({
      principals: { principals: [human] },
      agents: {
        agents: [
          { agent_id: 'aig:agent:demo', status: 'active', enrolled_at: 300, attributes: [] },
        ],
      },
    });
    return resolveUsersList(engine, PRINCIPAL).then((rows) => {
      expect(rows).toHaveLength(2);
      expect(rows[0]?.username).toBe('aig:agent:demo');
      expect(rows[0]?.kind).toBe('agent');
      expect(rows[1]?.username).toBe('todd');
      expect(rows[1]?.kind).toBe('human');
    });
  });

  it('collapses the whole read when a principal carries an unknown tag (never a shorter list)', () => {
    const engine = engineWith({
      principals: { principals: [human, { ...human, principal_id: 'x', status: 'banished' }] },
    });
    return expect(resolveUsersList(engine, PRINCIPAL)).rejects.toBeInstanceOf(
      UsersUnavailableError,
    );
  });

  it('collapses the whole read when an agent carries an unknown lifecycle', () => {
    const engine = engineWith({
      agents: {
        agents: [{ agent_id: 'aig:agent:x', status: 'haunted', enrolled_at: 1, attributes: [] }],
      },
    });
    return expect(resolveUsersList(engine, PRINCIPAL)).rejects.toBeInstanceOf(
      UsersUnavailableError,
    );
  });

  it('an empty tenant resolves an honest empty directory', () => {
    return resolveUsersList(engineWith({}), PRINCIPAL).then((rows) => {
      expect(rows).toEqual([]);
    });
  });
});

describe('the drawer resolves a LUG principal (UY.5)', () => {
  it('builds header + info from the principal directory when the ref is not an agent', () => {
    const engine = engineWith({ principals: { principals: [human] } });
    return resolveEntityDetail(engine, PRINCIPAL, {
      kind: 'principal',
      id: human.principal_id,
    } as Parameters<typeof resolveEntityDetail>[2]).then((view) => {
      expect(view.header.status).toBe('ok');
      if (view.header.status === 'ok') {
        expect(view.header.data.displayName).toBe('todd');
        expect(view.header.data.kindLabel).toBe('Human');
        expect(view.header.data.status).toBe('active');
      }
      expect(view.info.status).toBe('ok');
      if (view.info.status === 'ok') {
        expect(view.info.data.tags).toContain('origin=observed');
        expect(view.info.data.tags).toContain('group=sudo');
        expect(view.info.data.tags).toContain('privilege=sudo_all');
        // No trust-era field sneaks in through the tags.
        for (const tag of view.info.data.tags) {
          expect(tag.toLowerCase()).not.toContain('trust');
          expect(tag.toLowerCase()).not.toContain('score');
        }
      }
      // Capabilities apply to agents only; a LUG principal is not-applicable, never fabricated.
      expect(view.capabilities.status).toBe('not-applicable');
    });
  });

  it('an id in neither directory renders honest empty sections', () => {
    return resolveEntityDetail(engineWith({}), PRINCIPAL, {
      kind: 'principal',
      id: 'lug:local_account:ns:uid:9999',
    } as Parameters<typeof resolveEntityDetail>[2]).then((view) => {
      expect(view.header.status).toBe('empty');
      expect(view.info.status).toBe('empty');
    });
  });
});

describe('resolveCreateGroup (groups.create, audited)', () => {
  it('returns the audited commit receipt on success', () => {
    return resolveCreateGroup(engineWith({}), PRINCIPAL, 'Finance', 'Money team').then(
      (receipt) => {
        expect(receipt).toEqual({ commitVersion: 7 });
      },
    );
  });

  it('propagates an engine refusal untouched (the route maps Conflict to 409)', () => {
    return expect(resolveCreateGroup(engineWith({}), PRINCIPAL, 'Engineering', '')).rejects.toThrow(
      'duplicate',
    );
  });
});

describe('the UY.6 command resolvers', () => {
  it('users.create returns the audited receipt; a duplicate propagates the refusal', () => {
    const draft = { username: 'linda', kind: 'human' as const, email: null, org: null };
    return resolveCreatePrincipal(engineWith({}), PRINCIPAL, draft).then((r) => {
      expect(r).toEqual({ commitVersion: 3 });
      return expect(
        resolveCreatePrincipal(engineWith({}), PRINCIPAL, { ...draft, username: 'sarah' }),
      ).rejects.toThrow('duplicate');
    });
  });

  it('users.setStatus commits the lifecycle transition', () => {
    return resolveSetPrincipalStatus(engineWith({}), PRINCIPAL, 'linda', 'revoked').then((r) => {
      expect(r).toEqual({ commitVersion: 9 });
    });
  });

  it('groups.setMembers reports the no-change replay honestly (commit 0)', () => {
    return resolveSetGroupMembers(engineWith({}), PRINCIPAL, 'Engineering', []).then((r) => {
      expect(r).toEqual({ commitVersion: 0 });
    });
  });
});

describe('resolveGroupsList (the Groups tab)', () => {
  it('projects observed and enterprise groups through one card shape', () => {
    const engine = engineWith({
      groups: {
        groups: [
          {
            group_id: 'lug:local_group:enterprise%3AEngineering',
            name: 'Engineering',
            namespace: 'enterprise',
            built_in: false,
            member_count: 3,
            description: 'Software team',
          },
        ],
      },
    });
    return resolveGroupsList(engine, PRINCIPAL).then((cards) => {
      expect(cards).toHaveLength(1);
      expect(cards[0]?.name).toBe('Engineering');
      expect(cards[0]?.memberCount).toBe(3);
      expect(cards[0]?.description).toBe('Software team');
    });
  });
});
