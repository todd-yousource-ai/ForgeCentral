import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// O1.6b (INV-CONSOLE-3-CLICKS): the Overview select-then-act journey in a real browser, the BFF mocked at
// the network boundary (never a live engine). Proves the two operator tasks end to end -- (1) container ->
// member -> inspect (and back), and (2) container -> agent -> Isolate -> confirm -> audited receipt --
// each reached in <= 3 clicks from the Overview graph.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

const GRAPH = {
  sources: [
    { class: 'users', count: 515 },
    { class: 'devices', count: 47 },
    { class: 'agents', count: 3 },
  ],
  vtzs: [{ id: 'vpubag', name: 'Demo.Public.Agent', profile: 'observe', risk: band('red') }],
  destinations: [
    { class: 'network', count: 101, apps: [], moreCount: 101 },
    { class: 'saas', count: 323, apps: [], moreCount: 323 },
    { class: 'private-apps', count: 52, apps: [], moreCount: 52 },
    { class: 'data-stores', count: 18, apps: [], moreCount: 18 },
  ],
  sourceEdges: [{ sourceClass: 'agents', vtzId: 'vpubag', weight: 2 }],
  destEdges: [{ vtzId: 'vpubag', destClass: 'network', weight: 12 }],
  truncated: false,
};

const MEMBERS = {
  members: [
    { id: 'aig:agent:codex', kind: 'agent_instance', name: 'Codex', connectionCount: 5 },
    { id: 'aig:agent:claude', kind: 'agent_instance', name: 'Claude', connectionCount: 2 },
  ],
};

const ENTITY = {
  ref: { kind: 'principal', id: 'aig:agent:codex' },
  header: { status: 'ok', data: { displayName: 'Codex', kindLabel: 'Agent', status: 'active' } },
  info: { status: 'ok', data: { role: 'operator', clearance: 'secret', enrolledAt: 1, tags: [] } },
  zones: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  capabilities: { status: 'pending', owningRepo: 'torch', gatingTask: 'x' },
  effectivePolicies: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  recentDecisions: { status: 'empty' },
};

const CONNECTIONS = {
  connections: [{ destinationId: '93.184.216.34:443', destinationKind: 'network', observedAt: 1 }],
};

function band(level: 'green' | 'yellow' | 'red') {
  return { level, escalate: level === 'red' ? 1 : 0, candidate: 0, observe: 0 };
}

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Mock the whole BFF for the Overview journey. Disjoint matchers; the isolate route is registered after
 *  the entity route so it wins for the `/isolate` POST (Playwright's last-registered match takes precedence).
 *  `state.graph` is mutable so a test can seed a change and let the O1.7 live poll pick it up in place. */
async function mockBff(page: Page): Promise<{ state: { graph: typeof GRAPH } }> {
  const state = { graph: GRAPH };
  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/overview\/sankey/, (route) => json(route, state.graph));
  await page.route(/\/api\/overview\/members/, (route) => json(route, MEMBERS));
  await page.route(/\/api\/overview\/entity-connections/, (route) => json(route, CONNECTIONS));
  await page.route(/\/api\/entity\//, (route) => json(route, ENTITY));
  await page.route(/\/api\/entity\/.*\/isolate$/, (route) =>
    json(route, { posture: 'quarantine', enforcementActive: false, summary: 'recorded' }),
  );
  return { state };
}

test('task 1: container -> member -> inspect, then back to the list (<= 3 clicks)', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/');

  // The Overview graph renders live.
  await expect(page.getByRole('img', { name: /Connectivity flow/ })).toBeVisible();

  // Click 1: the AI Agents source ring -> the drawer lists the container's members.
  await page.locator('.fc-ov__ring--agents').click({ force: true });
  const list = page.getByRole('dialog', { name: 'AI Agents' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button', { name: /Codex/ })).toBeVisible();

  // Click 2: a member -> the drawer swaps to that entity's live detail + its live connections (O1.6a).
  await list.getByRole('button', { name: /Codex/ }).click();
  const detail = page.getByRole('dialog', { name: 'Codex' });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Connections')).toBeVisible();
  await expect(detail.getByText('93.184.216.34:443')).toBeVisible();

  // Back returns to the container list (the drawer stays open, never closes).
  await detail.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('dialog', { name: 'AI Agents' })).toBeVisible();
});

test('task 2: container -> agent -> Isolate -> confirm -> audited receipt (<= 3 clicks)', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Connectivity flow/ })).toBeVisible();

  // Click 1: container. Click 2: the agent member. Click 3: Isolate.
  await page.locator('.fc-ov__ring--agents').click({ force: true });
  await page
    .getByRole('dialog', { name: 'AI Agents' })
    .getByRole('button', { name: /Codex/ })
    .click();
  const detail = page.getByRole('dialog', { name: 'Codex' });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Isolate from network' }).click();

  // The audited confirm gate appears (enforcement OFF, said honestly); confirming shows the receipt.
  const confirm = page.getByRole('alertdialog', { name: /Isolate from network\?/ });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(/Live enforcement is OFF/);
  await confirm.getByRole('button', { name: 'Isolate' }).click();
  await expect(page.getByText(/Isolation recorded/)).toBeVisible();
});

test('O1.7: the live poll updates the graph in place, showing a real Live badge', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/');
  // The poll is real, so the surface shows a live badge (not a fabricated pill). The graph's accessible
  // name enumerates the AI Agents count (3) -- a robust, color-free assertion.
  await expect(page.locator('.fcx-surface__header').getByText('Live')).toBeVisible();
  await expect(page.getByRole('img', { name: /AI AGENTS 3/ })).toBeVisible();

  // Seed a newer graph; the 2 s live poll refetches and the count updates IN PLACE (no reload, no wipe).
  bff.state.graph = {
    ...GRAPH,
    sources: [
      { class: 'users', count: 515 },
      { class: 'devices', count: 47 },
      { class: 'agents', count: 9 },
    ],
  };
  await expect(page.getByRole('img', { name: /AI AGENTS 9/ })).toBeVisible({ timeout: 8000 });
});
