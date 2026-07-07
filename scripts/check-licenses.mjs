#!/usr/bin/env node
// scripts/check-licenses.mjs -- the ForgeCentral dependency-license allowlist enforcer.
//
// The TypeScript/Node counterpart of the engine repos' `deny.toml` license gate. Reads the installed
// dependency licenses via `pnpm licenses list --json` and fails if any transitive license is outside
// the allowlist. AGPL and GPL of any version are prohibited (federal-distribution constraint); the
// permitted set matches CRAFTED_ENGINEERING_STANDARDS.md. Runs in scripts/ci.sh after `pnpm install`.
//
// Exit 0 = all licenses allowlisted; exit 1 = a disallowed license (prints the offenders).

import { execFileSync } from 'node:child_process';

// The allowlist (SPDX ids and common aliases). Keep in sync with DEPENDENCY-POLICY.md.
const ALLOW = new Set([
  'Apache-2.0',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unicode-DFS-2016',
  'Unicode-3.0',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
]);

// Never permitted, called out explicitly for a clear message.
const FORBIDDEN_SUBSTRINGS = ['GPL', 'AGPL', 'LGPL', 'SSPL', 'BUSL', 'CC-BY-NC'];

function normalize(license) {
  // pnpm may report "MIT", "(MIT OR Apache-2.0)", or "Unknown". Split on OR/AND/parens.
  return String(license)
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

let raw;
try {
  raw = execFileSync('pnpm', ['licenses', 'list', '--json', '--prod', '--dev'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (err) {
  console.error('check-licenses: failed to read `pnpm licenses list --json`. Run `pnpm install` first.');
  process.exit(1);
}

// `pnpm licenses list --json` returns an object keyed by license -> array of packages.
const byLicense = JSON.parse(raw || '{}');
const offenders = [];

for (const [license, packages] of Object.entries(byLicense)) {
  const parts = normalize(license);
  const forbidden = FORBIDDEN_SUBSTRINGS.some((f) => license.toUpperCase().includes(f));
  // A package is OK if ANY part is allowlisted (an "MIT OR GPL" dual license lets us take MIT), UNLESS
  // the license string itself is an explicitly forbidden family with no allowlisted alternative.
  const hasAllowed = parts.some((p) => ALLOW.has(p));
  if (!hasAllowed || (forbidden && !parts.some((p) => ALLOW.has(p)))) {
    const names = (Array.isArray(packages) ? packages : []).map((p) => p.name ?? p).join(', ');
    offenders.push({ license, names });
  }
}

if (offenders.length > 0) {
  console.error('check-licenses: disallowed dependency licenses found:');
  for (const o of offenders) {
    console.error(`  ${o.license}: ${o.names}`);
  }
  console.error('Only Apache-2.0/MIT/BSD/ISC/Unicode-family are permitted; AGPL/GPL are prohibited.');
  console.error('See DEPENDENCY-POLICY.md. Replace the dependency or add a reviewed allowlist entry.');
  process.exit(1);
}

console.log('check-licenses: all dependency licenses are within the allowlist.');
