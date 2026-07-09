// packages/design/src/contrast.ts -- WCAG 2.1 contrast math (F0.2a).
//
// The dark theme claims WCAG AA contrast on all text/data (TRD-CONSOLE-00 Section 6.4). This module makes
// that claim testable: it computes the WCAG contrast ratio between two colors so the token test can
// assert every text/background and accent/background pair meets the AA threshold, rather than trusting
// the eye. Pure functions over hex strings; no color literals live here.

/** The WCAG AA contrast ratio for normal body text (WCAG 1.4.3). */
export const AA_TEXT = 4.5;
/** The WCAG AA contrast ratio for large text and non-text UI/graphical objects (WCAG 1.4.11). */
export const AA_LARGE = 3;

/** Parse a `#rgb` or `#rrggbb` hex string into 0-255 channels. Throws on a malformed value. */
export function parseHex(hex: string): { r: number; g: number; b: number } {
  const captured = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim())?.[1];
  if (captured === undefined) {
    throw new Error(`not a #rgb or #rrggbb hex color: ${hex}`);
  }
  const body =
    captured.length === 3
      ? captured
          .split('')
          .map((c) => c + c)
          .join('')
      : captured;
  return {
    r: Number.parseInt(body.slice(0, 2), 16),
    g: Number.parseInt(body.slice(2, 4), 16),
    b: Number.parseInt(body.slice(4, 6), 16),
  };
}

/** The sRGB relative luminance of a hex color (WCAG definition), in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The WCAG contrast ratio between two hex colors, in [1, 21]. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
