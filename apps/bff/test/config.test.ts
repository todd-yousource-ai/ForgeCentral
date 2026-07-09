// apps/bff/test/config.test.ts -- F0.3 config validation (fail-closed).

import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';

const complete = {
  FC_ENGINE_HOST: 'engine.internal',
  FC_TLS_CA: '/etc/forge/ca.pem',
  FC_TLS_CERT: '/etc/forge/bff.crt',
  FC_TLS_KEY: '/etc/forge/bff.key',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a complete environment and applies defaults', () => {
    const config = loadConfig(complete);
    expect(config.engineHost).toBe('engine.internal');
    expect(config.enginePort).toBe(7878);
    expect(config.httpPort).toBe(8787);
    expect(config.logLevel).toBe('info');
    expect(config.requestTimeoutMs).toBe(5000);
  });

  it('coerces numeric env values', () => {
    const config = loadConfig({ ...complete, FC_ENGINE_PORT: '9000', FC_CACHE_TTL_MS: '500' });
    expect(config.enginePort).toBe(9000);
    expect(config.cacheTtlMs).toBe(500);
  });

  it('fails closed when a required mTLS path is missing', () => {
    const { FC_TLS_KEY: _omitted, ...withoutKey } = complete;
    expect(() => loadConfig(withoutKey)).toThrow(ConfigError);
  });

  it('fails closed on a non-numeric port', () => {
    expect(() => loadConfig({ ...complete, FC_ENGINE_PORT: 'not-a-number' })).toThrow(ConfigError);
  });

  it('names the offending field, never the value, in the error', () => {
    try {
      loadConfig({ ...complete, FC_ENGINE_HOST: undefined });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain('engineHost');
    }
  });
});
