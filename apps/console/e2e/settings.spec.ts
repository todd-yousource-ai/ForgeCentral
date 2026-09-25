import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// IP-CONSOLE-11 ST.N (TRD-CONSOLE-11 Sections 7 and 9.4): the Settings surface end to end in a real
// browser, the BFF mocked at the network boundary exactly as the BFF emits each view (the engine legs
// are proven by crdb IP-CONSOLE-SETTINGS-WIRE's capstones against a booted node and the shipped
// cdb-actl). Proves: every task within 3 clicks of the Overview; a knob edit commits behind a confirm
// and shows the engine's receipt; under dual control the same edit PROPOSES and a different Admin
// approves it on the Changes tab; every posture tab reads its engine report; boot-bound values carry
// no control; the tier below Admin / SecurityAudit is an honest empty state; and the no-stub sweep:
// every tab is visited, every request it makes is a real BFF route, and no placeholder text renders.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

const row = (
  key: string,
  surface: string,
  origin: 'knob' | 'section',
  value: string,
  liveApply: string,
  editable: boolean,
) => ({
  key,
  surface,
  origin,
  value,
  valueType: origin === 'knob' ? 'ticks' : 'record_list',
  defaultValue: '60',
  bound: '> 0',
  liveApply,
  changeVia: 'config-commit / config-apply',
  uiBinding: `console:settings/${surface}`,
  summary: `${key}.`,
  editable,
});

function governed(dualControlRequired: boolean) {
  return {
    version: 12,
    surfaces: ['admin_endpoint', 'identity', 'maintenance', 'observability'],
    dualControlRequired,
    sectionValues: null,
    identity: {
      admins: [{ identity: 'sha512:ab12', roles: ['securityadmin'], clearance: 'secret' }],
      ssoGroupRoles: [{ group: 'soc-admins', roles: ['tenantadmin'] }],
    },
    rows: [
      row('maintenance.cadence_secs', 'maintenance', 'knob', '120', 'live (the engine)', true),
      row(
        'admin_endpoint.max_payload_bytes',
        'admin_endpoint',
        'knob',
        '262144',
        'boot-bound (the admin plane reads it at start)',
        false,
      ),
      row(
        'identity.admins',
        'identity',
        'section',
        'sha512:ab12=[SecurityAdmin]@Secret',
        'boot-bound (the admin plane reads it at start)',
        false,
      ),
      row(
        'identity.sso_group_roles',
        'identity',
        'section',
        'soc-admins=[TenantAdmin]',
        'boot-bound (the admin plane reads it at start)',
        false,
      ),
      row('observability.trace_sample_permille', 'observability', 'knob', '100', 'live (x)', true),
    ],
  };
}

const SOC = {
  version: 12,
  tiers: { pLowMilli: 200, pHighMilli: 800 },
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
  registry: [],
};

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
    identitiesBound: 1,
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

const COMMITTED = {
  version: 13,
  needsRestart: [],
  dualControlRequired: false,
  refusedEdits: [],
  violations: [],
  refused: false,
  explanation: null,
  proposal: null,
  approvalRefused: null,
};

/** Every BFF route the Settings surface may call (the no-stub sweep's allow-list). */
const SETTINGS_ROUTES = [
  /\/api\/settings$/,
  /\/api\/settings\/soc$/,
  /\/api\/settings\/console-rbac$/,
  /\/api\/settings\/reports\?names=[a-z_,]+$/,
  /\/api\/settings\/security-session$/,
  /\/api\/settings\/propose$/,
  /\/api\/settings\/approvals$/,
  /\/api\/settings\/approvals\/[0-9]+\/approve$/,
  /\/api\/settings\/history(\?limit=[0-9]+)?$/,
  /\/api\/settings\/rollback$/,
  /\/api\/idam\/connectors$/,
];

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Mocked {
  readonly posts: Array<{ url: string; body: unknown }>;
  readonly unknown: string[];
}

/**
 * Mock the BFF for Settings. `tierBelow` answers every engine-gated read with the BFF's 403;
 * `dualControl` sets the committed governance. Any /api request outside SETTINGS_ROUTES (other than
 * the shell's own Overview / SOC reads) is recorded as unknown, so the sweep can fail on it.
 */
