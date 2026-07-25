// packages/design/src/components/GlassPanel.tsx -- the floating-glass panel (the SOC Ops
// visual-language proof, TRD-CONSOLE-03 direction).
//
// The Console's owned glass material: a translucent panel that floats over the ambient backdrop with
// backdrop blur + saturation, a specular top edge-light, an elevation shadow, and a whisper of grain.
// Deliberately a HOME-BUILT primitive, not an imported kit: the material is a product differentiator,
// every hue derives from the design tokens via color-mix (INV-CONSOLE-DESIGN-SEMANTIC-COLOR), and a
// third-party cosmetic package would be un-earned supply-chain surface (DEPENDENCY-POLICY.md).
//
// Honesty + accessibility contract:
//   - `prefers-reduced-transparency` and browsers without backdrop-filter both fall back to the solid
//     card surface (the stylesheet handles it; the DOM is identical).
//   - The material is decoration only: it never carries meaning by transparency alone, and it renders
//     its children unchanged, so tests and screen readers see the same tree with or without glass.

import type { ReactElement, ReactNode } from 'react';

/** How high the panel floats over the ambient backdrop. */
export type GlassElevation = 'raised' | 'floating';

export interface GlassPanelProps {
  /** Panel body. Rendered unchanged: the glass is a surface, never a data treatment. */
  readonly children: ReactNode;
  /**
   * `raised` sits in the page flow (zone tiles, side panels); `floating` hovers with the heavy blur +
   * deep shadow (the Zone 0 banner, overlays). Default `raised`.
   */
  readonly elevation?: GlassElevation;
  /** Optional compact header row (a zone label + trailing hint), styled by the material. */
  readonly header?: ReactNode;
  /** Additional class names (layout hooks; the material classes are owned here). */
  readonly className?: string;
  /** Accessible name for the panel region, when the panel is a landmark of its own. */
  readonly ariaLabel?: string;
}

/** The floating-glass panel. A `section` when labeled (a real region), a `div` otherwise. */
export function GlassPanel({
  children,
  elevation = 'raised',
  header,
  className,
  ariaLabel,
}: GlassPanelProps): ReactElement {
  const classes = ['fc-glass', `fc-glass--${elevation}`, className].filter(Boolean).join(' ');
  const body = (
    <>
      {header !== undefined ? <div className="fc-glass__header">{header}</div> : null}
      <div className="fc-glass__body">{children}</div>
    </>
  );
  return ariaLabel !== undefined ? (
    <section className={classes} aria-label={ariaLabel}>
      {body}
    </section>
  ) : (
    <div className={classes}>{body}</div>
  );
}
