import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// IP-CONSOLE-05 P5.3: the read-only Policies surface journey in a real browser, the BFF mocked at the
// network boundary (never a live engine; the live leg + the authoring/distribute journey fold into the
// P5.N capstone). Proves the grouped-by-VTZ accordion over the real engine shape: expand a zone to its
// policy table with the 07-*.png columns; the action cell is the four-action lattice + logging the three
// levels; search narrows a complete dataset; the Create control is present-but-disabled (authoring is
// P5.4); the empty tenant is honest.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

/** A projected PolicyRow as the BFF returns it (camelCase view model). */
function policyRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    vtz: 'YouSource.Corp',
    name: 'contain-egress',
    version: '1.2.0',
    lifecycle: 'published',
    description: 'quarantine agent egress',
    rules: [
      {
        source: { kind: 'agent', selectorKind: 'exact', selectorValue: 'demo-agent' },
        destination: { kind: 'network', selectorKind: 'cidr', selectorValue: '10.8.0.0/16' },
        action: 'quarantine',
      },
    ],
    network: { protocols: ['https'], ports: '443' },
    restrictions: {
      scheduleDays: ['mon'],
      scheduleStartMinute: 540,
      scheduleEndMinute: 1020,
      activeFrom: null,
      activeUntil: 999,
      geo: [],
      tags: ['PHI'],
    },
    logging: 'full',
    appliedTo: [{ endpointCn: 'host-01.corp', agent: 'demo-agent' }],
    maxClassification: 'confidential',
    ...over,
  };
}

const zones = [
  { vtz: 'YouSource.Corp', policies: [policyRow()] },
  {
    vtz: 'YouSource.Public',
    policies: [
      policyRow({
        id: '22222222-2222-2222-2222-222222222222',
        vtz: 'YouSource.Public',
        name: 'allow-dns',
        version: '1.0.0',
        lifecycle: 'draft',
        rules: [
          {
            source: { kind: 'agent', selectorKind: 'glob', selectorValue: '*' },
            destination: { kind: 'uri', selectorKind: 'exact', selectorValue: 'dns' },
            action: 'permit',
          },
        ],
        network: { protocols: [], ports: '' },
        restrictions: {
          scheduleDays: [],
          scheduleStartMinute: null,
          scheduleEndMinute: null,
          activeFrom: null,
          activeUntil: null,
          geo: [],
          tags: [],
        },
        logging: 'off',
      }),
    ],
  },
];

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

const vtzTree = {
  zones: [
    {
      id: 'YouSource.Corp',
      name: 'YouSource.Corp',
      parent: 'YouSource',
      zoneType: 'standard',
      lifecycle: 'published',
      microSegmentation: true,
      telemetry: 'full',
      reauthIntervalHours: 8,
      ownPostures: [],
      effectivePostures: [],
      subZoneCount: 0,
    },
  ],
  truncated: false,
};

const objectCatalog = [
  {
    name: 'demo-agent',
    kind: 'agent',
    selectorKind: 'exact',
    selectorValue: 'demo-agent',
    attributes: [],
    description: '',
    tags: [],
    lifecycle: 'published',
  },
  {
    name: 'corp-subnet',
    kind: 'network',
    selectorKind: 'cidr',
    selectorValue: '10.8.0.0/16',
    attributes: [],
    description: '',
    tags: [],
    lifecycle: 'published',
  },
];

/**
 * Mock the whole BFF. `state.zones` backs the read; a create POST appends the drafted policy as the
 * engine's row so it refetches into the surface; `commands` records every audited POST.
 */
async function mockBff(
  page: Page,
  initial: Array<Record<string, unknown>> = zones,
): Promise<{ commands: Array<{ url: string; body: unknown }> }> {
  const commands: Array<{ url: string; body: unknown }> = [];
  const state = { zones: initial.map((z) => ({ ...z })) };

  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/vtz\/tree/, (route) => json(route, vtzTree));
  await page.route(/\/api\/objects$/, (route) => json(route, objectCatalog));
  await page.route(/\/api\/policies\/(edit|publish|delete)$/, (route) => {
    commands.push({
      url: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    });
    return json(route, { id: 'p-1', version: '2.0.0', lifecycle: 'published', breaking: false });
  });
  await page.route(/\/api\/policies$/, (route) => {
    if (route.request().method() === 'POST') {
      const draft = route.request().postDataJSON() as Record<string, unknown>;
      commands.push({ url: '/api/policies', body: draft });
      const vtz = String(draft['vtz']);
      const row = { id: 'p-new', version: '1.0.0', lifecycle: 'draft', ...draft };
      const group = state.zones.find((z) => z['vtz'] === vtz) as
        { vtz: string; policies: Record<string, unknown>[] } | undefined;
      if (group) group.policies.push(row);
      else state.zones.push({ vtz, policies: [row] });
      return json(route, { id: 'p-new', version: '1.0.0', lifecycle: 'draft', breaking: false });
    }
    return json(route, state.zones);
  });

  return { commands };
}

