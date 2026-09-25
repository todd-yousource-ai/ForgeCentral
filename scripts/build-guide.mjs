#!/usr/bin/env node
// scripts/build-guide.mjs -- render the ForgeCentral Configuration Guide (docs/guide) to HTML and PDF.
//
// The guide is authored as HTML fragments in docs/guide/chapters/ (NN-slug.html per chapter,
// 9N-appendix-slug.html per appendix), in the Cisco configuration-guide layout with the Forge brand
// (docs/guide/assets/forge-guide.css). This script:
//   1. (scripts/guide-model.mjs, shared with the console's ReadMe) validates the fragments: every h2 / h3 carries an id, ids are unique, every internal link
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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GuideError, fillXrefs, processGuide } from './guide-model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// FORGE_GUIDE_DIR renders another copy of the guide (a review draft); the default is the committed one.
const GUIDE = process.env.FORGE_GUIDE_DIR ?? join(ROOT, 'docs', 'guide');
const OUT = join(GUIDE, 'build');
const BASENAME = 'ForgeCentral-Configuration-Guide';

// TUNE: the page-number fill settles in two passes in practice (numbers change no line breaks); the
// cap bounds a layout that would oscillate, which then fails loudly instead of looping.
const MAX_PASSES = 4;

const pn = (id) => `<span class="pn" data-ref="${id}"></span>`;

function fail(message) {
  process.stderr.write(`build-guide: ${message}\n`);
  process.exit(1);
}

function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

function fillRefs(html, index, pages) {
  return fillXrefs(html, index).replace(
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
  let processed;
  try {
    processed = processGuide(
      GUIDE,
      (id) => `<span class="on">(<a href="#${id}">page ${pn(id)}</a>)</span>`,
    );
  } catch (err) {
    if (err instanceof GuideError) fail(err.message);
    throw err;
  }
  const { meta, legal, chapters, index } = processed;
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
