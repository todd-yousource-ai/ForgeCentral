# @forge/design

The Console design system. Implements `TRD-CONSOLE-00` Section 6 (the dark theme,
the only theme). The visual ground truth is `docs/ui-examples/`; the tokens here
are its programmatic form.

## Tokens

- **Color** (`src/tokens/color.ts`) -- the ONE home for color values, keyed by
  MEANING (`status.good`, `flow.users`, `surface.canvas`, ...), reproducing
  `TRD-CONSOLE-00` §6.1. `INV-CONSOLE-DESIGN-SEMANTIC-COLOR`: this is the only
  file permitted to hold a color hex literal; a hand-picked hex anywhere else in
  `src/` fails the token test.
- **Scale** (`src/tokens/scale.ts`) -- spacing (4px base), radius, typography,
  elevation, motion.

## Theme (CSS variables)

`tokensToCss()` (`src/css.ts`) renders the tokens as a
`:root { --fc-...: ...; }` block, so styles bind to
`var(--fc-color-status-good)` rather than a value; `componentStyles()`
(`src/styles.ts`) gives the components their look from those variables, so no
component holds a color literal. Import both at the app root.

## Components (`src/components/`)

React shells consuming the tokens (color by semantic variant, never a hex):

- **Primitives** -- `Badge`, `ScoreRing` (banded 0-100), `KpiCard`, `TabStrip`
  (ARIA tablist, roving tabindex), `Sparkline`, `GlassPanel`, `AmbientBackdrop`.
- **Data + layout** -- `DataTable`, `AccordionGroup`, `ContainerMembersView`.
- **Overlays** -- `Drawer`, `EntityDrawer` (the right-drawer entity pattern),
  `ConfirmDialog` (the select-then-act confirmation).
- **Surface-scale** -- `OverviewSankeyFlow` (the Overview connectivity flow),
  `VtzZoneCard`.

Components render semantic classNames and ARIA; surfaces in `apps/console`
compose them rather than inventing new patterns.

## Accessibility tooling

`src/contrast.ts` implements the WCAG 2.1 contrast ratio. The token test asserts
primary/muted text meets AA (4.5:1) on every surface and each flow/status accent
meets the non-text threshold (3:1) on the canvas -- the "WCAG AA on all
text/data" claim (§6.4) is verified, not assumed.

## Tests

`pnpm --filter @forge/design test` (Vitest). Tokens: the semantic-color invariant
(hex scan across `.ts`/`.tsx`), the WCAG contrast assertions, CSS-variable
generation. Components: isolated render in happy-dom with Testing Library --
role/name/keyboard assertions verify each shell's ARIA contract. A full axe audit
is deferred (axe-core is MPL-2.0, outside the dependency allowlist); the
role-based assertions enforce name/role/value now.
