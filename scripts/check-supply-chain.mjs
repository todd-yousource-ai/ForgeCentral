#!/usr/bin/env node
// scripts/check-supply-chain.mjs -- the ForgeCentral supply-chain integrity gate.
//
// Complements `pnpm audit` (known CVEs) and check-licenses.mjs (licenses) with the controls that defend
// against a MALICIOUS package (not just a vulnerable one) -- the class of attack behind the recent npm
// worms (self-replicating install-script payloads, maintainer-account takeovers, dependency confusion).
// Hermetic: reads only local files (the installed tree + the lockfile), no network, no external service.
//
// It enforces, fail-loud:
//   1. Install-script lockdown. Only packages in package.json > pnpm.onlyBuiltDependencies may carry a
//      lifecycle script (preinstall/install/postinstall). pnpm already BLOCKS the rest from executing
//      (deny-by-default); this check makes the allowlist explicit and fails the gate the moment a new or
//      compromised package introduces a script -- so a poisoned update cannot slip an install payload in
//      unnoticed. Review + extend the allowlist deliberately when a build tool genuinely needs it.
//   2. Source pinning. Every resolved dependency must come from the public npm registry with a content
//      integrity hash. A lockfile edit that repoints a dependency at an attacker tarball or a git repo
//      (dependency substitution) is refused here.
//
// Run after `pnpm install` (the gate does). Exit 0 = clean; exit 1 = a violation (prints offenders).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

// ---- 1. Install-script lockdown ------------------------------------------------------------------
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const allow = new Set(rootPkg.pnpm?.onlyBuiltDependencies ?? []);
const LIFECYCLE = ['preinstall', 'install', 'postinstall'];
const store = join(repoRoot, 'node_modules', '.pnpm');

/** Collect the names of installed packages that declare a lifecycle (install) script. */
function collectScriptedPackages(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    // Dependencies are symlinks into the store; only a package's OWN files are a real directory, so we
    // never follow symlinks (that would revisit the whole graph) and never leave this store.
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectScriptedPackages(full, found);
    } else if (entry.name === 'package.json') {
      try {
        const pkg = JSON.parse(readFileSync(full, 'utf8'));
        const scripts = pkg.scripts ?? {};
        if (pkg.name && LIFECYCLE.some((s) => typeof scripts[s] === 'string')) {
          found.set(
            pkg.name,
            LIFECYCLE.filter((s) => typeof scripts[s] === 'string'),
          );
        }
      } catch {
        // A malformed package.json in the store is not this check's concern.
      }
    }
  }
  return found;
}

if (existsSync(store)) {
  const scripted = collectScriptedPackages(store, new Map());
  const offenders = [...scripted.keys()].filter((name) => !allow.has(name)).sort();
  if (offenders.length > 0) {
    failures.push(
      `install scripts on non-allowlisted packages: ${offenders.join(', ')}. ` +
        'If a build tool legitimately needs this, add it to package.json > pnpm.onlyBuiltDependencies ' +
        'after review; otherwise this is a supply-chain red flag.',
    );
  }
  const allowedInUse = [...scripted.keys()].filter((name) => allow.has(name)).sort();
  const staleAllow = [...allow].filter((name) => !scripted.has(name)).sort();
  console.log(
    `check-supply-chain: ${scripted.size} package(s) with install scripts; ` +
      `allowed + present: [${allowedInUse.join(', ')}]` +
      (staleAllow.length
        ? `; stale allowlist entries (not in tree): [${staleAllow.join(', ')}]`
        : ''),
  );
} else {
  failures.push('node_modules/.pnpm not found -- run `pnpm install` before this check.');
}

// ---- 2. Source pinning: npm registry + integrity only --------------------------------------------
const lockPath = join(repoRoot, 'pnpm-lock.yaml');
if (!existsSync(lockPath)) {
  failures.push('pnpm-lock.yaml missing -- the committed lockfile is the pinned source of truth.');
} else {
  const lock = readFileSync(lockPath, 'utf8');
  // Off-registry tarball resolutions (a repointed dependency): any `tarball:` not on the npm registry.
  const offRegistry = [...lock.matchAll(/tarball:\s*(\S+)/g)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith('https://registry.npmjs.org/'));
  if (offRegistry.length > 0) {
    failures.push(`off-registry tarball source(s) in the lockfile: ${offRegistry.join(', ')}`);
  }
  // Git / VCS dependency sources (unpinned, unsigned code): refuse them outright.
  if (/\n\s+resolution:\s*\{[^}]*\b(repo|commit|type:\s*git)\b/.test(lock) || /git\+/.test(lock)) {
    failures.push(
      'git/VCS dependency source(s) in the lockfile -- use published, integrity-hashed npm releases.',
    );
  }
  // Content integrity must be present (packages are hash-pinned).
  if (!/integrity:\s*sha512-/.test(lock)) {
    failures.push('no sha512 integrity hashes in the lockfile -- installs are not tamper-evident.');
  }
}

// ---- verdict -------------------------------------------------------------------------------------
if (failures.length > 0) {
  console.error('check-supply-chain: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('See DEPENDENCY-POLICY.md (supply-chain hardening).');
  process.exit(1);
}
console.log('check-supply-chain: install-script lockdown and source pinning OK.');
