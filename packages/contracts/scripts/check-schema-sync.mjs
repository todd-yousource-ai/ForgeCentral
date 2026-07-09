// packages/contracts/scripts/check-schema-sync.mjs -- vendored-schema sync check (maintenance tool).
//
// The vendored schema/wire-dto.schema.json is a copy of the crdb committed artifact
// crates/cdb-wire/schema/wire-dto.schema.json. This script compares the vendored copy against a crdb
// checkout (semantically: parse both, deep-equal, so formatting differences never cause a false diff)
// and exits non-zero if they diverge. It is NOT part of scripts/ci.sh, because the gate must run without
// a crdb checkout present (CI has no engine repo). Run it locally when bumping the vendored contract:
//
//   node scripts/check-schema-sync.mjs [path-to-crdb]   (default: ../../../crdb)
//
// The gated integrity check is the codegen round-trip in test/contracts.test.ts (schema -> generated),
// which needs only this package.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendored = join(here, '..', 'schema', 'wire-dto.schema.json');
const crdbRoot = resolve(process.argv[2] ?? join(here, '..', '..', '..', '..', 'crdb'));
const source = join(crdbRoot, 'crates', 'cdb-wire', 'schema', 'wire-dto.schema.json');

if (!existsSync(source)) {
  console.error(`check-schema-sync: crdb source not found at ${source}`);
  console.error(
    'Pass the crdb repo path as the first argument, or skip (this is not a gated check).',
  );
  process.exit(2);
}

const a = JSON.stringify(JSON.parse(readFileSync(vendored, 'utf8')));
const b = JSON.stringify(JSON.parse(readFileSync(source, 'utf8')));

if (a !== b) {
  console.error('check-schema-sync: vendored schema DIFFERS from the crdb source.');
  console.error(`  vendored: ${vendored}`);
  console.error(`  source:   ${source}`);
  console.error('Re-copy the crdb artifact and run `node scripts/generate.mjs`.');
  process.exit(1);
}

console.log('check-schema-sync: vendored schema matches the crdb source.');
