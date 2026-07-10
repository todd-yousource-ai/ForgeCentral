// apps/bff/test/no-node-tls.test.ts -- INV-CONSOLE-CRYPTO-AWSLC: the Node tiers perform no TLS.
//
// Every Console TLS boundary is terminated/originated by the AWS-LC crypto sidecar (a separate process);
// the BFF and @forge/wire speak plaintext over a loopback socket to it. This guard fails the gate if any
// BFF or wire source reaches for Node's TLS stack (`node:tls`/`node:https`), which would reintroduce a
// second crypto module on the Node side.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const roots = [
  join(here, '..', 'src'), // apps/bff/src
  join(here, '..', '..', '..', 'packages', 'wire', 'src'), // packages/wire/src
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsFiles(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

// A source imports Node's TLS stack when it references the `node:tls` or `node:https` module specifiers.
const NODE_TLS_IMPORT = /['"]node:(?:tls|https)['"]/;

describe('INV-CONSOLE-CRYPTO-AWSLC: Node performs no TLS', () => {
  it('no BFF or wire source imports node:tls or node:https', () => {
    const offenders = roots
      .flatMap((root) => tsFiles(root))
      .filter((file) => NODE_TLS_IMPORT.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