async function mockBff(
  page: Page,
  opts: { dualControl?: boolean; tierBelow?: boolean } = {},
): Promise<Mocked> {
  const posts: Array<{ url: string; body: unknown }> = [];
  const unknown: string[] = [];
  const pending: unknown[] = [];
  const refusedTier = { error: 'refused', class: 'Tier' };
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const known = SETTINGS_ROUTES.some((r) => r.test(path));
    if (!known) {
      if (!/\/api\/(overview|soc)\//.test(path)) unknown.push(path);
      return json(route, {}, 404);
    }
    const method = route.request().method();
    if (method === 'POST') {
      posts.push({ url: path, body: route.request().postDataJSON() as unknown });
      if (path.endsWith('/propose')) {
        pending.push({
          proposal: 7,
          proposer: 'console:me',
          proposedAtMs: 1_700_000_000_000,
          changedKeys: ['maintenance.cadence_secs'],
          stale: false,
        });
        return json(route, {
          proposal: 7,
          refusedEdits: [],
          violations: [],
          refused: false,
          explanation: null,
        });
      }
      if (/\/approve$/.test(path)) {
        pending.length = 0;
      }
      return json(route, COMMITTED);
    }
    if (opts.tierBelow && !/idam|security-session/.test(path)) {
      return json(route, refusedTier, 403);
    }
    if (path === '/api/settings') return json(route, governed(opts.dualControl ?? false));
    if (path.endsWith('/soc')) return json(route, SOC);
    if (path.endsWith('/console-rbac')) {
      return json(route, {
        groupRoles: [{ key: 'fc-admins', role: 'global-admin', tenant: null }],
        localRbac: [],
        defaultTenant: 't1',
      });
    }
    if (path.includes('/reports')) return json(route, REPORTS);
    if (path.endsWith('/security-session')) {
      return json(route, { status: 'negotiated', group: 'X25519MLKEM768' });
    }
    if (path.endsWith('/approvals')) return json(route, { proposals: pending });
    if (path.includes('/history')) {
      return json(route, {
        versions: [
          {
            version: 12,
            principal: 'console:me',
            atMs: 1_700_000_000_000,
            changedKeys: ['maintenance.cadence_secs'],
          },
          { version: 9, principal: 'soc-capstone', atMs: 1_600_000_000_000, changedKeys: [] },
        ],
        complete: true,
      });
    }
    return json(route, []); // idam connectors
  });
  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  return { posts, unknown };
}

test('commit a knob within 3 clicks of the Overview, behind a confirm, with the engine receipt', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/');
  // Click 1: Settings. Click 2: Configuration. Click 3: Edit.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('tab', { name: 'Configuration' }).click();
  await page.getByTestId('settings-surface-picker').selectOption('maintenance');
  await page.getByRole('button', { name: 'Edit maintenance.cadence_secs' }).click();
  await page.getByLabel('New value for maintenance.cadence_secs').fill('300');
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Commit 1 change' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('maintenance.cadence_secs: 120 -> 300');
  expect(bff.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await expect(page.getByTestId('settings-configuration-receipt')).toContainText(
    'Committed at version 13',
  );
  expect(bff.posts).toEqual([
    { url: '/api/settings', body: { edits: [{ key: 'maintenance.cadence_secs', value: '300' }] } },
  ]);

  // A boot-bound value carries no control.
  await page.getByTestId('settings-surface-picker').selectOption('admin_endpoint');
  await expect(
    page.getByRole('button', { name: 'Edit admin_endpoint.max_payload_bytes' }),
  ).toHaveCount(0);
});

