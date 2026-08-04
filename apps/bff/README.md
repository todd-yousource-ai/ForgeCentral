# @forge/bff

The ForgeCentral **backend-for-frontend**: a stateless Node service that brokers
the Console's reads and commands to the Crucible engine on `:7878`. It owns **no
domain data** (Crucible is the sole system of record;
`INV-CONSOLE-NO-2ND-DB`); its only state is an in-memory, short-TTL cache and the
operator session store.

## Architecture

- **Config** (`config.ts`) -- validated at startup with zod, fail-closed; errors
  name the offending field, never the value.
- **Logging** (`log.ts`) -- pino structured JSON with central secret redaction.
- **The engine seam** (`engine/client.ts` -> `engine/wire-client.ts`) -- the typed
  `CrucibleClient` boundary over `@forge/contracts`, realized by the live
  `@forge/wire` transport **through the crypto sidecar**: the BFF performs no TLS
  (`INV-CONSOLE-CRYPTO-AWSLC`); the sidecar terminates admin TLS and originates
  the engine mTLS. Every call takes a timeout / `AbortSignal`.
- **Operator auth** (`auth/`) -- Auth0 OIDC login (`oidc.ts`, JWKS-verified:
  signature, issuer, audience, expiry -- never trusted unverified), the session
  cookie (`cookie.ts`, `session.ts`), engine-side RBAC projection (`rbac.ts`,
  `tier.ts`), and the operator-identity mapping (`operator-id.ts`). The BFF
  projects identity; authorization is enforced engine-side on every operation.
- **Per-surface engine modules** (`engine/`) -- one module per Console surface,
  each a projection of real engine operations: `overview` (the Sankey flow),
  `logs`, `objects`, `vtz`, `users`, `policies`, `soc`, `idam`, `entity-detail`,
  `distribute` (signed policy-bundle distribution via the sidecar signer),
  `isolate`/`principal`/`destination-classifier`/`reverse-dns` supporting lanes,
  and `secret-client`/`sign-client` (the sidecar loopback services).
- **The stateless projector rule** -- the BFF composes, projects, and streams; it
  never computes domain truth. A number the engine did not produce is a defect.
- **HTTP surface** (`server.ts`, `openapi.ts`, `static.ts`) -- `node:http`:
  `/healthz`, `/readyz` (probes the engine through the seam), `/openapi.json`,
  the API routes behind auth, and SPA static serving.
- **Ephemeral cache** (`cache.ts`) -- in-memory, version-tagged, bounded, short
  TTL. No durable store.

## Tests

`pnpm --filter @forge/bff test` (Vitest, node env): config fail-closed, cache
TTL/version/bound, the HTTP surface over a mocked seam, auth (JWKS verification,
cookie/session, RBAC projection), per-surface projections over recorded engine
replies, secret redaction, and the `INV-CONSOLE-NO-2ND-DB` structural proof (no
DB/ORM/store dependency, no migrations). The live path runs in the e2e stage of
`scripts/ci.sh` against a seeded engine.
