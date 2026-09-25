// apps/console/src/test/contract/guide-content.test.ts -- IP-CONSOLE-11-guide GD.2: the ReadMe's
// generated content is the guide's one source, current, and sanitized at build time.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { GUIDE } from '../../guide/generated/guide-content.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const GENERATOR = join(ROOT, 'scripts', 'generate-guide-content.mjs');
const CHAPTERS = join(ROOT, 'docs', 'guide', 'chapters');

/** Run the generator in check mode; returns its exit code and output. */
function check(guideDir?: string): { code: number; output: string } {
  try {
    const output = execFileSync('node', [GENERATOR, '--check'], {
      encoding: 'utf8',
      env: { ...process.env, ...(guideDir === undefined ? {} : { FORGE_GUIDE_DIR: guideDir }) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return { code: e.status ?? 1, output: e.stderr ?? '' };
  }
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A copy of the guide with one chapter's source rewritten. */
function doctored(edit: (html: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fc-guide-'));
  temps.push(dir);
  cpSync(join(ROOT, 'docs', 'guide'), dir, { recursive: true });
  const file = join(dir, 'chapters', '02-how-configuration-works.html');
  writeFileSync(file, edit(readFileSync(file, 'utf8')));
  return dir;
}

describe('the ReadMe content (INV-GUIDE-ONE-SOURCE for the document and the tab)', () => {
  it('is current: the committed module equals a fresh generation from docs/guide', () => {
    expect(check()).toEqual({ code: 0, output: 'generate-guide-content: up to date\n' });
  });

  it('carries every chapter file of the guide, in order', () => {
    const files = readdirSync(CHAPTERS)
      .filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f))
      .sort();
    expect(GUIDE.chapters.map((c) => c.id)).toEqual(files.map((f) => `ch-${f.slice(3, -5)}`));
  });

  it('refuses markup outside the allowlist (the build-time sanitizer)', () => {
    for (const [injected, expected] of [
      ['<p>x<script>alert(1)</script></p>', '<script> is not allowed'],
      ['<p onclick="steal()">x</p>', '<p onclick> is not allowed'],
      ['<p><a href="https://example.com/">out</a></p>', 'only in-guide links are allowed'],
    ] as const) {
      const result = check(doctored((html) => html.replace('</h1>', `</h1>\n${injected}`)));
      expect(result.code, injected).not.toBe(0);
      expect(result.output, injected).toContain(expected);
    }
  });

  it('refuses a section heading without an id (every section must be addressable)', () => {
    const result = check(doctored((html) => html.replace('</h1>', '</h1>\n<h2>No anchor</h2>')));
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('heading without an id');
  });
});
