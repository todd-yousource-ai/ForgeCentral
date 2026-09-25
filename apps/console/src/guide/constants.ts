// apps/console/src/guide/constants.ts -- the Console constants the guide names (GD.12).
//
// A number the guide states about the Console's own limits is marked in the chapter as
// `<span class="const" data-const="NAME">value</span>`, and the ReadMe renders the value from this
// registry, which imports it from the code that enforces it. The contract test holds every marked value
// equal to its constant, so the printed guide cannot drift from the running Console
// (INV-GUIDE-ONE-SOURCE).

import {
  LUG_THRESHOLD_PERMILLE_MAX,
  MAX_EGRESS_ID_CHARS,
  MAX_SECTION_ENTRIES,
  MAX_SECTION_TEXT_CHARS,
  MAX_SETTING_EDITS,
  MAX_SETTING_VALUE_CHARS,
  SOC_TIER_MILLI_MAX,
} from '@forge/contracts';

export const GUIDE_CONSTANTS: Readonly<Record<string, number>> = {
  LUG_THRESHOLD_PERMILLE_MAX,
  MAX_EGRESS_ID_CHARS,
  MAX_SECTION_ENTRIES,
  MAX_SECTION_TEXT_CHARS,
  MAX_SETTING_EDITS,
  MAX_SETTING_VALUE_CHARS,
  SOC_TIER_MILLI_MAX,
};
