// apps/console/src/test/settings-surface.test.tsx -- IP-CONSOLE-11 S3.18 the Settings tab's SOC section.

import type { SettingsView, SocSettings, SocSettingsReceipt } from '@forge/contracts';
import {
  LUG_THRESHOLD_PERMILLE_MAX,
  MAX_EGRESS_ID_CHARS,
  MAX_SECTION_TEXT_CHARS,
  MAX_SETTING_VALUE_CHARS,
  SOC_TIER_MILLI_MAX,
} from '@forge/contracts';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    const writeBack = screen.getByRole('button', { name: 'Commit write-back' });
    expect(writeBack).toBeDisabled();
    // GD.13: every locked control is described by the dual-control notice, which links to the cause.
    expect(writeBack).toHaveAccessibleDescription(/tenant-config under dual control/);
    expect(screen.getByTestId('settings-p-low')).toHaveAccessibleDescription(/dual control/);
    expect(screen.getByRole('link', { name: 'Why these controls are locked' })).toHaveAttribute(
      'href',
      '/settings?tab=readme#soc-set-restrictions',
    );
    view.unmount();
    vi.unstubAllGlobals();
    mockSettings(null, ACCEPTED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByText('Admin or SecurityAudit tier required');
    expect(screen.queryByTestId('settings-soc')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Who can configure what' })).toHaveAttribute(
      'href',
      '/settings?tab=readme#cfg-who',
    );
  });
});

