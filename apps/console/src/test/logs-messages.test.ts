// apps/console/src/test/logs-messages.test.ts -- the Logs export failure line (IP-CONSOLE-11-guide GD.9).

import { describe, expect, it } from 'vitest';

import { LogExportError, exportFailure } from '../surfaces/useExportLogs.js';

describe('the Logs export failure line', () => {
  it('names each status, and never promises nothing was recorded after an engine fault', () => {
    const line = (status: number): string => exportFailure(new LogExportError(status));
    expect(line(401)).toBe('Your session has expired. Sign in again; nothing was exported.');
    expect(line(403)).toBe('The engine refused the export. Nothing was recorded.');
    expect(line(503)).toBe('The engine is unavailable. Nothing was recorded.');
    expect(line(502)).toBe(
      'The engine could not complete the export; a receipt may still have been recorded.',
    );
    expect(exportFailure(new TypeError('fetch failed'))).toBe(
      'The export could not reach ForgeCentral.',
    );
  });
});
