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

  // The home surface is an honest empty state (no fabricated data), with the "not live" indicator.
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByText('No Overview data yet')).toBeVisible();
  await expect(page.getByText('Not live')).toBeVisible();

  // The select-then-act drawer frame: open one click, close.
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Open entity drawer' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // One-click navigation to another destination, still an honest empty state.
  await rail.getByRole('link', { name: 'Policies' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Policies' })).toBeVisible();
  await expect(page.getByText('No Policies data yet')).toBeVisible();
});
