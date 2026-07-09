// packages/design/src/css.ts -- CSS custom-property generation from tokens (F0.2a).
//
// Emits the design tokens as CSS variables under `:root`, so the SPA and any component style can bind to
// `var(--fc-color-status-good)` etc. rather than importing a value. The token module is still the single
// source; this is a projection of it (the same generate-from-one-source discipline as the wire DTO
// codegen in @forge/contracts). All values come from the tokens; no color literal lives here.

import { colorTokens } from './tokens/color.js';
import { scaleTokens } from './tokens/scale.js';

/** The custom-property prefix for every Console token (`--fc-...`). */
export const CSS_VAR_PREFIX = '--fc';

/** The CSS variable name for a color token (e.g. `status-good` -> `--fc-color-status-good`). */
export function colorVarName(name: string): string {
  return `${CSS_VAR_PREFIX}-color-${name}`;
}

/** The CSS variable name for a scale token (e.g. `space-md` -> `--fc-space-md`). */
export function scaleVarName(name: string): string {
  return `${CSS_VAR_PREFIX}-${name}`;
}

/** Render the full token set as a `:root { ... }` CSS custom-property block (the dark theme). */
export function tokensToCss(): string {
  const lines: string[] = [];
  for (const { name, token } of colorTokens) {
    lines.push(`  ${colorVarName(name)}: ${token.value};`);
  }
  for (const { name, value } of scaleTokens) {
    lines.push(`  ${scaleVarName(name)}: ${value};`);
  }
  return `:root {\n${lines.join('\n')}\n}\n`;
}
