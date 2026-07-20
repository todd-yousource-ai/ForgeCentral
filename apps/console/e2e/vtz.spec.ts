import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// IP-CONSOLE-02 V2.N (INV-CONSOLE-VTZ-COMPLETE): the Virtual Trust Zones journey in a real browser, the
// BFF mocked at the network boundary (never a live engine). Proves the `TRD-CONSOLE-02` Section 8
// acceptance rows end to end:
//   * the tree, postures and sub-zone counts come from the store; nothing is fabricated, and a fixtureless
//     tenant renders only its seeded root zone;
//   * tighten-only inheritance is shown correctly and the read-only catastrophic floor cannot be edited;
//   * create / save (settings, and the move when the parent changes) / delete commit through the audited
//     path, confirm-gated, and a refusal is surfaced honestly rather than silently accepted;
//   * a VTZ ring on the Overview graph lands on that zone inside the 3-click budget;
//   * NO trust score is shown anywhere.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

/** The engine's eleven-domain matrix; `network` varies so own and effective can differ. */
function postures(network: 'deny' | 'permit-deny-risky' = 'permit-deny-risky') {
  return [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'privilege-escalation', posture: 'deny', floor: false },
    { domain: 'kernel-module', posture: 'deny', floor: false },
    { domain: 'credential-store', posture: 'deny', floor: false },
    { domain: 'persistence', posture: 'permit-deny-risky', floor: false },
    { domain: 'ordinary-network', posture: network, floor: false },
    { domain: 'file-and-config', posture: 'permit-deny-risky', floor: false },
    { domain: 'memory', posture: 'permit-deny-risky', floor: false },
    { domain: 'ipc', posture: 'permit-deny-risky', floor: false },
    { domain: 'device', posture: 'permit-deny-risky', floor: false },
  ];
}

function zone(over: Record<string, unknown> = {}) {
  return {
    id: 'YouSource.Corp.Finance',
    name: 'YouSource.Corp.Finance',
    parent: 'YouSource.Corp',
    zoneType: 'standard',
    lifecycle: 'published',
    microSegmentation: true,
    telemetry: 'full',
    reauthIntervalHours: 8,
    ownPostures: postures(),
    // The parent denies ordinary-network, so the effective value is tightened.
    effectivePostures: postures('deny'),
    subZoneCount: 2,
    ...over,
  };
}

const ROOT = zone({
  id: 'YouSource.Corp',
  name: 'YouSource.Corp',
  parent: null,
  subZoneCount: 1,
  ownPostures: postures('deny'),
  effectivePostures: postures('deny'),
});

const TREE = { zones: [ROOT, zone()], truncated: false };

/** A LEAF zone: the engine only moves a zone with no descendants, so re-parenting needs one. */
const LEAF = zone({
  id: 'YouSource.Corp.Sales',
  name: 'YouSource.Corp.Sales',
  parent: 'YouSource.Corp',
  subZoneCount: 0,
});

