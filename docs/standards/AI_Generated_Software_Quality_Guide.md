# AI-Generated Software Development Framework

*A Framework Document -- ForgeCentral (Console) instantiation*

> **Shared YouSource engineering standard.** The framework -- the six bug categories AI reliably
> introduces, the phased verification pipeline, the Definition of Done, and the agent-governance
> controls -- is language- and stack-neutral and identical across YouSource repos. This edition
> instantiates the **tooling** for the **Console**: TypeScript / Node.js / the browser, verified against
> the platform (Crucible/Torch/Forge) rather than reimplementing it. Read it alongside the engine
> editions; the principles are the same, the tools differ.

---

## 1. Why verification is required

AI generates by predicting plausible text; it does not compile, run, observe, or iterate. The output is
a structurally-coherent **draft**, not a finished product. Two structural properties make this acute:

- **Single-pass:** no feedback loop removed the bugs.
- **Multi-session context loss:** a type/field/route defined in one session drifts in the next.

Every AI-produced artifact is systematically verified before it ships. For the Console there is a third
property to defend: **confident fabrication** -- AI will happily invent a data value, a table, or an API
that does not exist. The Console's answer is structural: **no stubs, one source of truth** (Section 12).

---

## 2. The six bug categories -- Console (TypeScript) detection

| # | Category | How it appears | Detection in the Console |
|---|----------|----------------|--------------------------|
| 1 | Dead code | A constant/branch/component defined but never on any execution path | ESLint `no-unused-vars`, `import/no-unused-modules`; the contract test flags any component/route/binding unreachable from the nav; a test that changes a `TUNE:` constant and asserts the output changes. |
| 2 | Async/sync boundary | A blocking or unhandled async call (sync fs, unawaited promise, event-loop stall) | `@typescript-eslint/no-floating-promises` + `no-misused-promises`; a load test on the live stream asserts no event-loop starvation. |
| 3 | Cross-module gap | A type/field/route defined in one place, consumed with a drifted name elsewhere | `tsc --strict` across the workspace; the SPA client is **generated** from the BFF OpenAPI and BFF calls are typed against `@forge/contracts` -- a drift fails compilation; the contract test asserts client<->OpenAPI equality. |
| 4 | Schema/type bypass | Data written/read outside its declared typed interface (`any`, unchecked JSON) | `no-explicit-any`; all external input validated with zod (`unknown` -> typed); serialization round-trip tests on view models. |
| 5 | Parallel execution error handling | A fan-out where one failure cancels the group | Code review for `Promise.all` vs `Promise.allSettled`; unit tests injecting one failure into an aggregation assert the others still resolve (tolerant parallelism, `TRD-CONSOLE-00` Section 11). |
| 6 | Missing failure paths | The happy path only; engine-down / unauthorized / empty / stale unhandled | A unit + integration test for every error path per the surface TRD's failure-semantics table; the contract test asserts an empty real result renders the empty state, never a fabricated row. |

---

## 3. Planning before code

- **The TRD is the requirements doc.** `TRD-CONSOLE-00..12` is loaded as context before any generation.
- **The identifier registry** is `@forge/contracts` -- every shared type, binding id, enum, and error
  code defined once, before the surfaces that use them. This is the single most important artifact for
  multi-session work; it prevents the cross-module-gap category outright.
- **Prompt discipline:** state the language/framework versions and the banned patterns; provide the
  interface contract (the binding + the engine DTO shape); require explicit failure handling; require a
  `TUNE:` comment on every threshold; generate one surface/module at a time and verify it before the next.

---

## 4. The six quality dimensions (Console verification)

| Dimension | Standard | Verified by |
|-----------|----------|-------------|
| Correctness | Every function does what its type + doc say; every rendered value + action binds to real engine data | `tsc` clean; unit/integration tests; the **contract test** (no stub); E2E on a seeded engine |
| Reliability | One component failure does not fail the view; every failure path has defined behavior | Integration tests inject engine-down/unauthorized/empty/stale; tolerant aggregation |
| Performance | Meets the `TRD-CONSOLE-00` budgets under expected load; no event-loop block; bounded memory | Load tests (stream fan-out), RUM, bundle budgets in CI |
| Security | No client-side secret; input validated; parameterized CrucibleQL; engine-side authz | ESLint security rules; `pnpm audit`; header/CSP checks; the authz E2E |
| Observability | Structured logs + metrics + traces for every significant op | Log/metric assertions; trace-id propagation test |
| Maintainability | A new engineer understands a module from its types + tests; every `TUNE:` documented | Coverage >= 80% on business logic; review |

---

## 5. The verification pipeline (Console phases)

- **Phase 0 -- Environment:** pin the toolchain (Node LTS, pnpm, the versions in the lockfile); document
  setup in the README.
- **Phase 1 -- Static analysis (before any human review):** `tsc --noEmit` (strict), `eslint
  --max-warnings 0`, `prettier --check`, dependency audit (`pnpm audit`), SBOM/advisory scan. Fix
  findings before Phase 2. A type error blocks the test phase.
