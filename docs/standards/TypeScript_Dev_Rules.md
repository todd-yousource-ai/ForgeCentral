# TypeScript AI Slop Prevention Rules

> **Shared YouSource engineering standard, ForgeCentral (Console) edition.** This is the TypeScript /
> Node.js counterpart to the engine repos' `Rust_Dev_Rules.md`. Where those repos target the Rust
> engine (Crucible) and edge (Torch), this targets the **Console**: a TypeScript backend-for-frontend
> (BFF) and a TypeScript web application over the platform. The engine's rules still govern the engine;
> these govern the UI tier.

## Purpose

Prevent the common failure modes of AI-generated TypeScript: `any`-typing, unhandled promises, swallowed
errors, hallucinated package APIs, compiler-fighting with `@ts-ignore`, weak tests, architectural
fragmentation, and -- specific to this product -- **UI stubs and a second source of truth**.

AI-generated TypeScript is **untrusted draft code** until it passes the full quality gate:

```bash
pnpm tsc --noEmit               # strict type check, zero errors
pnpm eslint . --max-warnings 0  # lint, zero warnings
pnpm prettier --check .         # formatting
pnpm test                       # unit + integration (Vitest/Jest)
pnpm test:contract              # the no-stub binding contract (Console-specific, Section 17)
pnpm test:e2e                   # Playwright happy paths incl. the <=3-click tasks
pnpm audit --audit-level=high   # dependency vulnerabilities
pnpm build                      # the app + BFF build
```

Compiling is not enough. Code must be correct, typed, testable, and -- for the Console -- provably bound
to real platform data.

---

# 1. Core principle

TypeScript must not merely transpile. It must demonstrate:

- Correct, explicit types (no `any` escape hatches)
- Explicit error handling (no floating promises, no swallowed catches)
- Minimal, pinned dependencies
- Meaningful tests including failure paths
- Consistency with the established architecture (`TRD-CONSOLE-00`)
- Clear security boundaries (no secrets client-side, validated input)
- No hallucinated package APIs
- No lint/type suppression as a shortcut
- **Real data only: every rendered value and action binds to a real Crucible/Torch/Forge operation**

---

# 2. Hard bans

## 2.1 No `any`

`any` disables the type system. Banned in application code except where a third-party type is genuinely
unavailable, and then it is quarantined behind a typed adapter with a comment.

Bad:
```ts
function handle(payload: any) { return payload.data.items; }
```
Better:
```ts
function handle(payload: DecisionPayload): DecisionItem[] { return payload.data.items; }
```
For genuinely unknown input, use `unknown` + validation (Section 9), never `any`:
```ts
const parsed = DecisionPayload.parse(input); // zod validates unknown -> typed
```

Rule: `noImplicitAny` and `"strict": true` are mandatory in `tsconfig`. `any` (explicit or implicit) is
a review-blocking finding. `unknown` + a schema is the sanctioned path for external data.

## 2.2 No non-null assertion to bypass null-safety

`strictNullChecks` is on. The `!` non-null assertion is banned as a way to silence it.

Bad:
```ts
const el = document.getElementById('graph')!;
```
Better:
```ts
const el = document.getElementById('graph');
if (!el) throw new ConsoleError('graph mount missing'); // or handle
```
Allowed only with a documented invariant (rare), same discipline as Rust `expect()`.

## 2.3 No `@ts-ignore` / `@ts-expect-error` / `eslint-disable` without justification

Banned unless narrowly scoped with a comment naming the reason. `// @ts-nocheck` on a file is a hard
reject. `eslint-disable` for a whole file is a hard reject.

Allowed:
```ts
// @ts-expect-error upstream types for vendor-sdk@2.1 omit the `stream` field; tracked in VENDOR-123.
client.subscribe({ stream: true });
```

## 2.4 No invented package APIs, methods, or options

AI must not hallucinate library behavior.

Rule: before using an API, verify it exists in the version in `package.json`/lockfile. Do not invent
methods, options, hooks, or exports.

Bad:
```ts
fetchClient.enableAutoRetryForever();
```
Better:
```ts
// Confirmed against undici@6 / the generated Crucible client.
const res = await client.query(stmt, { signal: AbortSignal.timeout(5000) });
```

