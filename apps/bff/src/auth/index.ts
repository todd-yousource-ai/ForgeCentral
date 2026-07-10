// apps/bff/src/auth/index.ts -- the BFF auth barrel (F0.5a).
//
// Operator authentication: the OIDC device-authorization login (oidc.ts), the derived EXPLAIN tier
// (tier.ts), and the ephemeral operator session + store (session.ts).

export * from './tier.js';
export * from './session.js';
export * from './oidc.js';
