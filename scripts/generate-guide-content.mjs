#!/usr/bin/env node
// scripts/generate-guide-content.mjs -- emit the ReadMe tab's content from the configuration guide
// (IP-CONSOLE-11-guide GD.2; TRD-CONSOLE-11 Section 11).
//
// The chapters in docs/guide/chapters/ are the one source of the guide. This script runs them through
// the shared model (scripts/guide-model.mjs: the same lint, numbering, cross references and
// known-limitations appendix the printed guide gets), parses each chapter, and writes a typed element
// tree to apps/console/src/guide/generated/guide-content.ts. The console renders that tree as React
// elements: no HTML string reaches the browser, and only the tags and attributes allowed below can
// appear in the tree -- anything else fails the generation (the build-time sanitizer).
//
// Appendix A's static tables are replaced by markers the console fills from the live SETTINGS_READ
// (TRD-CONSOLE-11 11.4: engine-owned facts render live, never copied).
//
// Usage: node scripts/generate-guide-content.mjs           writes the generated module
//        node scripts/generate-guide-content.mjs --check   fails if the committed module is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GuideError, fillXrefs, processGuide, stripTags } from './guide-model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// FORGE_GUIDE_DIR reads another copy (the contract test's doctored fixtures); the default is the committed one.
const GUIDE = process.env.FORGE_GUIDE_DIR ?? join(ROOT, 'docs', 'guide');
const OUT = join(ROOT, 'apps', 'console', 'src', 'guide', 'generated', 'guide-content.ts');
const REFERENCE_CHAPTER = 'ch-appendix-settings-reference';

const HTML_TAGS = new Set([
  'a',
  'b',
  'br',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h2',
  'h3',
  'h4',
  'i',
  'kbd',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
  'wbr',
]);
const SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'linearGradient',
  'stop',
  'rect',
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'text',
  'tspan',
  'title',
]);
const HTML_ATTRS = new Set(['class', 'id', 'href', 'colspan', 'rowspan', 'style', 'title']);
const SVG_ATTRS = new Set([
  'class',
  'id',
  'style',
  'viewBox',
  'xmlns',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'marker-end',
  'marker-start',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'refX',
  'refY',
  'orient',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
]);
// Whitespace between these elements' children is layout noise (and invalid DOM inside a table row).
const NO_TEXT_CHILDREN = new Set([
  'table',
  'thead',
  'tbody',
  'tr',
  'ul',
  'ol',
  'dl',
  'svg',
  'g',
  'defs',
  'marker',
  'linearGradient',
]);

function parser() {
  const require = createRequire(join(ROOT, 'apps', 'console', 'package.json'));
  const { Window } = require('happy-dom');
  return new Window();
}

/** Convert one parsed node to the tree, refusing anything outside the allowlist. */
function toNode(node, where, problems) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType === 8) return null; // a comment
  if (node.nodeType !== 1) {
    problems.push(`${where}: unexpected node type ${node.nodeType}`);
    return null;
  }
  const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
  const tag = node.localName;
  if (!(svg ? SVG_TAGS : HTML_TAGS).has(tag)) {
    problems.push(`${where}: <${tag}> is not allowed`);
    return null;
  }
  const allowed = svg ? SVG_ATTRS : HTML_ATTRS;
  const attrs = {};
  for (const attr of node.attributes) {
    if (!allowed.has(attr.name)) {
      problems.push(`${where}: <${tag} ${attr.name}> is not allowed`);
      continue;
    }
    if (attr.name === 'href' && !/^#[a-z0-9-]+$/.test(attr.value)) {
      problems.push(`${where}: only in-guide links are allowed (<a href="${attr.value}">)`);
      continue;
    }
    attrs[attr.name] = attr.value;
  }
  const children = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && NO_TEXT_CHILDREN.has(tag) && child.textContent.trim() === '') {
      continue;
    }
    const converted = toNode(child, where, problems);
    if (converted !== null) children.push(converted);
  }
  const out = { t: tag };
  if (Object.keys(attrs).length > 0) out.a = attrs;
  if (children.length > 0) out.c = children;
  return out;
}

function topLevel(window, html, where, problems) {
  const doc = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const nodes = [];
  for (const child of doc.body.childNodes) {
    if (child.nodeType === 3 && child.textContent.trim() === '') continue;
    const converted = toNode(child, where, problems);
    if (converted !== null) nodes.push(converted);
  }
  return nodes;
}

function plainText(node) {
  if (typeof node === 'string') return node;
  return (node.c ?? []).map(plainText).join(' ');
}

/** The registry keys an Appendix A table lists (its first column), in order. */
function tableKeys(node) {
  const keys = [];
  const visit = (n) => {
    if (typeof n === 'string') return;
    if (n.t === 'tr') {
      const first = (n.c ?? []).find((c) => typeof c !== 'string' && c.t === 'td');
      if (first !== undefined) keys.push(plainText(first).replace(/\s+/g, ''));
      return;
    }
    (n.c ?? []).forEach(visit);
  };
  visit(node);
  return keys;
}

