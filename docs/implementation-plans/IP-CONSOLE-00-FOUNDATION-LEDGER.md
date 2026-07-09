# IP-CONSOLE-00-FOUNDATION -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-FOUNDATION.md` (Phase 0, the platform foundation of
`TRD-CONSOLE-00`). One PR per roster row, a named invariant proven by its test tier(s), the full
`scripts/ci.sh` green before merge, branch-per-PR off local `main`, no-ff merge, push to `origin`,
scoped commits (code separate from docs), no em dashes. Reviewed with the maintainer before each merge.

Status: **F0.1 + SC + F0.2a/b + F0.3 (core) + F0.3b-1/-2/-3a + F0.3b-3b (mTLS socket transport) COMPLETE; F0.3b-3c (cert + operation dispatch + LIVE round-trip) next, then F0.4.** (The node is live locally on `:7878`; the wire CA key is located, so the live capstone is unblocked.)

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| F0.1 | INV-CONSOLE-CONTRACTS-SINGLE-SOURCE | LANDED (review) | a738517 | `@forge/contracts` + the workspace bring-up. See the note below. |
| F0.2a | INV-CONSOLE-DESIGN-SEMANTIC-COLOR | LANDED (review) | f42331d | Design-token foundation (`@forge/design`): tokens + CSS theme + WCAG contrast tests. |
| F0.2b | INV-CONSOLE-DESIGN-SEMANTIC-COLOR | LANDED (review) | 8ca5ff6 | React harness + core primitives (Badge/ScoreRing/KpiCard/TabStrip). |
| F0.2c | INV-CONSOLE-DESIGN-SEMANTIC-COLOR | OPEN | -- | Remaining shells: right drawer, confirm dialog, data table, flow-graph host, charts, timeline scrubber (data-bound ones may land with their surface). |
| F0.3 | INV-CONSOLE-NO-2ND-DB | LANDED (review) | c36528b | Stateless BFF core (`@forge/bff`): config/log/cache/seam/HTTP; no domain store. |
| F0.3b-1 | INV-CONSOLE-WIRE-FRAME | LANDED (review) | e3c7e6f | `@forge/wire` frame codec (16-byte header + FrameType), byte-exact to crdb. |
| F0.3b-2 | INV-CONSOLE-WIRE-CBOR | LANDED (review) | c0078f2 | Hand-rolled CBOR codec + typed `WireRequest`/`WireReply` payloads, byte-exact to crdb ciborium. |
| F0.3b-3a | INV-CONSOLE-WIRE-HANDSHAKE | LANDED (review) | ade2424 | Client handshake (`Hello->Negotiate->Authenticate->Ready`) over a frame-transport abstraction, byte-exact to crdb. |
| F0.3b-3b | INV-CONSOLE-WIRE-TRANSPORT | LANDED (review) | e1e73dd | `StreamFrameTransport` (frame reassembly over a duplex) + `connectTls` mTLS dial; handshake proven over the real framed transport. |
| F0.3b-3c | INV-CONSOLE-ENGINE-AUTHZ | LIVE-PROVEN (review) | b7b49ee | Operation dispatch + `wireHandshake` (reactor `Hello->Ready`) + a **real round-trip against the live `:7878` node** (mTLS -> handshake -> QuerySubmit -> decoded WireReply). |
| F0.3b-3d | INV-CONSOLE-ENGINE-AUTHZ | OPEN | -- | Wire the real transport behind the BFF `CrucibleClient` seam so `/readyz` goes green (monorepo runtime-dep plumbing + TLS servername config). |
| F0.4 | INV-CONSOLE-NO-STUB | OPEN | -- | Binding registry + the `test:contract` no-stub gate. |
| F0.5 | INV-CONSOLE-ENGINE-AUTHZ | OPEN | -- | OIDC -> Principal + EXPLAIN tier; engine-side authz. |
| F0.6 | INV-CONSOLE-LIVE | OPEN | -- | Live-feel channel (v1: short-interval CrucibleQL polling). |
| F0.7 | INV-CONSOLE-ADMIN-PLANE | OPEN | -- | 8443 node-IP admin listener; hybrid-PQC + CNSA-1.0 floor. |
| F0.8 | INV-CONSOLE-SHELL-3-CLICK-FRAME | OPEN | -- | SPA shell: nav + IA + drawer host + empty/loading/error/stale. |
| SC | INV-CONSOLE-SUPPLYCHAIN-HARDENED | LANDED (review) | 734e145 | Supply-chain hardening of the gate. See the note below. |

