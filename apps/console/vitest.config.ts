import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

// The shell renders in a DOM (happy-dom) with Testing Library. setup.ts registers the jest-dom matchers
// and auto-cleanup. The @forge/* packages resolve to source (build-order-independent), matching the app's
// vite.config alias.
export default defineConfig({
  resolve: {
    alias: {
      '@forge/design': fileURLToPath(
        new URL('../../packages/design/src/index.ts', import.meta.url),
      ),
      '@forge/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@forge/bindings': fileURLToPath(
        new URL('../../packages/bindings/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // The Playwright e2e (e2e/**) has its own runner (gate step 8); keep vitest from collecting its
    // *.spec.ts. Exclude (not a narrowed include) so `--dir src/test/contract` still resolves.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
