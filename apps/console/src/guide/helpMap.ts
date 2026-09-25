// apps/console/src/guide/helpMap.ts -- where the contextual help opens (IP-CONSOLE-11-guide GD.11;
// TRD-CONSOLE-11 11.2 (2), INV-GUIDE-CONTEXTUAL).
//
// The Help control opens the guide section for the active surface and, on Settings, the active tab. The
// map is keyed by destination id and Settings tab id; the contract test proves every destination and every
// tab has an entry and that each entry names a section the generated guide contains.

import type { SettingsTabId } from '../surfaces/settingsTabs.js';

/** The section each destination's help opens at (Settings is resolved per tab below). */
export const SURFACE_HELP: Readonly<Record<string, string>> = {
  overview: 'ovw-graph',
  vtz: 'vtz-concepts',
  users: 'usr-concepts',
  objects: 'obj-concepts',
  policies: 'pol-concepts',
  'soc-ops': 'soc-lifecycle',
  reports: 'rep-weekly',
  logs: 'log-read',
  settings: 'setc-concepts',
};

/** The section each Settings tab's help opens at. */
export const SETTINGS_TAB_HELP: Readonly<Record<SettingsTabId, string>> = {
  soc: 'soc-set-tiers',
  configuration: 'setc-concepts',
  rbac: 'posture-rbac',
  federation: 'idp-how',
  changes: 'setc-approve',
  security: 'posture-security',
  keylock: 'posture-keylock',
  observability: 'posture-observability',
  topology: 'posture-ha',
  fips: 'posture-fips',
  readme: 'rmf-conventions',
};

/** The help section for a location: the Settings tab's when on Settings, else the destination's. */
export function helpSectionFor(destinationId: string, search: string): string | undefined {
  if (destinationId === 'settings') {
    const tab = new URLSearchParams(search).get('tab') ?? 'soc';
    return (SETTINGS_TAB_HELP as Readonly<Record<string, string>>)[tab] ?? SETTINGS_TAB_HELP.soc;
  }
  return SURFACE_HELP[destinationId];
}
