// apps/console/src/surfaces/settingsTabs.ts -- the Settings tab list (TRD-CONSOLE-11 Section 9.2), shared by the
// Settings surface and the contextual help map (IP-CONSOLE-11-guide GD.11) so neither can drift.

/** The tabs whose engine bindings are live (TRD-CONSOLE-11 Section 9.2); the rest are absent. */
export const SETTINGS_TABS = [
  { id: 'soc', label: 'SOC' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'rbac', label: 'RBAC' },
  { id: 'federation', label: 'Federation' },
  { id: 'changes', label: 'Changes' },
  { id: 'security', label: 'Security' },
  { id: 'keylock', label: 'KeyLock' },
  { id: 'observability', label: 'Observability' },
  { id: 'topology', label: 'HA & Topology' },
  { id: 'fips', label: 'FIPS Mode' },
  { id: 'readme', label: 'ReadMe' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];