test('the Policies journey: VTZ-grouped accordions expand to the real policy table', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/policies');

  await expect(
    page.getByRole('heading', { level: 2, name: 'Policies', exact: true }),
  ).toBeVisible();

  // Grouped by VTZ, collapsed by default: the toggles carry the zone + count, the table is not yet shown.
  const corp = page.getByRole('button', { name: 'YouSource.Corp, 1 policy' });
  await expect(corp).toBeVisible();
  await expect(page.getByRole('button', { name: 'YouSource.Public, 1 policy' })).toBeVisible();
  await expect(page.getByText('contain-egress')).toHaveCount(0);

  // 1 click: expand the Corp zone to its policy table with the 07 columns off the engine record.
  await corp.click();
  await expect(page.getByText('contain-egress')).toBeVisible();
  await expect(page.getByText('v1.2.0')).toBeVisible();
  await expect(page.getByText('Quarantine')).toBeVisible();
  await expect(page.getByText('Full')).toBeVisible();
  await expect(page.getByText('agent:demo-agent -> network:10.8.0.0/16')).toBeVisible();
  await expect(page.getByText('HTTPS 443')).toBeVisible();
  for (const header of [
    'Name',
    'Scope',
    'Protocol / Ports',
    'Action',
    'Restrictions',
    'Logging',
    'Status',
  ]) {
    await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  }

  // The Create control is live (authoring, P5.4).
  await expect(page.getByRole('button', { name: '+ Create Policy' })).toBeEnabled();

  // Search narrows a complete dataset and opens the matching group in place.
  await page.getByRole('searchbox', { name: 'Search policies' }).fill('allow-dns');
  await expect(page.getByText('allow-dns')).toBeVisible();
  await expect(page.getByText('Permit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'YouSource.Corp, 1 policy' })).toHaveCount(0);
});

test('Create authors a policy through the audited route and it appears as the engine row (P5.4)', async ({
  page,
}) => {
  const bff = await mockBff(page, []);
  await page.goto('/policies');

  await page.getByRole('button', { name: '+ Create Policy' }).click();
  const form = page.getByRole('form', { name: 'Create a policy' });
  await expect(form).toBeVisible();

  await form.getByLabel('Policy Name').fill('contain-egress');
  await form.getByLabel('Zone').selectOption('YouSource.Corp');
  // Subjects + Targets are real objects from the catalog; the policy authors the cross-product ruleset.
  await form.getByLabel('Subjects').selectOption('demo-agent');
  await form.getByLabel('Targets').selectOption('10.8.0.0/16');
  await form.getByLabel('Action').selectOption('quarantine');
  await form.getByLabel('Logging Level').selectOption('full');
  // The Action control offers exactly the four lattice actions.
  expect(await form.getByLabel('Action').locator('option').allTextContents()).toEqual([
    'Permit',
    'Monitor',
    'Quarantine',
    'Deny',
  ]);

  await form.getByRole('button', { name: 'Save as Draft' }).click();

  // The audited create fired with the built ruleset, and the draft refetches into the surface.
  await expect(page.getByRole('button', { name: 'YouSource.Corp, 1 policy' })).toBeVisible();
  const created = bff.commands.find((c) => c.url === '/api/policies')?.body as {
    name: string;
    rules: { action: string }[];
  };
  expect(created.name).toBe('contain-egress');
  expect(created.rules[0]?.action).toBe('quarantine');
});

test('Delete removes a policy through a critical confirm gate', async ({ page }) => {
  const bff = await mockBff(page);
  await page.goto('/policies');
  await page.getByRole('button', { name: 'YouSource.Corp, 1 policy' }).click();
  await page
    .getByRole('row', { name: /contain-egress/ })
    .getByRole('button', { name: 'Delete' })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => bff.commands.some((c) => c.url === '/api/policies/delete')).toBe(true);
});

test('an empty tenant renders the honest empty state, never a fabricated policy', async ({
  page,
}) => {
  await mockBff(page, []);
  await page.goto('/policies');
  await expect(page.getByText('No policies match')).toBeVisible();
  await expect(page.getByText('No policies have been authored yet.')).toBeVisible();
});
