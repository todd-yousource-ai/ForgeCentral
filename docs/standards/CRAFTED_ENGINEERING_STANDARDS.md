# Crafted Engineering Standards

Version: 2.0 -- Universal Edition, **ForgeCentral (Console) instantiation**

> **Shared YouSource engineering standard.** The principles here are language-neutral and identical
> across the YouSource repos. This edition instantiates the language-specific sections (dependencies,
> concurrency, interface surface, performance, data protection) for the **Console** -- a TypeScript
> BFF + web application over the platform. Where a section names Rust/cargo/CrucibleQL-engine internals
> in the engine editions, the Console maps them to TypeScript/npm and the BFF-over-engine boundary.

These standards are the floor. Every PR meets them.

---

## License and distribution

The Console is proprietary software of YouSource.ai.

- Every source file carries the YouSource proprietary header.
- Transitive dependencies must be license-compatible with proprietary distribution. **AGPL of any
  version is prohibited. GPL is prohibited.** LGPL only for dynamically-linked native modules with
  operator documentation. MPL only for header-isolated modules. Apache-2.0, MIT, BSD, ISC, Unicode are
  permitted.
- A license allowlist is enforced in CI (`license-checker` or equivalent) on every build; a transitive
  license outside the allowlist fails the build.

---

## Core principles

1. **Correctness first.** Working software with clear behavior over clever code.
2. **Security by design.** A structural property from the first line, not a late feature.
3. **Simplicity over cleverness.** The best solution is the one a new engineer understands in five
   minutes.
4. **Explicit over implicit.** Names, contracts, and data flows are obvious from reading the code.
5. **Fail fast and loudly.** Surface errors at the earliest point with context. Silent failures are the
   most expensive. For the Console this means an explicit empty/error/stale state, never a fabricated
   value.
6. **Traceability.** Every significant decision traces to a TRD requirement or a recorded rationale.

---

## Security requirements

### Input validation
- Treat all external input as untrusted: HTTP bodies, query params, IdP claims, webhook payloads, and
  engine responses at trust boundaries.
- Validate at every trust boundary with a schema (zod or equivalent): `unknown` in, typed value out.
- Allowlist over blocklist. Reject malformed input with a typed error; never silently repair.

### Authentication and authorization
The Console has two authorization concerns and conflates neither:

**External federated identity (login).** Operators authenticate via OIDC against the platform IdP. Use
established protocols only; do not invent identity flows. Sessions are short-lived. **Client-side gating
is UX, not security.**

**Engine-enforced authorization (every action).** The Console brokers every read/command under the
operator's Crucible **Principal + EXPLAIN tier**; Crucible/Torch/Forge enforce policy and tier on every
operation (TRD-04). The Console renders only the operator's tier; redacted fields are absent, not
masked-but-present. This is not "custom auth" -- it is the engine's `Principal`/policy model, consumed.

### Secrets and credentials
- Never hardcode secrets. Source them from the runtime environment / a secrets manager, **server-side
  only** -- no secret reaches the browser bundle or a client log.
- The BFF holds the Console's service mTLS identity to the engine; the browser holds only a session.
- Never log secrets, tokens, session ids, or authorization headers, even partially.

### Data protection
- **The Console stores no domain data at rest** (`INV-CONSOLE-NO-2ND-DB`); it inherits the platform's
  at-rest protections (AES-256-GCM, FIPS 140-3 module) for any data it displays, and adds none of its
  own. Any operational store (sessions, cache) holds no regulated data; the ephemeral cache is
  non-authoritative and version-tagged.
- **In transit: TLS 1.2+ everywhere.** Browser<->BFF over HTTPS; BFF<->engine over the mTLS `:7878`
  seam. No plaintext endpoint carries any data.
- **PII minimization.** The Console displays only what the operator's tier authorizes and retains none
  of it durably.

### Dependency security
- Pin exact versions; commit the lockfile; no wildcards in production manifests.
- CI runs `pnpm audit` (fail at high/critical) plus an SBOM + advisory scan (Trivy/OSV). Reject packages
  with unpatched CVEs, unclear provenance, or no recent maintenance.
- Minimize the tree; every transitive dependency is attack surface and bundle weight.

### Audit logging
- **Every Console-originated mutation is an audited engine operation** (operator identity, action,
  target, outcome) on the engine's hash-chained audit log (TRD-04 Section 10). The Console adds no
  parallel audit and cannot delete or alter engine audit entries.
- Server logs are structured (JSON, `pino`), include a request id + operator id (never PII/secrets), and
  are the operational record; the authoritative audit is the engine's.

---

## Code quality standards

### Naming
- Names describe intent, not implementation. Booleans read as predicates (`isTrusted`, `canPublish`).
- Consistent casing: `camelCase` values/functions, `PascalCase` types/components, `SCREAMING_SNAKE_CASE`
  module constants.

### Functions and components
- Single responsibility. **Maximize shared types and contracts** -- a concept that appears in more than
  one place (an error code, an enum, an id, a validation schema) is extracted into `@forge/contracts`
  and referenced from both sites. DRY at the contract level, not the keystroke level.
