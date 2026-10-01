// packages/contracts/test/model-access.test.ts -- IP-FRONTIER-GATEWAY GW.10 the model-access narrowers.

import { describe, expect, it } from 'vitest';

import type { WireAgentGrant, WireModelAccess } from '../src/generated/wire-dto.js';
import {
  epochDayDate,
  formatMicroUsd,
  formatPerMillion,
  parseAgentDoorSession,
  toAgentGrantChange,
  toAgentGrantOutcome,
  toModelAccessView,
  toggleEntry,
} from '../src/model-access.js';

const grant = (agent: string, models: string[], cls = 'internal'): WireAgentGrant => ({
  agent,
  models,
  tools: ['crucible/*'],
  read_scopes: ['leg'],
  workspaces: [],
  class: cls,
});

const spendRow = (session: string, calls: number, cost: number) => ({
  principal: 'p-1',
  session,
  model: 'claude-opus-5-5',
  calls,
  uncached_input: 10,
  cache_read: 100,
  cache_write: 5,
  reasoning: 0,
  output: 20,
  cost_micro_usd: cost,
});

const wire = (over: Partial<WireModelAccess> = {}): WireModelAccess => ({
  admin_plane: true,
  catalog_configured: true,
  catalog_version: 1,
  models: [
    {
      id: 'gpt-6-luna',
      version: 'rolling',
      vendor_model: 'gpt-6-luna',
      destination: 'openai',
      surface: 'openai-responses',
      pin: 'rolling',
      lifecycle: 'active',
      ceiling: 'internal',
      region: 'us',
      context_window: 1_050_000,
      max_output_tokens: 128_000,
      price_uncached_input: 100_000,
      price_cache_read: 10_000,
      price_cache_write: 0,
      price_output: 500_000,
      zdr_eligible: true,
      retention_days: 30,
    },
  ],
  roles: [{ role: 'soc.researcher', model: 'gpt-6-luna', version: 'rolling' }],
  grants: [grant('codex', ['gpt-6-luna'])],
  grants_truncated: false,
  spend: [
    spendRow('agent-door:claude-code:d20362', 2, 300),
    spendRow('agent-door:claude-code:d20362', 1, 200),
    spendRow('agent-door:claude-code:d20361', 1, 50),
    spendRow('soc-run-ep-1', 4, 900),
  ],
  spend_truncated: false,
  refused: false,
  ...over,
});

describe('toModelAccessView', () => {
  it('groups agent-door spend per agent per day and lists every agent with a grant or spend', () => {
    const view = toModelAccessView(wire());

    expect(view?.agents.map((a) => a.agent)).toEqual(['claude-code', 'codex']);
    const claude = view?.agents[0];
    expect(claude?.grant).toBeNull();
    expect(claude?.spend.map((d) => [d.date, d.calls, d.costMicroUsd])).toEqual([
      [epochDayDate(20362), 3, 500],
      [epochDayDate(20361), 1, 50],
    ]);
    expect(view?.agents[1]?.grant?.models).toEqual(['gpt-6-luna']);
    expect(view?.otherSpend).toEqual([
      {
        session: 'soc-run-ep-1',
        principal: 'p-1',
        model: 'claude-opus-5-5',
        calls: 4,
        costMicroUsd: 900,
      },
    ]);
    expect(view?.models[0]?.prices.output).toBe(500_000);
    expect(view?.roles[0]?.role).toBe('soc.researcher');
  });

  it('fails closed on the engine refusal and on an unknown classification tag', () => {
    expect(toModelAccessView(wire({ refused: true }))).toBeNull();
    expect(toModelAccessView(wire({ grants: [grant('codex', [], 'topsecret')] }))).toBeNull();
  });
});

describe('the grant change', () => {
  it('validates the body and refuses anything malformed', () => {
    const good = {
      agent: 'codex',
      models: ['gpt-6-luna'],
      tools: [],
      expectedModels: [],
      expectedTools: [],
    };
    expect(toAgentGrantChange(good)).toEqual(good);
    expect(toAgentGrantChange({ ...good, agent: ' ' })).toBeNull();
    expect(toAgentGrantChange({ ...good, models: ['ok', 7] })).toBeNull();
    expect(toAgentGrantChange({ ...good, expectedTools: undefined })).toBeNull();
    expect(toAgentGrantChange('codex')).toBeNull();
  });

  it('toggles one entry and keeps the list sorted', () => {
    expect(toggleEntry(['b', 'd'], 'c')).toEqual(['b', 'c', 'd']);
    expect(toggleEntry(['b', 'c', 'd'], 'c')).toEqual(['b', 'd']);
  });

  it('reads an applied change, a conflict with what is stored now, and a refusal', () => {
    const applied = toAgentGrantOutcome({
      conflict: false,
      refused: false,
      grant: grant('codex', ['a']),
    });
    const conflict = toAgentGrantOutcome({
      conflict: true,
      refused: false,
      current: grant('codex', ['b']),
    });

    expect(applied).toMatchObject({ kind: 'applied', grant: { models: ['a'] } });
    expect(conflict).toMatchObject({ kind: 'conflict', current: { models: ['b'] } });
    expect(toAgentGrantOutcome({ conflict: false, refused: true })).toBeNull();
  });
});

describe('formatting', () => {
  it('reads an agent-door session and formats prices and costs', () => {
    expect(parseAgentDoorSession('agent-door:claude-code:d20362')).toEqual({
      agent: 'claude-code',
      day: 20362,
    });
    expect(parseAgentDoorSession('cognition-0193')).toBeNull();
    expect(epochDayDate(20362)).toBe('2025-10-01');
    expect(formatPerMillion(500_000)).toBe('$0.50/M');
    expect(formatPerMillion(5_000)).toBe('$0.0050/M');
    expect(formatMicroUsd(185)).toBe('$0.0002');
  });
});
