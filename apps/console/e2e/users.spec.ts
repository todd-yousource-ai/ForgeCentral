import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// UY.N (INV-CONSOLE-USERS-COMPLETE): the Users surface tier-4 journey in a real browser, the BFF
// mocked at the network boundary (never a live engine; the live leg was operator-confirmed on the
// box 2026-07-21 over crdb E1-E3). Proves TRD-CONSOLE-04 Section 6 end to end: the one table over
// every principal family (observed account / provisioned local record / AI agent); NO trust field
// anywhere; Origin replaces the deleted Override column; search + filters narrow the COMPLETE
// bounded directory; a row opens the entity drawer; lifecycle actions exist ONLY on local records
// and commit through the audited command route after an explicit confirm; Add User provisions a
// local record that appears as the ENGINE's row; the Groups cards + member path; the honest
// not-connected IDAM shell.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

const OBSERVED = {
  principalId: 'lug:local_account:posix_host%3Am1:uid:1000',
  username: 'todd',
  namespace: 'lug:identity_namespace:posix_host%3Am1',
  kind: 'human',
  status: 'active',
  origin: 'observed',
  email: '',
  org: '',
  groups: ['sudo'],
  subjectId: null,
  privileges: ['sudo_all'],
  firstSeen: 100,
};

const LOCAL = {
  principalId: 'lug:identity_subject:enterprise%3Asarah',
  username: 'sarah',
  namespace: 'enterprise',
  kind: 'human',
  status: 'active',
  origin: 'local',
  email: 'sarah.chen@yousource.test',
  org: 'YouSource Healthcare',
  groups: ['Engineering'],
  subjectId: 'enterprise:sarah',
  privileges: [],
  firstSeen: 200,
};

const AGENT = {
  principalId: 'aig:agent:patient-assistant',
  username: 'aig:agent:patient-assistant',
  namespace: 'aig',
  kind: 'agent',
  status: 'active',
  origin: 'observed',
  email: '',
  org: '',
  groups: [],
  subjectId: null,
  privileges: [],
  firstSeen: 300,
};

// A live Auth0 connector card (the ID.2 IDAM_CONNECTORS projection), exactly as the BFF emits it.
const AUTH0_CONNECTOR = {
  connectorId: 'auth0',
  displayName: 'Auth0',
  providerTenant: 'dev-6rcwumbp1tsae8me.us.auth0.com',
  state: 'healthy',
  enabled: true,
  running: false,
  lastSyncAt: 1_700_000_000_000,
  lastSyncOutcome: 'complete',
  objectsSynced: 20,
  lastError: null,
  pollIntervalSecs: 300,
  fullSyncCadenceHours: 24,
};

// A federated (IdAM-imported) Auth0 identity, as the BFF projects it (crdb DR.2 / ID.5): origin
// observed, but bound to the auth0 connector so the Origin column renders "Auth0".
const FEDERATED = {
  principalId: 'lug:external_account:idp:auth0:auth0%7C42',
  username: 'priya',
  namespace: 'idp:auth0:dev-x.us.auth0.com',
  kind: 'human',
  status: 'active',
  origin: 'observed',
  email: 'priya@corp.example',
  org: '',
  groups: ['Engineering'],
  subjectId: null,
  privileges: [],
  firstSeen: 400,
  boundConnector: 'auth0',
  bindingStatus: 'confirmed',
  ownedFields: ['email', 'org'],
};

const GROUPS = [
  {
    groupId: 'lug:local_group:posix_host%3Am1:gid:27',
    name: 'sudo',
    namespace: 'lug:identity_namespace:posix_host%3Am1',
    builtIn: true,
    memberCount: 1,
    description: '',
  },
  {
    groupId: 'lug:local_group:enterprise%3AEngineering',
    name: 'Engineering',
    namespace: 'enterprise',
    builtIn: false,
    memberCount: 3,
    description: 'Software development team',
  },
];

