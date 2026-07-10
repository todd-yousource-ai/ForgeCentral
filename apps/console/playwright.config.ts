import { defineConfig, devices } from '@playwright/test';

// The Console e2e stage (F0.8b): the tier-4 empty-state journey driven in a real browser (chromium) with
// the BFF mocked at the network boundary (page.route), so it proves the SHELL, not the engine. It runs
// against the Vite dev server; the BFF planes (/auth, /api) are intercepted per test, never proxied. The
// gate runs this only when the networked/e2e stage is enabled (scripts/ci.sh step 8); browsers are fetched
// by an explicit `playwright install chromium` in the test:e2e script, not on npm install.

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
