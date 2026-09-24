// apps/console/src/test/settings-surface.test.tsx -- IP-CONSOLE-11 S3.18 the Settings tab's SOC section.

import type { SettingsView, SocSettings, SocSettingsReceipt } from '@forge/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

const GOVERNED: SettingsView = {
  version: 9,
  surfaces: ['admin_endpoint', 'maintenance'],
  dualControlRequired: false,
  sectionValues: null,
  rows: [
    {
      key: 'maintenance.cadence_secs',
      surface: 'maintenance',
      origin: 'knob',
      value: '120',
      valueType: 'ticks',
      defaultValue: '60',
      bound: '> 0',
      liveApply: 'live (the maintenance engine)',
      changeVia: 'config-commit / config-apply',
      uiBinding: 'console:settings/maintenance/cadence_secs',
      summary: 'The maintenance cadence.',
      editable: true,
    },
    {
      key: 'admin_endpoint.max_payload_bytes',
      surface: 'admin_endpoint',
      origin: 'knob',
      value: '65536',
      valueType: 'bytes',
      defaultValue: '65536',
      bound: '>= 1024',
      liveApply: 'boot-bound (a change needs a restart)',
      changeVia: 'config-commit / config-apply',
      uiBinding: 'console:settings/admin_endpoint/max_payload_bytes',
      summary: 'The max admin frame payload.',
      editable: false,
    },
  ],
};

function mockGoverned(
  view: SettingsView | null,
  receipt: unknown = null,
  posted: unknown[] = [],
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/settings' && init?.method === 'POST') {
        posted.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(receipt),
        } as Response);
      }
      if (url === '/api/settings') {
        return Promise.resolve({
          ok: view !== null,
          status: view === null ? 403 : 200,
          json: () => Promise.resolve(view),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(SETTINGS),
      } as Response);
    }),
  );
}