const GOVERNED: SettingsView = {
  version: 9,
  surfaces: ['admin_endpoint', 'maintenance'],
  dualControlRequired: false,
  sectionValues: null,
  identity: null,
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
      if (url === '/api/settings/propose' && init?.method === 'POST') {
        posted.push({
          propose: JSON.parse(typeof init.body === 'string' ? init.body : '{}') as unknown,
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              proposal: 7,
              refusedEdits: [],
              violations: [],
              refused: false,
              explanation: null,
            }),
        } as Response);
      }
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
    expect(tabs.map((t) => t.textContent)).toEqual([
      'SOC',
      'Configuration',
      'RBAC',
      'Federation',
      'Changes',
      'Security',
      'KeyLock',
      'Observability',
      'HA & Topology',
      'FIPS Mode',
      // The configuration guide (IP-CONSOLE-11-guide GD.2): static content plus the live reference.
      'ReadMe',
    ]);
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
    // The boot-bound row on the first surface is read-only, with a link to why (GD.13).
    expect(within(table).getAllByText(/read-only/).length).toBeGreaterThan(0);
    const why = within(table).getAllByRole('link', { name: /^Why .* is read-only$/ })[0];
    expect(why).toHaveAttribute('href', '/settings?tab=readme#cfg-apply');
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

  it('proposes instead of committing under dual control (ST.9)', async () => {
    const posted: unknown[] = [];
    mockGoverned({ ...GOVERNED, dualControlRequired: true }, null, posted);
    await openMaintenance();
    expect(screen.getByTestId('settings-configuration-version')).toHaveTextContent(
      'a different Admin approves',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit maintenance.cadence_secs' }));
    fireEvent.change(screen.getByLabelText('New value for maintenance.cadence_secs'), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Propose 1 change' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('under dual control');
    fireEvent.click(screen.getByRole('button', { name: 'Propose' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      propose: { edits: [{ key: 'maintenance.cadence_secs', value: '300' }] },
    });
    expect(await screen.findByTestId('settings-configuration-receipt')).toHaveTextContent(
      'Proposal 7 recorded',
    );
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

  it('proposes a section under dual control (ST.9)', async () => {
    const posted: unknown[] = [];
    await openSections({ ...WITH_SECTIONS, dualControlRequired: true }, posted);
    const dual = within(screen.getByTestId('settings-section-dualControl'));
    fireEvent.click(dual.getByLabelText('audit-export'));
    fireEvent.click(dual.getByRole('button', { name: 'Commit dual control' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Propose Dual control?');
    fireEvent.click(screen.getByRole('button', { name: 'Propose' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      propose: { edits: [], sections: { dualControl: ['audit-export'] } },
    });
    expect(await screen.findByTestId('settings-configuration-receipt')).toHaveTextContent(
      'Proposal 7 recorded',
    );
  });
});

const TRICKY = 'proxy:alice;mallory=[Root]@Secret';

const IDENTITY_VIEW: SettingsView = {
  version: 12,
  surfaces: ['identity'],
  dualControlRequired: false,
  sectionValues: null,
  identity: {
    admins: [{ identity: TRICKY, roles: ['auditor', 'operator'], clearance: 'confidential' }],
    ssoGroupRoles: [{ group: 'soc-admins', roles: ['tenantadmin'] }],
  },
  rows: ['identity.admins', 'identity.sso_group_roles'].map((key) => ({
    key,
    surface: 'identity',
    origin: 'section' as const,
    value: key === 'identity.admins' ? `${TRICKY}=[Operator,Auditor]@Confidential` : 'x',
    valueType: 'record_list',
    defaultValue: 'empty',
    bound: 'non-empty roles',
    liveApply: 'boot-bound (the admin plane reads it at start)',
    changeVia: 'config-commit / config-apply',
    uiBinding: `console:settings/${key.replace('.', '/')}`,
    summary: key,
    editable: false,
  })),
};

function mockIdentity(view: SettingsView | null, rbac: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const reply = (status: number, body: unknown) =>
        Promise.resolve({
          ok: status === 200,
          status,
          json: () => Promise.resolve(body),
        } as Response);
      if (url === '/api/settings') return reply(view === null ? 403 : 200, view);
      if (url === '/api/settings/console-rbac') return reply(rbac === null ? 403 : 200, rbac);
      if (url === '/api/idam/connectors') return reply(200, []);
      return reply(200, SETTINGS);
    }),
  );
}

describe('the RBAC and Federation tabs (ST.3 / ST.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the engine admins from the typed values, read-only with the boot-bound path', async () => {
    mockIdentity(IDENTITY_VIEW, {
      groupRoles: [{ key: 'fc-admins', role: 'global-admin', tenant: null }],
      localRbac: [],
      defaultTenant: 't1',
    });
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(screen.getByRole('tab', { name: 'RBAC' }));
    const admins = await screen.findByRole('table', { name: 'The engine admin assignments' });
    // One admin: the identity verbatim, separators and all -- never split into a forged second row.
    expect(within(admins).getAllByRole('row')).toHaveLength(2);
    expect(within(admins).getByText(TRICKY)).toBeInTheDocument();
    expect(within(admins).getByText('Auditor')).toBeInTheDocument();
    expect(within(admins).getByText('confidential')).toBeInTheDocument();
    expect(screen.getAllByText(/Source: committed at version 12/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/then restart the node/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /edit|commit/i })).not.toBeInTheDocument();
    const consoleRoles = await screen.findByRole('table', {
      name: 'Console roles granted by IdP group',
    });
    expect(within(consoleRoles).getByText('fc-admins')).toBeInTheDocument();
    expect(within(consoleRoles).getByText('every tenant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
  });

  it('withholds the Console role map from a non-global admin and states the tier below', async () => {
    mockIdentity(IDENTITY_VIEW, null);
    const view = renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(screen.getByRole('tab', { name: 'RBAC' }));
    await screen.findByText('Global admin required');
    view.unmount();
    vi.unstubAllGlobals();
    mockIdentity(null, null);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(screen.getByRole('tab', { name: 'RBAC' }));
    await screen.findByText('Admin or SecurityAudit tier required');
    expect(screen.queryByRole('table', { name: 'The engine admin assignments' })).toBeNull();
  });

  it('mounts the connector panel and shows the SSO map read-only on Federation', async () => {
    mockIdentity(IDENTITY_VIEW, null);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(screen.getByRole('tab', { name: 'Federation' }));
    const sso = await screen.findByRole('table', { name: 'The SSO group to admin role map' });
    expect(within(sso).getByText('soc-admins')).toBeInTheDocument();
    expect(within(sso).getByText('Tenant admin')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Identity providers' })).toBeInTheDocument();
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/idam/connectors', expect.anything());
    });
  });
});

const REPORTS = {
  adminPlane: true,
  server: {
    shards: 1,
    serving: true,
    durable: true,
    maintenanceEnabled: true,
    maintenanceCadenceSecs: 120,
    maxPayload: 262_144,
    version: '0.0.0',
  },
  connectivity: {
    listenAddr: '127.0.0.1:7440',
    mutualTls: true,
    identitiesBound: 2,
    postQuantumKx: true,
    cryptoProvider: 'aws-lc-rs',
    fipsModule: false,
  },
  security: {
    classification: 'confidential',
    auditHeadVersion: 42,
    auditEntries: 7,
    auditChainVerified: true,
    artifactsSpotChecked: 3,
    artifactSpotFailures: 0,
    templateArtifacts: 0,
  },
  telemetry: {
    enabled: true,
    grpcAddr: '0.0.0.0:4317',
    httpAddr: '0.0.0.0:4318',
    queueCapacity: 1024,
    tenantsBound: 1,
  },
  keyIssuing: { enabled: false, dualControlRequired: true, keyValiditySecs: 86_400 },
  egress: [{ id: 'frontier', ceiling: 'internal' }],
};

const OBSERVABILITY_VIEW: SettingsView = {
  ...IDENTITY_VIEW,
  identity: null,
  rows: [
    {
      key: 'observability.trace_sample_permille',
      surface: 'observability',
      origin: 'knob',
      value: '100',
      valueType: 'permille',
      defaultValue: '0',
      bound: '0..=1000',
      liveApply: 'live (the tracer)',
      changeVia: 'config-commit / config-apply',
      uiBinding: 'console:settings/observability/trace_sample_permille',
      summary: 'The trace sampling rate.',
      editable: true,
    },
  ],
};

function mockReports(
  reports: unknown,
  asked: string[] = [],
  session: unknown = { status: 'negotiated', group: 'X25519MLKEM768' },
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const reply = (status: number, body: unknown) =>
        Promise.resolve({
          ok: status === 200,
          status,
          json: () => Promise.resolve(body),
        } as Response);
      if (url === '/api/settings/security-session') return reply(200, session);
      if (url.startsWith('/api/settings/reports')) {
        asked.push(url);
        return reply(reports === null ? 403 : 200, reports);
      }
      if (url === '/api/settings') return reply(200, OBSERVABILITY_VIEW);
      return reply(200, SETTINGS);
    }),
  );
}

