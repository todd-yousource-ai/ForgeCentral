// apps/console/src/test/contract/guide-disabled.test.ts -- IP-CONSOLE-11-guide GD.13,
// INV-GUIDE-DISABLED-EXPLAINED: every disabled or locked control states why.
//
// The test reads the Console source. Every `disabled={...}` must sit on an element that names its
// reason with `aria-describedby`, unless the condition only says a request is in flight (the control
// shows its own progress). Every guide link a reason carries must name a section the guide contains.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GUIDE } from '../../guide/generated/guide-content.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'test' && name !== 'generated') out.push(...sources(path));
    } else if (name.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

/** An operand that only says a request is in flight. */
const IN_FLIGHT = /^(busy|saving|syncingThis|[\w.]+\.isPending|phase\.kind === 'starting')$/;

function inFlightOnly(expr: string): boolean {
  return expr
    .replace(/[()!]/g, ' ')
    .split('||')
    .map((operand) => operand.trim())
    .every((operand) => IN_FLIGHT.test(operand));
}

/** The expression inside `disabled={...}` starting at `at` (the index of the opening brace). */
function braced(text: string, at: number): { expr: string; end: number } {
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return { expr: text.slice(at + 1, i), end: i };
    }
  }
  return { expr: text.slice(at + 1), end: text.length };
}

/** The opening tag around `at`: back to its `<Name`, forward to its `>` outside any braces. */
function tagAround(text: string, at: number): string {
  let start = at;
  while (start > 0 && !/<[A-Za-z]/.test(text.slice(start, start + 2))) start -= 1;
  let depth = 0;
  let end = at;
  for (; end < text.length; end += 1) {
    if (text[end] === '{') depth += 1;
    if (text[end] === '}') depth -= 1;
    if (text[end] === '>' && depth === 0 && text[end - 1] !== '=') break;
  }
  return text.slice(start, end + 1);
}

interface Control {
  readonly where: string;
  readonly expr: string;
  readonly tag: string;
}

const CONTROLS: Control[] = [];
const GUIDE_LINKS: { where: string; section: string }[] = [];
for (const file of sources(SRC)) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(SRC, file);
  for (const match of text.matchAll(/\bdisabled=\{/g)) {
    const brace = (match.index ?? 0) + 'disabled='.length;
    const { expr } = braced(text, brace);
    const line = text.slice(0, match.index).split('\n').length;
    CONTROLS.push({
      where: `${rel}:${String(line)}`,
      expr,
      tag: tagAround(text, match.index ?? 0),
    });
  }
  for (const match of text.matchAll(/<GuideLink section="([^"]+)"/g)) {
    GUIDE_LINKS.push({ where: rel, section: match[1] ?? '' });
  }
}

const SECTION_IDS = new Set(GUIDE.chapters.flatMap((c) => [c.id, ...c.sections.map((s) => s.id)]));

describe('INV-GUIDE-DISABLED-EXPLAINED (GD.13)', () => {
  it('finds the disabled controls', () => {
    expect(CONTROLS.length).toBeGreaterThan(30);
  });

  it('gives every control disabled for a reason other than an in-flight request a stated reason', () => {
    const unexplained = CONTROLS.filter(
      (c) => !inFlightOnly(c.expr) && !c.tag.includes('aria-describedby'),
    ).map((c) => `${c.where}: disabled={${c.expr.replace(/\s+/g, ' ')}}`);
    expect(unexplained).toEqual([]);
  });

  it('treats only in-flight conditions as self-explaining', () => {
    expect(inFlightOnly('busy')).toBe(true);
    expect(inFlightOnly('connect.isPending')).toBe(true);
    expect(inFlightOnly('locked')).toBe(false);
    expect(inFlightOnly('busy || !valid')).toBe(false);
  });

  it('links every reason to a section the guide contains', () => {
    expect(GUIDE_LINKS.filter((l) => !SECTION_IDS.has(l.section))).toEqual([]);
  });
});
