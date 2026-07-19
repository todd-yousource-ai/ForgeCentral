// SQ.8b (INV-CONSOLE-LOGS-INSTANT): the client predicate mirrors the engine's, and the query string
// carries the page offset only when set.
import { describe, expect, it } from 'vitest';
import type { LogQueryFilter, LogRow } from '@forge/contracts';
import { logsQueryString, matchesFilter } from '../surfaces/useLogs.js';

const row: LogRow = {
  decisionId: 'sha512:abc' as LogRow['decisionId'],
  at: 1_000_000,
  ruleId: 'LR-C2-001',
  summary: 'C2 beaconing',
  outcome: 'candidate',
  status: 'candidate' as LogRow['status'],
  technique: 'T1071',
  tactics: ['TA0011'],
  confidence: 'HIGH',
  evidenceCount: 1,
};
const base: LogQueryFilter = { limit: 50 };

describe('matchesFilter', () => {
  it('mirrors the engine predicate over the cached row', () => {
    expect(matchesFilter(row, base)).toBe(true);
    expect(matchesFilter(row, { ...base, technique: 'T1071' })).toBe(true);
    expect(matchesFilter(row, { ...base, technique: 'T9999' })).toBe(false);
    expect(matchesFilter(row, { ...base, tactic: 'TA0011' })).toBe(true);
    expect(matchesFilter(row, { ...base, action: 'escalate' })).toBe(false);
    expect(matchesFilter(row, { ...base, search: 'beacon' })).toBe(true);
    expect(matchesFilter(row, { ...base, search: 'nope' })).toBe(false);
    expect(matchesFilter(row, { ...base, since: 2_000_000 })).toBe(false);
    expect(matchesFilter(row, { ...base, until: 999 })).toBe(false);
  });
});

describe('logsQueryString', () => {
  it('carries the offset only when set', () => {
    expect(logsQueryString(base)).not.toContain('offset');
    expect(logsQueryString({ ...base, offset: 100 })).toContain('offset=100');
  });
});
