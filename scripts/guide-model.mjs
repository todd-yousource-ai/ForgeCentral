// scripts/guide-model.mjs -- the configuration guide's one processing model (IP-CONSOLE-11-guide GD.2).
//
// The guide is authored once, as HTML fragments in docs/guide/chapters/. Two renderers consume them:
// scripts/build-guide.mjs prints the standalone HTML + PDF, and scripts/generate-guide-content.mjs
// emits the typed content the console's ReadMe tab renders. Both run the fragments through THIS
// module, so the chapter numbers, figure and table labels, cross-reference text and the
// known-limitations appendix are the same in the document and in the tab.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Internal names the guide's prose must never use (operator ruling 2026-09-25: Forge is the platform;
// repository and component names are internal). Checked outside <code> and <pre>.
export const INTERNAL_NAMES = /\b(crucible\w*|crdb|cdb|torch\w*|bff|sidecar|forge-central)\b/i;
export const PROVENANCE = /\b(TRD-\S+|IP-[A-Z]{2,}\S*|CD-\d+)\b/;
export const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

export class GuideError extends Error {}

export function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&nbsp;/g, ' ');
}

/** Read the chapter fragments in file order and give each its label, number and section list. */
export function loadChapters(guideDir) {
  const dir = join(guideDir, 'chapters');
  const files = readdirSync(dir)
    .filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f))
    .sort();
  let chapterNo = 0;
  let appendixNo = 0;
  return files.map((file) => {
    const html = readFileSync(join(dir, file), 'utf8');
    const h1 = /<h1>([^<]+)<\/h1>/.exec(html);
    if (h1 === null) throw new GuideError(`${file}: the fragment must open with <h1>Title</h1>`);
    const isAppendix = /^9\d-appendix-/.test(file);
    const num = isAppendix ? String.fromCharCode(65 + appendixNo++) : String(++chapterNo);
    const body = html.replace(h1[0], '');
    const sections = [...body.matchAll(/<h([23]) id="([a-z0-9-]+)">([\s\S]*?)<\/h\1>/g)].map(
      (m) => ({
        level: Number(m[1]),
        id: m[2],
        text: stripTags(m[3]),
      }),
    );
    return {
      file,
      id: `ch-${file.slice(3, -5)}`,
      label: isAppendix ? 'APPENDIX' : 'CHAPTER',
      num,
      title: h1[1],
      body,
      sections,
    };
  });
}

/** Throw on anything the content rules forbid (every h2 / h3 has an id; names; provenance; dashes). */
export function lint(chapters, frontFiles) {
  const problems = [];
  for (const ch of chapters) {
    for (const m of ch.body.matchAll(/<h[23](?![^>]*\bid=)[^>]*>/g)) {
      problems.push(`${ch.file}: heading without an id: ${m[0]}`);
    }
    const prose = stripTags(ch.body.replace(/<code>[\s\S]*?<\/code>|<pre[\s\S]*?<\/pre>/g, ' '));
    const lines = `${ch.title}\n${prose}`.split('\n');
    for (const line of lines) {
      if (INTERNAL_NAMES.test(line))
        problems.push(`${ch.file}: internal name in prose: "${line.trim().slice(0, 100)}"`);
      if (PROVENANCE.test(line))
        problems.push(`${ch.file}: internal provenance in prose: "${line.trim().slice(0, 100)}"`);
    }
  }
  for (const [name, text] of frontFiles) {
    if (DASHES.test(text)) problems.push(`${name}: em or en dash`);
  }
  for (const ch of chapters) {
    if (DASHES.test(ch.body)) problems.push(`${ch.file}: em or en dash`);
  }
  if (problems.length > 0) throw new GuideError(`content lint failed:\n  ${problems.join('\n  ')}`);
}

