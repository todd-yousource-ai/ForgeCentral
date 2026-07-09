import { defineConfig } from 'vitest/config';

// The component shells render in a DOM (happy-dom) with Testing Library; setup.ts registers the
// jest-dom matchers and auto-cleanup. The pure token tests (F0.2a) run fine in this environment too.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
