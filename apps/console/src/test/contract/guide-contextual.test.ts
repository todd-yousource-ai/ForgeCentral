// apps/console/src/test/contract/guide-contextual.test.ts -- INV-GUIDE-CONTEXTUAL (TRD-CONSOLE-11 11.6;
// IP-CONSOLE-11-guide GD.11): every destination and every Settings tab has contextual help, and each opens
// a section the generated guide contains.

import { describe, expect, it } from 'vitest';

import { GUIDE } from '../../guide/generated/guide-content.js';
import { SETTINGS_TAB_HELP, SURFACE_HELP, helpSectionFor } from '../../guide/helpMap.js';
import { guideTargets } from '../../guide/model.js';
import { DESTINATIONS } from '../../ia/destinations.js';
import { SETTINGS_TABS } from '../../surfaces/settingsTabs.js';

const targets = guideTargets(GUIDE);

describe('INV-GUIDE-CONTEXTUAL', () => {
  it('maps every destination to a guide section that exists', () => {
    const missing = DESTINATIONS.filter((d) => {
      const id = SURFACE_HELP[d.id];
      return id === undefined || !targets.has(id);
    }).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it('maps every Settings tab to a guide section that exists', () => {
    const missing = SETTINGS_TABS.filter((t) => !targets.has(SETTINGS_TAB_HELP[t.id])).map(
      (t) => t.id,
    );
    expect(missing).toEqual([]);
  });

  it('opens the active Settings tab, and SOC when no tab is named', () => {
    expect(helpSectionFor('settings', '?tab=configuration')).toBe('setc-concepts');
    expect(helpSectionFor('settings', '')).toBe(SETTINGS_TAB_HELP.soc);
    expect(helpSectionFor('vtz', '?zone=x')).toBe('vtz-concepts');
  });
});