## F0.3b -- the native wire transport (`@forge/wire`), built now (node is live locally)

The premise for deferring the transport ("no live node to validate against") was wrong: the crdb node runs
on this same box, listening on `:7878` (`cdb.service` active), and the wire format is fully defined and
portable in crdb `cdb-wire`. So F0.3b is being built ahead of F0.4 (the critical path: without a real
transport, the F0.4 bindings would all be PENDING). The gateway (`transport.rs` -> `cdb_agent::mtls::
server_config`) requires an **enrolled client cert** and derives the Principal from it, so a live round-trip
needs the BFF's own cert -- the one genuine decision, deferred to F0.3b-3.

### F0.3b-1 -- frame codec

`@forge/wire`, a new package: the native TS client of the Crucible wire protocol. This step lands the
**frame codec** -- the fixed 16-byte big-endian header (`protocol_version / frame_type / stream_id / flags
/ reserved / payload_len`), the full `FrameType` opcode set, and decode validation (reserved must be 0,
only known flags, payload bound) -- a faithful port of `cdb-wire` `frame.rs`/`frame_io.rs`. Pure TS, **zero
dependencies**. `INV-CONSOLE-WIRE-FRAME`: 9 tests including the **exact-byte** header vector taken from
crdb's own frame test (`0x0100 / Ready / stream 7 / END_STREAM / len 3`), so the two implementations cannot
drift. Full `scripts/ci.sh` green.

### F0.3b-2 -- CBOR payload codec

The wire payloads are CBOR (ciborium on the node). Rather than add a third-party CBOR library to the
critical wire path, this lands a **hand-rolled, zero-dependency** codec (`src/cbor.ts`) over the exact
subset the wire uses, plus the typed `WireRequest`/`WireReply` layer (`src/payload.ts`). `INV-CONSOLE-
WIRE-CBOR`, proven by **byte-exact conformance to golden vectors generated from crdb's ciborium** (a
throwaway `cdb-wire` test, since removed): 22 tests covering externally-tagged enums (single-key maps),
struct field order, `Vec<u8>` as a CBOR array (not a byte string), 32-byte handles as int arrays, unit
variants as bare strings, and float handling (ciborium emits minimal-form floats; the decoder accepts
f16/f32/f64, the encoder emits f64 which the node widens). `wireValueToCbor` forces the float-typed
`WireValue` variants (`Float`/`Vector`) to encode as floats. The write-path request variants throw a clear
error rather than emit a wrong shape (no fabrication). `@forge/contracts` enters as a type-only dependency
(paths for typecheck, dist for build). 31 wire tests total. Full `scripts/ci.sh` green; still zero runtime
deps in `@forge/wire`.

### F0.3b-3a -- client handshake

The client handshake, a faithful port of crdb `cdb_agent::client_handshake`: `Hello (CBOR ClientHello) ->
recv Negotiate (CBOR Negotiated) -> Authenticate (empty payload; the identity is the mTLS cert, not a
field) -> recv Ready`. Written over a `FrameTransport` abstraction (`src/transport.ts`) so the handshake
logic is unit-tested over an in-memory transport, no socket required. `INV-CONSOLE-WIRE-HANDSHAKE`: the
`ClientHello`/`Negotiated` CBOR is byte-exact to crdb ciborium vectors, and the driver is proven to send
Hello then Authenticate in order and to reject an out-of-order frame (5 tests; 36 wire tests total). Also
converted `FrameType` from a TS `enum` to a `const` object + union type (idiomatic; avoids the numeric-
enum comparison pitfall when matching a raw decoded opcode). Full `scripts/ci.sh` green.

### F0.3b-3b -- mTLS socket transport

