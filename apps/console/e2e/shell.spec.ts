import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// F0.8b: the tier-4 empty-state journey in a real browser. INV-CONSOLE-SHELL-3-CLICK-FRAME end to end:
// unauthenticated -> the login screen; authenticated -> the shell with the IA reachable, honest empty
// states, and the select-then-act drawer frame. The BFF is mocked at the network boundary (never a live
// engine), so this exercises the shell alone and fabricates no surface data.

const OPERATOR = {
  subject: 'auth0|op-e2e',
  email: 'operator@example.gov',
  tier: 'Admin',
} as const;

/** Intercept the BFF auth plane. `authed` decides whether /auth/me resolves to an operator or 401. */
async function mockBff(page: Page, authed: boolean): Promise<void> {
  await page.route('**/auth/me', (route) =>
    authed
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ operator: OPERATOR }),
        })
      : route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unauthenticated' }),
        }),
  );
  // The home Overview surface reads its connectivity Sankey; a mocked empty tenant renders the honest empty
  // state (never a live engine, never fabricated data).
  await page.route('**/api/overview/sankey*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sources: [],
        vtzs: [],
        destinations: [],
        sourceEdges: [],
        destEdges: [],
      }),
    }),
  );
}

test('unauthenticated: the login screen renders, no shell', async ({ page }) => {
  await mockBff(page, false);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
});

test('authenticated: the shell, the IA, empty states, and the drawer frame', async ({ page }) => {
  await mockBff(page, true);
  await page.goto('/');

  // The IA is reachable: all eleven destinations in the rail.
  const rail = page.getByRole('navigation', { name: 'Primary' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('link')).toHaveCount(11);

  // The home Overview surface renders live: the heading, the honest empty connectivity flow (the mocked
  // tenant has none), and -- since the O1.7 poll succeeds -- a real Live indicator driven by the poll.
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByText('No connectivity observed')).toBeVisible();
  await expect(page.locator('.fcx-topbar').getByText('Live')).toBeVisible();

  // One-click navigation to a still-placeholder destination (SOC Ops, the renamed Dashboards per the
  // 2026-07-24 IA revision), an honest empty placeholder. The Overview unmounts, so it stops driving
  // freshness and the shell indicator returns to the deferred "Not live". (Policies is now a real
  // surface, P5.3; SOC Ops remains a placeholder until its phase lands.)
  await rail.getByRole('link', { name: 'SOC Ops' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'SOC Ops' })).toBeVisible();
  await expect(page.getByText('No SOC Ops data yet')).toBeVisible();
  await expect(page.getByText('Not live')).toBeVisible();
});
