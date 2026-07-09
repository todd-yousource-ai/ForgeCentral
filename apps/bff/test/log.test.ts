// apps/bff/test/log.test.ts -- F0.3 secret redaction in structured logs.

import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/log.js';

describe('createLogger', () => {
  it('redacts secret-bearing fields and preserves the rest', () => {
    let out = '';
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb: () => void) {
        out += chunk.toString();
        cb();
      },
    });
    const log = createLogger('info', sink);
    log.info({ token: 'super-secret-value', password: 'pw', user: 'alice' }, 'audit');

    const line = JSON.parse(out.trim().split('\n')[0] ?? '{}') as Record<string, unknown>;
    expect(line['token']).toBe('[redacted]');
    expect(line['password']).toBe('[redacted]');
    expect(line['user']).toBe('alice');
    expect(out).not.toContain('super-secret-value');
  });
});