describe('the Settings tab strip and the Configuration tab (ST.1)', () => {
  it('shows only the tabs whose engine bindings are live, SOC first', async () => {
    mockGoverned(GOVERNED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    const strip = await screen.findByRole('tablist', { name: 'Settings' });
    const tabs = within(strip).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['SOC', 'Configuration']);
    await screen.findByTestId('settings-soc');
  });

  it('renders each surface as the engine rendered it, with source and apply class', async () => {
    mockGoverned(GOVERNED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
    const table = await screen.findByTestId('settings-configuration');
    expect(screen.getByTestId('settings-configuration-version')).toHaveTextContent('version 9');
    // Surfaces in the engine order; the first is shown.
    expect(within(table).getByText('admin_endpoint.max_payload_bytes')).toBeInTheDocument();
    expect(table).toHaveTextContent('boot-bound: changes need a restart');
    expect(table).toHaveTextContent('committed at version 9');
    fireEvent.change(screen.getByTestId('settings-surface-picker'), {
      target: { value: 'maintenance' },
    });
    expect(within(table).getByText('120')).toBeInTheDocument();
    expect(table).toHaveTextContent('live');
  });

  it('states the tier below Admin, never an empty table', async () => {
    mockGoverned(null);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
    await screen.findByText('Admin or SecurityAudit tier required');
    expect(screen.queryByTestId('settings-configuration')).not.toBeInTheDocument();
  });
});

describe('knob edits on the Configuration tab (ST.2a)', () => {
  async function openMaintenance(): Promise<void> {
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
    await screen.findByTestId('settings-configuration');
    fireEvent.change(screen.getByTestId('settings-surface-picker'), {
      target: { value: 'maintenance' },
    });
  }

  it('stages an edit, confirms it with old and new, and shows the engine receipt', async () => {
    const posted: unknown[] = [];
    mockGoverned(
      GOVERNED,
      {
        version: 10,
        needsRestart: [],
        dualControlRequired: false,
        refusedEdits: [],
        violations: [],
        refused: false,
        explanation: null,
      },
      posted,
    );
    await openMaintenance();
    fireEvent.click(screen.getByRole('button', { name: 'Edit maintenance.cadence_secs' }));
    fireEvent.change(screen.getByLabelText('New value for maintenance.cadence_secs'), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stage' }));
    expect(screen.getByTestId('settings-configuration-staged')).toHaveTextContent(
      '1 staged change',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit 1 change' }));
    // Nothing leaves before the confirm, and the confirm states old -> new.
    expect(posted).toHaveLength(0);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'maintenance.cadence_secs: 120 -> 300',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ edits: [{ key: 'maintenance.cadence_secs', value: '300' }] });
    expect(await screen.findByTestId('settings-configuration-receipt')).toHaveTextContent(
      'Committed at version 10. Applied live.',
    );
  });

  it('shows a refused batch with every cause in words, and offers no edit on a boot-bound row', async () => {
    mockGoverned(GOVERNED, {
      version: 0,
      needsRestart: [],
      dualControlRequired: false,
      refusedEdits: [
        {
          key: 'maintenance.cadence_secs',
          cause: 'unparseable',
          causeTag: 'unparseable',
          detail: 'cannot parse "soon"',
        },
      ],
      violations: [],
      refused: true,
      explanation: 'an edit was refused; nothing was committed',
    });
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
    const table = await screen.findByTestId('settings-configuration');
    // The boot-bound row on the first surface is read-only.
    expect(within(table).getAllByText('read-only').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Edit admin_endpoint.max_payload_bytes' }),
    ).toBeNull();
    fireEvent.change(screen.getByTestId('settings-surface-picker'), {
      target: { value: 'maintenance' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit maintenance.cadence_secs' }));
    fireEvent.change(screen.getByLabelText('New value for maintenance.cadence_secs'), {
      target: { value: 'soon' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Commit 1 change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    const refusals = await screen.findByTestId('settings-configuration-refusals');
    expect(refusals).toHaveTextContent(
      'maintenance.cadence_secs: not a valid value for this setting',
    );
    // A refused batch stays staged so the operator can correct it.
    expect(screen.getByTestId('settings-configuration-staged')).toBeInTheDocument();
  });

  it('offers no edit under dual control', async () => {
    mockGoverned({ ...GOVERNED, dualControlRequired: true });
    await openMaintenance();
    expect(screen.queryByRole('button', { name: 'Edit maintenance.cadence_secs' })).toBeNull();
    expect(screen.getByTestId('settings-configuration-version')).toHaveTextContent('dual control');
  });
});

const sectionRow = (key: string, surface: string, editable: boolean) => ({
  key,
  surface,
  origin: key === 'governance.dual_control' ? ('knob' as const) : ('section' as const),
  value: '[]',
  valueType: key === 'governance.dual_control' ? 'CapabilitySet' : 'Struct',
  defaultValue: '',
  bound: 'b',
  liveApply: editable ? 'live (x)' : 'boot-bound (a change needs a restart)',
  changeVia: 'config-commit / config-apply',
  uiBinding: `console:settings/${surface}`,
  summary: 's.',
  editable,
});

const WITH_SECTIONS: SettingsView = {
  ...GOVERNED,
  rows: [
    ...GOVERNED.rows,
    sectionRow('governance.dual_control', 'governance', true),
    sectionRow('egress.destinations', 'egress', true),
    sectionRow('soc_narrative.model_ref', 'soc_narrative', true),
    sectionRow('lug.exposure', 'lug', false),
  ],
  sectionValues: {
    dualControl: [],
    egressDestinations: [{ id: 'frontier', ceiling: 'internal' }],
    lugExposure: {
      enabled: true,
      resolutionEnabled: true,
      maxAccountsPerNamespace: 1,
      maxGroupsPerNamespace: 1,
      maxSessionsPerDevice: 1,
      lastSeenBucketHours: 1,
      bindingConfirmThresholdPermille: 900,
      snapshotCadenceHours: 24,
    },
    disabledDecoderFamilies: [],
    sourceFormatMap: [],
    socNarrativeModelRef: 'gemma4@2026-07',
  },
};

const COMMITTED = {
  version: 11,
  needsRestart: [],
  dualControlRequired: false,
  refusedEdits: [],
  violations: [],
  refused: false,
  explanation: null,
};

describe('the typed section forms on the Configuration tab (ST.2b)', () => {
  async function openSections(view: SettingsView, posted: unknown[] = []): Promise<void> {
    mockGoverned(view, COMMITTED, posted);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
    await screen.findByTestId('settings-configuration');
  }

  it('shows a form only for a section the engine marks editable', async () => {
    await openSections(WITH_SECTIONS);
    const sections = screen.getByTestId('settings-sections');
    expect(within(sections).getByText('Dual control')).toBeInTheDocument();
    expect(within(sections).getByText('Egress destinations')).toBeInTheDocument();
    expect(within(sections).getByText('Narrative model')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-lugExposure')).toBeNull();
  });

  it('commits only its own section after a confirm that names it', async () => {
    const posted: unknown[] = [];
    await openSections(WITH_SECTIONS, posted);
    const dual = within(screen.getByTestId('settings-section-dualControl'));
    fireEvent.click(dual.getByLabelText('audit-export'));
    fireEvent.click(dual.getByRole('button', { name: 'Commit dual control' }));
    expect(posted).toHaveLength(0);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Commit Dual control?');
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ edits: [], sections: { dualControl: ['audit-export'] } });
    expect(await screen.findByTestId('settings-configuration-receipt')).toHaveTextContent(
      'Committed at version 11',
    );
  });

  it('adds an egress destination and unbinds the narrative model', async () => {
    const posted: unknown[] = [];
    await openSections(WITH_SECTIONS, posted);
    const egress = within(screen.getByTestId('settings-section-egressDestinations'));
    fireEvent.click(egress.getByRole('button', { name: 'Add destination' }));
    expect(egress.getByRole('button', { name: 'Commit egress destinations' })).toBeDisabled();
    fireEvent.change(egress.getByLabelText('Destination 2 id'), { target: { value: 'grok' } });
    fireEvent.change(egress.getByLabelText('Destination 2 ceiling'), {
      target: { value: 'internal' },
    });
    fireEvent.click(egress.getByRole('button', { name: 'Commit egress destinations' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      edits: [],
      sections: {
        egressDestinations: [
          { id: 'frontier', ceiling: 'internal' },
          { id: 'grok', ceiling: 'internal' },
        ],
      },
    });
    const model = within(screen.getByTestId('settings-section-socNarrativeModelRef'));
    fireEvent.change(model.getByLabelText('Narrative model ref'), { target: { value: '' } });
    fireEvent.click(model.getByRole('button', { name: 'Commit narrative model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toEqual({ edits: [], sections: { socNarrativeModelRef: '' } });
  });

  it('shows no section forms under dual control', async () => {
    await openSections({ ...WITH_SECTIONS, dualControlRequired: true });
    expect(screen.queryByTestId('settings-sections')).toBeNull();
  });
});
