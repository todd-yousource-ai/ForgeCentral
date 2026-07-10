// apps/bff/src/auth/index.ts -- the BFF auth barrel (F0.5a / F0.5a-2).
//
// Operator authentication: the OIDC device-authorization login (oidc.ts) behind a testable provider seam
// (provider.ts), the derived EXPLAIN tier (tier.ts), the ephemeral operator session + store (session.ts)
// and in-flight login store (login-store.ts), the session cookie (cookie.ts), and the mounted HTTP router
// (router.ts).

export * from './tier.js';
export * from './session.js';
export * from './oidc.js';
export * from './provider.js';
export * from './login-store.js';
export * from './cookie.js';
export * from './router.js';
