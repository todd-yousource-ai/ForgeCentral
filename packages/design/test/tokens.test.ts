// packages/design/test/tokens.test.ts -- F0.2a tier-1 tests for @forge/design.
//
// Proves INV-CONSOLE-DESIGN-SEMANTIC-COLOR (a color hex lives only in the token module; a hand-picked hex
// anywhere else in src/ fails) and the WCAG AA contrast claim of the dark theme (TRD-CONSOLE-00 6.4).

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AA_LARGE,
  AA_TEXT,
  colorVarName,
  contrastRatio,
  flow,
  scaleVarName,
  status,
  surface,
  text,
  tokensToCss,
} from '../src/index.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const COLOR_TOKEN_FILE = join('tokens', 'color.ts');

/** Every `.ts` file under src/, as paths relative to src/. */
function srcFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      srcFiles(full, acc);
    } else if (entry.name.endsWith('.ts')) {
      acc.push(relative(srcDir, full));
    }
  }
  return acc;
}

describe('INV-CONSOLE-DESIGN-SEMANTIC-COLOR: hex literals live only in the token module', () => {
  it('no src file other than tokens/color.ts contains a color hex literal', () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const offenders = srcFiles(srcDir)
      .filter((rel) => rel !== COLOR_TOKEN_FILE)
      .filter((rel) => hex.test(readFileSync(join(srcDir, rel), 'utf8')));
    // A component (or any module) hand-picking a hex instead of a semantic token fails here.
    expect(offenders).toEqual([]);
  });
});

describe('WCAG AA contrast (dark theme, TRD-CONSOLE-00 6.4)', () => {
  const backgrounds = [surface.canvas, surface.panel, surface.card] as const;

  it('primary and muted text meet AA (4.5:1) on every surface', () => {
    for (const bg of backgrounds) {
      expect(contrastRatio(text.primary.value, bg.value)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(text.muted.value, bg.value)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('flow and status accent colors meet AA for non-text UI (3:1) on the canvas', () => {
    const accents = [
      flow.users,
      flow.devices,
      flow.agents,
      flow.objects,
      status.good,
      status.caution,
      status.critical,
      status.quarantine,
    ] as const;
    for (const accent of accents) {
      expect(contrastRatio(accent.value, surface.canvas.value)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe('CSS variable generation', () => {
  it('emits a :root block binding each token to a --fc- custom property', () => {
    const css = tokensToCss();
    expect(css.startsWith(':root {')).toBe(true);
    expect(css).toContain(`${colorVarName('status-good')}: ${status.good.value};`);
    expect(css).toContain(`${colorVarName('surface-canvas')}: ${surface.canvas.value};`);
    expect(css).toContain(`${scaleVarName('space-md')}: 12px;`);
  });
});
