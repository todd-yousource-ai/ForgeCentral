# Brand assets (canonical)

The committed source of truth for the YouSource brand furniture used across the Console
(`TRD-CONSOLE-00` Section 6.1/6.2). Prefer the **SVG** for the web (crisp at any size); the PNG/GIF are
raster/animated fallbacks. The Console renders on a dark canvas, so the **on-dark** variant is the
default; the **on-light** variant is for light surfaces (print, email, exported reports, light embeds).

## The logo

| Intended background | Vector (preferred) | Raster | Animated |
|---------------------|--------------------|--------|----------|
| **Dark** (Console default) | `yousource-logo-on-dark.svg` | `yousource-logo.png` | `yousource-logo.gif` |
| **Light** | `yousource-logo-on-light.svg` | `yousource-logo-on-light.png` | `yousource-logo-on-light.gif` |

The swirling teal-to-navy torus mark + "YouSource.ai" wordmark. `yousource-logo.png` / `yousource-logo.gif`
are the original on-dark raster/animated assets (kept under their historical names, referenced by the
spec); `yousource-logo-on-dark.svg` is their vector form. The animated variants are reserved for
load/splash (Section 6.2); the mark is static elsewhere.

## The honeycomb field

`yousource-honeycomb.jpg` -- the dark hex-mesh ambient field, rendered low-contrast behind content-light
surfaces and the Overview flow so it never competes with data (Section 6.2).

## Usage

Use the semantic design tokens for color (`@forge/design`), and these assets for the mark/field. Do not
recolor or restretch the logo; pick the variant that matches the background. The `.eps` print masters are
not committed here (large, print-only); request them from the brand source if needed.
