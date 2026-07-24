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

// ---- documented waivers (advisories not applicable to THIS codebase) -------------------------------
//
// A waiver suppresses a SINGLE advisory, keyed by its GHSA id, ONLY when the affected package matches
// and the waiver has not expired. It is never a silent drop: a waived advisory is still printed (with
// its justification) on every run, and the waiver EXPIRES so it is forced back for review rather than
// rotting. An expired waiver, an unparseable expiry, or a package mismatch does NOT suppress (fail
// closed). Every entry names the reason the vulnerable code path is unreachable here + the real fix.
// See DEPENDENCY-POLICY.md.
const WAIVERS = {
  'GHSA-qwww-vcr4-c8h2': {
    package: 'react-router',
    reason:
      'RSC-mode-only CSRF -- the advisory states it "only affects your application if you are using ' +
      'the unstable RSC APIs". The Console is a Vite BrowserRouter SPA and imports no react-router RSC ' +
      'API, so the vulnerable path is unreachable here. The fix is react-router 8.3.0, a v7->v8 ' +
      'migration (react-router-dom is removed in v8); revisit at that upgrade.',
    expires: '2026-10-24',
  },
  'GHSA-mh99-v99m-4gvg': {
    package: 'brace-expansion',
    reason:
      'brace-expansion ReDoS/DoS via unbounded expansion. Two conditions make it not-applicable here: ' +
      '(1) the installed versions (1.1.16 and 5.0.7) are already at or above the advisory patched ' +
      'versions, and (2) `pnpm why brace-expansion --prod` is empty -- it is a DEV-TOOLING-ONLY ' +
      'transitive dep (minimatch/glob for build-time file globbing over trusted, developer-authored ' +
      'repo paths), never in the shipped BFF/SPA bundle and never fed attacker-controlled patterns. ' +
      'Revisit if a production dependency ever pulls it. [short expiry: re-confirm at the next audit]',
    expires: '2026-09-24',
  },
};

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

// ---- waivers --------------------------------------------------------------------------------------

/** The GHSA id embedded in an advisory URL (e.g. `.../GHSA-qwww-vcr4-c8h2`), or null. */
export function ghsaIdFromUrl(url) {
  const m = /(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i.exec(url ?? '');
  return m ? m[1] : null;
}

/**
 * Split findings into actively-failing vs waived. A waiver suppresses a finding ONLY when its GHSA id
 * is in `waivers`, the waiver's `package` matches the finding's package, and the waiver has not
 * expired (`now < expires`). An expired waiver, an unparseable `expires`, or a package mismatch never
 * suppresses (fail closed). Returns `{ active, waived, staleWaivers }`, where `staleWaivers` are waiver
 * ids that matched no finding this run (so a rotted waiver surfaces rather than lingering silently).
 */
export function applyWaivers(findings, waivers, now) {
  const active = [];
  const waived = [];
  const used = new Set();
  for (const finding of findings) {
    const waiver = finding.ghsa ? waivers[finding.ghsa] : undefined;
    const expiry = waiver ? Date.parse(`${waiver.expires}T00:00:00Z`) : Number.NaN;
    const expired = Number.isNaN(expiry) || now >= expiry;
    if (waiver && waiver.package === finding.name && !expired) {
      waived.push({ finding, waiver });
      used.add(finding.ghsa);
    } else {
      active.push(finding);
    }
  }
  const staleWaivers = Object.keys(waivers).filter((id) => !used.has(id));
  return { active, waived, staleWaivers };
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

  // Waivers: a matching, unexpired waiver suppresses; expiry / package mismatch / bad expiry do not.
  eq(
    ghsaIdFromUrl('https://github.com/advisories/GHSA-qwww-vcr4-c8h2'),
    'GHSA-qwww-vcr4-c8h2',
    'ghsa id parsed from url',
  );
  const now = Date.parse('2026-07-24T00:00:00Z');
  const finding = {
    name: 'pkg',
    versions: ['1.0.0'],
    severity: 'high',
    title: 't',
    url: 'u',
    ghsa: 'GHSA-aaaa-bbbb-cccc',
  };
  const good = { 'GHSA-aaaa-bbbb-cccc': { package: 'pkg', reason: 'x', expires: '2999-01-01' } };
  eq(applyWaivers([finding], good, now).waived.length, 1, 'valid waiver suppresses');
  eq(applyWaivers([finding], good, now).active.length, 0, 'valid waiver leaves nothing active');
  const expiredW = {
    'GHSA-aaaa-bbbb-cccc': { package: 'pkg', reason: 'x', expires: '2020-01-01' },
  };
  eq(applyWaivers([finding], expiredW, now).active.length, 1, 'expired waiver does not suppress');
  const badDate = { 'GHSA-aaaa-bbbb-cccc': { package: 'pkg', reason: 'x', expires: 'nope' } };
  eq(applyWaivers([finding], badDate, now).active.length, 1, 'unparseable expiry fails closed');
  const mismatch = {
    'GHSA-aaaa-bbbb-cccc': { package: 'other', reason: 'x', expires: '2999-01-01' },
  };
  eq(applyWaivers([finding], mismatch, now).active.length, 1, 'package mismatch does not suppress');
  eq(applyWaivers([], good, now).staleWaivers.length, 1, 'an unused waiver is reported stale');
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
        findings.push({
          name,
          versions: affected,
          severity: advisory.severity,
          title: advisory.title,
          url: advisory.url,
          ghsa: ghsaIdFromUrl(advisory.url),
        });
      }
    }
  }

  const fmt = (f) => `${f.name}@${f.versions.join(',')}: [${f.severity}] ${f.title} (${f.url})`;
  const { active, waived, staleWaivers } = applyWaivers(findings, WAIVERS, Date.now());

  // A waived advisory is REPORTED every run (with its justification), never silently dropped.
  if (waived.length > 0) {
    console.log(`audit-bulk: ${waived.length} advisory(ies) WAIVED (documented not-applicable):`);
    for (const { finding, waiver } of waived) {
      console.log(`  ${fmt(finding)}`);
      console.log(`    waiver: ${waiver.reason} [expires ${waiver.expires}]`);
    }
  }
  // A waiver that matched nothing this run is surfaced (the advisory may have cleared or the dep bumped).
  for (const id of staleWaivers) {
    console.log(
      `audit-bulk: NOTE -- waiver ${id} matched no current advisory (revisit; may be stale)`,
    );
  }

  if (active.length > 0) {
    console.error(`audit-bulk: ${active.length} advisory(ies) at or above "${level}":`);
    for (const f of active) console.error(`  ${fmt(f)}`);
    process.exit(1);
  }
  console.log(
    `audit-bulk: ${packages.size} packages checked against the bulk advisory DB -- no unwaived advisories at or above "${level}"`,
  );
}

main().catch((err) => {
  console.error(`audit-bulk: ${err.message}`);
  process.exit(1);
});