const ENTITY = {
  ref: { kind: 'principal', id: OBSERVED.principalId },
  header: { status: 'ok', data: { displayName: 'todd', kindLabel: 'Human', status: 'active' } },
  info: {
    status: 'ok',
    data: { enrolledAt: 100, tags: ['origin=observed', 'group=sudo', 'privilege=sudo_all'] },
  },
  zones: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  capabilities: { status: 'not-applicable' },
  effectivePolicies: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  recentDecisions: { status: 'empty' },
};

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Mock the whole BFF for the Users journey. `commands` collects every POST body so a test can
 * assert what the audited route received; `state.rows` backs the list read, so a committed create
 * refetches into the table exactly as the engine's record would.
 */
async function mockBff(page: Page): Promise<{
  commands: Array<{ url: string; body: unknown }>;
  state: { rows: unknown[]; idamConnectors: unknown[] };
}> {
  const commands: Array<{ url: string; body: unknown }> = [];
  const state = {
    rows: [OBSERVED, LOCAL, AGENT, FEDERATED] as unknown[],
    idamConnectors: [AUTH0_CONNECTOR] as unknown[],
  };

  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/entity\//, (route) => json(route, ENTITY));
  await page.route(/\/api\/idam\/connectors$/, (route) => json(route, state.idamConnectors));
  await page.route(/\/api\/idam\/sync$/, (route) => {
    commands.push({ url: '/api/idam/sync', body: route.request().postDataJSON() });
    return json(route, { provider: 'auth0' });
  });
  await page.route(/\/api\/idam\/secret$/, (route) => {
    commands.push({ url: '/api/idam/secret', body: route.request().postDataJSON() });
    return json(route, { ok: true });
  });
  await page.route(/\/api\/idam\/connect$/, (route) => {
    commands.push({ url: '/api/idam/connect', body: route.request().postDataJSON() });
    return json(route, { commitVersion: 1 });
  });
  await page.route(/\/api\/users\/groups$/, (route) => {
    if (route.request().method() === 'POST') {
      commands.push({ url: '/api/users/groups', body: route.request().postDataJSON() });
      return json(route, { commitVersion: 7 });
    }
    return json(route, GROUPS);
  });
  await page.route(/\/api\/users\/(status|edit|groups\/(edit|members))$/, (route) => {
    const url = new URL(route.request().url()).pathname;
    commands.push({ url, body: route.request().postDataJSON() });
    return json(route, { commitVersion: 8 });
  });
  await page.route(/\/api\/users$/, (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        username: string;
        kind: string;
        email: string | null;
        org: string | null;
      };
      commands.push({ url: '/api/users', body });
      // The engine's record: the next list read carries the provisioned row (origin local).
      state.rows = [
        ...state.rows,
        {
          ...LOCAL,
          principalId: `lug:identity_subject:enterprise%3A${body.username}`,
          username: body.username,
          email: body.email ?? '',
          org: body.org ?? '',
          groups: [],
          subjectId: `enterprise:${body.username}`,
        },
      ];
      return json(route, { commitVersion: 9 });
    }
    return json(route, state.rows);
  });

  return { commands, state };
}

