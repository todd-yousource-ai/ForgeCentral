import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The BFF imports @forge/wire and @forge/contracts runtime values (e.g. the wire codec, and the branded-id
// constructors decisionId/principalId used by the entity-detail resolver); alias both to their source so
// tests resolve them without a prior build -- the built dist only exists after the gate's build step, which
// runs AFTER test, so on a fresh checkout the package entry is unresolvable otherwise.
export default defineConfig({
  resolve: {
    alias: {
      '@forge/wire': fileURLToPath(new URL('../../packages/wire/src/index.ts', import.meta.url)),
      '@forge/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
});