- **Phase 2 -- Unit tests (Vitest):** three per unit -- happy path (asserts the real value, incl. a
  `TUNE:`-change test), boundary/empty, and the **error path** (engine down, unauthorized, timeout,
  empty). No network.
- **Phase 3 -- Integration + contract:** BFF route -> handler -> shaped result over a mocked engine
  seam; the **contract test** (every control bound to a real op; client/OpenAPI parity; no prod mock
  provider); dependency-unavailable and malformed-input scenarios.
- **Phase 3.5 -- Runtime resilience:** stream reconnect-with-backoff verified; the ephemeral cache
  invalidation verified; a kill-switch/feature-flag for a risky surface verified; graceful shutdown
  drains requests + closes subscriptions.
- **Phase 4 -- E2E + load (Playwright + k6):** the canonical <=3-click tasks on a seeded real engine;
  live-stream fan-out under load with no event-loop starvation; bundle-size budgets.

---

## 6. CI/CD

The gate (`TypeScript_Dev_Rules.md` Section 14) runs on every PR and is a required, non-bypassable
status check for merge to `main`. Secrets are CI secrets, never in workflow files or source. Branch
protection requires all phases green.

---

## 7-11. Runtime resilience, telemetry, supply chain, architecture governance, output-trust

These framework sections apply unchanged in substance; the Console instantiation:

- **Runtime resilience:** circuit-breaker + timeout + retry-budget on the engine client; a kill-switch
  feature flag per risky surface; adaptive degradation (a failed panel degrades, the shell stays);
  runtime invariant checks (a rendered value must carry an engine watermark, else it is discarded).
- **Telemetry:** OpenTelemetry traces/metrics/logs; RUM for the UX budgets; bounded-cardinality metric
  labels (no user/request ids as labels).
- **Supply chain:** SBOM per build artifact; signed build artifacts; provenance on every AI-suggested
  dependency (exists on npm, maintained, no advisories, license-ok); IaC/container scanning.
- **Architecture governance:** dependency-graph rules (`import/no-cycle`, no lower->higher imports, the
  SPA never imports the engine client directly); duplicate-logic detection (jscpd); bi-weekly drift
  review against the TRD IA.
- **Output-trust:** the generated SPA client + the OpenAPI are the contract source of truth; SDK/API
  signatures are validated against the installed versions; AI-generated modules carry provenance
  comments (model, date, TRDs referenced, verification phases completed).

---

## 12. Agent governance and safety (if the Console gains agent features)

Any AI-agent capability the Console itself adds (e.g. an operator copilot, an autonomous remediation
suggester) follows the platform's agent controls: least-privilege per-task tool scoping; a typed tool
registry (no tool built from an LLM string); external content wrapped as untrusted (`ContentBlob`, never
concatenated raw into a prompt); an audited action trail; retry limits + human-in-the-loop escalation for
irreversible actions. Governance mirrors what Torch/Forge do for the agents the platform governs -- the
Console does not get a weaker bar because it is the UI.

---

## 21. Definition of Done (Console -- binary checklist)

Every item true before a surface ships:

```
Phase 1   tsc --noEmit strict: zero errors.                                    [tool output]
Phase 1   eslint --max-warnings 0 + prettier --check: clean.                   [tool output]
Phase 1   pnpm audit: zero high/critical; licenses in the allowlist.           [tool output]
Phase 2   Unit tests pass; >= 80% on business logic.                           [coverage]
Phase 2   A test verifies a TUNE: constant changes observable output.          [specific test]
Phase 2   A test verifies one failed parallel sub-read does not fail the view. [specific test]
Phase 3   Contract test green: every value + control binds to a real engine op;[contract test]
          client<->OpenAPI parity; NO mock provider in the build.
Phase 3   Cross-module identifiers resolve (@forge/contracts); tsc proves it.  [tsc]
Phase 3   Engine-down / unauthorized / empty / stale each render defined state.[integration]
Phase 4   The surface's <=3-click tasks pass E2E on a seeded real engine.      [Playwright]
Phase 4   Live-stream freshness < 2 s; no event-loop starvation under load.    [load test]
Phase 4   Bundle-size budget met.                                             [CI budget]
Sec       No client-side secret; input validated; parameterized CrucibleQL;   [review + tests]
          authorization enforced engine-side.
Obs       Structured logs + metrics + trace-id propagation present.           [assertions]
Docs      Public APIs documented; every TUNE: has a basis; README accurate;   [review]
          AI-provenance metadata on primarily-generated modules.
CI        Quality gate green on main; branch protection requires all phases.  [pipeline]
Product   INV-CONSOLE-NO-STUB, NO-2ND-DB, 3-CLICKS upheld for the surface.     [contract + E2E]
```

The single most important practice: **static analysis + the contract test before every human review.**
It catches the majority of AI-generated defects -- including the fabricated-data defect that is unique
and fatal to a data console -- in seconds.
