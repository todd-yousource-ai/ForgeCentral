// apps/console/src/test/settings-surface.test.tsx -- IP-CONSOLE-11 S3.18 the Settings tab's SOC section.

import type { SocSettings, SocSettingsReceipt } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsSurface } from '../surfaces/SettingsSurface.js';
import { renderWithProviders } from './render.js';

const SETTINGS: SocSettings = {
  version: 3,
  tiers: { pLowMilli: 0, pHighMilli: 1000 },
  siemWriteback: {
    enabled: false,
    vendor: 'splunk',
    host: '',
    stream: '',
    caseUrlBase: '',
    ceiling: 'unclassified',
  },
  narrativeModelRef: null,
  dualControlRequired: false,
  registry: [
    {
      key: 'soc.tiers',
      valueType: 'struct',
      defaultValue: 'p_low=0, p_high=1000',
      bound: '0 <= p_low <= p_high <= 1000',
      liveApply: 'live',
      uiBinding: 'console:settings/soc/tiers',
      summary: 'The SOC response-tier thresholds.',
    },
  ],
};

function mockSettings(
  settings: SocSettings | null,
  receipt: SocSettingsReceipt,
  posted: unknown[] = [],
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(receipt),
        } as Response);
      }
      return Promise.resolve({
        ok: settings !== null,
        status: settings === null ? 403 : 200,
        json: () => Promise.resolve(settings),
      } as Response);
    }),
  );
}

const ACCEPTED: SocSettingsReceipt = {
  version: 4,
  dualControlRequired: false,
  violations: [],
  refused: false,
  explanation: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Settings tab SOC section (S3.18)', () => {
  it('renders the committed values, the unbound model, and the registry definitions', async () => {
    mockSettings(SETTINGS, ACCEPTED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByTestId('settings-soc');
    expect(screen.getByTestId('settings-p-low')).toHaveValue(0);
    expect(screen.getByTestId('settings-p-high')).toHaveValue(1000);
    expect(screen.getByTestId('settings-model-ref')).toHaveTextContent('none bound');
    expect(screen.getByText('soc.tiers')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-dual-control')).not.toBeInTheDocument();
  });

  it('commits the tiers confirm-gated and renders the engine receipt', async () => {
    const posted: unknown[] = [];
    mockSettings(SETTINGS, ACCEPTED, posted);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByTestId('settings-soc');
    fireEvent.change(screen.getByTestId('settings-p-low'), { target: { value: '200' } });
    fireEvent.change(screen.getByTestId('settings-p-high'), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit tiers' }));
    // Nothing is posted before the confirm.
    expect(posted).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ tiers: { pLowMilli: 200, pHighMilli: 800 } });
    expect(await screen.findByTestId('settings-receipt')).toHaveTextContent(
      'Committed at version 4',
    );
  });

  it('renders a validation refusal with the engine violations, verbatim', async () => {
    mockSettings(SETTINGS, {
      version: 0,
      dualControlRequired: false,
      violations: [
        'the SOC tier thresholds p_low=900 / p_high=100 (milli) are not ordered within 0..=1000',
      ],
      refused: true,
      explanation: 'the candidate did not validate',
    });
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByTestId('settings-soc');
    fireEvent.click(screen.getByRole('button', { name: 'Commit tiers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    expect(await screen.findByTestId('settings-violations')).toHaveTextContent('p_low=900');
    expect(screen.getByTestId('settings-receipt')).toHaveTextContent('Refused');
  });

  it('locks the forms and says why under dual control, and states the tier below Admin', async () => {
    mockSettings({ ...SETTINGS, dualControlRequired: true }, ACCEPTED);
    const view = renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByTestId('settings-dual-control');
    expect(screen.getByRole('button', { name: 'Commit tiers' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Commit write-back' })).toBeDisabled();
    view.unmount();
    vi.unstubAllGlobals();
    mockSettings(null, ACCEPTED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByText('Admin or SecurityAudit tier required');
    expect(screen.queryByTestId('settings-soc')).not.toBeInTheDocument();
  });
});
