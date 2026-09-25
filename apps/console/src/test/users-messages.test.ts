// apps/console/src/test/users-messages.test.ts -- the Users form's failure lines (IP-CONSOLE-11-guide GD.7):
// an Edit conflict is not a duplicate name, and a session or outage is not a refusal.

import { describe, expect, it } from 'vitest';

import { commandFailure } from '../surfaces/UsersSurface.js';
import { GroupCreateError } from '../surfaces/useUsers.js';

describe('the Users form failure line', () => {
  const line = (status: number, mode: 'add' | 'edit'): string | null =>
    commandFailure(new GroupCreateError(status), mode);

  it('reads a 409 as a duplicate on Add and as a conflict on Edit', () => {
    expect(line(409, 'add')).toBe('A principal with that username already exists.');
    expect(line(409, 'edit')).toBe(
      'The change conflicts: the record no longer exists, or an identity provider owns that field.',
    );
  });

  it('names a session expiry and an unreachable engine, and keeps refused for a real refusal', () => {
    expect(line(401, 'add')).toBe(
      'Your session has expired. Sign in again; nothing was committed.',
    );
    expect(line(502, 'edit')).toBe('The command could not reach the engine.');
    expect(line(503, 'add')).toBe('The command could not reach the engine.');
    expect(line(403, 'add')).toBe('The engine refused the command.');
    expect(line(400, 'add')).toBe('The form is incomplete or malformed.');
  });
});