/** Split a chapter's top-level nodes into its opening and one section per h2. */
function sectionize(nodes, isReference, referenceKeys) {
  const intro = [];
  const sections = [];
  for (const node of nodes) {
    if (typeof node !== 'string' && node.t === 'h2') {
      sections.push({
        id: node.a?.id ?? '',
        title: plainText(node).replace(/\s+/g, ' ').trim(),
        subsections: [],
        nodes: [],
      });
      continue;
    }
    let kept = node;
    if (
      isReference &&
      typeof node !== 'string' &&
      node.t === 'div' &&
      /\btablewrap\b/.test(node.a?.class ?? '')
    ) {
      const keys = tableKeys(node);
      referenceKeys.push(...keys);
      kept = { t: 'x-settings-reference', a: { id: node.a?.id ?? '', keys: keys.join(' ') } };
    }
    const current = sections.at(-1);
    if (current === undefined) {
      intro.push(kept);
      continue;
    }
    if (typeof kept !== 'string' && kept.t === 'h3') {
      current.subsections.push({
        id: kept.a?.id ?? '',
        title: plainText(kept).replace(/\s+/g, ' ').trim(),
      });
    }
    current.nodes.push(kept);
  }
  for (const s of sections) {
    s.text = s.nodes.map(plainText).join(' ').replace(/\s+/g, ' ').trim();
  }
  return { intro, sections };
}

function generate() {
  const { meta, chapters, index } = processGuide(
    GUIDE,
    (id) => `<span class="on">(<a href="#${id}">see the note</a>)</span>`,
  );
  const window = parser();
  const problems = [];
  try {
    const out = chapters.map((ch) => {
      const nodes = topLevel(window, fillXrefs(ch.floats.body, index), ch.file, problems);
      const isReference = ch.id === REFERENCE_CHAPTER;
      const referenceKeys = [];
      const { intro, sections } = sectionize(nodes, isReference, referenceKeys);
      const chapter = {
        id: ch.id,
        label: ch.label,
        num: ch.num,
        title: stripTags(ch.title),
        intro,
        sections,
      };
      if (isReference) chapter.referenceKeys = referenceKeys;
      return chapter;
    });
    if (problems.length > 0)
      throw new GuideError(`not allowed in the ReadMe:\n  ${problems.join('\n  ')}`);
    if (!out.some((ch) => ch.id === REFERENCE_CHAPTER)) {
      throw new GuideError(`the settings reference chapter (${REFERENCE_CHAPTER}) is missing`);
    }
    return { meta, chapters: out };
  } finally {
    window.happyDOM.close();
  }
}

/** One JSON value per line per section, so a chapter edit is a readable diff. */
function render({ meta, chapters }) {
  const lines = [
    '// @generated by scripts/generate-guide-content.mjs from docs/guide/ -- do not edit by hand.',
    '// Regenerate with `node scripts/generate-guide-content.mjs`; the contract test fails when stale.',
    '',
    "import type { GuideDocument } from '../model.js';",
    '',
    'export const GUIDE: GuideDocument = {',
    `  title: ${JSON.stringify(meta.title)},`,
    `  published: ${JSON.stringify(meta.published)},`,
    `  appliesTo: ${JSON.stringify(meta.appliesTo)},`,
    '  chapters: [',
  ];
  for (const ch of chapters) {
    lines.push('    {');
    lines.push(`      id: ${JSON.stringify(ch.id)},`);
    lines.push(`      label: ${JSON.stringify(ch.label)},`);
    lines.push(`      num: ${JSON.stringify(ch.num)},`);
    lines.push(`      title: ${JSON.stringify(ch.title)},`);
    if (ch.referenceKeys !== undefined)
      lines.push(`      referenceKeys: ${JSON.stringify(ch.referenceKeys)},`);
    lines.push(`      intro: ${JSON.stringify(ch.intro)},`);
    lines.push('      sections: [');
    for (const s of ch.sections) lines.push(`        ${JSON.stringify(s)},`);
    lines.push('      ],');
    lines.push('    },');
  }
  lines.push('  ],', '};', '');
  return lines.join('\n');
}

function main() {
  let text;
  try {
    text = render(generate());
  } catch (err) {
    if (err instanceof GuideError) {
      process.stderr.write(`generate-guide-content: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  if (process.argv.includes('--check')) {
    let committed = '';
    try {
      committed = readFileSync(OUT, 'utf8');
    } catch {
      // absent: stale by definition
    }
    if (committed !== text) {
      process.stderr.write(
        'generate-guide-content: apps/console/src/guide/generated/guide-content.ts is stale; run `node scripts/generate-guide-content.mjs`\n',
      );
      process.exit(1);
    }
    process.stdout.write('generate-guide-content: up to date\n');
    return;
  }
  writeFileSync(OUT, text);
  process.stdout.write(`generate-guide-content: wrote ${OUT}\n`);
}

main();
