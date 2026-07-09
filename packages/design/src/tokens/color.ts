// packages/design/src/tokens/color.ts -- the semantic color tokens (F0.2a).
//
// The ONE home for color values in the Console (INV-CONSOLE-DESIGN-SEMANTIC-COLOR): a color is named by
// its MEANING (good / deny / users-lane / caution / ...), never by a hand-picked hex at a call site.
// Components consume these tokens (or the CSS variables generated from them, see ../css.ts); a raw hex
// anywhere else in src/ fails the token test. This is the only file in the package permitted to hold a
// color hex literal.
//
// Values reproduce `TRD-CONSOLE-00` Section 6.1 (dark theme, the only theme). The committed brand assets
// in docs/assets/ are the canonical source; the spec marks these as approximations ("~#...") and the
// implementing TRD (this one) locks them. Where Section 6.1 names a meaning but gives no hex, the value
// is derived and marked TUNE.

/** A single semantic color: its value and what it means (why it exists, not where it is used). */
export interface ColorToken {
  readonly value: string;
  readonly meaning: string;
}

/** Background surfaces, darkest (canvas) to most-elevated (card), plus the hairline border. */
export const surface = {
  canvas: { value: '#0A0E17', meaning: 'app canvas (near-black navy), the base background' },
  panel: { value: '#0D1322', meaning: 'panel/rail background, one step above the canvas' },
  card: { value: '#111A2E', meaning: 'elevated card/drawer background' },
  border: { value: '#1B2740', meaning: 'hairline border between surfaces' },
} as const;

/** Brand identity: the logo teal-green and its deep-navy gradient anchor. */
export const brand = {
  primary: { value: '#3FBE96', meaning: 'brand teal-green: mark, active nav, positive emphasis' },
  deep: { value: '#123A6B', meaning: 'deep-navy brand counterpart, anchors gradients' },
} as const;

/** Connectivity-graph lane colors. Devices reuse the brand teal-green per Section 6.1. */
export const flow = {
  users: { value: '#3B82F6', meaning: 'Users lane (blue)' },
  devices: { value: brand.primary.value, meaning: 'Devices lane (brand teal-green)' },
  agents: { value: '#8B5CF6', meaning: 'AI Agents lane (purple)' },
  objects: { value: '#E8A33D', meaning: 'destination objects (amber)' },
} as const;

/** Score / status / policy-action semantics. `info` reuses the Users blue per Section 6.1. */
export const status = {
  good: { value: '#2ECC8F', meaning: 'good / permit / healthy score band (green)' },
  caution: { value: '#E8C14A', meaning: 'caution / monitor / mid score band (amber)' },
  critical: { value: '#E2574C', meaning: 'critical / deny / low score band (red)' },
  // TUNE: Section 6.1 names quarantine/isolate "orange-red" without a hex; derived between amber and red.
  quarantine: { value: '#E8743D', meaning: 'quarantine / isolate (orange-red)' },
  info: { value: flow.users.value, meaning: 'informational (blue)' },
} as const;

/** Foreground text. `onBrand` is the dark text placed on a brand-green fill (reuses the canvas navy). */
export const text = {
  primary: { value: '#F4F7FB', meaning: 'primary text on dark surfaces' },
  muted: { value: '#8A93A5', meaning: 'secondary/muted text and labels' },
  onBrand: { value: surface.canvas.value, meaning: 'dark text on a brand-green fill' },
} as const;

/** Every color token flattened to a `group.name` key, for CSS-variable generation and contrast tests. */
export const colorTokens: ReadonlyArray<{ readonly name: string; readonly token: ColorToken }> = [
  ...groupEntries('surface', surface),
  ...groupEntries('brand', brand),
  ...groupEntries('flow', flow),
  ...groupEntries('status', status),
  ...groupEntries('text', text),
];

function groupEntries(
  group: string,
  tokens: Readonly<Record<string, ColorToken>>,
): ReadonlyArray<{ readonly name: string; readonly token: ColorToken }> {
  return Object.entries(tokens).map(([key, token]) => ({ name: `${group}-${key}`, token }));
}