/** Number the figures and tables of one chapter; returns the new body and the label of each id. */
export function numberFloats(ch) {
  let figures = 0;
  let tables = 0;
  const labels = new Map();
  let body = ch.body.replace(
    /<figure id="([a-z0-9-]+)" data-title="([^"]+)"( class="[^"]*")?>([\s\S]*?)<\/figure>/g,
    (_m, id, title, cls, inner) => {
      const label = `Figure ${ch.num}-${++figures}`;
      labels.set(id, label);
      return `<figure id="${id}"${cls ?? ''}>${inner}<figcaption><span class="fignum">${label}.</span> ${title}</figcaption></figure>`;
    },
  );
  body = body.replace(
    /<div class="tablewrap( wide)?" id="([a-z0-9-]+)" data-title="([^"]+)">/g,
    (_m, wide, id, title) => {
      const label = `Table ${ch.num}-${++tables}`;
      labels.set(id, label);
      return `<div class="tablewrap${wide ?? ''}" id="${id}"><div class="tcap">${label}. ${title}</div>`;
    },
  );
  const limits = [];
  body = body.replace(/<div class="note limit">([\s\S]*?)<\/div>/g, (_m, inner) => {
    const id = `lim-${ch.num.toLowerCase()}-${limits.length + 1}`;
    limits.push({ id, inner });
    return `<div class="note limit" id="${id}">${inner}</div>`;
  });
  return { body, labels, limits };
}

/**
 * Fill the known-limitations appendix (marker <!-- known-limitations -->) from every Limitation note.
 * `where(id)` renders the pointer back to the note (a page number in print, a link in the console).
 */
export function fillLimitations(chapters, where) {
  const blocks = chapters
    .filter((ch) => ch.floats.limits.length > 0)
    .map((ch) => {
      const items = ch.floats.limits
        .map((l) => `<li>${l.inner.replace(/<\/?p>/g, ' ').trim()} ${where(l.id)}</li>`)
        .join('\n');
      const label = `${ch.label === 'APPENDIX' ? 'Appendix' : 'Chapter'} ${ch.num}`;
      return `<h3 id="limx-${ch.num.toLowerCase()}">${label}: ${ch.title}</h3>\n<ul class="limlist">\n${items}\n</ul>`;
    })
    .join('\n');
  for (const ch of chapters) {
    ch.floats.body = ch.floats.body.replace('<!-- known-limitations -->', blocks);
  }
}

/** Every id and its display text (chapter, section, figure, table), for cross references. */
export function buildIndex(chapters) {
  const index = new Map();
  for (const ch of chapters) {
    const add = (id, text) => {
      if (index.has(id)) throw new GuideError(`duplicate id "${id}" (${ch.file})`);
      index.set(id, text);
    };
    add(ch.id, ch.title);
    for (const s of ch.sections) add(s.id, s.text);
    for (const [id, label] of ch.floats.labels) add(id, label);
    for (const m of ch.floats.body.matchAll(/\bid="([a-z0-9-]+)"/g)) {
      if (!index.has(m[1])) add(m[1], m[1]);
    }
  }
  for (const ch of chapters) {
    for (const m of ch.floats.body.matchAll(/href="#([a-z0-9-]+)"/g)) {
      if (!index.has(m[1])) throw new GuideError(`${ch.file}: link to unknown id "#${m[1]}"`);
    }
  }
  return index;
}

/** Give every empty cross reference its target's display text. */
export function fillXrefs(html, index) {
  return html.replace(
    /<a class="xref" href="#([a-z0-9-]+)"><\/a>/g,
    (_m, id) => `<a class="xref" href="#${id}">${index.get(id) ?? id}</a>`,
  );
}

/** Load, lint, number, assemble the limitations and index the guide: the shared front half. */
export function processGuide(guideDir, where) {
  const meta = JSON.parse(readFileSync(join(guideDir, 'guide.json'), 'utf8'));
  const legal = readFileSync(join(guideDir, 'front', 'legal.html'), 'utf8');
  const chapters = loadChapters(guideDir);
  if (chapters.length === 0) throw new GuideError('no chapters in docs/guide/chapters');
  lint(chapters, [
    ['front/legal.html', legal],
    ['guide.json', JSON.stringify(meta)],
  ]);
  for (const ch of chapters) ch.floats = numberFloats(ch);
  fillLimitations(chapters, where);
  const index = buildIndex(chapters);
  return { meta, legal, chapters, index };
}
