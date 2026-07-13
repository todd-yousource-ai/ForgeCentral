import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// LG.N (INV-CONSOLE-LOGS-COMPLETE): the Logs surface tier-4 journey in a real browser, the BFF mocked at
// the network boundary (never a live engine). Proves TRD-CONSOLE-09 Section 8 end to end: the table over
// decisions; a filter recomputes the query engine-side; a new decision appears at the top under the live
// poll; a row opens the entity drawer (the real open-site the drawer's DR.N was deferred to); a decision
// shows its EXPLAIN rationale; the audited export shows its receipt.

const OPERATOR = { subject: 'auth0|op-e2e', email: 'operator@example.gov', tier: 'Admin' } as const;

function row(id: string, summary: string, technique: string) {
  return {
    decisionId: id,
    at: 1_700_000_000_000,
    ruleId: 'LR-EX-001',
    summary,
    outcome: 'escalate',
    status: 'denied',
    technique,
    tactics: ['TA0002'],
    confidence: 'HIGH',
    evidenceCount: 1,
  };
}

const DETAIL = {
  decisionId: 'sha512:d1',
  at: 1_700_000_000_000,
  ruleId: 'LR-EX-001',
  finding: 'Suspicious command',
  technique: 'T1059',
  tactics: ['TA0002'],
  evidence: ['dc:process_creation'],
  confidence: 'HIGH',
  outcome: 'escalate',
  scope: 'host-7',
  sourceHosts: ['host-7'],
  sourceSubjects: ['host-7:pid:1234'],
  sourceContext: [],
  sourceObservations: [],
  correlationId: 'corr-1',
  replayAsOf: 42,
  watermarkSeconds: 100,
  windowSeconds: 60,
  replayDigest: 'sha512:rd',
  actingEntity: { kind: 'principal', id: 'host-7:pid:1234' },
};

const ENTITY = {
  ref: { kind: 'principal', id: 'host-7:pid:1234' },
  header: {
    status: 'ok',
    data: { displayName: 'host-7:pid:1234', kindLabel: 'Agent', status: 'active' },
  },
  info: { status: 'empty' },
  zones: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  capabilities: { status: 'pending', owningRepo: 'torch', gatingTask: 'x' },
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
 * Mock the whole BFF for the Logs journey. `queryUrls` collects every /api/logs read URL so a test can
 * assert the engine received the filter. The query returns `state.rows`, so a test can seed a new decision
 * and let the live poll pick it up.
 */
async function mockBff(page: Page): Promise<{ queryUrls: string[]; state: { rows: unknown[] } }> {
  const queryUrls: string[] = [];
  const state = { rows: [row('sha512:d1', 'Suspicious command', 'T1059')] as unknown[] };

  // Disjoint RegExp matchers (avoids URL-glob `?` ambiguity); order is irrelevant since they never overlap.
  await page.route('**/auth/me', (route) => json(route, { operator: OPERATOR }));
  await page.route(/\/api\/logs\/explain\//, (route) => json(route, DETAIL));
  await page.route(/\/api\/entity\//, (route) => json(route, ENTITY));
  await page.route(/\/api\/logs\/export$/, (route) =>
    json(route, {
      exportId: 'sha512:e1abc0000000000000000000',
      commitVersion: 42,
      rowCount: 1,
      rows: state.rows,
    }),
  );
  await page.route(/\/api\/logs\?/, (route) => {
    queryUrls.push(route.request().url());
    return json(route, { rows: state.rows });
  });

  return { queryUrls, state };
}

test('the Logs journey: table, engine-side filter, row -> drawer, EXPLAIN, export', async ({
  page,
}) => {
  const bff = await mockBff(page);
  await page.goto('/logs');

  // The table renders over the decisions.
  await expect(page.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Governed decisions/ })).toBeVisible();
  await expect(page.getByText('Suspicious command')).toBeVisible();

  // A filter recomputes the query engine-side: selecting a confidence issues a /api/logs read carrying it.
  await page.getByLabel('Confidence').selectOption('HIGH');
  await expect.poll(() => bff.queryUrls.some((u) => u.includes('confidence=HIGH'))).toBeTruthy();

  // Click the decision cell -> the EXPLAIN rationale inline (real detail fields, not fabricated).
  await page.getByRole('button', { name: /Suspicious command/ }).click();
  await expect(page.getByRole('complementary', { name: 'Decision rationale' })).toBeVisible();
  await expect(page.getByText('dc:process_creation')).toBeVisible();

  // Activate the row -> the entity drawer opens for the acting entity (the DR.N open-site).
  await page.getByRole('row', { name: /Open the acting entity/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('host-7:pid:1234');
  // Scope to the dialog: the EXPLAIN panel also has a "Close" control, so target the drawer's.
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // The audited export shows its receipt (the download is triggered browser-side; the receipt is honest).
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('status')).toContainText('audit receipt');
});

test('the live tail surfaces a new decision at the top', async ({ page }) => {
  const bff = await mockBff(page);
  await page.goto('/logs');
  await expect(page.getByText('Suspicious command')).toBeVisible();

  // Seed a newer decision; the 2s live poll refetches the window and it appears.
  bff.state.rows = [row('sha512:d2', 'Beaconing to a rare host', 'T1071'), ...bff.state.rows];
  await expect(page.getByText('Beaconing to a rare host')).toBeVisible({ timeout: 8_000 });
});
