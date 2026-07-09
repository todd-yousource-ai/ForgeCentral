# IP-CONSOLE-00-FOUNDATION -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-FOUNDATION.md` (Phase 0, the platform foundation of
`TRD-CONSOLE-00`). One PR per roster row, a named invariant proven by its test tier(s), the full
`scripts/ci.sh` green before merge, branch-per-PR off local `main`, no-ff merge, push to `origin`,
scoped commits (code separate from docs), no em dashes. Reviewed with the maintainer before each merge.

Status: **F0.1 + SC + F0.2a + F0.2b COMPLETE; F0.3 next (F0.2c carries the remaining shells).**

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| F0.1 | INV-CONSOLE-CONTRACTS-SINGLE-SOURCE | LANDED (review) | a738517 | `@forge/contracts` + the workspace bring-up. See the note below. |
| F0.2a | INV-CONSOLE-DESIGN-SEMANTIC-COLOR | LANDED (review) | f42331d | Design-token foundation (`@forge/design`): tokens + CSS theme + WCAG contrast tests. |
| F0.2b | INV-CONSOLE-DESIGN-SEMANTIC-COLOR | LANDED (review) | 8ca5ff6 | React harness + core primitives (Badge/ScoreRing/KpiCard/TabStrip). |
| F0.2c | INV-CONSOLE-DESIGN-SEMANTIC-COLOR | OPEN | -- | Remaining shells: right drawer, confirm dialog, data table, flow-graph host, charts, timeline scrubber (data-bound ones may land with their surface). |
| F0.3 | INV-CONSOLE-NO-2ND-DB | OPEN | -- | Stateless BFF core over mTLS `:7878`; no domain store. |
| F0.4 | INV-CONSOLE-NO-STUB | OPEN | -- | Binding registry + the `test:contract` no-stub gate. |
| F0.5 | INV-CONSOLE-ENGINE-AUTHZ | OPEN | -- | OIDC -> Principal + EXPLAIN tier; engine-side authz. |
| F0.6 | INV-CONSOLE-LIVE | OPEN | -- | Live-feel channel (v1: short-interval CrucibleQL polling). |
| F0.7 | INV-CONSOLE-ADMIN-PLANE | OPEN | -- | 8443 node-IP admin listener; hybrid-PQC + CNSA-1.0 floor. |
| F0.8 | INV-CONSOLE-SHELL-3-CLICK-FRAME | OPEN | -- | SPA shell: nav + IA + drawer host + empty/loading/error/stale. |
| SC | INV-CONSOLE-SUPPLYCHAIN-HARDENED | LANDED (review) | 734e145 | Supply-chain hardening of the gate. See the note below. |

## F0.2b -- React component shells (harness + core primitives)

The second half of the design system: the React rendering + accessibility test harness, and the core
presentational primitives built on the F0.2a tokens.

**Delivered:**

- **First runtime dependency**: React enters as a **peerDependency** of `@forge/design` (react /
  react-dom `^19`); the SPA app (F0.8) declares the concrete runtime dep. The build now compiles `.tsx`.
- **Test harness**: Vitest + **happy-dom** + **Testing Library** (`vitest.config.ts` env + `test/setup.ts`
  jest-dom matchers + auto-cleanup). All MIT.
- **Core primitives** (`src/components/`): `Badge` (status/chip, color by semantic variant, label always
  present so meaning is never color-alone), `ScoreRing` (0-100 trust score banded green/amber/red via SVG,
  score in the accessible name), `KpiCard` (dashboard metric + optional badge), `TabStrip` (ARIA tablist:
  `role`, `aria-selected`, roving `tabindex`, Left/Right/Home/End keys).
- **Component stylesheet** (`src/styles.ts`, `componentStyles()`) -- the components' look as a CSS string
  over the `--fc-*` variables; **no color literal in any component or the stylesheet** (the hex-scan test
  now covers `.tsx` too), so INV-CONSOLE-DESIGN-SEMANTIC-COLOR holds across the components.

**Tests:** 13 (4 token + 9 component). Accessibility is verified via Testing Library role/name/keyboard
assertions. Full `scripts/ci.sh` green; `happy-dom` pinned to `^20.8.9` (16.x carried a critical
VM-escape RCE, GHSA; dev-only but the audit gate flagged it).

**Scope decisions (recorded honestly):**

