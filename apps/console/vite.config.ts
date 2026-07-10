import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Console SPA. The @forge/* workspace packages are aliased to their source (like the BFF's vitest
// alias for @forge/wire) so the app builds and tests without a prior package build; Vite compiles the
// TSX and resolves each `.js` specifier to its `.ts` source. The dev server proxies the BFF planes
// (/auth and /api) to a local BFF; in a release deployment the sidecar/BFF front the SPA, so no proxy
// ships in the bundle.
const alias = {
  '@forge/design': fileURLToPath(new URL('../../packages/design/src/index.ts', import.meta.url)),
  '@forge/contracts': fileURLToPath(
    new URL('../../packages/contracts/src/index.ts', import.meta.url),
  ),
  '@forge/bindings': fileURLToPath(
    new URL('../../packages/bindings/src/index.ts', import.meta.url),
  ),
};

const bffTarget = process.env['FC_BFF_DEV_ORIGIN'] ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  server: {
    proxy: {
      '/auth': { target: bffTarget, changeOrigin: false },
      '/api': { target: bffTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
