#!/usr/bin/env node
// scripts/audit-bulk.mjs -- the dependency CVE audit, over npm's BULK advisory endpoint.
//
// `pnpm audit` calls the legacy quick-audit endpoint, which the npm registry retired
// (HTTP 410, 2026-07: "Use the bulk advisory endpoint instead") -- and every current pnpm major
// (9/10/11) still calls it, so the CI gate broke through no fault of ours. This script IS the
// audit step now: it reads the resolved package set straight from pnpm-lock.yaml (the same source
// of truth pnpm audits), posts it to the documented bulk endpoint
// (https://registry.npmjs.org/-/npm/v1/security/advisories/bulk), applies the advisories'
// vulnerable ranges locally, and fails the gate on any advisory at or above the threshold
// (default: high). Swap back to `pnpm audit` if/when pnpm adopts the bulk endpoint.
//
// Fail-loud + fail-closed: a lockfile line the parser cannot read, an advisory range the matcher
// cannot parse, or a non-OK registry response each FAIL the gate rather than silently passing.
// No dependencies: node built-ins only (the audit tool must not itself widen the supply chain).
//
// Usage: node scripts/audit-bulk.mjs [--level=low|moderate|high|critical] [--self-test]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BULK_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const SEVERITY_RANK = { low: 0, moderate: 1, high: 2, critical: 3 };

// ---- lockfile -> { name: [versions] } -------------------------------------------------------------

/** Parse the v9 pnpm-lock.yaml `packages:` section keys into a name -> versions map. */
export function parseLockfilePackages(lock) {
  const packages = new Map();
  const lines = lock.split('\n');
  let inPackages = false;
  for (const line of lines) {
    if (/^packages:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) break; // the next top-level section (snapshots:) ends it
    if (!inPackages) continue;
    const m = line.match(/^ {2}'?([^' ]+?)'?:\s*$/);
    if (!m) continue;
    // Strip a peer-dependency suffix: name@1.2.3(peer@x) -> name@1.2.3
    const key = m[1].replace(/\(.*\)$/, '');
    const at = key.lastIndexOf('@');
    if (at <= 0) {
      throw new Error(`unparseable lockfile package key (fail closed): ${m[1]}`);
    }
    const name = key.slice(0, at);
    const version = key.slice(at + 1);
    if (!packages.has(name)) packages.set(name, new Set());
    packages.get(name).add(version);
  }
  return packages;
}

// ---- minimal semver range matching (no deps; fail-closed on anything unparseable) -----------------

/** Compare two release triples (prerelease tags compare before their release, which is sufficient
 *  here: an advisory range boundary is almost always a release; unparseable input throws). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
    if (!m) throw new Error(`unparseable version: ${v}`);
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1; // release > its own prerelease
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

/** Whether `version` satisfies an advisory `vulnerable_versions` range
 *  (`||` alternatives of space-separated comparators; `*` matches all). Unparseable -> throws
 *  (the caller treats that advisory as matching: fail closed). */
export function versionInRange(version, range) {
  const alternatives = range.split('||').map((s) => s.trim());
  return alternatives.some((alt) => {
    if (alt === '*' || alt === '') return true;
    return alt.split(/\s+/).every((comparator) => {
      const m = comparator.match(/^(<=|>=|<|>|=)?(.+)$/);
      if (!m) throw new Error(`unparseable comparator: ${comparator}`);
      const op = m[1] ?? '=';
      const cmp = compareVersions(version, m[2]);
      if (op === '<') return cmp < 0;
      if (op === '<=') return cmp <= 0;
      if (op === '>') return cmp > 0;
      if (op === '>=') return cmp >= 0;
      return cmp === 0;
    });
  });
}

// ---- self-test (hermetic; run by the gate before the network call) --------------------------------

function selfTest() {
  const eq = (got, want, what) => {
    if (got !== want) throw new Error(`self-test failed: ${what} (got ${got}, want ${want})`);
  };
  const lock = [
    'packages:',
    '',
    "  '@scope/pkg@1.2.3':",
    '    resolution: {integrity: sha512-x}',
    '  plain@0.1.0:',
    "  '@scope/peer@2.0.0(@babel/core@7.0.0)':",
    'snapshots:',
    "  'never@9.9.9':",
  ].join('\n');
  const parsed = parseLockfilePackages(lock);
  eq(parsed.size, 3, 'parsed package count');
  eq([...parsed.get('@scope/pkg')][0], '1.2.3', 'scoped version');
  eq([...parsed.get('@scope/peer')][0], '2.0.0', 'peer suffix stripped');
  eq(parsed.has('never'), false, 'snapshots section excluded');
  eq(versionInRange('1.2.3', '<1.2.4'), true, 'upper bound');
  eq(versionInRange('1.2.3', '>=1.0.0 <1.2.3'), false, 'exclusive upper');
  eq(versionInRange('2.3.4', '<1.0.0 || >=2.0.0 <2.4.0'), true, 'alternatives');
  eq(versionInRange('1.2.3-beta.1', '<1.2.3'), true, 'prerelease below release');
  eq(versionInRange('1.2.3', '*'), true, 'wildcard');
  eq(compareVersions('10.0.0', '9.9.9') > 0, true, 'numeric (not lexical) compare');
}

// ---- main ------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const level = (args.find((a) => a.startsWith('--level=')) ?? '--level=high').slice(8);
  if (!(level in SEVERITY_RANK)) {
    throw new Error(`unknown --level=${level} (use low|moderate|high|critical)`);
  }
  selfTest();
  if (args.includes('--self-test')) {
    console.log('audit-bulk self-test: ok');
    return;
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const lock = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  const packages = parseLockfilePackages(lock);
  const body = Object.fromEntries([...packages].map(([name, versions]) => [name, [...versions]]));

  const response = await fetch(BULK_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`bulk advisory endpoint responded ${response.status} (fail closed)`);
  }
  const advisories = await response.json();

  const findings = [];
  for (const [name, list] of Object.entries(advisories)) {
    const versions = [...(packages.get(name) ?? [])];
    for (const advisory of list) {
      if ((SEVERITY_RANK[advisory.severity] ?? SEVERITY_RANK.critical) < SEVERITY_RANK[level]) {
        continue;
      }
      let affected;
      try {
        affected = versions.filter((v) => versionInRange(v, advisory.vulnerable_versions ?? '*'));
      } catch {
        affected = versions; // unparseable range: treat every resolved version as affected
      }
      if (affected.length > 0) {
        findings.push(
          `${name}@${affected.join(',')}: [${advisory.severity}] ${advisory.title} (${advisory.url})`,
        );
      }
    }
  }

  if (findings.length > 0) {
    console.error(`audit-bulk: ${findings.length} advisory(ies) at or above "${level}":`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `audit-bulk: ${packages.size} packages checked against the bulk advisory DB -- no advisories at or above "${level}"`,
  );
}

main().catch((err) => {
  console.error(`audit-bulk: ${err.message}`);
  process.exit(1);
});
