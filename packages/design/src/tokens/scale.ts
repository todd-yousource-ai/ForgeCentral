// packages/design/src/tokens/scale.ts -- the non-color scale tokens (F0.2a).
//
// Spacing, radius, typography, elevation, and motion, as named scales the Console composes with. Like
// the color tokens these have exactly one home; components reference the token, not a magic number, so
// density and rhythm stay consistent across every surface (TRD-CONSOLE-00 Section 6).

/** A 4px base spacing scale (the mockups' density). */
export const spacing = {
  none: '0',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
} as const;

/** Corner radii. `pill` is the chip/badge shape (fully rounded). */
export const radius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  pill: '999px',
} as const;

/** Typography scale: a system font stack, a modular size ramp, weights, and line heights. */
export const typography = {
  fontFamily: {
    // TUNE: a system stack (no web-font dependency shipped); the implementing surface may pin a brand face.
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
  },
  size: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    '2xl': '28px',
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.2',
    normal: '1.5',
  },
} as const;

/** Elevation shadows for raised surfaces. */
export const elevation = {
  none: 'none',
  card: '0 1px 2px rgba(0, 0, 0, 0.4)',
  drawer: '0 8px 24px rgba(0, 0, 0, 0.5)',
  popover: '0 4px 12px rgba(0, 0, 0, 0.45)',
  // The floating-glass shadow: a soft, distant drop that reads as a panel hovering above the ambient
  // backdrop (the SOC Ops visual-language proof). Deeper than drawer, never harsh.
  glass: '0 12px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.35)',
} as const;

/**
 * The floating-glass material scale (the SOC Ops visual-language proof, TRD-CONSOLE-03 direction).
 *
 * The material itself: how much backdrop is blurred/saturated through a panel, how opaque the panel
 * tint is, and how strong the specular edge-light and grain read. Colors are NEVER defined here --
 * the glass derives every hue from the surface/brand color tokens via `color-mix()` in the component
 * stylesheet, so the material recolors with the theme (INV-CONSOLE-DESIGN-SEMANTIC-COLOR).
 *
 * TUNE: blur radii chosen on a 2560-wide dark canvas -- raised reads as etched, floating as hovering;
 * past ~32px text under the panel ghosts. Tint percentages keep body text at AA contrast on the
 * ambient backdrop (verified by the contrast test against the darkest token). Grain above 0.05 reads
 * as dirt on a dark theme.
 */
export const glass = {
  blur: '18px',
  blurHeavy: '28px',
  saturate: '140%',
  tint: '72%',
  tintHeavy: '84%',
  edge: '22%',
  grain: '0.04',
} as const;

/** Motion: subtle, purposeful durations + easing (Section 6.3/6.4; reduced-motion is honored by consumers). */
export const motion = {
  duration: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

/** Flatten a nested scale group to `prefix-path` / value pairs for CSS-variable generation. */
export function flattenScale(
  prefix: string,
  group: Readonly<Record<string, unknown>>,
): ReadonlyArray<{ readonly name: string; readonly value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const [key, value] of Object.entries(group)) {
    const name = `${prefix}-${key}`;
    if (typeof value === 'string') {
      out.push({ name, value });
    } else if (value && typeof value === 'object') {
      out.push(...flattenScale(name, value as Record<string, unknown>));
    }
  }
  return out;
}

/** Every scale token flattened, for CSS-variable generation. */
export const scaleTokens: ReadonlyArray<{ readonly name: string; readonly value: string }> = [
  ...flattenScale('space', spacing),
  ...flattenScale('radius', radius),
  ...flattenScale('font', typography),
  ...flattenScale('elevation', elevation),
  ...flattenScale('motion', motion),
  ...flattenScale('glass', glass),
];
