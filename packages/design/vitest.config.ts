import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The component shells render in a DOM (happy-dom) with Testing Library; setup.ts registers the
// jest-dom matchers and auto-cleanup. The pure token tests (F0.2a) run fine in this environment too.
// The entity-drawer body is typed against the @forge/contracts DR.1 view models; alias it to source so
// the tests resolve those types without a prior build (the built dist only exists after the gate's build).
export default defineConfig({
  resolve: {
    alias: {
      '@forge/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
