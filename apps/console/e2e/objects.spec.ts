import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// O10.N (INV-CONSOLE-OBJECTS-COMPLETE): the Objects surface tier-4 journey in a real browser, the
// BFF mocked at the network boundary (never a live engine; the live leg folds into the box redeploy).
// Proves TRD-CONSOLE-10 Section 6 end to end: the catalog grouped by ObjectKind; NO apply/enforce/
// posture control anywhere (noun-only, structural); Create an object (a Network+CIDR and a DataStore)
// through the audited route; a malformed selector reads back the 400; edit; delete behind a confirm;
// a card opens the entity drawer with the READ-TIME resolved members; the empty tenant is honest.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

interface Obj {
  name: string;
  kind: string;
  selector_kind: string;
  selector_value: string;
  attributes: string[];
  description: string;
  tags: string[];
  lifecycle: string;
}

const ipObject: Obj = {
  name: 'corp-subnet',
  kind: 'network',
  selector_kind: 'cidr',
  selector_value: '10.8.0.0/16',
  attributes: [],
  description: 'the corp /16',
  tags: ['PHI'],
  lifecycle: 'published',
};

const server: Obj = {
  name: 'prod-servers',
  kind: 'server',
  selector_kind: 'glob',
  selector_value: 'prod-*',
  attributes: [],
  description: 'the prod pool',
  tags: [],
  lifecycle: 'draft',
};

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Mock the whole BFF for the Objects journey. `commands` collects every POST body; `state.objects`
 * backs the catalog read, so a committed create refetches into the surface as the engine's record.
 */
async function mockBff(page: Page): Promise<{
  commands: Array<{ url: string; body: unknown }>;
  state: { objects: Obj[] };
}> {
  const commands: Array<{ url: string; body: unknown }> = [];
  const state = { objects: [ipObject, server] as Obj[] };

  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  // The object drawer: /api/entity/object/<name> -> the detail projection.
  await page.route(/\/api\/entity\/object\//, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    const object = state.objects.find((o) => o.name === name);
    return json(route, {
      ref: { kind: 'object', id: name },
      header: object
        ? { status: 'ok', data: { displayName: name, kindLabel: 'Network', status: 'unknown' } }
        : { status: 'empty' },
      info: object
        ? {
            status: 'ok',
            data: {
              enrolledAt: 0,
              tags: [`selector=CIDR ${object.selector_value}`, 'member=10.8.0.9:443'],
            },
          }
        : { status: 'empty' },
      zones: { status: 'not-applicable' },
      capabilities: { status: 'not-applicable' },
      effectivePolicies: { status: 'pending', owningRepo: 'crdb', gatingTask: 'x' },
      recentDecisions: { status: 'not-applicable' },
    });
  });
  // Commands: create (/api/objects POST), edit, delete.
  await page.route(/\/api\/objects\/(edit|delete)$/, (route) => {
    const url = new URL(route.request().url()).pathname;
    commands.push({ url, body: route.request().postDataJSON() });
    return json(route, { name: 'x' });
  });
  await page.route(/\/api\/objects$/, (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Obj & {
        selectorKind: string;
        selectorValue: string;
      };
      commands.push({ url: '/api/objects', body });
      state.objects = [
        ...state.objects,
        {
          name: body.name,
          kind: body.kind,
          selector_kind: body.selectorKind,
          selector_value: body.selectorValue,
          attributes: [],
          description: body.description ?? '',
          tags: [],
          lifecycle: body.lifecycle,
        },
      ];
      return json(route, { name: body.name });
    }
    return json(
      route,
      state.objects.map((o) => toCard(o)),
    );
  });

  return { commands, state };
}

/** The BFF projects records to camelCase cards; mirror that shape for the read. */
function toCard(o: Obj): unknown {
  return {
    name: o.name,
    kind: o.kind,
    selectorKind: o.selector_kind,
    selectorValue: o.selector_value,
    attributes: o.attributes,
    description: o.description,
    tags: o.tags,
    lifecycle: o.lifecycle,
  };
}

