# CLAUDE.md -- Code Generation Standards for Claude (YouSource Console)

> **Shared YouSource engineering standard, ForgeCentral (Console) edition.** This is the TypeScript /
> Node.js counterpart to the engine repos' standards. Where the engine standards target **Crucible**
> (the Rust `crdb` core) and **Torch** (the Rust agent edge), this file governs how Claude generates
> code for the **Console** -- the TypeScript BFF + web application over the platform. It follows the
> same fundamental contract and the same federal-grade bar, instantiated in TypeScript.

This file governs how Claude generates code for **ForgeCentral / the YouSource Console**, proprietary
software of YouSource.ai.

## Source hierarchy (read in this order before writing any code or tests)

1. **The Console TRD suite** (`docs/spec/`, `TRD-CONSOLE-00..12`) -- the build contract for the UI. The
   platform TRD (`CONSOLE-00`) is authoritative for architecture, the data contract, the design system,
   the IA, auth, and the invariants.
2. **The relevant engine TRD** when the Console consumes an engine surface -- Crucible TRD-01..08
   (data/policy/audit/time-travel), Torch TRD-09/25 (edge/enrollment), Forge TRD-32/34 (VTZ/governance).
   The Console never reimplements these; it reads and commands them.
3. **`TypeScript_Dev_Rules.md`** -- the canonical TypeScript rules; non-negotiable.
4. **`CRAFTED_ENGINEERING_STANDARDS.md`** -- language-neutral standards (security, testing tiers,
   observability, deployment).
5. **`AI_Generated_Software_Quality_Guide.md`** -- the verification framework + the six bug categories.
6. **`AGENTS.md`** -- operating rules for AI agents producing code in this repo.

If two sources conflict, a TRD wins over the standards, and `TRD-CONSOLE-00` wins over a surface TRD.
Cite the conflict in the PR description so the resolution is auditable.

---

## Fundamental contract

You are writing production software that operators use to steer a security platform. The standard is:

> **Would a senior engineer at a well-run company be comfortable shipping this into a federal-customer
> deployment?**

If the answer is no, rewrite it before committing.

---

## Target languages

The Console has one implementation language: **TypeScript** (strict), on **Node.js** (the BFF) and the
browser (the SPA). There is no second language in the UI tier.

- **The BFF** (Node.js/TypeScript): a stateless backend-for-frontend. It speaks the platform's wire
  protocols (CrucibleQL/DTO over the mTLS `:7878` seam; the Torch/Forge admin + govern surfaces), shapes
  and aggregates results into view models, and streams the live surfaces. It owns **no** durable domain
  data (`INV-CONSOLE-NO-2ND-DB`).
- **The SPA** (TypeScript, React): renders the design system and navigates the IA. It holds only view
  state, never engine credentials or a durable secret, and never talks to the engine directly.

Both follow `TypeScript_Dev_Rules.md` in full: no `any`, no floating promises, no swallowed errors, no
hallucinated APIs, no lint/type suppression as a shortcut. The gate is
`tsc --noEmit` + `eslint --max-warnings 0` + `prettier --check` + `test` + `test:contract` + `test:e2e`
+ `audit` + `build` on every PR.

**Languages explicitly out of scope:** the Rust engine/edge are separate repos with their own standards;
do not write Rust here. SQL is not used (the data plane is CrucibleQL, always parameterized).

### The cross-package identifier registry

The most important defense against multi-session integration gaps (AI Quality Guide Section 2.4, bug
category #3) is a single source of truth for every shared identifier. The **`@forge/contracts`** package
is that source: the generated engine DTO types, the BFF OpenAPI types, the binding ids, error codes, and
shared enums live there and are imported by both the BFF and the SPA. No enum, error code, or engine
type is hand-duplicated in a dependent package. A drifted identifier fails compilation.

---

## Architecture decision rules

Apply in order:

1. **Does a TRD define it?** Implement exactly what `TRD-CONSOLE-00..12` (or the relevant engine TRD)
   specifies. No reinterpretation.
2. **Does an established Console pattern cover it?** Follow it (the query layer, the binding registry,
   the error boundary, the design-system tokens). Cite the cross-reference.
3. **What do `TypeScript_Dev_Rules.md` + `CRAFTED_ENGINEERING_STANDARDS.md` say?** Apply them.
4. **Ecosystem idiom?** Follow the workspace's conventions (React, the chosen Node framework, the query
   library).
5. **Make the conservative choice:** simpler, more explicit, more testable, more auditable.

Document any deviation with a comment naming the alternative and why it lost. Add a `TUNE:` comment for
every numeric threshold, timeout, cache TTL, or budget not fixed by a TRD.

---

## The three product invariants (never violate)

- **`INV-CONSOLE-NO-STUB`.** Every rendered value and every control binds to a real Crucible/Torch/Forge
  operation. No mock/synthesized data or unbound control ships. Enforced by `test:contract` + no prod
  mock provider (`TypeScript_Dev_Rules.md` Section 17).
- **`INV-CONSOLE-NO-2ND-DB`.** The Console persists no durable domain data; Crucible is the sole system
  of record; any cache is ephemeral and never authoritative (Section 18).
- **`INV-CONSOLE-3-CLICKS`.** Every operator task is reachable in <= 3 clicks from the Overview graph;
  proven by an E2E test.

Additional platform invariants (`ENGINE-AUTHZ`, `LIVE`, `AUDITED`) are defined in `TRD-CONSOLE-00`
Section 10 and are equally binding.

---

## Error handling

- **Domain/library layers** return typed results (an `Error` subclass or a discriminated
  `Result<T, E>`); never throw strings; never swallow a catch.
- **Application edges** (route handlers, React error boundaries) map typed results to HTTP responses / UI
  states. Engine errors carry the platform taxonomy (`PolicyError`, `AsOfError`, `PrepareError`, ...) and
  a request id; they are sanitized to the operator's EXPLAIN tier before crossing to the browser -- never
  a stack trace or internal path.

---

## Generating tests

Tests are first-class deliverables (tiers in `CRAFTED_ENGINEERING_STANDARDS.md`):

| Tier | Scope | Gated |
|------|-------|-------|
| 1 Unit | Pure logic / view-model shaping (Vitest) | Every PR |
| 2 Integration | BFF route -> handler -> shaped result over a mocked engine seam | Every PR |
| 3 Contract | The no-stub binding check + generated-client/OpenAPI drift | Every PR |
| 4 E2E | The canonical <=3-click tasks on a seeded real engine (Playwright) | Every PR |
| 5 Load/soak | Live-stream fan-out, bundle budgets, memory over time | Nightly / pre-release |

Every surface TRD acceptance-criterion row gets a test. Every failure-semantics row gets a test. Binary,
not best-effort.

---

## Self-check before committing

- [ ] No `any`/implicit any; `tsc --noEmit` clean; `eslint --max-warnings 0` clean; `prettier --check`
      clean.
- [ ] No floating promises; no swallowed catches; typed errors; no leaked internals to the client.
- [ ] Every external call has a timeout + `AbortSignal`; no event-loop blocking.
- [ ] Every rendered value + control binds to a REAL engine operation; `test:contract` green; no mock
      provider in the build.
- [ ] No client-side secrets; external input validated (zod); parameterized CrucibleQL only.
- [ ] Shared types imported from `@forge/contracts`; no duplicated engine type.
- [ ] Tests assert behavior + failure paths; the touched <=3-click task has an E2E.
- [ ] Every `TUNE:` constant has a basis comment.
- [ ] `pnpm audit` clean at high; deps pinned; licenses compatible.
- [ ] Commit message follows `AGENTS.md`.