async function openTab(name: string): Promise<void> {
  renderWithProviders(<SettingsSurface />, { route: '/settings' });
  fireEvent.click(await screen.findByRole('tab', { name }));
}

describe('the report-backed tabs (crdb SET.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Security asks for its three reports and shows each with its source', async () => {
    const asked: string[] = [];
    mockReports(REPORTS, asked);
    await openTab('Security');
    const endpoint = await screen.findByRole('table', {
      name: 'Admin endpoint (the engine connectivity report)',
    });
    expect(within(endpoint).getByText('127.0.0.1:7440')).toBeInTheDocument();
    expect(within(endpoint).getByText('Offered')).toBeInTheDocument();
    const security = screen.getByRole('table', {
      name: 'Server security (the engine security report)',
    });
    expect(within(security).getByText('Verified')).toBeInTheDocument();
    expect(within(security).getByText('confidential')).toBeInTheDocument();
    expect(screen.getByText('frontier')).toBeInTheDocument();
    expect(await screen.findByText('Hybrid post-quantum (X25519MLKEM768)')).toBeInTheDocument();
    expect(asked).toEqual(['/api/settings/reports?names=connectivity,security,egress']);
    expect(screen.queryByRole('button', { name: /rotate|edit|commit/i })).toBeNull();
  });

  it('shows a failed audit chain as a failure and a node without an admin plane as such', async () => {
    mockReports({
      ...REPORTS,
      security: { ...REPORTS.security, auditChainVerified: false },
    });
    await openTab('Security');
    expect(await screen.findByText('Failed verification')).toBeInTheDocument();
    cleanupAndReset();
    mockReports({
      adminPlane: false,
      server: null,
      connectivity: null,
      security: null,
      telemetry: null,
      keyIssuing: null,
      egress: null,
    });
    await openTab('Security');
    expect(await screen.findByText('This node runs no admin endpoint')).toBeInTheDocument();
    cleanupAndReset();
    mockReports(null);
    await openTab('KeyLock');
    expect(await screen.findByText('Admin or SecurityAudit tier required')).toBeInTheDocument();
  });

  it('KeyLock shows the key-issuing report and states rotation as unavailable', async () => {
    mockReports(REPORTS);
    await openTab('KeyLock');
    const keys = await screen.findByRole('table', {
      name: 'Agent key issuing (the engine key-issuing report)',
    });
    expect(within(keys).getByText('1 d')).toBeInTheDocument();
    expect(screen.getByText(/SET\.6c/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rotate/i })).toBeNull();
  });

  it('Observability shows the telemetry report and the committed observability settings', async () => {
    mockReports(REPORTS);
    await openTab('Observability');
    const telemetry = await screen.findByRole('table', {
      name: 'Telemetry ingest (the engine telemetry report)',
    });
    expect(within(telemetry).getByText('0.0.0.0:4317')).toBeInTheDocument();
    expect(await screen.findByText('observability.trace_sample_permille')).toBeInTheDocument();
    expect(screen.getByText(/SET\.6d/)).toBeInTheDocument();
  });

  it('HA & Topology and FIPS Mode read their reports and offer no control', async () => {
    mockReports(REPORTS);
    await openTab('HA & Topology');
    const node = await screen.findByRole('table', { name: 'This node (the engine server report)' });
    expect(within(node).getByText('every 120 s')).toBeInTheDocument();
    expect(screen.getByText(/SET\.6a/)).toBeInTheDocument();
    cleanupAndReset();
    mockReports(REPORTS);
    await openTab('FIPS Mode');
    const fips = await screen.findByRole('table', {
      name: 'Crypto build posture (the engine connectivity report)',
    });
    expect(within(fips).getByText('aws-lc-rs')).toBeInTheDocument();
    expect(within(fips).getByText('No')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe("the Security tab's own-session key exchange (ST.5b)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the P-384 floor, an unprovisioned lookup, and a request that bypassed the terminator', async () => {
    mockReports(REPORTS, [], { status: 'negotiated', group: 'secp384r1' });
    await openTab('Security');
    expect(await screen.findByText('Classical P-384 floor (CNSA 1.0)')).toBeInTheDocument();
    cleanupAndReset();
    mockReports(REPORTS, [], { status: 'unconfigured' });
    await openTab('Security');
    expect(await screen.findByText(/session lookup is not provisioned/)).toBeInTheDocument();
    cleanupAndReset();
    mockReports(REPORTS, [], { status: 'not-tunnelled' });
    await openTab('Security');
    expect(
      await screen.findByText(/did not arrive through the admin TLS terminator/),
    ).toBeInTheDocument();
  });
});

