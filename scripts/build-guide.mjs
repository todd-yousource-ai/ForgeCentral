#!/usr/bin/env node
// scripts/build-guide.mjs -- render the ForgeCentral Configuration Guide (docs/guide) to HTML and PDF.
//
// The guide is authored as HTML fragments in docs/guide/chapters/ (NN-slug.html per chapter,
// 9N-appendix-slug.html per appendix), in the Cisco configuration-guide layout with the Forge brand
// (docs/guide/assets/forge-guide.css). This script:
//   1. validates the fragments: every h2 / h3 carries an id, ids are unique, every internal link
//      resolves, no em or en dash, and no internal component or repository name in prose (commands and
//      paths inside <code> / <pre> are exempt) -- INV-GUIDE-FORGE-NAMING;
//   2. numbers figures and tables per chapter and fills cross references;
//   3. assembles the cover, the legal page, the contents and the chapters into one self-contained HTML
//      (images embedded as data URIs);
//   4. prints it to PDF with the console's Playwright Chromium, reads the PDF's named destinations
//      (pdfinfo -dests) and fills every page number, re-printing until the numbers are stable.
//
// Prerequisites: the console's Playwright Chromium (`pnpm --filter console exec playwright install
// chromium`), poppler-utils (`pdfinfo`), and the Roboto font family (`fonts-roboto`).
// Usage: node scripts/build-guide.mjs        -> docs/guide/build/ForgeCentral-Configuration-Guide.{html,pdf}
//        FORGE_GUIDE_DIR=<dir> node scripts/build-guide.mjs   renders a copy laid out like docs/guide.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// FORGE_GUIDE_DIR renders another copy of the guide (a review draft); the default is the committed one.
const GUIDE = process.env.FORGE_GUIDE_DIR ?? join(ROOT, 'docs', 'guide');
const OUT = join(GUIDE, 'build');
const BASENAME = 'ForgeCentral-Configuration-Guide';

// TUNE: the page-number fill settles in two passes in practice (numbers change no line breaks); the
// cap bounds a layout that would oscillate, which then fails loudly instead of looping.
const MAX_PASSES = 4;

// Internal names the guide's prose must never use (operator ruling 2026-09-25: Forge is the platform;
// repository and component names are internal). Checked outside <code> and <pre>.
const INTERNAL_NAMES = /\b(crucible\w*|crdb|cdb|torch\w*|bff|sidecar|forge-central)\b/i;
const PROVENANCE = /\b(TRD-\S+|IP-[A-Z]{2,}\S*|CD-\d+)\b/;
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

const pn = (id) => `<span class="pn" data-ref="${id}"></span>`;

function fail(message) {
  process.stderr.write(`build-guide: ${message}\n`);
  process.exit(1);
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&nbsp;/g, ' ');
}

function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

