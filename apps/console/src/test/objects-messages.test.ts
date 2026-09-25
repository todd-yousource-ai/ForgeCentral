// apps/console/src/test/objects-messages.test.ts -- the Objects form's failure lines (IP-CONSOLE-11-guide
// GD.5): a refusal, an expired session and an unreachable engine each read as what they are.

import { describe, expect, it } from 'vitest';

import { commandFailure } from '../surfaces/ObjectsSurface.js';
import { ObjectCommandError } from '../surfaces/useObjects.js';

describe('the Objects form failure line', () => {
  it('names each BFF status for what it is', () => {
    const line = (status: number): string | null => commandFailure(new ObjectCommandError(status));
    expect(line(409)).toBe('An object with that name already exists.');
    expect(line(400)).toBe('The form is incomplete or the selector does not fit the kind.');
    expect(line(401)).toBe('Your session has expired. Sign in again; nothing was committed.');
    expect(line(502)).toBe('The command could not reach the engine.');
    expect(line(503)).toBe('The command could not reach the engine.');
    expect(line(403)).toBe('The engine refused the command.');
  });

  it('reports a browser-side failure as a connection problem and no error as nothing', () => {
    expect(commandFailure(new TypeError('fetch failed'))).toBe(
      'The command could not reach the engine.',
    );
    expect(commandFailure(null)).toBeNull();
  });
});
