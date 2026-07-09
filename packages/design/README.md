# @forge/design

The Console design system. Implements `TRD-CONSOLE-00` Section 6 (the dark theme, the only theme).

- **F0.2a:** the design-token foundation -- semantic color tokens, scale tokens, CSS-variable theme
  generation, and the WCAG contrast tooling that proves the theme is accessible.
- **F0.2b:** the React component shells + their stylesheet, built on the tokens with isolated-render + a11y
  tests. This PR lands the harness and the core primitives; the data-bound / complex shells (data table,
  flow-graph host, charts, timeline scrubber) and the remaining overlays (right drawer, confirm dialog)
  follow (F0.2c / with their first consuming surface).

## Components (F0.2b)

React shells consuming the tokens (color by semantic variant, never a hex): `Badge` (status/chip),
`ScoreRing` (0-100 trust score, banded green/amber/red), `KpiCard` (dashboard metric), `TabStrip` (ARIA
tablist with roving tabindex + arrow-key navigation). Import the stylesheet with the theme at the app root:

```ts
import { tokensToCss, componentStyles } from '@forge/design';
const css = tokensToCss() + componentStyles();
```

Components render semantic classNames and ARIA; `componentStyles()` gives them their look using the
`--fc-*` variables, so no component holds a color literal.

## Tokens

- **Color** (`src/tokens/color.ts`) -- the ONE home for color values, keyed by MEANING (`status.good`,
  `flow.users`, `surface.canvas`, ...), reproducing `TRD-CONSOLE-00` Section 6.1. `INV-CONSOLE-DESIGN-
SEMANTIC-COLOR`: this is the only file permitted to hold a color hex literal; a hand-picked hex anywhere
  else in `src/` fails the token test.
- **Scale** (`src/tokens/scale.ts`) -- spacing (4px base), radius, typography, elevation, motion.

## Theme (CSS variables)

`tokensToCss()` (`src/css.ts`) renders the tokens as a `:root { --fc-color-...: ...; }` block, so styles
bind to `var(--fc-color-status-good)` rather than a value. The token module stays the single source; the
CSS is a projection of it.

## Accessibility tooling

`src/contrast.ts` implements the WCAG 2.1 contrast ratio. The token test asserts primary/muted text meets
AA (4.5:1) on every surface and each flow/status accent meets the non-text AA threshold (3:1) on the
canvas, so the "WCAG AA on all text/data" claim (Section 6.4) is verified, not assumed.

## Tests

`pnpm --filter @forge/design test` (Vitest). Tokens: the semantic-color invariant (hex scan across
`.ts`/`.tsx`), the WCAG contrast assertions, and CSS-variable generation. Components: isolated render in
happy-dom with Testing Library -- role/name/keyboard assertions verify each shell's ARIA contract. A full
axe audit is deferred (axe-core is MPL-2.0, outside the dependency allowlist); the role-based assertions
enforce name/role/value now.