---

# 3. Error handling

## 3.1 Typed errors, not strings

Bad:
```ts
throw 'query failed';
```
Better -- an Error subclass or a discriminated result:
```ts
export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, readonly requestId: string, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
```
Domain/library layers return typed results (`Result<T, E>` via a small helper, or a discriminated union
`{ ok: true; value } | { ok: false; error }`); the application edge (a route handler, an error boundary)
maps them to HTTP responses / UI states. Engine errors carry the platform's taxonomy (`PolicyError`,
`AsOfError`, ...) and a request id.

## 3.2 No floating promises

Every promise is awaited, returned, or explicitly `void`-ed with a reason. `no-floating-promises` is a
gate-enforced lint.

Bad:
```ts
savePreference(view); // fire and forget, error lost
```
Better:
```ts
await savePreference(view);
// or, deliberately detached with handling:
void savePreference(view).catch((e) => logger.warn({ err: e }, 'preference save failed'));
```

## 3.3 No swallowed catches

Bad:
```ts
try { await load(); } catch { /* ignore */ }
```
Better: handle, or rethrow with context. A silent catch is a review-blocking finding. Never `catch (e)`
and continue as if success.

## 3.4 Do not erase errors at the boundary

Preserve `cause`. Map to the UI's typed error states (`TRD-CONSOLE-00` Section 9); never surface a stack
trace or internal path to the browser.

---

# 4. Types and data safety

## 4.1 Strict everywhere

`tsconfig`: `"strict": true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`. These are not optional.

## 4.2 Branded types for identifiers (the newtype discipline)

Cross-boundary identifiers get branded types so a `PrincipalId` cannot be passed where a `VtzId` is
expected -- the TypeScript analog of Rust newtypes and the cross-module identifier registry.

```ts
type PrincipalId = string & { readonly __brand: 'PrincipalId' };
```

## 4.3 The shared contract package is the single source of truth

Every shared type -- engine DTO shapes, the binding ids, enum unions, error codes -- lives in one
`@forge/contracts` package generated from the BFF OpenAPI + the Crucible DTO schema, imported by both
the BFF and the SPA. No duplicated enums or hand-written copies of an engine type across packages. A
drifted identifier fails compilation (AI Quality Guide cross-module-gap defense).

---

# 5. Async and the event loop (Node/BFF)

## 5.1 Never block the event loop

No synchronous filesystem in the request path, no CPU-heavy loops on the main thread (offload to a worker
thread), no `JSON.parse` of unbounded bodies without a size limit.

## 5.2 Every external call has a timeout and is cancellable

Every call to the engine, an IdP, or any network dependency carries an `AbortSignal` timeout. An
operation without a timeout can hang a request forever.

```ts
const res = await client.query(stmt, { signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS) });
```

## 5.3 Streaming has lifecycle handling

The live decision/audit stream subscription has connect, backpressure, reconnect-with-backoff, and
teardown on client disconnect. A dangling subscription is a leak; a stream without backpressure starves
the loop under load.

---

# 6. Immutability and state

- Prefer `readonly` and immutable updates. Mutate locally and explicitly; never mutate shared state.
- **No shared mutable module-global domain state.** The BFF is stateless per `TRD-CONSOLE-00`; the only
  process state permitted is the ephemeral cache and operational counters, never domain data.
- In React, state lives in hooks/stores, never in module-level mutable variables; derived data is
  computed, not duplicated into state.

---

# 7. Architecture

## 7.1 No fragmentation

One approved pattern each for: data fetching (the generated client + a query layer), error handling
(typed errors + error boundaries), logging (structured `pino`, server only), config (env at startup,
validated), state management, and styling (the design-system tokens). Do not introduce a second HTTP
client, a second state library, or a second styling system without approval.

## 7.2 No util junk drawers

No `utils.ts` / `helpers.ts` / `common.ts` / `misc.ts`. Code lives near its domain concept
(`overview/graph.ts`, `policies/publish.ts`), matching the surface TRDs.

## 7.3 Clean boundaries

The SPA never talks to the engine directly and never holds engine credentials or a durable secret. Lower
layers do not import from higher layers. Domain logic returns typed results; the transport/route layer
maps them to HTTP/UI.

