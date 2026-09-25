// apps/console/src/test/contract/guide-coverage.test.ts -- INV-GUIDE-COVERS-EVERY-CONFIG
// (TRD-CONSOLE-11 11.6; IP-CONSOLE-11-guide GD.3, global at GD.N).
//
// Every console binding in the no-stub manifest has a guide section that documents it: the section
// declares the binding in its heading (`<h2 id="..." data-covers="settings.commit ...">`), and a binding
// with no declaring section fails the gate. The scope grew surface by surface (GD.3 to GD.10); at GD.N it
// is the whole manifest, so a new binding cannot ship without its guide section.

import { bindings } from '@forge/bindings';
import { describe, expect, it } from 'vitest';

import { GUIDE } from '../../guide/generated/guide-content.js';

const declared = new Map<string, string[]>();
for (const chapter of GUIDE.chapters) {
  for (const section of chapter.sections) {
    for (const id of section.covers) {
      declared.set(id, [...(declared.get(id) ?? []), section.id]);
    }
  }
}

describe('INV-GUIDE-COVERS-EVERY-CONFIG', () => {
  it('documents every binding in the manifest in at least one guide section', () => {
    const all = Object.keys(bindings);
    expect(all.length).toBeGreaterThan(80);
    expect(all.filter((id) => !declared.has(id)).sort()).toEqual([]);
  });

  it('declares only bindings that exist in the no-stub manifest', () => {
    expect([...declared.keys()].filter((id) => !(id in bindings)).sort()).toEqual([]);
  });
});
