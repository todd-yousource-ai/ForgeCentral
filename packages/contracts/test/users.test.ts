// packages/contracts/test/users.test.ts -- IP-CONSOLE-04 UY.1 tier-1 tests for the Users contract.
//
// Proves the UY.1 slice of INV-CONSOLE-USERS-REAL: every Users view model is a projection of the
// live crdb wire DTOs (a drifted engine field is a compile error in these fixtures), the enum
// narrowings are CLOSED (an unknown engine tag collapses the projection rather than rendering a
// guessed identity), NO trust field exists anywhere in the contract, and the honest-empty rules
// hold (an observed account's enterprise fields are empty, the IDAM shells carry no fabricated
// sync).

import { describe, expect, it } from 'vitest';

import {
  IDAM_CONNECTOR_SHELLS,
  toAgentPrincipalRow,
  toGroupCards,
  toPrincipalRow,
  toPrincipalRows,
  toProvisionReceipt,
  toWirePrincipalSpec,
} from '../src/index.js';
import type { PrincipalDraft, WireGroupList, WirePrincipalRecord } from '../src/index.js';

/** An observed device account, exactly as the ER.6 read emits it. */
const observed = (overrides: Partial<WirePrincipalRecord> = {}): WirePrincipalRecord => ({
  principal_id: 'lug:local_account:posix_host%3Am1:uid:1000',
  username: 'todd',
  namespace: 'lug:identity_namespace:posix_host%3Am1',
  account_type: 'human',
  enabled: true,
  status: 'active',
  origin: 'observed',
  email: '',
  org: '',
  groups: ['sudo'],
  privileges: ['sudo_all'],
  first_seen: 100,
  ...overrides,
});

/** An operator-provisioned enterprise record (E3), exactly as the read emits it. */
const local = (overrides: Partial<WirePrincipalRecord> = {}): WirePrincipalRecord => ({
  principal_id: 'lug:identity_subject:enterprise%3Asarah',
  username: 'sarah',
  namespace: 'enterprise',
  account_type: 'human',
  enabled: true,
  status: 'active',
  origin: 'local',
  email: 'sarah@yousource.test',
  org: 'YouSource Healthcare',
  groups: ['Engineering'],
  subject_id: 'enterprise:sarah',
  privileges: [],
  first_seen: 200,
  ...overrides,
});

describe('principal rows project both engine families through one shape', () => {
  it('projects an observed account with honest-empty enterprise fields', () => {
    const row = toPrincipalRow(observed());
    expect(row).not.toBeNull();
    expect(row?.origin).toBe('observed');
    expect(row?.kind).toBe('human');
    expect(row?.status).toBe('active');
    expect(row?.email).toBe('');
    expect(row?.org).toBe('');
    expect(row?.groups).toEqual(['sudo']);
    expect(row?.privileges).toEqual(['sudo_all']);
    expect(row?.subjectId).toBeNull();
  });

  it('projects a provisioned local record with its enterprise fields + subject', () => {
    const row = toPrincipalRow(local());
    expect(row?.origin).toBe('local');
    expect(row?.email).toBe('sarah@yousource.test');
    expect(row?.org).toBe('YouSource Healthcare');
    expect(row?.subjectId).toBe('enterprise:sarah');
    expect(row?.groups).toEqual(['Engineering']);
  });

  it('carries NO trust field on any row (the amendment is structural)', () => {
    const row = toPrincipalRow(local());
    const keys = Object.keys(row ?? {});
    for (const key of keys) {
      expect(key.toLowerCase()).not.toContain('trust');
      expect(key.toLowerCase()).not.toContain('override');
      expect(key.toLowerCase()).not.toContain('score');
    }
  });
});

describe('enum narrowing is closed (fail-closed on an unknown engine tag)', () => {
  it('refuses an unknown kind, status, or origin rather than guessing', () => {
    expect(toPrincipalRow(observed({ account_type: 'robot' }))).toBeNull();
    expect(toPrincipalRow(observed({ status: 'banished' }))).toBeNull();
    expect(toPrincipalRow(observed({ origin: 'imported' }))).toBeNull();
  });

  it('one malformed record collapses the whole directory, not just its row', () => {
    const rows = toPrincipalRows({
      principals: [observed(), local({ account_type: 'robot' })],
    });
    expect(rows).toBeNull();
  });

  it('an empty tenant projects an honest empty directory, never a fabricated row', () => {
    expect(toPrincipalRows({ principals: [] })).toEqual([]);
  });
});

describe('group cards + provisioning shapes', () => {
  it('projects observed and enterprise groups through one card shape', () => {
    const list: WireGroupList = {
      groups: [
        {
          group_id: 'lug:local_group:posix_host%3Am1:gid:27',
          name: 'sudo',
          namespace: 'lug:identity_namespace:posix_host%3Am1',
          built_in: true,
          member_count: 1,
          description: '',
        },
        {
          group_id: 'lug:local_group:enterprise%3AEngineering',
          name: 'Engineering',
          namespace: 'enterprise',
          built_in: false,
          member_count: 3,
          description: 'Software team',
        },
      ],
    };
    const cards = toGroupCards(list);
    expect(cards).toHaveLength(2);
    expect(cards[0]?.builtIn).toBe(true);
    expect(cards[0]?.description).toBe('');
    expect(cards[1]?.description).toBe('Software team');
    expect(cards[1]?.memberCount).toBe(3);
  });

  it('a draft round-trips to the wire spec with absent optionals OMITTED (byte discipline)', () => {
    const draft: PrincipalDraft = { username: 'sarah', kind: 'human', email: null, org: null };
    const spec = toWirePrincipalSpec(draft);
    expect(spec).toEqual({ username: 'sarah', subject_type: 'human' });
    expect('email' in spec).toBe(false);
    expect('org' in spec).toBe(false);
  });

  it('a provisioning receipt carries the audited commit version', () => {
    expect(toProvisionReceipt({ commit_version: 9 })).toEqual({ commitVersion: 9 });
  });
});

describe('the AI-Agent cross-bind (LIST_AGENTS, ER.1)', () => {
  it('projects an agent record as an agent-kind row with honest empties', () => {
    const row = toAgentPrincipalRow({
      agent_id: 'aig:agent:demo-agent',
      status: 'active',
      enrolled_at: 300,
      attributes: [['role', 'operator']],
    });
    expect(row?.kind).toBe('agent');
    expect(row?.status).toBe('active');
    expect(row?.origin).toBe('observed');
    expect(row?.namespace).toBe('aig');
    expect(row?.email).toBe('');
    expect(row?.groups).toEqual([]);
    expect(row?.firstSeen).toBe(300);
  });

  it('carries the AIG compromised lifecycle and refuses an unknown one', () => {
    expect(
      toAgentPrincipalRow({
        agent_id: 'aig:agent:x',
        status: 'compromised',
        enrolled_at: 1,
        attributes: [],
      })?.status,
    ).toBe('compromised');
    expect(
      toAgentPrincipalRow({
        agent_id: 'aig:agent:x',
        status: 'haunted',
        enrolled_at: 1,
        attributes: [],
      }),
    ).toBeNull();
  });
});

describe('the IDAM shells are honest', () => {
  it('every shell is not-connected with no fabricated sync timestamp', () => {
    expect(IDAM_CONNECTOR_SHELLS).toHaveLength(3);
    for (const shell of IDAM_CONNECTOR_SHELLS) {
      expect(shell.state).toBe('not-connected');
      expect(shell.lastSyncAt).toBeNull();
    }
  });
});
