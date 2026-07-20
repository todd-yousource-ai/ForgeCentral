// packages/contracts/scripts/check-schema-sync.mjs -- vendored-schema sync check (maintenance tool).
//
// The vendored schema/*.schema.json files are copies of the crdb committed artifacts under
// crates/cdb-wire/schema/. This script compares each vendored copy against a crdb
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
const crdbRoot = resolve(process.argv[2] ?? join(here, '..', '..', '..', '..', 'crdb'));
const NAMES = ['wire-dto.schema.json', 'forge-dto.schema.json'];

let diverged = false;
for (const name of NAMES) {
  const vendored = join(here, '..', 'schema', name);
  const source = join(crdbRoot, 'crates', 'cdb-wire', 'schema', name);

  if (!existsSync(source)) {
    console.error(`check-schema-sync: crdb source not found at ${source}`);
    console.error(
      'Pass the crdb repo path as the first argument, or skip (this is not a gated check).',
    );
    process.exit(2);
  }

  const a = JSON.stringify(JSON.parse(readFileSync(vendored, 'utf8')));
  const b = JSON.stringify(JSON.parse(readFileSync(source, 'utf8')));

  if (a === b) {
    console.log(`check-schema-sync: ${name} matches the crdb source.`);
    continue;
  }
  diverged = true;
  console.error(`check-schema-sync: vendored ${name} DIFFERS from the crdb source.`);
  console.error(`  vendored: ${vendored}`);
  console.error(`  source:   ${source}`);
}

if (diverged) {
  console.error('Re-copy the crdb artifact(s) and run `node scripts/generate.mjs`.');
  process.exit(1);
}
