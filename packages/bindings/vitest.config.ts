import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The contract test uses the runtime `bindingId` constructor from @forge/contracts; alias it to source so
// the test resolves it without a prior build (the built dist only exists after the gate's build step).
export default defineConfig({
  resolve: {
    alias: {
      '@forge/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
});
