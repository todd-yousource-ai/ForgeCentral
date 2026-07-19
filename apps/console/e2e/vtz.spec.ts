import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// IP-CONSOLE-02 V2.N (INV-CONSOLE-VTZ-COMPLETE): the Virtual Trust Zones journey in a real browser, the
// BFF mocked at the network boundary (never a live engine). Proves the `TRD-CONSOLE-02` Section 8
// acceptance rows end to end:
//   * the tree, postures and sub-zone counts come from the store; nothing is fabricated, and a fixtureless
//     tenant renders only its seeded root zone;
//   * tighten-only inheritance is shown correctly and the read-only catastrophic floor cannot be edited;
//   * create / edit / re-scope / delete commit through the audited path, confirm-gated, and a refusal is
//     surfaced honestly rather than silently accepted;
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
}

/** Mock the whole BFF for the VTZ journey. `state` is mutable so a test can script a refusal. */
async function mockBff(page: Page): Promise<BffState> {
  const state: BffState = {
    tree: TREE,
    mutation: { status: 200, body: { id: 'YouSource.Corp.Finance', lifecycle: 'published' } },
    sent: [],
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

test('the editor shows tighten-only inheritance and will not let the floor be edited away', async ({
  page,
}) => {
  await mockBff(page);
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();

  await expect(page.getByText(/Inherits from YouSource.Corp/)).toBeVisible();

  // The two catastrophic-floor domains offer NO control at all, and say why.
  await expect(page.getByText('Locked: catastrophic floor')).toHaveCount(2);
  await expect(page.getByLabel('Posture for governed-egress')).toHaveCount(0);
  await expect(page.getByLabel('Posture for execution')).toHaveCount(0);

  // The zone set ordinary-network laxer than its parent; the effective column shows the ancestor won.
  await expect(page.getByText('Tightened by an ancestor')).toBeVisible();
  const control = page.getByLabel('Posture for ordinary-network');
  await expect(control).toHaveValue('permit-deny-risky');
  // Relaxing it further still cannot produce a relaxed effective posture.
  await control.selectOption('permit-deny-risky');
  await expect(page.getByText('Tightened by an ancestor')).toBeVisible();
});

test('an edit commits through the audited path only after an explicit confirm', async ({
  page,
}) => {
  const state = await mockBff(page);
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();
  await expect(page.getByLabel('Posture for ipc')).toBeVisible();

  await page.getByLabel('Posture for ipc').selectOption('deny');
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
  const spec = state.sent[0]?.body as { ownPostures: { domain: string; posture: string }[] };
  expect(spec.ownPostures.find((p) => p.domain === 'ipc')?.posture).toBe('deny');
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
  await expect(alert).toContainText('read-only catastrophic floor');
  await expect(alert).toContainText('Nothing was committed.');
});

test('a re-scope and a delete are separate audited acts, each separately confirmed', async ({
  page,
}) => {
  const state = await mockBff(page);
  await page.goto('/vtz');
  await page.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }).click();
  await expect(page.getByLabel('Re-scope (move) to')).toBeVisible();

  // A rename is the engine's RESCOPE verb, not an edit of the name field.
  await page.getByLabel('Re-scope (move) to').fill('YouSource.Ops.Finance');
  await page.getByRole('button', { name: 'Re-scope' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'Move YouSource.Corp.Finance to YouSource.Ops.Finance?',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Commit' }).click();
  await expect.poll(() => state.sent.length).toBe(1);
  expect(state.sent[0]?.url).toBe('/api/vtz/YouSource.Corp.Finance/rescope');
  expect(state.sent[0]?.body).toEqual({ newName: 'YouSource.Ops.Finance' });

  // Delete is its own confirm, marked destructive, and names the rule the engine will apply.
  await page.getByRole('button', { name: 'Delete zone' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('refuses to delete a zone that still has sub-zones');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => state.sent.length).toBe(2);
  expect(state.sent[1]?.method).toBe('DELETE');
});

test('a new zone is authored from a real parent posture matrix and committed on confirm', async ({
  page,
}) => {
  const state = await mockBff(page);
  state.mutation = { status: 200, body: { id: 'YouSource.Corp.New', lifecycle: 'draft' } };
  await page.goto('/vtz');
  await expect(page.getByRole('button', { name: 'New zone' })).toBeEnabled();

  await page.getByRole('button', { name: 'New zone' }).click();
  await expect(page.getByLabel('Parent zone')).toBeVisible();
  // The matrix seeds from the chosen parent's real effective postures, never a hardcoded default.
  await expect(page.getByText('Locked: catastrophic floor')).toHaveCount(2);

  await page.getByLabel('Zone name').fill('YouSource.Corp.New');
  await page.getByRole('button', { name: 'Create zone' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Create YouSource.Corp.New?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Commit' }).click();

  await expect.poll(() => state.sent.length).toBe(1);
  expect(state.sent[0]?.method).toBe('POST');
  expect(state.sent[0]?.url).toBe('/api/vtz');
  expect((state.sent[0]?.body as { name: string }).name).toBe('YouSource.Corp.New');
});
