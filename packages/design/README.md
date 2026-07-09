# @forge/design

The Console design system. Implements `TRD-CONSOLE-00` Section 6 (the dark theme, the only theme). This
package is being built in two PRs:

- **F0.2a (this):** the design-token foundation -- semantic color tokens, scale tokens, CSS-variable
  theme generation, and the WCAG contrast tooling that proves the theme is accessible.
- **F0.2b (next):** the React component shells (flow-graph host, score ring, KPI card, data table, tab
  strip, right drawer, badge/chip, timeline scrubber, chart primitives, confirm dialog), built on these
  tokens with isolated-render + a11y tests.

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

`pnpm --filter @forge/design test` (Vitest). Tier 1: the semantic-color invariant (hex scan), the WCAG
contrast assertions, and CSS-variable generation.
