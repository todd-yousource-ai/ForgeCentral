// apps/console/src/guide/constants.ts -- the Console constants the guide names (GD.12).
//
// A number the guide states about the Console's own limits is marked in the chapter as
// `<span class="const" data-const="NAME">value</span>` (with `data-format="grouped"` where the prose
// prints thousands separators), and the ReadMe renders the value from this registry, which imports it
// from the code that enforces it. The contract test holds every marked value equal to its constant, so
// the printed guide cannot drift from the running Console (INV-GUIDE-ONE-SOURCE).

import {
  DEFAULT_REAUTH_INTERVAL_HOURS,
  LUG_THRESHOLD_PERMILLE_MAX,
  MAX_EGRESS_ID_CHARS,
  MAX_NOTE_CHARS,
  MAX_REAUTH_INTERVAL_HOURS,
  MAX_SECTION_ENTRIES,
  MAX_SECTION_TEXT_CHARS,
  MAX_SETTING_EDITS,
  MAX_SETTING_VALUE_CHARS,
  MIN_REAUTH_INTERVAL_HOURS,
  POLICY_DESCRIPTION_MAX_BYTES,
  POLICY_NAME_MAX_BYTES,
  POLICY_PORT_MAX,
  POLICY_PORT_MIN,
  RISK_ACCEPTANCE_MAX_DAYS,
  SOC_TIER_MILLI_MAX,
  VTZ_DESCRIPTION_MAX_BYTES,
  VTZ_LABEL_MAX_BYTES,
  VTZ_NAME_MAX_BYTES,
  VTZ_NAME_MAX_LABELS,
} from '@forge/contracts';

import {
  IDAM_FULL_SYNC_HOURS_DEFAULT,
  IDAM_FULL_SYNC_HOURS_MAX,
  IDAM_FULL_SYNC_HOURS_MIN,
  IDAM_POLL_INTERVAL_SECS_DEFAULT,
  IDAM_POLL_INTERVAL_SECS_MAX,
  IDAM_POLL_INTERVAL_SECS_MIN,
} from '../surfaces/useIdam.js';
import { LOG_PAGE_LIMIT } from '../surfaces/useLogs.js';

export const GUIDE_CONSTANTS: Readonly<Record<string, number>> = {
  DEFAULT_REAUTH_INTERVAL_HOURS,
  IDAM_FULL_SYNC_HOURS_DEFAULT,
  IDAM_FULL_SYNC_HOURS_MAX,
  IDAM_FULL_SYNC_HOURS_MIN,
  IDAM_POLL_INTERVAL_SECS_DEFAULT,
  IDAM_POLL_INTERVAL_SECS_MAX,
  IDAM_POLL_INTERVAL_SECS_MIN,
  LOG_PAGE_LIMIT,
  LUG_THRESHOLD_PERMILLE_MAX,
  MAX_EGRESS_ID_CHARS,
  MAX_NOTE_CHARS,
  MAX_REAUTH_INTERVAL_HOURS,
  MAX_SECTION_ENTRIES,
  MAX_SECTION_TEXT_CHARS,
  MAX_SETTING_EDITS,
  MAX_SETTING_VALUE_CHARS,
  MIN_REAUTH_INTERVAL_HOURS,
  POLICY_DESCRIPTION_MAX_BYTES,
  POLICY_NAME_MAX_BYTES,
  POLICY_PORT_MAX,
  POLICY_PORT_MIN,
  RISK_ACCEPTANCE_MAX_DAYS,
  SOC_TIER_MILLI_MAX,
  VTZ_DESCRIPTION_MAX_BYTES,
  VTZ_LABEL_MAX_BYTES,
  VTZ_NAME_MAX_BYTES,
  VTZ_NAME_MAX_LABELS,
};

/** How a marker prints its constant: plain, or with thousands separators (`grouped`). */
export function formatGuideConstant(value: number, format: string | undefined): string {
  return format === 'grouped' ? value.toLocaleString('en-US') : String(value);
}
