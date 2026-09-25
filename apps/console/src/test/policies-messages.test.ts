// apps/console/src/test/policies-messages.test.ts -- the Policies form's failure lines (IP-CONSOLE-11-guide
// GD.6): a refusal, an expired session and an unreachable engine each read as what they are.

import { describe, expect, it } from 'vitest';

import { commandFailure } from '../surfaces/PolicyForm.js';
import { PolicyCommandError } from '../surfaces/usePolicyMutation.js';

describe('the Policies form failure line', () => {
  it('names each BFF status for what it is', () => {
    const line = (status: number): string | null => commandFailure(new PolicyCommandError(status));
    expect(line(409)).toBe(
      'A policy with that name already exists in the zone, or the version conflicts.',
    );
    expect(line(400)).toBe('The policy is incomplete or a field does not fit the engine contract.');
    expect(line(403)).toBe('The engine refused the command (not authorized).');
    expect(line(401)).toBe('Your session has expired. Sign in again; nothing was committed.');
    expect(line(502)).toBe('The command could not reach the engine.');
    expect(line(503)).toBe('The command could not reach the engine.');
    expect(line(500)).toBe('The engine refused the command.');
  });

  it('reports a browser-side failure as a connection problem', () => {
    expect(commandFailure(new TypeError('fetch failed'))).toBe(
      'The command could not reach the engine.',
    );
  });
});