/** The connectivity graph, which the grid joins per-VTZ risk bands from (`vtz.riskBand`). */
const GRAPH = {
  sources: [{ class: 'agents', count: 2 }],
  vtzs: [
    {
      id: 'YouSource.Corp.Finance',
      name: 'YouSource.Corp.Finance',
      profile: 'observe',
      risk: { level: 'red', escalate: 3, candidate: 0, observe: 0 },
    },
  ],
  destinations: [{ class: 'network', count: 4, apps: [], moreCount: 4 }],
  sourceEdges: [{ sourceClass: 'agents', vtzId: 'YouSource.Corp.Finance', weight: 2 }],
  destEdges: [{ vtzId: 'YouSource.Corp.Finance', destClass: 'network', weight: 4 }],
  truncated: false,
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

interface BffState {
  tree: typeof TREE;
  /** Scripted response for the next mutation: 200 with a result, or a refusal status + body. */
  mutation: { status: number; body: unknown };
  /** Every authoring request the surface actually sent. */
  sent: { url: string; method: string; body: unknown }[];
  /** The scripted convergence a zone's distribution panel reads. */
  convergence: unknown;
  /** Every distribute (re-push) the surface actually sent. */
  distributed: { url: string; body: unknown }[];
}

/** Mock the whole BFF for the VTZ journey. `state` is mutable so a test can script a refusal. */
async function mockBff(page: Page): Promise<BffState> {
  const state: BffState = {
    tree: TREE,
    mutation: { status: 200, body: { id: 'YouSource.Corp.Finance', lifecycle: 'published' } },
    sent: [],
    convergence: {
      hasBundle: true,
      version: 7,
      members: [
        { endpointCn: 'a.box', state: 'applied', reason: null },
        { endpointCn: 'b.box', state: 'rejected', reason: 'SignatureInvalid' },
        { endpointCn: 'c.box', state: 'silent', reason: null },
      ],
    },
    distributed: [],
  };
  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/overview\/sankey/, (route) => json(route, GRAPH));
  await page.route(/\/api\/vtz\/tree/, (route) => json(route, state.tree));
  await page.route(/\/api\/vtz\/detail/, (route) => {
    const id = new URL(route.request().url()).searchParams.get('id') ?? '';
    const found = state.tree.zones.find((z) => z.id === id) ?? null;
    return json(route, {
      zone: found,
      ancestors: found?.parent === null ? [] : [{ id: 'YouSource.Corp', name: 'YouSource.Corp' }],
    });
  });
  // Registered last so it wins for the authoring methods (Playwright prefers the latest match).
  await page.route(/\/api\/vtz(\/[^/]+(\/rescope)?)?$/, (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fallback();
    state.sent.push({
      url: new URL(route.request().url()).pathname,
      method,
      body:
        route.request().postData() !== null
          ? JSON.parse(route.request().postData() ?? '{}')
          : undefined,
    });
    return json(route, state.mutation.body, state.mutation.status);
  });
  // FD.7c: the distribution ledger read and the re-distribute post. Registered last so they win.
  await page.route(/\/api\/vtz\/convergence/, (route) => json(route, state.convergence));
  await page.route(/\/api\/vtz\/[^/]+\/distribute$/, (route) => {
    state.distributed.push({
      url: new URL(route.request().url()).pathname,
      body: JSON.parse(route.request().postData() ?? '{}'),
    });
    return json(route, {
      version: 8,
      commitVersion: 42,
      unexpressedDomains: [],
      unexpressedFields: [],
    });
  });
  return state;
}

test('the grid renders the real zones with posture + risk and no trust score anywhere', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/vtz');

  await expect(
    page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Trust zone YouSource.Corp', exact: true }),
  ).toBeVisible();

  // The KPI row: real totals, and specifically NOT an average trust score.
  await expect(page.getByRole('region', { name: 'Total VTZs' })).toContainText('2');
  await expect(page.getByRole('region', { name: 'High-sensitivity zones' })).toBeVisible();
  await expect(page.getByRole('region', { name: /avg trust/i })).toHaveCount(0);

  // The card focal is the archetype badge + the joined risk band. Finance has detections (red ->
  // Critical); the root zone is not in the graph, so it carries NO band rather than a defaulted green.
  await expect(page.getByText('Critical')).toBeVisible();
  await expect(page.getByText('Nominal')).toHaveCount(0);

  // Member and policy counts have no engine substrate; they read as an explicit absence, never a 0.
  await expect(page.getByText('Not available')).toHaveCount(4);

  // No score, no gauge, anywhere on the surface.
  await expect(page.locator('.fc-score-ring')).toHaveCount(0);
  await expect(page.getByText(/trust score/i)).toHaveCount(0);
});

