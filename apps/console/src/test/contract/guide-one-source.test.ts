// apps/console/src/test/contract/guide-one-source.test.ts -- IP-CONSOLE-11-guide GD.12,
// INV-GUIDE-ONE-SOURCE: a limit the guide states about the Console is the constant the code enforces.
//
// Every `data-const` marker in the generated guide must name a registered constant and carry its
// current value (so the PDF, which prints the authored text, matches the Console), every registered
// constant must be stated somewhere, and the ReadMe renders the constant rather than the authored text.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GUIDE_CONSTANTS, formatGuideConstant } from '../../guide/constants.js';
import { GUIDE } from '../../guide/generated/guide-content.js';
import type { GuideNode } from '../../guide/model.js';
import { GuideNodes } from '../../guide/render.js';

interface Marker {
  readonly where: string;
  readonly name: string;
  readonly format: string | undefined;
  readonly text: string;
}

function textOf(node: GuideNode): string {
  return typeof node === 'string' ? node : (node.c ?? []).map(textOf).join('');
}

function collect(nodes: readonly GuideNode[], where: string, out: Marker[]): void {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    const name = node.a?.['data-const'];
    if (name !== undefined) {
      out.push({ where, name, format: node.a?.['data-format'], text: textOf(node) });
    }
    collect(node.c ?? [], where, out);
  }
}

const MARKERS: Marker[] = [];
for (const chapter of GUIDE.chapters) {
  collect(chapter.intro, chapter.id, MARKERS);
  for (const section of chapter.sections) collect(section.nodes, section.id, MARKERS);
}

describe('INV-GUIDE-ONE-SOURCE (GD.12)', () => {
  it('marks the Console limits the chapters state', () => {
    expect(MARKERS.length).toBeGreaterThan(0);
  });

  it('names only registered constants, each carrying its current value', () => {
    const expected = (m: Marker): string | undefined => {
      const value = GUIDE_CONSTANTS[m.name];
      return value === undefined ? undefined : formatGuideConstant(value, m.format);
    };
    const wrong = MARKERS.filter((m) => m.text !== expected(m)).map(
      (m) => `${m.where}: ${m.name} says ${m.text}, code says ${String(expected(m))}`,
    );
    expect(wrong).toEqual([]);
  });

  it('states every registered constant somewhere', () => {
    const used = new Set(MARKERS.map((m) => m.name));
    expect(Object.keys(GUIDE_CONSTANTS).filter((n) => !used.has(n))).toEqual([]);
  });

  it('renders the constant, not the authored text, so a changed limit changes the ReadMe', () => {
    const node: GuideNode = {
      t: 'p',
      c: [
        'At most ',
        { t: 'span', a: { class: 'const', 'data-const': 'MAX_SETTING_EDITS' }, c: ['64'] },
        ' changes.',
      ],
    };
    const render = (constants?: Readonly<Record<string, number>>): string =>
      renderToStaticMarkup(
        createElement(GuideNodes, {
          nodes: [node],
          ctx: {
            onNavigate: () => undefined,
            reference: () => createElement('div'),
            ...(constants === undefined ? {} : { constants }),
          },
        }),
      );
    expect(render()).toContain(
      `At most <span class="const" data-const="MAX_SETTING_EDITS">${String(GUIDE_CONSTANTS['MAX_SETTING_EDITS'])}</span> changes.`,
    );
    expect(render({ ...GUIDE_CONSTANTS, MAX_SETTING_EDITS: 32 })).toContain('>32</span>');
  });

  it('prints a grouped marker with thousands separators', () => {
    expect(formatGuideConstant(86_400, 'grouped')).toBe('86,400');
    expect(formatGuideConstant(86_400, undefined)).toBe('86400');
  });
});
