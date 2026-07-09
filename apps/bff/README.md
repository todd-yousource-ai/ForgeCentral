# @forge/bff

The ForgeCentral **backend-for-frontend**: a stateless Node service that brokers the Console's reads and
commands to the Crucible engine over mTLS `:7878`. It owns **no domain data** (Crucible is the sole system
of record); its only state is an in-memory, short-TTL cache. Implements F0.3 of `IP-CONSOLE-00-FOUNDATION`
(`INV-CONSOLE-NO-2ND-DB`).

## What F0.3 lands (the transport-agnostic core)

- **Config** (`src/config.ts`) -- validated at startup with zod, **fail-closed**; the mTLS material
  (CA + enrolled client cert + key) is required. Errors name the offending field, never the value.
- **Logging** (`src/log.ts`) -- pino structured JSON with central secret redaction (tokens/keys/passwords/
  authorization are always censored).
- **Engine seam** (`src/engine/client.ts`) -- the typed `CrucibleClient` boundary over `@forge/contracts`;
  every call takes a timeout / `AbortSignal`. Handlers depend on this interface, not on a transport.
- **Ephemeral cache** (`src/cache.ts`) -- in-memory, version-tagged (a newer engine version invalidates),
  bounded (oldest evicted), short TTL. No durable store.
- **HTTP surface** (`src/server.ts`) -- `node:http`: `/healthz` (liveness), `/readyz` (probes the engine
  through the seam), `/openapi.json` (the OpenAPI 3.1 skeleton).

## What is deferred (F0.3b, tracked)

The concrete **mTLS `:7878` wire transport** (`src/engine/wire-client.ts`) is not implemented: it needs the
crdb **frame** wire-format vendored (the DTO payload schema is already vendored in `@forge/contracts`; the
frame/opcode header is the missing piece), the BFF's **enrolled client certificate**, and a **live node**
to validate. Until then the transport **fails closed** (`ping`/reads reject with `EngineTransportPending`);
it never fabricates a result, so `/readyz` truthfully reports not-ready. See the F0.3 ledger note.

## Tests

`pnpm --filter @forge/bff test` (Vitest, node env). Config fail-closed, cache TTL/version/bound, the HTTP
surface over a mocked seam (health/ready/openapi/404), secret redaction, and the `INV-CONSOLE-NO-2ND-DB`
structural proof (no DB/ORM/store dependency, no migrations).