test('a fixtureless tenant renders only its seeded root zone, never a fabricated one', async ({
  page,
}) => {
  const state = await mockBff(page);
  // A clean install seeds exactly one generic fail-closed root zone.
  state.tree = { zones: [ROOT], truncated: false };
  await page.goto('/vtz');

  await expect(
    page.getByRole('button', { name: 'Trust zone YouSource.Corp', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trust zone/ })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Total VTZs' })).toContainText('1');
});

test('a VTZ ring on the Overview graph lands on that zone (<= 3 clicks)', async ({ page }) => {
  await mockBff(page);
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Connectivity flow/ })).toBeVisible();

  // Click 1: the VTZ ring itself (the pointer affordance over the graphic). An equivalent real button
  // renders in the nav alongside it, so the affordance is never mouse-only.
  await expect(
    page.getByRole('button', { name: 'Open trust zone YouSource.Corp.Finance' }),
  ).toBeAttached();
  await page.locator('.fc-ov__vtz').first().click({ force: true });

  await expect(page).toHaveURL(/\/vtz\?zone=YouSource.Corp.Finance/);
  // It lands on that zone's configuration, not a generic list.
  await expect(page.getByRole('heading', { name: 'YouSource.Corp.Finance' })).toBeVisible();
});

test('the zone configuration authors the zone, never the policy applied to it', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();

  // The seven authoring fields -- identity, nesting, operational settings. A VTZ is the policy EDGE.
  await expect(page.getByLabel('VTZ name')).toBeVisible();
  await expect(page.getByLabel('VTZ type')).toBeVisible();
  await expect(page.getByLabel('Parent VTZ (optional)')).toBeVisible();
  await expect(page.getByLabel('Description')).toBeVisible();
  await expect(page.getByLabel('Session duration (hours)')).toBeVisible();
  await expect(page.getByLabel('Telemetry mode')).toBeVisible();
  await expect(page.getByLabel('Micro-segmentation')).toBeVisible();

  // Nothing here grants or denies: no posture matrix, and the surface says where the rules live.
  await expect(page.getByText('Locked: catastrophic floor')).toHaveCount(0);
  await expect(page.getByLabel('Posture for ordinary-network')).toHaveCount(0);
  await expect(page.getByText(/authored against it on the Policies surface/)).toBeVisible();
});

test('an edit commits through the audited path only after an explicit confirm', async ({
  page,
}) => {
  const state = await mockBff(page);
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();
  await expect(page.getByLabel('Session duration (hours)')).toBeVisible();

  await page.getByLabel('Session duration (hours)').fill('12');
  await page.getByRole('button', { name: 'Save changes' }).click();

  // Nothing has been written yet.
  expect(state.sent).toHaveLength(0);
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Save changes to YouSource.Corp.Finance?');
  await expect(confirm).toContainText('audited change to the trust-zone system of record');
  await confirm.getByRole('button', { name: 'Commit' }).click();

  await expect.poll(() => state.sent.length).toBe(1);
  expect(state.sent[0]?.method).toBe('PUT');
  expect(state.sent[0]?.url).toBe('/api/vtz/YouSource.Corp.Finance');
  const spec = state.sent[0]?.body as { reauthIntervalHours: number; ownPostures: unknown[] };
  expect(spec.reauthIntervalHours).toBe(12);
  // No policy travels from this surface; the engine fail-closes every unauthored domain.
  expect(spec.ownPostures).toEqual([]);
});

test('an engine refusal is surfaced honestly, never silently accepted', async ({ page }) => {
  const state = await mockBff(page);
  // The engine refuses a spec that would relax the read-only catastrophic floor or contradict an ancestor.
  state.mutation = { status: 403, body: { error: 'refused', reason: 'denied' } };
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Commit' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('contradicts a rule the platform enforces');
  await expect(alert).toContainText('Nothing was committed.');
});

