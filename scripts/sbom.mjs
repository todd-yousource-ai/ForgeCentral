#!/usr/bin/env node
// scripts/sbom.mjs -- generate a CycloneDX SBOM for the installed dependency tree.
//
// A Software Bill of Materials (CRAFTED_ENGINEERING_STANDARDS "Software Supply Chain Security", AI
// Quality Guide 9.1) lets us answer "are we affected?" the instant a CVE is disclosed in any direct or
// transitive dependency. Produced per build as an artifact (sbom.cdx.json, gitignored -- it is derivable
// from the lockfile, so it is generated, not committed). Hermetic: reads `pnpm list` output, no network.
//
// Run:  node scripts/sbom.mjs   (the gate does)  -> writes sbom.cdx.json (CycloneDX 1.5)

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(repoRoot, 'sbom.cdx.json');

const raw = execFileSync('pnpm', ['list', '-r', '--json', '--depth', 'Infinity'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const projects = JSON.parse(raw);

// Flatten the nested dependency graph into a unique set of name@version components.
const components = new Map();
function walk(deps) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    const version = info?.version;
    if (!version || String(version).startsWith('link:')) continue; // skip workspace links
    const key = `${name}@${version}`;
    if (!components.has(key)) {
      components.set(key, {
        type: 'library',
        name,
        version: String(version),
        purl: `pkg:npm/${encodeURIComponent(name).replace('%40', '@')}@${version}`,
      });
    }
    walk(info.dependencies);
    walk(info.devDependencies);
  }
}
for (const project of Array.isArray(projects) ? projects : [projects]) {
  walk(project.dependencies);
  walk(project.devDependencies);
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    tools: [{ name: 'forge-sbom', vendor: 'YouSource' }],
    component: { type: 'application', name: '@forge/console' },
  },
  components: [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl)),
};

writeFileSync(outPath, `${JSON.stringify(bom, null, 2)}\n`);
console.log(`sbom: wrote ${bom.components.length} components to ${outPath} (CycloneDX 1.5)`);