- **a11y via role-based assertions, not axe.** `axe-core` is MPL-2.0, outside the dependency allowlist
  (DEPENDENCY-POLICY.md). Testing Library's role/name/value queries enforce each shell's ARIA contract; a
  full axe audit is deferred unless the license position changes.
- **Remaining shells deferred to F0.2c / their surface.** The data-bound and complex components (virtualized
  data table, flow-graph host, chart primitives, timeline scrubber) are best built with the real data
  contract of their first consuming surface; the remaining overlays (right drawer, confirm dialog) follow in
  F0.2c. Building them speculatively now would be shells without a consumer.

## F0.2a -- design-token foundation (`@forge/design`)

The first half of the design system (`TRD-CONSOLE-00` Section 6), split from F0.2 so it lands without
introducing React (that arrives with the component shells in F0.2b). Pure TypeScript, **zero runtime
dependencies** (the Console still ships only its own code).

**Delivered:**

- **Semantic color tokens** (`src/tokens/color.ts`) -- surfaces, brand, flow lanes, score/status, and
  text, keyed by MEANING and reproducing Section 6.1's dark-theme palette. This is the ONE file permitted
  to hold a color hex literal.
- **Scale tokens** (`src/tokens/scale.ts`) -- spacing (4px base), radius, typography, elevation, motion.
- **CSS-variable theme** (`src/css.ts`) -- `tokensToCss()` projects the tokens to a `:root { --fc-...: ; }`
  block, so styles bind `var(--fc-color-status-good)` rather than a value (the token module stays the
  single source, same generate-from-one-source discipline as the wire codegen).
- **WCAG contrast tooling** (`src/contrast.ts`) -- the WCAG 2.1 contrast ratio, making Section 6.4's
  accessibility claim testable.

**Invariant `INV-CONSOLE-DESIGN-SEMANTIC-COLOR`**, proven by 4 tier-1 tests: a hex scan asserting no
`src/` file other than the color token module contains a color hex literal (a hand-picked hex in a
component will fail it); the WCAG assertions (primary/muted text >= 4.5:1 on every surface, each
flow/status accent >= 3:1 on the canvas); and CSS-variable generation. Full `scripts/ci.sh` green.

## Supply-chain hardening (SC) -- malicious-package defense on the gate

A cross-cutting hardening of the now-active gate, done right after F0.1 while the tree is smallest (178
packages, exactly one with an install script). It implements `TRD-CONSOLE-00`'s supply-chain posture and
the AI Quality Guide Section 9 controls, hermetically (no external service in the local gate).

**Delivered:**

- **Install-script lockdown (deny-by-default)** -- `package.json > pnpm.onlyBuiltDependencies = ["esbuild"]`
  so pnpm runs a lifecycle script (preinstall/install/postinstall) only for esbuild; every other package
  is blocked (verified: emptying the allowlist makes pnpm report the ignored script). `scripts/
  check-supply-chain.mjs` enforces the allowlist in the gate and **fails loudly** the moment any
  non-allowlisted package in the tree carries a script (verified by a negative test: it names esbuild and
  exits 1). This is the control that stops the recent worm-class attacks.
- **Source pinning** -- `.npmrc` pins the registry to `registry.npmjs.org` + `verify-store-integrity=true`;
  `check-supply-chain.mjs` additionally refuses any off-registry tarball or git/VCS source in the lockfile
  (dependency substitution), and asserts SHA-512 integrity hashes are present. CI stays `--frozen-lockfile`.
- **SBOM per build** -- `scripts/sbom.mjs` emits `sbom.cdx.json` (CycloneDX 1.5, 205 components) each gate
  run from `pnpm list`; generated, not committed (gitignored, derivable from the lockfile).
- **Policy of record** -- `DEPENDENCY-POLICY.md` gains a "Supply-chain hardening" section (threat model +
  the controls + the runtime-containment last layer).

The gate step [9] is now `audit + install-script lockdown + source pinning + licenses + SBOM`; full
`scripts/ci.sh` green (10 steps, incl. the networked audit: no known vulnerabilities).

**Recommended fast-follow (own PR):** a **release-age cooldown** (pnpm 10.4+ `minimumReleaseAge`) so a
compromised publish is not auto-pulled before the ecosystem yanks it. It rides on a pnpm 9 -> 10 major
bump (which also makes deny-by-default the default), so it is its own focused, verified PR rather than a
rider here. Networked scanners (OSV-Scanner, Socket) are a CI-side addition, not part of the hermetic
local gate.

## F0.1 -- `@forge/contracts` + workspace bring-up