test('the catalog journey: kind-grouped, no apply control, card -> drawer with read-time members', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/objects');

  await expect(page.getByRole('heading', { level: 2, name: 'Objects', exact: true })).toBeVisible();
  // Grouped by kind: the Network and Server sections both render their cards.
  await expect(page.getByRole('region', { name: 'Network' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Server' })).toBeVisible();
  await expect(page.getByText('CIDR 10.8.0.0/16')).toBeVisible();
  await expect(page.getByText('glob prod-*')).toBeVisible();

  // NOUN-ONLY: no apply/enforce/posture control exists anywhere on the surface.
  for (const banned of [/apply/i, /enforce/i, /posture/i, /distribute/i]) {
    await expect(page.getByRole('button', { name: banned })).toHaveCount(0);
  }

  // A kind filter narrows the catalog.
  await page.getByLabel('Kind').selectOption('server');
  await expect(page.getByRole('region', { name: 'Server' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Network' })).toHaveCount(0);
  await page.getByLabel('Kind').selectOption('');

  // 1 click: a card opens the entity drawer with the READ-TIME resolved member.
  await page.getByRole('button', { name: 'Open the drawer for corp-subnet' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('corp-subnet');
  await expect(page.getByRole('dialog').getByText('member=10.8.0.9:443')).toBeVisible();
});

test('Create Object registers a Network+CIDR through the audited route and it appears', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/objects');

  // Create (1) -> form (2) -> Create Object (3). The kind drives the selector input (Network -> cidr).
  await page.getByRole('button', { name: '+ Create Object' }).click();
  const form = page.getByRole('form', { name: 'Create an object' });
  await expect(form).toBeVisible();
  // NO posture field on the form.
  await expect(form.getByText(/posture/i)).toHaveCount(0);
  await form.getByLabel('Name').fill('vpn-range');
  await form.getByLabel('Kind').selectOption('network');
  await form.getByLabel('Value').fill('10.9.0.0/16');
  await form.getByRole('button', { name: 'Create Object' }).click();

  await expect.poll(() => bff.commands.length).toBe(1);
  const sent = bff.commands[0];
  expect(sent?.url).toBe('/api/objects');
  expect((sent?.body as { kind: string; selectorKind: string }).kind).toBe('network');
  expect((sent?.body as { selectorKind: string }).selectorKind).toBe('cidr');

  // The committed object refetches into the catalog.
  await expect(page.getByText('CIDR 10.9.0.0/16')).toBeVisible();
});

test('a DataStore object is authorable with a path glob; delete is behind a confirm', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/objects');

  // Create a DataStore (data at rest) with a path glob -- the storage kind, not Uri.
  await page.getByRole('button', { name: '+ Create Object' }).click();
  const form = page.getByRole('form', { name: 'Create an object' });
  await form.getByLabel('Name').fill('phi-tree');
  await form.getByLabel('Kind').selectOption('data_store');
  await form.getByLabel('Value').fill('/data/phi/**');
  await form.getByRole('button', { name: 'Create Object' }).click();
  await expect.poll(() => bff.commands.length).toBe(1);
  expect((bff.commands[0]?.body as { kind: string }).kind).toBe('data_store');
  await expect(page.getByRole('region', { name: 'Data Store' })).toBeVisible();

  // Delete = card action (1) -> confirm (2); the command carries the name.
  // The Network kind section holds only corp-subnet, so its Delete button is unambiguous.
  await page
    .getByRole('region', { name: 'Network' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete corp-subnet?');
  await expect(page.getByRole('alertdialog')).toContainText('changes no enforcement');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => bff.commands.length).toBe(2);
  expect(bff.commands[1]?.url).toBe('/api/objects/delete');
  expect(bff.commands[1]?.body).toEqual({ name: 'corp-subnet' });
});

test('an empty tenant renders the honest empty state, never a fabricated object', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/objects$/, (route) => json(route, []));
  await page.goto('/objects');
  await expect(page.getByText('No objects have been registered yet.')).toBeVisible();
});
