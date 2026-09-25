// apps/console/src/test/soc-messages.test.ts -- the SOC command failure lines (IP-CONSOLE-11-guide GD.8): an
// expired session, an engine fault and an outage each read as what they are.

import { describe, expect, it } from 'vitest';

import { caseRefusalReason } from '../surfaces/useCaseCommand.js';
import { runRefusalReason } from '../surfaces/useCognitionRun.js';
import { planRefusalReason } from '../surfaces/usePlanCommand.js';

describe('the SOC command failure lines', () => {
  it('names a session expiry, an engine fault and an outage for every command family', () => {
    for (const reason of [
      (s: number) => caseRefusalReason(s, null),
      planRefusalReason,
      runRefusalReason,
    ]) {
      expect(reason(401)).toMatch(/^Your session has expired\. Sign in again; nothing was/);
      expect(reason(502)).toBe('The engine could not complete the request.');
      expect(reason(503)).toBe(
        'The engine is unavailable, or answered with something the Console will not render.',
      );
    }
  });

  it('keeps the engine refusal and the malformed-request lines distinct', () => {
    expect(caseRefusalReason(409, 'the incident is closed')).toBe(
      'The engine refused it: the incident is closed',
    );
    expect(caseRefusalReason(400, null)).toBe(
      'The request was not accepted as sent (malformed, or too large).',
    );
    expect(planRefusalReason(400)).toBe(
      'The plan was not accepted as sent (malformed, or too large).',
    );
  });
});