The first implementation PR. It moves the gate out of scaffold stage (the full TypeScript gate now runs:
typecheck -> lint -> format -> test -> contract -> e2e -> audit -> licenses -> build) and lands the shared
contracts package that both tiers import so their types cannot drift.

**Delivered:**

- **`packages/contracts` (`@forge/contracts`)** -- the first workspace member. NodeNext ESM, strict
  `tsconfig` extending the root base, built to `dist/` (JS + `.d.ts`).
- **Generated engine DTO types** (`src/generated/wire-dto.ts`) -- the TypeScript projection of the
  Crucible wire DTO contract, emitted by `scripts/generate.mjs` from the **vendored** schema
  `schema/wire-dto.schema.json` (an exact byte-for-byte copy of the crdb committed artifact
  `crates/cdb-wire/schema/wire-dto.schema.json`, `IP-CONSOLE-READINESS` Part A). The engine is the single
  source of truth: the types are generated, never hand-authored. A **codegen round-trip drift gate**
  (the committed file must equal the emitter output) fails the gate if a wire change is not regenerated,
  the same discipline crdb applies in CR.A2.
- **Branded ids** (`src/ids.ts`) -- `PrincipalId` / `TenantId` / `DecisionId` / `VtzId` / `PolicyId` /
  `ObjectId` / `RequestId`; nominal strings, zero runtime cost. Cross-assignment is a compile error
  (proven by `@ts-expect-error` tests).
- **Error taxonomy** (`src/errors.ts`) -- `ConsoleErrorCode` (the Crucible typed-error names, which the
  wire schema does not carry, so the Console owns the one enumeration) + `ConsoleError`, composed over the
  generated `WireErrorClass` / `RetryClass` (re-exported, never re-listed).
- **Binding-manifest shape** (`src/binding.ts`) -- `Binding` / `ReadBinding` / `CommandBinding` /
  `BindingManifest`, the typed contract the no-stub registry (F0.4) will populate, with an honest
  `pending` status that names its owning repo + gating task (INV-CROSS).
- **BFF OpenAPI placeholder** (`src/openapi.ts`) -- an explicit empty `paths` map filled by F0.3, not
  fabricated endpoints.

**Workspace bring-up (folded in, per the IP Section 3):**

- Lint runs **once at the root** (`eslint "packages/**/*.{ts,tsx}" "apps/**/*.{ts,tsx}"`), where the
  eslint + typescript-eslint devDeps live; typecheck / test / build fan out per package via
  `pnpm -r --if-present`, each package carrying `typescript` + `vitest` so `tsc` / `vitest` resolve
  locally. The committed `pnpm-lock.yaml` lands here.
- **Prettier scoped to code + config**: the vendored schema and the generated code are prettier-ignored
  (each has its own authority on format); authored spec/standards Markdown under `docs/**` and the
  pnpm-managed lockfile are ignored (the no-em-dash hygiene check, gate step 1, governs the prose).
- **Two pre-existing scaffold-tooling fixes** the now-active gate surfaced: `scripts/check-licenses.mjs`
  used `pnpm licenses list --json --prod --dev`, which pnpm 9.15 answers with a non-JSON "No licenses in
  packages found" (dropped the `--prod --dev` pair; the default already covers both); and a pnpm
  `overrides` entry forces patched dev-only transitives (`vite >=6.4.3`, `esbuild >=0.25.0`) so
  `pnpm audit --audit-level=high` is clean (vitest 3.2 otherwise keeps a vite `<=6.4.2` carrying
  GHSA-fx2h-pf6j-xcff). These are dev-only and never in `dist/`.

**Test tier:** 1 (type-level + codegen round-trip). 11 assertions: the drift gate, the pinned contract
version, generated-type usability (tagged-union narrowing + tuple/nullable shapes), branded-id
distinctness (compile-time), and the error / binding shapes. Full `scripts/ci.sh` green (all 10 steps,
including the networked dependency audit).

**Scope decision (recorded honestly):** **Playwright is deferred to F0.8** (the first e2e, with the SPA
shell) rather than pinned in F0.1. F0.1 has no e2e test and no browser surface; pulling Playwright +
browsers now would be an unused dependency against the "no deps outside current scope" rule. The gate's
e2e stage is already wired (`test:e2e` via `pnpm -r --if-present`, a no-op until a package defines it),
so adding Playwright in F0.8 needs no gate change. Vitest (used by F0.1) is pinned now.
