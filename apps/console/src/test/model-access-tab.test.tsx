// apps/console/src/test/model-access-tab.test.tsx -- IP-FRONTIER-GATEWAY GW.10 the Settings Model access tab.

import type { AgentGrantOutcome, ModelAccessView } from '@forge/contracts';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsSurface } from '../surfaces/SettingsSurface.js';
import { renderWithProviders } from './render.js';

const grant = (models: string[]) => ({
  models,
  tools: [],
  readScopes: ['leg'],
  workspaces: [],
  classification: 'internal' as const,
});

const VIEW: ModelAccessView = {
  adminPlane: true,
  catalogConfigured: true,
  catalogVersion: 1,
  models: [
    {
      id: 'gpt-6-luna',
      version: 'rolling',
      vendorModel: 'gpt-6-luna',
      destination: 'openai',
      surface: 'openai-responses',
      pin: 'rolling',
      lifecycle: 'active',
      ceiling: 'internal',
      region: 'us',
      contextWindow: 1_050_000,
      maxOutputTokens: 128_000,
      prices: { uncachedInput: 100_000, cacheRead: 10_000, cacheWrite: 0, output: 500_000 },
      zdrEligible: true,
      retentionDays: 30,
    },
    {
      id: 'claude-opus-5-5',
      version: '2026-09-01',
      vendorModel: 'claude-opus-5-5',
      destination: 'anthropic',
      surface: 'anthropic-messages',
      pin: 'pinned',
      lifecycle: 'active',
      ceiling: 'confidential',
      region: 'us',
      contextWindow: 1_000_000,
      maxOutputTokens: 64_000,
      prices: {
        uncachedInput: 5_000_000,
        cacheRead: 500_000,
        cacheWrite: 6_250_000,
        output: 25_000_000,
      },
      zdrEligible: true,
      retentionDays: 0,
    },
  ],
  roles: [{ role: 'soc.researcher', model: 'gpt-6-luna', version: 'rolling' }],
  agents: [
    {
      agent: 'codex',
      grant: grant(['gpt-6-luna']),
      spend: [
        {
          day: 20362,
          date: '2025-10-01',
          calls: 3,
          costMicroUsd: 555,
          inputTokens: 10,
          cacheReadTokens: 100,
          outputTokens: 20,
        },
      ],
    },
  ],
  otherSpend: [],
  grantsTruncated: false,
  spendTruncated: false,
};

function mockEngine(outcome: AgentGrantOutcome, status: number, put: unknown[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        put.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
        return Promise.resolve({
          ok: status === 200,
          status,
          json: () => Promise.resolve(outcome),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(VIEW),
      } as Response);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the Settings Model access tab (GW.10)', () => {
  it('grants a model in one click on its matrix cell, sending what the page saw', async () => {
    const put: unknown[] = [];
    mockEngine({ kind: 'applied', grant: grant(['claude-opus-5-5', 'gpt-6-luna']) }, 200, put);
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=model-access' });

    const cell = await screen.findByRole('checkbox', { name: 'claude-opus-5-5 for codex' });
    expect(cell).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'gpt-6-luna for codex' })).toBeChecked();
    fireEvent.click(cell);

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]).toEqual({
      agent: 'codex',
      models: ['claude-opus-5-5', 'gpt-6-luna'],
      tools: [],
      expectedModels: ['gpt-6-luna'],
      expectedTools: [],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByText('$25.00/M')).toBeInTheDocument();
    expect(screen.getByText('$0.0006')).toBeInTheDocument();
  });

  it('shows a conflict with the grant as stored now and saves nothing silently', async () => {
    const put: unknown[] = [];
    mockEngine({ kind: 'conflict', current: grant(['claude-opus-5-5']) }, 409, put);
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=model-access' });

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Engine tools for codex' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Changed by someone else');
    expect(alert).toHaveTextContent('claude-opus-5-5');
    expect((put[0] as { tools: string[] }).tools).toEqual(['crucible/*']);
  });

  it('says a global administrator is required when the BFF refuses the read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response),
      ),
    );
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=model-access' });

    expect(await screen.findByText('Global administrator required')).toBeInTheDocument();
  });
});