test('the directory journey: one table over every principal family, no trust field, row -> drawer', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/users');

  // The one table over the three families the engine authorizes.
  await expect(page.getByRole('heading', { level: 2, name: 'Users', exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: /Every principal the engine authorizes/ });
  await expect(table).toBeVisible();
  await expect(table.getByText('todd', { exact: true })).toBeVisible();
  await expect(table.getByText('sarah', { exact: true })).toBeVisible();
  await expect(table.getByText('AI Agent')).toBeVisible();

  // NO trust field anywhere (the amendment is structural): no such column header exists.
  for (const banned of [/trust/i, /override/i, /score/i]) {
    await expect(table.getByRole('columnheader', { name: banned })).toHaveCount(0);
  }
  // Origin replaces Override: local, observed, and a federated identity's CONNECTOR each render.
  await expect(table.getByRole('columnheader', { name: 'Origin' })).toBeVisible();
  await expect(table.getByText('Local', { exact: true })).toBeVisible();
  // The IdAM-imported identity shows its connector (ID.5), not a bare Observed.
  await expect(table.getByText('priya', { exact: true })).toBeVisible();
  await expect(table.getByText('Auth0', { exact: true })).toBeVisible();

  // The group chips + the honest empty columns are real row data.
  await expect(table.getByText('sudo', { exact: true })).toBeVisible();
  await expect(table.getByText('sarah.chen@yousource.test')).toBeVisible();

  // Search narrows the COMPLETE bounded directory (never a fabricated subset).
  await page.getByLabel('Search users').fill('sarah');
  await expect(table.getByText('sarah', { exact: true })).toBeVisible();
  await expect(table.getByText('todd', { exact: true })).toBeHidden();
  await page.getByLabel('Search users').fill('');

  // A type filter narrows to the engine kind.
  await page.getByLabel('Type').selectOption('agent');
  await expect(table.getByText('AI Agent')).toBeVisible();
  await expect(table.getByText('sarah', { exact: true })).toBeHidden();
  await page.getByLabel('Type').selectOption('');

  // Lifecycle actions exist ONLY on the local record (the engine refuses non-local subjects).
  const localRow = page.getByRole('row', { name: /Open the entity drawer for sarah/ });
  await expect(localRow.getByRole('button', { name: 'Suspend' })).toBeVisible();
  const observedRow = page.getByRole('row', { name: /Open the entity drawer for todd/ });
  await expect(observedRow.getByRole('button', { name: 'Suspend' })).toHaveCount(0);

  // 1 click: a row opens the entity drawer with the REAL identity facts.
  await observedRow.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('todd');
  await expect(page.getByRole('dialog').getByText('privilege=sudo_all')).toBeVisible();
});

test('Add User provisions a local record through the audited route and it appears as the engine row', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/users');
  await expect(page.getByText('todd', { exact: true })).toBeVisible();

  // Add (1) -> form (2) -> Create (3). The form is the mock's MINUS the trust-override field.
  await page.getByRole('button', { name: '+ Add' }).click();
  const form = page.getByRole('form', { name: 'Add a user' });
  await expect(form).toBeVisible();
  await expect(form.getByText(/trust/i)).toHaveCount(0);
  await form.getByLabel('User Name').fill('linda');
  await form.getByLabel('Email Address').fill('linda.martinez@partner.test');
  await form.getByLabel('Organization').fill('Partner Healthcare');
  await form.getByRole('button', { name: 'Create User' }).click();

  // The audited command carried the typed draft (no trust key in the body).
  await expect.poll(() => bff.commands.length).toBe(1);
  const sent = bff.commands[0];
  expect(sent?.url).toBe('/api/users');
  expect(sent?.body).toEqual({
    username: 'linda',
    kind: 'human',
    email: 'linda.martinez@partner.test',
    org: 'Partner Healthcare',
  });

  // The committed record refetches into the table: origin Local, the ENGINE's row.
  await expect(page.getByText('linda', { exact: true })).toBeVisible();
});