test('changing the parent moves the zone as part of Save, and delete stays its own act', async ({
  page,
}) => {
  const state = await mockBff(page);
  state.tree = { zones: [ROOT, zone(), LEAF], truncated: false };
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Sales' }).click();
  await expect(page.getByLabel('Parent VTZ (optional)')).toBeVisible();
  // Re-parenting is a field on the form, not a separate workflow.
  await expect(page.getByRole('button', { name: 'Re-scope' })).toHaveCount(0);

  await page.getByLabel('Parent VTZ (optional)').selectOption('YouSource.Corp.Finance');
  await page.getByRole('button', { name: 'Save changes' }).click();
  // One act for the operator, but the confirm still NAMES the move: it is a second audited write and it
  // changes the posture the zone inherits.
  await expect(page.getByRole('alertdialog')).toContainText(
    'Save YouSource.Corp.Sales and move it to YouSource.Corp.Finance.Sales?',
  );
  await expect(page.getByRole('alertdialog')).toContainText('separate audited write');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Commit' }).click();

  // Settings first, then the move, so the moved record carries the new settings forward.
  await expect.poll(() => state.sent.length).toBe(2);
  expect(state.sent[0]?.method).toBe('PUT');
  expect(state.sent[0]?.url).toBe('/api/vtz/YouSource.Corp.Sales');
  expect(state.sent[1]?.url).toBe('/api/vtz/YouSource.Corp.Sales/rescope');
  expect(state.sent[1]?.body).toEqual({ newName: 'YouSource.Corp.Finance.Sales' });

  // Delete remains its own confirm, marked destructive, naming the rule the engine will apply.
  await page.getByRole('button', { name: 'Delete zone' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('refuses to delete a zone that still has sub-zones');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => state.sent.length).toBe(3);
  expect(state.sent[2]?.method).toBe('DELETE');
});

test('a zone with sub-zones is not offered a move the engine would refuse', async ({ page }) => {
  await mockBff(page);
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();
  // Finance has descendants, which a move would orphan; the control states that and disables.
  await expect(page.getByLabel('Parent VTZ (optional)')).toBeDisabled();
  await expect(page.getByText(/has sub-zones, so the engine refuses to move it/)).toBeVisible();
});

test('a new zone nests under the chosen parent and commits on confirm', async ({ page }) => {
  const state = await mockBff(page);
  state.mutation = { status: 200, body: { id: 'YouSource.Corp.New', lifecycle: 'draft' } };
  await page.goto('/vtz');
  await expect(page.getByRole('button', { name: 'New zone' })).toBeEnabled();

  await page.getByRole('button', { name: 'New zone' }).click();
  await expect(page.getByLabel('Parent VTZ (optional)')).toBeVisible();

  // Parent VTZ is what nests: pick a parent, name the leaf, and the dotted name is composed.
  await page.getByLabel('Parent VTZ (optional)').selectOption('YouSource.Corp');
  await page.getByLabel('VTZ name').fill('New');
  await expect(page.getByText('YouSource.Corp.New')).toBeVisible();
  await page.getByRole('button', { name: 'Create zone' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Create YouSource.Corp.New?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Commit' }).click();

  await expect.poll(() => state.sent.length).toBe(1);
  expect(state.sent[0]?.method).toBe('POST');
  expect(state.sent[0]?.url).toBe('/api/vtz');
  expect((state.sent[0]?.body as { name: string }).name).toBe('YouSource.Corp.New');
});

test('the distribution ledger shows who has a zone policy and re-distributes to them (<= 3 clicks)', async ({
  page,
}) => {
  const state = await mockBff(page);
  await page.goto('/vtz');

  // 1 click: open the zone. Its authoring view carries the distribution ledger.
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();

  const panel = page.getByRole('region', { name: 'Policy distribution' });
  await expect(panel).toBeVisible();
  // The three states an operator must tell apart, the rejection carrying its reason.
  await expect(panel.getByText('a.box')).toBeVisible();
  await expect(panel.getByText('Applied')).toBeVisible();
  await expect(panel.getByText(/Rejected: SignatureInvalid/)).toBeVisible();
  await expect(panel.getByText('No confirmation')).toBeVisible();

  // 2 clicks: re-distribute the freshly composed policy to exactly the current scope.
  await panel.getByRole('button', { name: /Commit & re-distribute to 3 endpoints/ }).click();

  await expect.poll(() => state.distributed.length).toBe(1);
  expect(state.distributed[0]?.body).toEqual({ members: ['a.box', 'b.box', 'c.box'] });
});
