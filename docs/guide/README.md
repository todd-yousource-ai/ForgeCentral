# ForgeCentral Configuration Guide (source)

The in-product instruction manual for Forge, authored as a standalone document first (operator
direction 2026-09-25) and posted into ForgeCentral as the Settings ReadMe tab afterwards
(`IP-CONSOLE-11-guide`). Format model: the Cisco configuration guide (cover, contents, chapter
openers with a mini table of contents, an availability table, "How it works" figures with numbered
callouts, Procedure blocks with Step labels, Note / Tip / Caution / Limitation call-outs, running
headers). Brand: the Forge mark and the ForgeCentral design tokens (teal-green `#3FBE96`, deep navy
`#123A6B`, the honeycomb field, Roboto / Roboto Condensed), on a light printed page.

Every statement traces to the configuration census (`docs/implementation-plans/IP-CONSOLE-11-guide-CENSUS.md`
and its evidence slices); re-verify against the code when you change a chapter.

## Build

```bash
node scripts/build-guide.mjs
# -> docs/guide/build/ForgeCentral-Configuration-Guide.html and .pdf (build/ is gitignored)
```

Prerequisites: the console's Playwright Chromium (`pnpm --filter console exec playwright install
chromium`), `pdfinfo` (poppler-utils) and the Roboto fonts (`fonts-roboto`). The build prints the HTML
with Chromium, reads the PDF's named destinations and fills every page number, re-printing until the
numbers are stable. `FORGE_GUIDE_DIR=<dir>` renders a copy laid out like this folder (a review draft).

## Layout

| Path | What it holds |
|------|---------------|
| `guide.json` | Title, subtitle, publication date, status, company block (the cover) |
| `front/legal.html` | The legal page |
| `chapters/NN-slug.html` | One chapter per file, in file order; `9N-appendix-slug.html` for appendices |
| `assets/forge-guide.css` | The print stylesheet (the Forge brand in the Cisco layout) |

The Forge mark, the honeycomb and the YouSource logo are read from their canonical copies
(`apps/console/public/forge.png`, `docs/assets/`) and embedded at build time.

## Authoring rules (the build enforces the first four)

1. A chapter opens with `<h1>Title</h1>`; every `<h2>` and `<h3>` carries an `id`; ids are unique across
   the guide; every internal link resolves.
2. **Forge naming:** prose names the platform Forge, the console ForgeCentral, the Forge engine and the
   Forge endpoint agent; never an internal repository or component name, and never internal plan,
   requirement or defect ids. Commands, paths and identifiers an operator types go in `<code>`.
3. No em or en dashes (use `--` in prose, or rephrase).
4. Figures: `<figure id="fig-..." data-title="..." class="wide">` around an inline SVG in the brand
   palette; the build numbers them (`Figure N-M.`). Tables: `<div class="tablewrap" id="tab-..."
   data-title="...">`; the build numbers them. Cross references: `<a class="xref" href="#id"></a>` is
   filled with the target's title or label; `<span class="pn" data-ref="id"></span>` with its page.
5. Each configuration chapter follows the pattern: Availability table, concepts and How it works (a
   figure whose numbered callouts match numbered steps), Restrictions, one Procedure per task,
   Messages, Verify.
6. Call-outs: `<div class="note">` (Note), `note tip`, `note caution`, `note limit` (Limitation). Every
   Limitation is collected into Appendix B automatically, so write each one to stand on its own.
7. Honest by construction: never claim an effect the platform does not have. State a limitation
   plainly with its workaround; the change that removes it updates the entry.