test('suspend commits through the confirm gate; groups + the honest IDAM shell', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/users');

  // Suspend = row action (1) -> confirm (2); the command carries the lifecycle transition.
  await page
    .getByRole('row', { name: /Open the entity drawer for sarah/ })
    .getByRole('button', { name: 'Suspend' })
    .click();
  await expect(page.getByRole('alertdialog')).toContainText('Suspend sarah?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Commit' }).click();
  await expect.poll(() => bff.commands.length).toBe(1);
  expect(bff.commands[0]?.url).toBe('/api/users/status');
  expect(bff.commands[0]?.body).toEqual({ username: 'sarah', status: 'suspended' });

  // The Groups tab renders the real directory as cards; the member count is the engine's.
  await page.getByRole('tab', { name: 'Groups' }).click();
  await expect(page.getByText('Engineering')).toBeVisible();
  await expect(page.getByText('Software development team')).toBeVisible();
  await expect(page.getByText('built-in')).toBeVisible();

  // 1 click: a group's members = All Users narrowed to that group.
  await page.getByRole('button', { name: /Show the 3 members of Engineering/ }).click();
  await expect(page.getByRole('tab', { name: 'All Users', selected: true })).toBeVisible();
  await expect(page.getByText('sarah', { exact: true })).toBeVisible();
  await expect(page.getByText('todd', { exact: true })).toBeHidden();

  // The External IDAM tab is LIVE: the real Auth0 connector card renders engine truth -- real state,
  // real tenant, real last-sync + object count. Sync/Configure remain non-live (ID.3/ID.4).
  await page.getByRole('tab', { name: 'External IDAM' }).click();
  await expect(page.getByText('Auth0', { exact: true })).toBeVisible();
  await expect(page.getByText('dev-6rcwumbp1tsae8me.us.auth0.com')).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('2023-11-14 22:13:20')).toBeVisible();
  await expect(page.getByText('20', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configure' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sync Now' }).first()).toBeEnabled();
});

test('Sync Now runs a real audited sync through the confirm gate', async ({ page }) => {
  const bff = await mockBff(page);
  await page.goto('/users');
  await page.getByRole('tab', { name: 'External IDAM' }).click();

  // Sync Now (1) -> confirm (2): the command carries the connector's provider to the audited route.
  await page.getByRole('button', { name: 'Sync Now' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Run a federation sync for auth0?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sync' }).click();
  await expect.poll(() => bff.commands.filter((c) => c.url === '/api/idam/sync').length).toBe(1);
  expect(bff.commands.find((c) => c.url === '/api/idam/sync')?.body).toEqual({ provider: 'auth0' });
});

test('the onboarding form sends the secret to the sidecar and connectivity to the engine', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/users');
  await page.getByRole('tab', { name: 'External IDAM' }).click();

  // Configure the connector: the form collects connectivity + the secret.
  await page.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Provider Domain').fill('dev-new.us.auth0.com');
  await page.getByLabel('Client ID').fill('m2m-client');
  await page.getByLabel('Audience').fill('');
  await page.getByLabel('Client Secret').fill('super-secret-value');
  await page.getByRole('button', { name: 'Save connector' }).click();

  // The connectivity POST fires last (after the secret is placed); wait for it, then check both.
  await expect.poll(() => bff.commands.filter((c) => c.url === '/api/idam/connect').length).toBe(1);
  const secretCmd = bff.commands.find((c) => c.url === '/api/idam/secret');
  expect(secretCmd?.body).toEqual({ provider: 'auth0', secret: 'super-secret-value' });
  const connectCmd = bff.commands.find((c) => c.url === '/api/idam/connect');
  expect(connectCmd?.body).toEqual({
    provider: 'auth0',
    domain: 'dev-new.us.auth0.com',
    clientId: 'm2m-client',
    audience: '',
  });
  // The secret is NEVER in the connectivity request to the engine.
  expect(JSON.stringify(connectCmd?.body)).not.toContain('super-secret-value');
});

test('the External IDAM tab shows an honest empty when no connector is configured', async ({
  page,
}) => {
  const bff = await mockBff(page);
  bff.state.idamConnectors = [];
  await page.goto('/users');
  await page.getByRole('tab', { name: 'External IDAM' }).click();
  await expect(page.getByText('No IdAM connector configured')).toBeVisible();
});

test('an empty tenant renders the honest empty state, never a fabricated principal', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/users\/groups$/, (route) => json(route, []));
  await page.route(/\/api\/users$/, (route) => json(route, []));
  await page.goto('/users');
  await expect(
    page.getByText('No principals have been observed or provisioned yet.'),
  ).toBeVisible();
});
