# CLAUDE.md -- ForgeCentral (repo root)

This is the entry point for Claude Code in the **ForgeCentral** repository -- the YouSource **Console**,
the operator pane of glass over the platform (Crucible + Torch + Forge). It does **not** restate the
engineering standards; those are authoritative in `docs/standards/` (the TypeScript/Node counterparts of
the engine repos' Rust standards). It points to them and records the conventions not written there.

The Console is a **TypeScript backend-for-frontend (BFF) + web application** over the platform. It is
proprietary software of YouSource.ai. The standard for every change is the one in
`docs/standards/CLAUDE.md`: would a senior engineer at a well-run company be comfortable shipping this
into a federal-customer deployment?

## Authoritative standards -- read in this order before writing code

- `docs/standards/CLAUDE.md` -- code-generation standards (Console edition)
- `docs/standards/TypeScript_Dev_Rules.md` -- the canonical TypeScript rules
- `docs/standards/CRAFTED_ENGINEERING_STANDARDS.md` -- language-neutral standards
- `docs/standards/AI_Generated_Software_Quality_Guide.md` -- the verification framework + six bug
  categories
- `docs/standards/AGENTS.md` -- operating rules for AI agents

The source hierarchy: the Console TRD suite (`docs/spec/`) wins over the standards, and
`TRD-CONSOLE-00` (the platform TRD) wins over a surface TRD. When the Console consumes an engine
surface, the relevant engine TRD (Crucible TRD-01..08, Torch TRD-09/25, Forge TRD-32/34, in the engine
repos) is the contract -- the Console reads and commands those systems, never reimplements them. Cite any
conflict in the PR description so the resolution is auditable.

## The specification

The Console is specified as a TRD suite in `docs/spec/` (`TRD-CONSOLE-00..12`, indexed by
`docs/spec/SUITE.md`). Read `TRD-CONSOLE-00` first: it fixes the architecture (BFF over Crucible, **no
second database**), the **no-stub** data contract, the design system + brand, the information
architecture + **<= 3-click** rule, auth, streaming/performance, and the invariants. Build no surface
until its bindings resolve to real engine operations.

## Product invariants (never violate)

- **`INV-CONSOLE-NO-STUB`** -- every value + control binds to a real Crucible/Torch/Forge operation; no
  mock/synthesized data ships. Enforced by `pnpm test:contract` + no prod mock provider.
- **`INV-CONSOLE-NO-2ND-DB`** -- the Console persists no durable domain data; Crucible is the sole system
  of record.
- **`INV-CONSOLE-3-CLICKS`** -- every operator task is <= 3 clicks from the Overview graph.
- `ENGINE-AUTHZ`, `LIVE`, `AUDITED` -- see `TRD-CONSOLE-00` Section 10.

## Frontend + backend stack

- **SPA:** TypeScript + **React**. Dynamic surfaces use: a data/cache layer (TanStack Query) for reads;
  a live-stream store (SSE/WebSocket -> a small state store such as Zustand) for the decision/graph
  deltas; a virtualization lib for large tables/feeds; and a visualization layer for the connectivity
  graph (a canvas/WebGL renderer under React for the flow at scale). The exact libraries are pinned in
  the implementing TRD, but React is the component/interaction model throughout.
- **BFF:** TypeScript on Node LTS -- a stateless, contract-first (OpenAPI) gateway that speaks the
  platform wire protocols and streams the live surfaces. Owns no domain data.
- **Shared:** `@forge/contracts` -- the generated engine DTO types + BFF OpenAPI types + binding ids +
  error codes, imported by both tiers so they cannot drift.

## Build and test invocation (the per-PR gate)

The gate is the full quality suite (`TypeScript_Dev_Rules.md` Section 14):

```bash
pnpm install --frozen-lockfile
pnpm tsc --noEmit            # strict type check
pnpm eslint . --max-warnings 0
pnpm prettier --check .
pnpm test                    # unit + integration
pnpm test:contract           # the no-stub binding + client/OpenAPI drift check
pnpm test:e2e                # the <=3-click canonical tasks on a seeded engine
pnpm audit --audit-level=high
pnpm build
```

Run the **full** gate before every push; **never** mask a check's exit. The lockfile is committed and
must stay consistent; a new dependency is justified, pinned, audited, and license-checked, and flagged at
review.

## Per-PR workflow conventions (local + GitHub)

- **One PR at a time.** A PR is a complete, working, testable unit aligned to a TRD acceptance criterion
  or one focused change. Finish it, gate it, review it with the user, and get approval before the next
  PR. Stop after each merge and wait.
- **Branch per PR:** branch off local `main` -> code + test -> full gate -> no-ff merge -> delete the
  branch -> push local + GitHub.
- **Named invariant / acceptance per PR.** Each PR states which TRD acceptance criterion or invariant it
  establishes and proves it with a tiered test (incl. the failure paths).
- **No stubs.** A binding that would ship without a real backing engine operation is never a mergeable
  PR.
- **Scoped commits.** Code commits are separate from docs commits.
- **No em dashes** in added code, comments, or committed prose. Use `--`.
- **A distinct concern gets its own package/module; a new package beats cramming.** The BFF, the SPA, and
  `@forge/contracts` are separate packages in the workspace.

## Git remote

The GitHub remote is `github-forgecentral` (`git@github-forgecentral:todd-yousource-ai/ForgeCentral.git`,
a dedicated SSH deploy key). Push local `main` and GitHub `main` together per the workflow above.

## Implementation-plan structure

Larger efforts are organized as implementation plans (IPs) under `docs/implementation-plans/` (created
when the first one lands), mirroring the engine repos. Deferred work is recorded honestly with the
gating dependency named, never as a silent stub.

## Commit message format

`<type>(<scope>): <imperative summary>` (types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`,
`security`), summary under 72 chars, no trailing period.
