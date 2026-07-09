import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The BFF imports @forge/wire runtime values; alias it to its source so tests resolve it without a prior
// build (the built dist only exists after the gate's build step). @forge/contracts is imported type-only
// (erased at transform), so it needs no alias.
export default defineConfig({
  resolve: {
    alias: {
      '@forge/wire': fileURLToPath(new URL('../../packages/wire/src/index.ts', import.meta.url)),
    },
  },
});