---

# 8. Dependencies

- Pin exact versions; no `^`/`~`/`*` wildcards in production manifests. Commit the lockfile.
- Do not add a dependency for what the platform, the standard library, or an existing dependency does in
  under ~30 lines.
- Every added dependency: verify it exists on npm, has recent maintenance, has no known high/critical
  advisories (`pnpm audit`), and is license-compatible (Apache-2.0/MIT/BSD/ISC; **AGPL/GPL prohibited**,
  matching the platform license policy).
- Enable only the features/entry points you use; no "import the world" barrel imports that defeat
  tree-shaking.

---

# 9. Security

## 9.1 No secrets client-side, ever

No API key, token, engine cert, or credential appears in the browser bundle, in client logs, or in a
client-readable env var. The browser holds only a short-lived session; the BFF holds the service
identity server-side. Never log tokens, session ids, or authorization headers.

## 9.2 Validate all external input at the boundary

All external input -- HTTP bodies, query params, IdP claims, engine responses at trust boundaries,
webhook payloads -- is parsed and validated (zod or equivalent) into typed structures before reaching
domain logic. `unknown` in, validated type out. Reject malformed input with a typed error; never
silently repair.

## 9.3 No injection

- **Parameterized engine queries only.** CrucibleQL binds values as parameters; **never** string-build a
  CrucibleQL statement from user input (the platform's injection prohibition, restated for the client).
- No `eval`, `new Function`, dynamic `import()` of user-controlled paths.
- React: no `dangerouslySetInnerHTML` without sanitization; user content renders as text by default.

## 9.4 Web hardening

Set security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Strict-Transport-Security`). CSRF protection on state-changing routes. Authorization is enforced
**engine-side** on every action; client gating is UX only (`TRD-CONSOLE-00` Section 8).

---

# 10. React and UI

- No side effects or state updates during render; effects declare exact dependency arrays.
- Stable `key`s on lists (never the array index for reorderable data).
- Controlled inputs; no direct DOM mutation outside a ref with a documented reason.
- Data fetching goes through the query layer (caching, loading/error states), not ad-hoc `fetch` in
  components.
- Every interactive element maps to a **binding** (Section 17); a control with no binding does not ship.
- Accessibility is not optional: semantic elements, labels, focus management, keyboard paths, ARIA on the
  graph (`TRD-CONSOLE-00` Section 6.4).

---

# 11. Performance

- Measure before optimizing. No premature `useMemo`/`useCallback`/`React.memo` without a demonstrated
  render cost.
- Respect the budgets in `TRD-CONSOLE-00` Section 7 (first paint, interaction p95, live freshness).
- Virtualize long lists; server-page tables; stream live feeds (never poll-refetch); prefetch on intent.
- Bundle budgets are enforced in CI; a regression fails the gate.

---

# 12. Testing

## 12.1 Tests assert behavior

Empty/smoke/console-log tests do not count. A test asserts a real outcome.

## 12.2 Test the failure paths

For each unit: valid input, boundary/empty input, and the **error path** (engine down, unauthorized,
timeout, empty result). Missing failure-path tests are the most common production defect.

## 12.3 Deterministic

No real network, time, or randomness in unit tests -- inject clocks, mock the engine client at its typed
seam (never mock the system under test), seed any randomness.

## 12.4 Tiers

- **Unit** (Vitest/Jest): pure logic, view-model shaping, reducers -- no network.
- **Integration:** the BFF against a mocked engine client seam; route -> handler -> shaped result.
- **Contract** (Section 17): the no-stub binding check + the generated-client-vs-OpenAPI check.
- **E2E** (Playwright): the canonical <=3-click tasks (`TRD-CONSOLE-00` Section 5.2) against a seeded
  real engine (a demo tenant), asserting real data renders and actions commit.

---

# 13. Recommended `tsconfig` and lint

`tsconfig.json` (essentials):
```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```
ESLint (essentials): `@typescript-eslint` type-checked config, plus:
```
@typescript-eslint/no-explicit-any: error
@typescript-eslint/no-floating-promises: error
@typescript-eslint/no-misused-promises: error
@typescript-eslint/no-non-null-assertion: error
@typescript-eslint/switch-exhaustiveness-check: error
no-console: error            // server uses the structured logger; UI never console.logs in prod
import/no-cycle: error
```

---

# 14. CI gate

```yaml
name: console-quality-gate
on: [pull_request, push]
jobs:
  quality:
    steps:
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --noEmit
      - run: pnpm eslint . --max-warnings 0
      - run: pnpm prettier --check .
      - run: pnpm test           # unit + integration
      - run: pnpm test:contract  # no-stub binding + client/OpenAPI drift
      - run: pnpm test:e2e        # <=3-click happy paths on a seeded engine
      - run: pnpm audit --audit-level=high
      - run: pnpm build
```
Branch protection requires the gate green before merge to `main`.

---

# 15. Reviewer checklist

```
Types:        no any/implicit any; branded ids at boundaries; shared types from @forge/contracts
Errors:       typed; no floating promises; no swallowed catches; no leaked internals to the client
Async:        timeouts + AbortSignal on external calls; no event-loop blocking; stream lifecycle handled
Security:     no client-side secrets; input validated (zod); parameterized CrucibleQL; CSP/headers set
React:        binding on every control; effect deps correct; a11y present; no dangerouslySetInnerHTML
Deps:         pinned; audited; license-ok; minimal
Tests:        behavior + failure paths; deterministic; contract + <=3-click E2E present
Console rule: every value + action binds to REAL Crucible/Torch/Forge data; NO stub; NO second DB
```

---

# 16. AI prompt rules (for `.cursorrules` / agent guides)

```
You are writing production TypeScript for the YouSource Console.
1. No `any` (explicit or implicit); use `unknown` + zod at boundaries.
2. No `@ts-ignore`/`eslint-disable`/`!` to silence the compiler without a documented reason.
3. No floating promises; no swallowed catches; typed errors only.
4. Timeouts + AbortSignal on every external call; never block the event loop.
5. No hallucinated package APIs; verify against the installed version.
6. No client-side secrets; validate all external input; parameterized CrucibleQL only.
7. Every UI value and control binds to a REAL Crucible/Torch/Forge operation (no stubs).
8. The Console persists no durable domain data (no second database).
9. Shared types come from @forge/contracts; do not duplicate engine types.
10. Meaningful tests including failure paths; run the full gate before declaring done.
11. When uncertain, stop and identify the uncertainty instead of inventing an API or a stub.
```

---

# 17. Console-specific: the no-stub binding contract (`INV-CONSOLE-NO-STUB`)

This is the rule that most distinguishes Console code from ordinary UI code, and it is enforced, not
trusted:

- Every interactive component takes a **binding id**; the component API makes it non-optional. A control
  without a binding does not compile.
- Every binding resolves, in the binding registry, to a concrete BFF resolver/handler, which resolves to
  a real Crucible/Torch/Forge read or command typed against the generated clients.
- `pnpm test:contract` asserts: (a) every route + interactive component references a registered binding;
  (b) every binding's backend operation exists in the current engine surface; (c) the generated SPA
  client matches the BFF OpenAPI; (d) **no mock data provider is reachable in a production build.**
- A fixture provider exists only under `NODE_ENV=test` and is compiled out of release bundles; a release
  build that imports it fails the gate. Empty real data renders the explicit empty state, never a
  fabricated row.

# 18. Console-specific: no second database (`INV-CONSOLE-NO-2ND-DB`)

- The BFF owns no domain schema, no migrations, no domain tables. Crucible is the sole system of record.
- Permitted BFF persistence is operational only: a session store (or stateless JWT), rate-limit
  counters, and the ephemeral, version-tagged, non-authoritative cache -- never consulted on a write
  path and never a source of truth.
- A write from the Console is a Crucible/Torch/Forge command committed through the engine's atomic batch
  + hash-chained audit; the Console adds no parallel store and no parallel audit.

---

# 19. Final rule

The strongest anti-slop rule is not "write better TypeScript." It is:

```
Force the AI to preserve typed contracts, bind every pixel to real platform data, prove behavior with
tests including failure paths, and fail closed (an explicit empty/error state) when data is absent --
never invent an API, a type, or a row.
```