describe('the Changes tab: approvals and history (ST.9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const PENDING = [
    {
      proposal: 3,
      proposer: 'console:someone-else',
      proposedAtMs: 1_700_000_000_000,
      changedKeys: ['maintenance.cadence_secs'],
      stale: false,
    },
    {
      proposal: 4,
      proposer: 'sha512:admin-plane',
      proposedAtMs: 1_700_000_000_000,
      changedKeys: ['egress.destinations'],
      stale: true,
    },
  ];
  const HISTORY = {
    versions: [
      {
        version: 9,
        principal: 'console:a approved-by console:b',
        atMs: 1_700_000_000_000,
        changedKeys: ['maintenance.cadence_secs'],
      },
      { version: 5, principal: null, atMs: null, changedKeys: [] },
    ],
    complete: false,
  };

  function mockChanges(acts: string[], receipt: unknown, approvals: unknown = PENDING): void {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const reply = (status: number, body: unknown) =>
          Promise.resolve({
            ok: status === 200,
            status,
            json: () => Promise.resolve(body),
          } as Response);
        if (init?.method === 'POST') {
          acts.push(`${url} ${typeof init.body === 'string' ? init.body : ''}`);
          return reply(200, receipt);
        }
        if (url === '/api/settings/approvals') {
          return reply(approvals === null ? 403 : 200, { proposals: approvals });
        }
        if (url.startsWith('/api/settings/history')) return reply(200, HISTORY);
        return reply(200, SETTINGS);
      }),
    );
  }

  const refused = {
    version: 0,
    needsRestart: [],
    dualControlRequired: true,
    refusedEdits: [],
    violations: [],
    refused: true,
    explanation: 'x',
    proposal: null,
    approvalRefused: 'self_approval',
  };

  it('lists proposals from both planes, approves behind a confirm, and shows a refusal in words', async () => {
    const acts: string[] = [];
    mockChanges(acts, refused);
    await openTab('Changes');
    const table = await screen.findByRole('table', {
      name: 'Configuration proposals awaiting a second Admin',
    });
    expect(within(table).getByText('sha512:admin-plane')).toBeInTheDocument();
    // A stale proposal offers no Approve: the engine would refuse it.
    expect(within(table).getByText(/Stale/)).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Approve 4' })).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: 'Approve 3' }));
    expect(acts).toEqual([]);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'You cannot approve your own proposal',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(acts).toEqual(['/api/settings/approvals/3/approve {}']));
    expect(await screen.findByTestId('settings-changes-receipt')).toHaveTextContent(
      'a different Admin must approve it',
    );
  });

  it('shows the history with names and rolls back behind a confirm; a proposal under dual control', async () => {
    const acts: string[] = [];
    mockChanges(acts, { ...refused, refused: false, approvalRefused: null, proposal: 11 });
    await openTab('Changes');
    const table = await screen.findByRole('table', {
      name: 'Committed configuration versions, newest first',
    });
    expect(within(table).getByText('console:a approved-by console:b')).toBeInTheDocument();
    expect(within(table).getAllByText('not recorded').length).toBeGreaterThan(0);
    expect(within(table).getByText('current')).toBeInTheDocument();
    expect(screen.getByText(/Older versions exist/)).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: 'Roll back to 5' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('applied live');
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(acts).toEqual(['/api/settings/rollback {"to":5}']));
    expect(await screen.findByTestId('settings-changes-receipt')).toHaveTextContent(
      'the rollback is proposal 11',
    );
  });

  it('states the tier below for the approvals', async () => {
    mockChanges([], refused, null);
    await openTab('Changes');
    expect((await screen.findAllByText('Admin or SecurityAudit tier required')).length).toBe(1);
  });
});

