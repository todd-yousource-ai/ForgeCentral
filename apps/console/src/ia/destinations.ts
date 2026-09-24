// The Console information architecture: the primary destinations of the left rail (nine in Step 1), in the order of
// TRD-CONSOLE-00 Section 5.1. This is the single source for nav + routing; the rail renders it and the
// router builds one route per entry. Adding a surface later is a data edit here plus its route element.
//
// `path` is the route (Overview is home, `/`). `id` is stable (used by tests, the account menu, and later
// per-surface bindings). `short` is the collapsed-rail glyph label (icons are a design-asset follow-on;
// the shell ships an accessible text glyph, never color alone).

export interface Destination {
  /** Stable id (route key, test handle). */
  readonly id: string;
  /** Human label in the rail + document title. */
  readonly label: string;
  /** The SPA route path. */
  readonly path: string;
  /** Two-letter glyph shown when the rail is collapsed to icons (responsive). */
  readonly short: string;
}

/** The home destination (the live-graph Overview). */
export const HOME: Destination = { id: 'overview', label: 'Overview', path: '/', short: 'Ov' };

// The order + names below are the 2026-07-24 operator IA revision (TRD-CONSOLE-00 Section 5.1, amended):
// the governance surfaces lead (VTZ -> Users -> Objects -> Policies, the noun-then-contract sequence the
// Phase-3 build established), then the three ops centers under their product names -- SOC Ops (was
// Dashboards), Agent Ops (was TrustFlow), Network Ops (was AIOps) -- then Reports, Logs, Settings. The
// three renamed surfaces were placeholders (not in REAL_SURFACES), so id + path + label renamed
// together; nothing real bound to the old ids.
//
// crdb IP-AISOC-STEP1 C.9 (INV-FC-NO-STUB, 2026-09-24): Agent Ops and Network Ops are REMOVED from the
// Step 1 nav rather than shipped as placeholders -- a destination that fabricates nothing but exists
// still promises a surface. They return with their phases (CONSOLE-07 / CONSOLE-08). Nine remain.
export const DESTINATIONS: readonly Destination[] = [
  HOME,
  { id: 'vtz', label: 'Virtual Trust Zones', path: '/vtz', short: 'Vz' },
  { id: 'users', label: 'Users', path: '/users', short: 'Us' },
  { id: 'objects', label: 'Objects', path: '/objects', short: 'Ob' },
  { id: 'policies', label: 'Policies', path: '/policies', short: 'Po' },
  { id: 'soc-ops', label: 'SOC Ops', path: '/soc-ops', short: 'So' },
  { id: 'reports', label: 'Reports', path: '/reports', short: 'Re' },
  { id: 'logs', label: 'Logs', path: '/logs', short: 'Lo' },
  { id: 'settings', label: 'Settings', path: '/settings', short: 'St' },
];

/** Lookup by route path (exact). Returns undefined for an unknown path. */
export function destinationForPath(path: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.path === path);
}