The concrete `FrameTransport` over a Node duplex byte stream (`src/socket-transport.ts`):
`StreamFrameTransport` buffers inbound bytes and **reassembles whole frames across chunk boundaries**
(16-byte header then `payloadLen` bytes), serializes outbound frames, and exposes the async `recv()` queue;
`connectTls` dials the engine over mutually-authenticated TLS (`node:tls`, `rejectUnauthorized` always on).
`INV-CONSOLE-WIRE-TRANSPORT`: 4 tests -- split-frame reassembly, two-frames-in-one-chunk, outbound
serialization, and the **full `clientHandshake` driven end to end over the real framed transport** (an
in-memory duplex pair). 40 wire tests total. Built-in modules only (`node:tls`/`node:stream`); still zero
runtime deps. Full `scripts/ci.sh` green.

**Next:** F0.3b-3c -- the live capstone. Operation dispatch (`QuerySubmit`/`QueryResult` over `stream_id`
correlation); the minted `console-bff` client cert (the **wire CA key is located at `/etc/cdb/mtls/ca.key`**,
so this is unblocked) + its static `config.agents` grant (single-tenant for the transport proof, per the
product-owner sequencing; device-wide identity is F0.5); a **live round-trip** against the local `:7878`
node (`Hello -> Ready -> QuerySubmit -> real QueryRows`); then wire the transport behind the BFF's
`CrucibleClient` seam so `/readyz` goes green. Proves `INV-CONSOLE-ENGINE-AUTHZ`.

## F0.3 -- stateless BFF core (`@forge/bff`)

The first `apps/` deployable: the stateless backend-for-frontend that will broker the Console's reads and
commands to Crucible over mTLS `:7878`. It owns **no domain data** (INV-CONSOLE-NO-2ND-DB). This PR is the
transport-agnostic core; the concrete wire transport is F0.3b.

**Delivered:**

- **Config** (`src/config.ts`) -- validated at startup with **zod**, **fail-closed**; the mTLS material
  (CA + enrolled client cert + key) is required. Errors name the offending field, never the value.
- **Logging** (`src/log.ts`) -- **pino** structured JSON with central secret redaction (tokens / keys /
  passwords / authorization always censored).
- **Engine seam** (`src/engine/client.ts`) -- the typed `CrucibleClient` boundary over `@forge/contracts`;
  every call takes a timeout / `AbortSignal`. Handlers and tests depend on the interface, not a transport.
- **Ephemeral cache** (`src/cache.ts`) -- in-memory, **version-tagged** (a newer engine version
  invalidates), **bounded** (oldest evicted), short TTL; a `Clock` is injected for deterministic tests.
- **HTTP surface** (`src/server.ts`, `node:http`) -- `/healthz`, `/readyz` (probes the engine through the
  seam under the timeout), `/openapi.json` (the OpenAPI 3.1 skeleton). Constructed from injected deps, so
  it is unit-testable over a mock seam.

**Invariant `INV-CONSOLE-NO-2ND-DB`** proven structurally: the BFF declares no database / ORM / external-
store dependency and ships no migrations (a test enforces both); its only state is the ephemeral cache.
18 tests (config fail-closed, cache TTL/version/bound, HTTP surface over a mock seam, secret redaction,
no-2nd-DB). Full `scripts/ci.sh` green (audit clean; zod/pino carry no install scripts). The monorepo type
resolution: the app resolves `@forge/contracts` from its source for typecheck (paths, no build-order
dependency; the import is type-only) and from its built dist for the emit (pnpm `-r` builds contracts first).

**Deferred -- F0.3b, the mTLS `:7878` wire transport (INV-CROSS).** `src/engine/wire-client.ts` is a
fail-closed placeholder: every call rejects with `EngineTransportPending` (it never fabricates a result,
INV-CONSOLE-NO-STUB), so `/readyz` truthfully reports not-ready. The real transport needs (1) the crdb
**frame** wire-format vendored the way the DTO payload schema already is in `@forge/contracts` (an
IP-CONSOLE-READINESS follow-on), (2) the BFF's **enrolled client certificate** (a service Principal), and
(3) a **live node** to validate. It carries `INV-CONSOLE-ENGINE-AUTHZ` (the brokered, authorized seam).

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
