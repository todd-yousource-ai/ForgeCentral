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
import { resolveGroupsList, resolveUsersList, UsersUnavailableError } from '../src/engine/users.js';

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
};

function engineWith(parts: {
  principals?: WirePrincipalList;
  agents?: WireAgentList;
  groups?: WireGroupList;
}): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: () => Promise.resolve(parts.agents ?? { agents: [] }),
    listPrincipals: () => Promise.resolve(parts.principals ?? { principals: [] }),
    listGroups: () => Promise.resolve(parts.groups ?? { groups: [] }),
    entityDecisions: unused,
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
