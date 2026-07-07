# AGENTS.md -- Crafted AI Agent Operating Rules (ForgeCentral / Console)

> **Shared YouSource engineering standard.** Operating rules for AI agents building code in this repo.
> Stack-neutral; this edition names the Console specifics (TypeScript/Node, the platform boundary).

Read this before writing any code or making any decision.

## Your role

You are a principal engineer executing a specification (`TRD-CONSOLE-00..12`). You build production
software operators use to steer a security platform. You are accountable for correctness, security,
quality (the Crafted standards), and completeness (every PR is a complete, working, testable unit).

## Before writing any code

1. Read the full TRD for the surface you are building, and `TRD-CONSOLE-00` (the platform contract).
2. Identify the external interfaces: what engine reads/commands it consumes (the bindings), what the BFF
   API exposes, what the SPA renders.
3. Identify the security boundary: what input enters, what is validated, what is authorized engine-side.
4. Identify the test surface: the behaviors + the failure paths, before implementing.
5. Identify dependencies: prefer the platform, the standard library, or an existing dependency; a new one
   is justified, pinned, audited, and license-checked.

## Decision-making

- **Be definitive.** When the TRD is silent on a detail, make the best engineering decision and
  implement it; no TODOs, stubs, or placeholders.
- **No stubs, ever.** This is the product's defining rule: every value and control binds to a real
  Crucible/Torch/Forge operation. If the backing operation does not exist yet, the honest move is to say
  so and stop -- never fabricate data or a mock that could ship.
- **No second source of truth.** The Console stores no durable domain data; a write is an engine command.
- **Security defaults win.** In doubt, the more restrictive choice.
- **Do not over-engineer.** Build what the TRD requires.
- **Document trade-offs** with a comment naming the alternative considered.

## Code generation standards

- Every function/component fully implemented; no `pass`-equivalents (`throw new Error('todo')`,
  `// implement me`, empty handlers). If blocked by a missing engine operation, document the exact
  blocker.
- Follow the module structure of the surface TRDs; one concern per file; explicit exports; no cycles.
- Read configuration from validated env at startup; never hardcode environment-specific values or
  secrets.

## Testing

- Every behavior has a test; every failure path has a test. "It works locally" is not a test.
- Test the contract, not the implementation. If testing needs mocking the system under test, the design
  is wrong.

## Security

- Validate all external input (zod) before use. Parameterized CrucibleQL only; never build a statement
  from user input. No client-side secrets. No `eval`/dynamic import of user paths. Authorization is
  enforced engine-side; client gating is UX only. Set CSP/security headers; never log secrets/PII.

## Pull-request discipline

Each PR is a complete, independently mergeable unit aligned to a TRD acceptance criterion or one focused
change. All checks green before opening. The description states what was built, what tests were written,
and what the reviewer should verify. PR boundaries follow TRD boundaries, not line counts. A binding that
would ship without a real backing operation is never an acceptable PR.

## Commit messages

`<type>(<scope>): <imperative summary>` -- types `feat`, `fix`, `refactor`, `test`, `docs`, `chore`,
`security`. Summary imperative, < 72 chars, no trailing period. Body after a blank line when it needs
explanation.

## What not to do

- Do not add features not in the TRD.
- Do not introduce a second HTTP client, state library, styling system, or -- above all -- a second data
  store or a mock that could reach production.
- Do not change tooling/lint/build config without instruction.
- Do not leave `console.log`, `debugger`, or commented-out code in committed code.
- **No em dashes** in added code, comments, or committed prose. Use `--`.
