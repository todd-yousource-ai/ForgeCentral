// apps/console/src/test/contract/guide-coverage.test.ts -- INV-GUIDE-COVERS-EVERY-CONFIG
// (TRD-CONSOLE-11 11.6; IP-CONSOLE-11-guide GD.3).
//
// Every console binding in scope has a guide section that documents it: the section declares the
// binding in its heading (`<h2 id="..." data-covers="settings.commit ...">`), and a binding with no
// declaring section fails the gate. The scope grows with the plan: each surface step adds its prefixes
// (GD.4 to GD.10) and GD.N makes it every binding in the manifest.

import { bindings } from '@forge/bindings';
import { describe, expect, it } from 'vitest';

import { GUIDE } from '../../guide/generated/guide-content.js';

/** The binding prefixes whose chapters have been verified (GD.3 Settings; GD.4 Virtual Trust Zones). */
const SCOPE = ['settings.', 'soc.settings.', 'vtz.'];

const declared = new Map<string, string[]>();
for (const chapter of GUIDE.chapters) {
  for (const section of chapter.sections) {
    for (const id of section.covers) {
      declared.set(id, [...(declared.get(id) ?? []), section.id]);
    }
  }
}

describe('INV-GUIDE-COVERS-EVERY-CONFIG (scoped to the verified chapters)', () => {
  it('documents every in-scope binding in at least one guide section', () => {
    const inScope = Object.keys(bindings).filter((id) => SCOPE.some((p) => id.startsWith(p)));
    expect(inScope.length).toBeGreaterThan(0);
    expect(inScope.filter((id) => !declared.has(id)).sort()).toEqual([]);
  });

  it('declares only bindings that exist in the no-stub manifest', () => {
    expect([...declared.keys()].filter((id) => !(id in bindings)).sort()).toEqual([]);
  });
});