describe('field help and visible limits (GD.12)', () => {
  it('shows the tier rule from the named bound, explains each bar, and refuses an out-of-order pair', async () => {
    mockSettings(SETTINGS, ACCEPTED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    await screen.findByTestId('settings-soc');
    const low = screen.getByTestId('settings-p-low');
    expect(low).toHaveAccessibleDescription(
      `Whole numbers from 0 to ${String(SOC_TIER_MILLI_MAX)}; p_low may not exceed p_high.`,
    );
    expect(low).toHaveAttribute('max', String(SOC_TIER_MILLI_MAX));
    fireEvent.click(screen.getByRole('button', { name: 'About p_low' }));
    expect(screen.getByText(/treated as noise/)).toBeInTheDocument();
    const commit = screen.getByRole('button', { name: 'Commit tiers' });
    fireEvent.change(low, { target: { value: '900' } });
    fireEvent.change(screen.getByTestId('settings-p-high'), { target: { value: '800' } });
    expect(commit).toBeDisabled();
    fireEvent.change(screen.getByTestId('settings-p-high'), {
      target: { value: String(SOC_TIER_MILLI_MAX + 1) },
    });
    expect(commit).toBeDisabled();
    fireEvent.change(screen.getByTestId('settings-p-high'), {
      target: { value: String(SOC_TIER_MILLI_MAX) },
    });
    expect(commit).toBeEnabled();
  });

  it('names the value limit under a knob edit', async () => {
    mockGoverned(GOVERNED, COMMITTED);
    renderWithProviders(<SettingsSurface />, { route: '/settings' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
    await screen.findByTestId('settings-configuration');
    fireEvent.change(screen.getByTestId('settings-surface-picker'), {
      target: { value: 'maintenance' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit / })[0] as HTMLElement);
    const input = screen.getByRole('textbox', { name: /^New value for / });
    expect(input).toHaveAttribute('maxLength', String(MAX_SETTING_VALUE_CHARS));
    expect(input).toHaveAccessibleDescription(
      new RegExp(`at most ${String(MAX_SETTING_VALUE_CHARS)} characters`),
    );
  });

  it('holds the section forms to the engine limits and says so under each', async () => {
    const lugEditable: SettingsView = {
      ...WITH_SECTIONS,
      rows: WITH_SECTIONS.rows.map((r) =>
        r.key === 'lug.exposure' ? { ...r, editable: true } : r,
      ),
    };
    await openSections(lugEditable);
    const lug = within(screen.getByTestId('settings-section-lugExposure'));
    const submitLug = lug.getByRole('button', { name: 'Commit LUG exposure' });
    expect(submitLug).toBeEnabled();
    const threshold = lug.getByLabelText('Binding confirm threshold (permille)');
    expect(threshold).toHaveAccessibleDescription(
      new RegExp(`0 to ${String(LUG_THRESHOLD_PERMILLE_MAX)} permille`),
    );
    fireEvent.change(threshold, { target: { value: String(LUG_THRESHOLD_PERMILLE_MAX + 1) } });
    expect(submitLug).toBeDisabled();
    fireEvent.change(threshold, { target: { value: '900' } });
    fireEvent.change(lug.getByLabelText('Max sessions per device'), { target: { value: '0' } });
    expect(submitLug).toBeDisabled();
    // Disabling LUG ingest lifts the bounded-caps rule, as the engine does.
    fireEvent.click(lug.getByLabelText('LUG ingest enabled'));
    expect(submitLug).toBeEnabled();

    const egress = within(screen.getByTestId('settings-section-egressDestinations'));
    const id = egress.getByLabelText('Destination 1 id');
    expect(id).toHaveAttribute('maxLength', String(MAX_EGRESS_ID_CHARS));
    fireEvent.change(id, { target: { value: 'x'.repeat(MAX_EGRESS_ID_CHARS + 1) } });
    expect(egress.getByRole('button', { name: 'Commit egress destinations' })).toBeDisabled();

    const model = within(screen.getByTestId('settings-section-socNarrativeModelRef'));
    expect(model.getByLabelText('Narrative model ref')).toHaveAttribute(
      'maxLength',
      String(MAX_SECTION_TEXT_CHARS),
    );
  });
});

async function openSections(view: SettingsView): Promise<void> {
  mockGoverned(view, COMMITTED, []);
  renderWithProviders(<SettingsSurface />, { route: '/settings' });
  fireEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));
  await screen.findByTestId('settings-configuration');
}

function cleanupAndReset(): void {
  cleanup();
  vi.unstubAllGlobals();
}