- Length is not hard-capped, but a component/function a reader cannot follow in one pass is refactored;
  no 2000-line files. No util junk drawers.
- Keep cyclomatic complexity and nesting modest; a data-shaping pipeline reads top-to-bottom.

### Error handling
- Errors propagate with context (`cause`); never swallowed. Distinguish recoverable from fatal.
- User-facing messages are informative but leak no stack trace, internal path, or system detail.
- Domain errors are typed (`Error` subclasses / discriminated unions), not stringly-typed.

### Immutability and state
- Prefer immutable data and `readonly`. Mutation is explicit and local.
- No shared mutable global domain state; the BFF is stateless (`INV-CONSOLE-NO-2ND-DB`).

---

## Testing requirements

Tests are specifications, not metrics.

- **Line-coverage floor:** >= 80% on business-logic modules (view-model shaping, handlers, reducers).
- **TRD conformance coverage:** 100% of every acceptance-criterion row and failure-semantics row in each
  Console TRD has a dedicated test. Binary, pass-or-fail.

### Test tiers and budgets

| Tier | Scope | Per-test | When gated |
|------|-------|----------|-----------|
| 1 Unit | Pure functions, view-model shaping, reducers (Vitest) | < 1 s | Every PR |
| 2 Integration | BFF route -> handler -> shaped result over a mocked engine seam | < 30 s | Every PR |
| 3 Contract | No-stub binding registry check + generated-client/OpenAPI drift | < 30 s | Every PR |
| 4 E2E | The <=3-click canonical tasks on a seeded real engine (Playwright) | < 5 min | Every PR |
| 5 Load / soak | Live-stream fan-out, bundle-size budgets, memory over a sustained run | minutes+ | Nightly / pre-release |

### Test quality
- One behavior, one reason to fail. Plain-language names. Arrange-Act-Assert. No logic in tests.
- Independent + deterministic; inject clocks; mock only external dependencies (the engine client at its
  typed seam), never the system under test.

---

## Interface surface (the Console)

The Console has two interfaces: the **BFF API** (browser-facing) and its **engine client** (platform-
facing).

- **The BFF API is contract-first.** It publishes an OpenAPI (REST) + an async schema for the stream;
  the SPA client is generated from it, so browser and BFF cannot drift. Every endpoint is versioned;
  additive changes are non-breaking, and a breaking change requires a version + deprecation window.
- **Values bind as parameters.** CrucibleQL statements the BFF issues bind values as parameters;
  literals are never interpolated (the platform's injection prohibition). No hand-built engine calls --
  always the typed client.
- **Every error crossing the browser boundary** is a typed taxonomy entry sanitized to the operator's
  EXPLAIN tier; existence/count of unauthorized data is itself access-controlled (a principal who cannot
  read a record cannot learn it exists).
- **All list results are paginated** (cursor/limit); unbounded returns are not permitted (mirrors TRD-04
  interface rules).
- **Reliability/idempotency:** mutating routes are idempotent by carrying the engine's `transaction_id`
  / command id; retries do not double-apply. Every external call has a timeout.

---

## Performance standards

- Measure before optimizing. No premature memoization.
- **Console budgets** (a named workload profile; the implementing TRD attaches it):
  first meaningful paint < 300 ms warm / < 1 s cold; interaction (drawer/filter/sort/tab) < 100 ms p95;
  live-stream freshness (engine commit -> on-screen) < 2 s.
- Server-page tables; stream live feeds (never poll-refetch); virtualize long lists; prefetch on intent;
  enforce bundle-size budgets in CI.
- No synchronous I/O in the request path; the BFF is fully async; CPU-heavy work goes to a worker thread.

---

## Observability standards

- **Logging:** structured JSON, appropriate levels, request id + operator id on every line, never
  PII/secrets.
- **Metrics:** the four golden signals for the BFF (latency, traffic, errors, saturation) + UI RUM
  (first paint, interaction latency, stream freshness). OpenTelemetry format.
- **Tracing:** propagate a trace/correlation id from the browser through the BFF to the engine call;
  every engine call and stream subscription is a span.

---

## Deployment and operations

- Configure via environment variables validated at startup; fail fast on missing/invalid config. No
  environment-specific branches in application logic.
- Health check + readiness endpoints on the BFF. Graceful shutdown drains in-flight requests and closes
  stream subscriptions.
- The BFF is stateless and horizontally scalable; state lives in the engine. Container images do not run
  as root and never bake secrets.

---

## Code review checklist

Before approving any PR:

- [ ] Does what the PR says; new code has tests including failure paths.
- [ ] No security anti-patterns (client-side secret, unvalidated input, string-built CrucibleQL, missing
      engine authz).
- [ ] Explicit, typed error handling; no leaked internals.
- [ ] No unnecessary complexity; public interfaces documented.
- [ ] No performance regression without justification; bundle budget respected.
- [ ] `INV-CONSOLE-NO-STUB` / `NO-2ND-DB` / `3-CLICKS` upheld; backward-compatible or the break is called
      out with a migration.