test('under dual control the edit is a proposal a different Admin approves on the Changes tab', async ({
  page,
}) => {
  const bff = await mockBff(page, { dualControl: true });
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Configuration' }).click();
  await page.getByTestId('settings-surface-picker').selectOption('maintenance');
  await page.getByRole('button', { name: 'Edit maintenance.cadence_secs' }).click();
  await page.getByLabel('New value for maintenance.cadence_secs').fill('300');
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Propose 1 change' }).click();
  await page.getByRole('button', { name: 'Propose', exact: true }).click();
  await expect(page.getByTestId('settings-configuration-receipt')).toContainText(
    'Proposal 7 recorded',
  );

  await page.getByRole('tab', { name: 'Changes' }).click();
  const pending = page.getByRole('table', {
    name: 'Configuration proposals awaiting a second Admin',
  });
  await expect(pending.getByText('console:me')).toBeVisible();
  await pending.getByRole('button', { name: 'Approve 7' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('You cannot approve your own proposal');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('settings-configuration-receipt')).toContainText(
    'Committed at version 13',
  );
  expect(bff.posts.map((p) => p.url)).toEqual([
    '/api/settings/propose',
    '/api/settings/approvals/7/approve',
  ]);
  const history = page.getByRole('table', {
    name: 'Committed configuration versions, newest first',
  });
  await expect(history.getByText('soc-capstone')).toBeVisible();
});

test('the no-stub sweep: every tab reads real routes, boot-bound identity is read-only, nothing is a placeholder', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/settings');
  const tabs = page.getByRole('tab');
  const names = [
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
    'ReadMe',
  ];
  // Web-first: waits for the strip to render (reading text contents directly raced the first paint).
  await expect(tabs).toHaveText(names);
  const expectations: Record<string, RegExp> = {
    SOC: /tier/i,
    Configuration: /Committed configuration at version 12/,
    RBAC: /sha512:ab12/,
    Federation: /soc-admins/,
    Changes: /soc-capstone/,
    Security: /Hybrid post-quantum \(X25519MLKEM768\)/,
    KeyLock: /1 d/,
    Observability: /0\.0\.0\.0:4317/,
    'HA & Topology': /every 120 s/,
    'FIPS Mode': /aws-lc-rs/,
    ReadMe: /ForgeCentral Configuration Guide/,
  };
  for (const name of names) {
    await page.getByRole('tab', { name, exact: true }).click();
    const expected = expectations[name];
    if (expected === undefined) throw new Error(`no expectation for tab ${name}`);
    await expect(page.locator('main')).toContainText(expected);
    await expect(page.locator('main')).not.toContainText(
      /lorem|placeholder|coming soon|TODO|mock/i,
    );
    if (name === 'RBAC' || name === 'Federation') {
      // Boot-bound identity: the registry's change path is stated and no edit control exists.
      await expect(page.locator('main')).toContainText('then restart the node');
      await expect(page.getByRole('button', { name: /edit|commit|propose/i })).toHaveCount(0);
    }
  }
  expect(bff.unknown).toEqual([]);
  expect(bff.posts).toEqual([]);
});

test('the ReadMe: a guide section within 3 clicks of the Overview, a deep link that survives a reload, live reference values', async ({
  page,
}) => {
  // IP-CONSOLE-11-guide GD.2 (INV-GUIDE-ADDRESSABLE, TRD-CONSOLE-11 11.5).
  const bff = await mockBff(page);
  await page.goto('/');
  // Click 1: Settings. Click 2: ReadMe. Click 3: a section in the contents.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('tab', { name: 'ReadMe' }).click();
  await page
    .getByRole('navigation', { name: 'Guide contents' })
    .getByRole('link', { name: 'Turn on two-person control for Settings', exact: true })
    .click();
  await expect(page.locator('#setc-dual')).toBeVisible();
  expect(page.url()).toMatch(/\/settings\?tab=readme#setc-dual$/);

  // The deep link survives a reload.
  await page.reload();
  await expect(page.locator('#setc-dual')).toBeVisible();

  // The Settings reference renders the engine's values, not the document's snapshot.
  await page.goto('/settings?tab=readme#ref-data');
  const cadence = page.getByRole('row', { name: /maintenance\.cadence_secs/ });
  await expect(cadence).toContainText('120');
  await expect(cadence).toContainText('Live');
  expect(bff.unknown).toEqual([]);
  expect(bff.posts).toEqual([]);
});

test('the tier below Admin / SecurityAudit is an honest empty state on every engine tab', async ({
  page,
}) => {
  await mockBff(page, { tierBelow: true });
  await page.goto('/settings');
  for (const name of ['SOC', 'Configuration', 'Changes', 'Security', 'HA & Topology']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByText('Admin or SecurityAudit tier required').first()).toBeVisible();
  }
});