/** Read the chapter fragments in file order and give each its label, number and section list. */
function loadChapters() {
  const dir = join(GUIDE, 'chapters');
  const files = readdirSync(dir)
    .filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f))
    .sort();
  let chapterNo = 0;
  let appendixNo = 0;
  return files.map((file) => {
    const html = readFileSync(join(dir, file), 'utf8');
    const h1 = /<h1>([^<]+)<\/h1>/.exec(html);
    if (h1 === null) fail(`${file}: the fragment must open with <h1>Title</h1>`);
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

/** Fail on anything the content rules forbid (see the header). */
function lint(chapters, frontFiles) {
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
  if (problems.length > 0) fail(`content lint failed:\n  ${problems.join('\n  ')}`);
}

/** Number the figures and tables of one chapter; returns the new body and the label of each id. */
function numberFloats(ch) {
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

/** Fill the known-limitations appendix (marker <!-- known-limitations -->) from every Limitation note. */
function fillLimitations(chapters) {
  const blocks = chapters
    .filter((ch) => ch.floats.limits.length > 0)
    .map((ch) => {
      const items = ch.floats.limits
        .map(
          (l) =>
            `<li>${l.inner.replace(/<\/?p>/g, ' ').trim()} <span class="on">(<a href="#${l.id}">page ${pn(l.id)}</a>)</span></li>`,
        )
        .join('\n');
      const where = `${ch.label === 'APPENDIX' ? 'Appendix' : 'Chapter'} ${ch.num}`;
      return `<h3 id="limx-${ch.num.toLowerCase()}">${where}: ${ch.title}</h3>\n<ul class="limlist">\n${items}\n</ul>`;
    })
    .join('\n');
  for (const ch of chapters) {
    ch.floats.body = ch.floats.body.replace('<!-- known-limitations -->', blocks);
  }
}

/** Every id and its display text (chapter, section, figure, table), for cross references. */
function buildIndex(chapters) {
  const index = new Map();
  for (const ch of chapters) {
    const add = (id, text) => {
      if (index.has(id)) fail(`duplicate id "${id}" (${ch.file})`);
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
      if (!index.has(m[1])) fail(`${ch.file}: link to unknown id "#${m[1]}"`);
    }
  }
  return index;
}

function fillRefs(html, index, pages) {
  return html
    .replace(
      /<a class="xref" href="#([a-z0-9-]+)"><\/a>/g,
      (_m, id) => `<a class="xref" href="#${id}">${index.get(id) ?? id}</a>`,
    )
    .replace(
      /<span class="pn" data-ref="([a-z0-9-]+)"><\/span>/g,
      (_m, id) => `<span class="pn" data-ref="${id}">${pages.get(id) ?? '0'}</span>`,
    );
}

function cover(meta, assets) {
  return `<div class="cover">
  <div class="brandbar"><img src="${assets.mark}" alt="Forge"><div class="word">Forge<span>Central</span></div></div>
  <div class="hero"></div>
  <div class="title">
    <h1>${meta.title}</h1>
    <p class="subtitle">${meta.subtitle}</p>
    <div class="meta"><b>First Published:</b> ${meta.published}<br><b>Applies to:</b> ${meta.appliesTo}</div>
    <div class="draft">${meta.status}</div>
  </div>
  <div class="company"><img src="${assets.logo}" alt="YouSource.ai">${meta.company}</div>
</div>`;
}

function contents(chapters) {
  const blocks = chapters.map((ch) => {
    const lines = ch.sections
      .map(
        (s) =>
          `<div class="toc-line l${s.level}"><a href="#${s.id}">${s.text}</a> ${pn(s.id)}</div>`,
      )
      .join('\n');
    return `<div class="toc-chapter"><div class="label">${ch.label} ${ch.num}</div><div class="entries">
<div class="toc-line l1"><a href="#${ch.id}">${ch.title}</a> ${pn(ch.id)}</div>
${lines}</div></div>`;
  });
  return `<div class="contents"><div class="band"></div><h1 class="toc-title">CONTENTS</h1>\n${blocks.join('\n')}</div>`;
}

function chapterHtml(ch) {
  const mini = ch.sections
    .filter((s) => s.level === 2)
    .map(
      (s) =>
        `<li><a href="#${s.id}">${s.text}</a><span class="on">, on page ${pn(s.id)}</span></li>`,
    )
    .join('\n');
  return `<section class="chapter" id="${ch.id}" style="page: pg-${ch.num}">
<div class="opener"><div class="band"></div><div class="chapnum">${ch.label}<span class="n">${ch.num}</span></div>
<h1>${ch.title}</h1><ul class="minitoc">${mini}</ul></div>
${ch.floats.body}
</section>`;
}

function pageRules(chapters) {
  return chapters
    .map((ch) => {
      const title = `${ch.label === 'APPENDIX' ? `Appendix ${ch.num}: ` : ''}${ch.title}`.replace(
        /"/g,
        '\\"',
      );
      return `@page pg-${ch.num} { @top-left { content: "${title}"; font: 700 8.5pt 'Roboto Condensed', sans-serif; color: #0c2748; vertical-align: bottom; padding-bottom: 10pt; border-left: 5pt solid #3fbe96; padding-left: 6pt; } }`;
    })
    .join('\n');
}

function assemble(chapters, parts, index, pages) {
  const body = [parts.cover, parts.legal, contents(chapters), ...chapters.map(chapterHtml)].join(
    '\n',
  );
  const css = `${parts.css}\n${pageRules(chapters)}\n.band, .cover .hero { background-image: url(${parts.honeycomb}); }`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${parts.meta.title}</title>
<style>${css}</style></head><body>
${body}
</body></html>`;
  return fillRefs(html, index, pages);
}

async function printPdf(browser, htmlPath, pdfPath) {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.pdf({
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    outline: true,
    tagged: true,
  });
  await page.close();
}

function readDests(pdfPath) {
  const out = execFileSync('pdfinfo', ['-dests', pdfPath], { encoding: 'utf8' });
  const dests = new Map();
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+\[.*\]\s+"([^"]+)"\s*$/.exec(line);
    if (m !== null) dests.set(m[2], Number(m[1]));
  }
  return dests;
}

function sameNumbers(refs, a, b) {
  return refs.every((id) => a.get(id) === b.get(id));
}

async function main() {
  const meta = JSON.parse(readFileSync(join(GUIDE, 'guide.json'), 'utf8'));
  const legal = readFileSync(join(GUIDE, 'front', 'legal.html'), 'utf8');
  const chapters = loadChapters();
  if (chapters.length === 0) fail('no chapters in docs/guide/chapters');
  lint(chapters, [
    ['front/legal.html', legal],
    ['guide.json', JSON.stringify(meta)],
  ]);
  for (const ch of chapters) ch.floats = numberFloats(ch);
  fillLimitations(chapters);
  const index = buildIndex(chapters);
  const assets = {
    mark: dataUri(join(ROOT, 'apps', 'console', 'public', 'forge.png'), 'image/png'),
    logo: dataUri(join(ROOT, 'docs', 'assets', 'yousource-logo-on-light.svg'), 'image/svg+xml'),
  };
  const parts = {
    meta,
    css: readFileSync(join(GUIDE, 'assets', 'forge-guide.css'), 'utf8'),
    honeycomb: dataUri(join(ROOT, 'docs', 'assets', 'yousource-honeycomb.jpg'), 'image/jpeg'),
    cover: cover(meta, assets),
    legal: `<div class="legal">${legal}</div>`,
  };

  mkdirSync(OUT, { recursive: true });
  const htmlPath = join(OUT, `${BASENAME}.html`);
  const pdfPath = join(OUT, `${BASENAME}.pdf`);
  const require = createRequire(join(ROOT, 'apps', 'console', 'package.json'));
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  try {
    let pages = new Map();
    const probe = assemble(chapters, parts, index, pages);
    const refs = [...new Set([...probe.matchAll(/data-ref="([a-z0-9-]+)"/g)].map((m) => m[1]))];
    for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
      writeFileSync(htmlPath, assemble(chapters, parts, index, pages));
      await printPdf(browser, htmlPath, pdfPath);
      const dests = readDests(pdfPath);
      const missing = refs.filter((id) => !dests.has(id));
      if (missing.length > 0)
        fail(`no PDF destination for: ${missing.join(', ')} (is each one linked?)`);
      if (sameNumbers(refs, dests, pages)) {
        process.stdout.write(
          `build-guide: ${chapters.length} chapters, ${refs.length} page references, stable after ${pass} passes\n`,
        );
        process.stdout.write(`build-guide: wrote ${htmlPath}\nbuild-guide: wrote ${pdfPath}\n`);
        return;
      }
      pages = dests;
    }
    fail(`page numbers did not settle within ${MAX_PASSES} passes`);
  } finally {
    await browser.close();
  }
}

await main();
