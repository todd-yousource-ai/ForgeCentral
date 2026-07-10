// apps/bff/test/config.test.ts -- F0.3 config validation (fail-closed).

import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';

// The BFF holds no TLS material now (the sidecar owns mTLS); the engine host defaults to loopback.
const complete = {} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a complete environment and applies defaults', () => {
    const config = loadConfig(complete);
    expect(config.engineHost).toBe('127.0.0.1');
    expect(config.enginePort).toBe(8789);
    expect(config.httpPort).toBe(8787);
    expect(config.logLevel).toBe('info');
    expect(config.requestTimeoutMs).toBe(5000);
  });

  it('coerces numeric env values', () => {
    const config = loadConfig({ ...complete, FC_ENGINE_PORT: '9000', FC_CACHE_TTL_MS: '500' });
    expect(config.enginePort).toBe(9000);
    expect(config.cacheTtlMs).toBe(500);
  });

  it('fails closed on a routable (non-loopback) engine host', () => {
    expect(() => loadConfig({ ...complete, FC_ENGINE_HOST: 'engine.public.example' })).toThrow(
      ConfigError,
    );
  });

  it('fails closed on a non-numeric port', () => {
    expect(() => loadConfig({ ...complete, FC_ENGINE_PORT: 'not-a-number' })).toThrow(ConfigError);
  });

  it('names the offending field, never the value, in the error', () => {
    try {
      loadConfig({ ...complete, FC_HTTP_PORT: 'not-a-number' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain('httpPort');
    }
  });

  it('leaves auth disabled (no oidc) when no issuer is set', () => {
    expect(loadConfig(complete).oidc).toBeUndefined();
  });

  it('derives the Auth0 endpoints from the issuer when auth is enabled', () => {
    const config = loadConfig({
      ...complete,
      FC_OIDC_ISSUER: 'https://tenant.us.auth0.com/',
      FC_OIDC_CLIENT_ID: 'abc123',
      FC_OIDC_ROLE_CLAIM: 'https://crucibledb/groups',
    });
    expect(config.oidc).toEqual({
      issuer: 'https://tenant.us.auth0.com/',
      clientId: 'abc123',
      roleClaim: 'https://crucibledb/groups',
      scope: 'openid profile email',
      jwksUri: 'https://tenant.us.auth0.com/.well-known/jwks.json',
      deviceCodeEndpoint: 'https://tenant.us.auth0.com/oauth/device/code',
      tokenEndpoint: 'https://tenant.us.auth0.com/oauth/token',
    });
  });

  it('honors explicit endpoint overrides', () => {
    const config = loadConfig({
      ...complete,
      FC_OIDC_ISSUER: 'https://tenant.us.auth0.com/',
      FC_OIDC_CLIENT_ID: 'abc123',
      FC_OIDC_ROLE_CLAIM: 'roles',
      FC_OIDC_TOKEN_ENDPOINT: 'https://proxy.internal/token',
    });
    expect(config.oidc?.tokenEndpoint).toBe('https://proxy.internal/token');
  });

  it('fails closed when the issuer is set but the client id / role claim are not', () => {
    expect(() =>
      loadConfig({ ...complete, FC_OIDC_ISSUER: 'https://tenant.us.auth0.com/' }),
    ).toThrow(ConfigError);
  });

  it('parses the secure-cookie flag exactly (the string "false" is false, not truthy)', () => {
    expect(
      loadConfig({ ...complete, FC_SESSION_COOKIE_SECURE: 'false' }).session.cookieSecure,
    ).toBe(false);
    expect(loadConfig(complete).session.cookieSecure).toBe(true);
  });
});
