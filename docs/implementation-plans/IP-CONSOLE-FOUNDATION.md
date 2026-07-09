# IP-CONSOLE-FOUNDATION -- Phase 0: the platform foundation (TRD-CONSOLE-00)

**Status:** OPEN (authored 2026-07-09). The first per-IP plan under `IP-CONSOLE-ROADMAP.md`, and the
implementation of the foundational TRD **`TRD-CONSOLE-00`**. It builds the platform layer that makes the
Console's invariants *enforceable* -- the contract package, the design system, the stateless BFF, the
binding registry + no-stub contract test, auth, the live stream, the admin plane, and the SPA shell --
**before any operator surface is built**. No surface (`CONSOLE-01..12`) starts until this lands.

This plan is the counterpart of the engine repos' per-IP plans: a roster of one-invariant-per-PR steps,
each with tiered tests, and a first-class **`INV-CROSS`** section that owns the Crucible/Torch/Forge work
the foundation depends on (so the plan drives the backend rather than the UI faking it).

Read with `TRD-CONSOLE-00` (authoritative), `IP-CONSOLE-ROADMAP.md` Section 3 (the Phase 0 table this
expands), and `TypeScript_Dev_Rules.md` (the gate).

---

## 1. Objective and exit criteria

**Objective.** Stand up the three-tier foundation of `TRD-CONSOLE-00` Section 2 so that: every value and
control *can only* bind to a real engine operation (no-stub is compiler- and gate-enforced), the Console
persists no domain data (no 2nd DB), auth resolves an operator to a Crucible Principal + EXPLAIN tier,
the live channel streams engine deltas, the admin plane is served on the node-IP 8443 leg, and the SPA
shell renders the design system and the IA -- **with zero fabricated data anywhere.**

**Exit criteria (Phase 0 done):**

- The workspace is out of the scaffold stage: `scripts/ci.sh` runs the full TypeScript gate
  (typecheck -> lint -> format -> test -> contract -> e2e -> audit -> licenses -> build), green.
- A logged-in operator sees the shell (nav, IA, drawer host, empty/loading/error/stale states) with **no
  surface data yet** and **no fabricated rows** -- every panel is an explicit empty/pending state.
- `pnpm test:contract` forbids any unbound control and any mock provider in a release build; the SPA API
  client is generated from the BFF OpenAPI (no drift).
- The BFF reaches Crucible only over the enrolled mTLS `:7878` seam; the admin leg is the node-IP 8443
  listener with the hybrid-PQC + CNSA-1.0-fallback profile, fail-closed on a widened bind.
- The live channel delivers a stream delta to the browser end to end (against the seeded demo tenant),
  or, if the engine subscribe surface is not yet landed, the channel ships behind a `PENDING` binding
  with its gating crdb task in flight (Section 5, X-STREAM).

The Phase-0 invariants proven: `INV-CONSOLE-NO-STUB`, `INV-CONSOLE-NO-2ND-DB`, `INV-CONSOLE-ENGINE-AUTHZ`,
`INV-CONSOLE-ADMIN-PLANE`, `INV-CONSOLE-LIVE` (or `PENDING` per X-STREAM), and the `<=3-click` frame
(`INV-CONSOLE-3-CLICKS` is proven per-surface later, but the shell + drawer host make it reachable).

---

## 2. Principles (inherited)

- **Foundation before surfaces.** Nothing here is deferrable; it is what makes the product rules
  enforceable (`IP-CONSOLE-ROADMAP.md` Section 1).
- **No stub ships; the plan owns the backend.** A binding whose engine op does not exist yet is `PENDING`
  and appears in Section 5 (`INV-CROSS`) with its owning repo + task; it never ships (`test:contract`
  fails a release build referencing one).
- **CrucibleQL-first reads.** Read bindings are parameterized CrucibleQL over `QuerySubmit` wherever
  CrucibleQL serves; a DTO/wire or admin call only where it cannot, noted on the binding.
- **One PR at a time, gated, reviewed.** Branch-per-PR through `scripts/ci.sh`, no-ff merge, one named
  invariant per PR proven by a tiered test; stop for review after each (`CONTRIBUTING.md`, the engine
  cadence).
- **The federal-grade bar.** `TypeScript_Dev_Rules.md` in full: strict types, no `any`, no floating
  promises, timeouts + `AbortSignal` on every engine call, zod at every trust boundary, no client-side
  secrets, `@forge/contracts` as the single source of shared types.

---

## 3. Workspace bring-up (folds into F0.1)

The gate self-detects the scaffold stage: it runs hygiene-only until a `packages/*` or `apps/*` member
lands. The **first PR (F0.1)** moves the gate out of scaffold stage and MUST wire, once, the tooling every
later step inherits, so the roster does not re-litigate it:

- `pnpm` workspace members under `packages/*` (libraries) and `apps/*` (deployables), each extending
  `tsconfig.base.json` and the root `eslint.config.mjs` (narrow-never-loosen).
- Per-package scripts (`typecheck`/`lint`/`test`/`build`, plus `test:contract` on the contracts+BFF and
  `test:e2e` on the SPA) so the root `pnpm -r --if-present` fan-out and `scripts/ci.sh` light up.
- Test runners pinned: **Vitest** (unit/integration), **Playwright** (e2e). The committed
  `pnpm-lock.yaml` (frozen-install in CI). Dependency + license policy per `DEPENDENCY-POLICY.md`.

Lockfile growth is expected here and is reviewed; every added dep is pinned, audited, and
license-allowlisted at review (`DEPENDENCY-POLICY.md`).

---

## 4. The roster (F0.1 -- F0.8)

Each row is one PR (or a small ordered set), a named invariant, and its test tier(s). Order follows the
`TRD-CONSOLE-00` Section 13 / roadmap dependency graph: contracts + design system are independent leaves;
the BFF core precedes the registry, auth, stream, and admin plane; the SPA shell composes them last.

| Step | Deliverable | Invariant | Tests |
|------|-------------|-----------|-------|
| **F0.1** | **`@forge/contracts`** -- the shared-types package + workspace bring-up (Section 3). Branded ids (`PrincipalId`, `VtzId`, `DecisionId`, ...), the platform error-code union (the Crucible taxonomy: `PolicyError`/`AsOfError`/`PrepareError`/...), the `BindingId` type + the typed **binding-manifest** shape, and the **generated engine DTO types** (from the Crucible wire DTO contract) + a placeholder BFF OpenAPI types module the SPA client will regenerate from. | `INV-CONSOLE-CONTRACTS-SINGLE-SOURCE` -- every shared type has exactly one home here; a duplicated engine type or a hand-copied enum fails the build. | 1 (type-level + a codegen round-trip test) |
| **F0.2** | **Design-system package** -- tokens sampled from `docs/assets/` (the dark theme of `TRD-CONSOLE-00` Section 6.1, semantic flow/score/status colors, the honeycomb field, the mark + env badge) and the shared component shells (`TRD-CONSOLE-00` Section 6.3 / the mockups): flow graph host, score ring, KPI card, virtualized data table, tab strip, right drawer, badge/chip, timeline scrubber, chart primitives, confirm dialog. Storybook-style isolated render + a11y (WCAG AA, `Section 6.4`). No data; pure presentation. | `INV-CONSOLE-DESIGN-SEMANTIC-COLOR` -- semantic color is a token keyed by *meaning* (good/permit, deny/critical, ...); a hand-picked hex in a component fails a lint/token test. | 1 (render + contrast/a11y) |
| **F0.3** | **BFF core** -- the stateless Node service: the enrolled **mTLS `:7878`** Crucible client seam (typed against `@forge/contracts`, every call timeout + `AbortSignal`), config validated at startup (fail-closed on missing/invalid), health + readiness, structured `pino` logging (no secrets), the OpenAPI surface skeleton, and the ephemeral, version-tagged, non-authoritative cache (`Section 2.2`). **No domain schema, no migrations, no domain tables.** | `INV-CONSOLE-NO-2ND-DB` -- the BFF owns only operational state (cache/counters/session); a domain table/migration/durable store is absent and a test asserts none is reachable. | 1, 2 (route->handler over a mocked engine seam) |
| **F0.4** | **Binding registry + the no-stub contract test** -- the typed binding manifest (every read binding names a BFF resolver -> a concrete CrucibleQL/DTO/Torch/Forge op + view-model shape; every command binding names a handler -> a real mutating op + authz + audited effect; `PENDING` bindings name their gating engine task). `pnpm test:contract`: (a) every route + interactive component references a registered binding; (b) each binding's backend op exists in the generated clients (or is `PENDING`); (c) the SPA client matches the BFF OpenAPI; (d) **no mock provider is reachable in a release build** (the fixture provider is `NODE_ENV=test`-only and compiled out). | `INV-CONSOLE-NO-STUB` -- an unbound control does not compile; a `PENDING` binding fails a release build; no synthesized datum ships. | 3 (contract) |
| **F0.5** | **Auth** -- federated **OIDC** login against the platform IdP; the session maps the operator to a Crucible **Principal + EXPLAIN tier** (User/Developer/Admin/SecurityAudit); the BFF brokers every read/command under that Principal; **tier-correct rendering** (redacted fields absent, not masked); an unauthorized action returns the engine's sanitized error + request id. Client gating is UX only; the client is assumed hostile. | `INV-CONSOLE-ENGINE-AUTHZ` -- every read/command is authorized engine-side under the operator Principal; the UI never renders above the operator's tier; a forged client claim is refused engine-side. | 1, 2, and a 4 (login -> tier-gated render) leg |
| **F0.6** | **The live streaming channel** -- one BFF subscription to Crucible's decision/audit stream, fanned to the browser over a single push channel (**SSE** default; WebSocket where bidirectional), with backpressure, reconnect-with-backoff, and **resync-from-engine** (never from cache) on reconnect; a "Live" badge + a staleness marker on lag. **Gated on X-STREAM** (Section 5): if the engine wire subscribe surface is not yet landed, the channel ships behind a `PENDING` binding and this step lands the BFF/SPA plumbing against the seeded tenant only. | `INV-CONSOLE-LIVE` -- a live panel reflects engine state within < 2 s with an explicit staleness indicator on lag; it is a stream, not a polled snapshot. | 2 (stream lifecycle: connect/backpressure/reconnect/resync), 5 (fan-out load) |
| **F0.7** | **The admin access plane** -- the **8443** listener **bound to the installed node's own IP** (not wildcard, not public), negotiating a **hybrid post-quantum key exchange** (classical + ML-KEM) with a **strong classical CNSA-1.0 fallback** (never below CNSA 1.0; a sub-CNSA-1.0 client refused); **fail-closed on a widened bind**. Admin routing is separate from the general plane; **engine access stays mTLS `:7878`** and never crosses 8443 (the two legs never merge). Installer-provisioned, operator-visible config (the exact hybrid group + cert profile pinned later by `TRD-CONSOLE-11`). | `INV-CONSOLE-ADMIN-PLANE` -- the admin leg binds node-IP:8443 with hybrid-PQC + CNSA-1.0-floor TLS; a config that widens the bind or drops below the floor fails startup; no engine call rides 8443. | 1, 2 (bind fail-closed; floor negotiation; leg separation) |
| **F0.8** | **The SPA shell** -- the left-rail nav + IA (`Section 5.1`, the 11 destinations, retermed), routing, the **drawer host** (`CONSOLE-12` lands its content later; the host + slide-over is here since every surface reuses it), the query layer (TanStack Query) + the live-store (SSE -> a small store) + list virtualization wired, error boundaries, and the explicit **empty / loading / error / stale** states (`Section 9`). Renders the F0.2 design system; **no surface data** -- every panel is an honest empty/pending state. | `INV-CONSOLE-SHELL-3-CLICK-FRAME` -- the shell realizes the IA and the select-then-act drawer frame so every surface's `<=3-click` path is reachable (proven per-surface later); no fabricated data renders. | 1, 4 (nav + drawer-open interaction; empty-state E2E) |

**Sequencing within the roster.** F0.1 and F0.2 are independent and can land in either order (F0.1 first
is preferred -- it unblocks typed BFF work). F0.3 depends on F0.1. F0.4 depends on F0.1 + F0.3. F0.5,
F0.6, F0.7 each depend on F0.3 and are independent of one another. F0.8 depends on F0.2 + F0.4 (+ F0.5 for
the gated shell) and composes F0.6's live-store. The admin plane (F0.7) can proceed in parallel once F0.3
lands.

---

## 5. Cross-surface engine work (`INV-CROSS`) -- the plan owns the backend

The foundation depends on these platform capabilities. Each row names the concrete engine work, its
owning repo, and whether the op **exists** today (the binding ships live) or is **PENDING** (the binding
is a tracked plan artifact and the engine PR lands first or in lockstep). Verified against the engine
surfaces on 2026-07-09.

| Foundation need (step) | Engine capability required | Owning repo / status |
|------------------------|----------------------------|----------------------|
| Typed engine DTO in `@forge/contracts` (F0.1) | A **consumable, machine-readable Crucible wire DTO schema** to generate TS from (the `cdb-wire` `WireRequest`/`WireReply` + CrucibleQL row/DTO shapes). The contract is built (IP-WIRE-DTO) but is Rust types, not a codegen source. | **crdb -- owned by the pre-req `IP-CONSOLE-READINESS` Part A** (`INV-WIRE-DTO-SCHEMA-EXPORTED`, steps CR.A1/CR.A2): crdb emits the DTO contract as a drift-gated JSON Schema and F0.1 generates `@forge/contracts` from it. Lands first or in lockstep; until it lands, F0.1 hand-authors the consumed subset behind the same byte-shape round-trip test, then swaps to the generated types. |
| BFF reaches the engine over mTLS `:7878` (F0.3) | An **enrolled Console service identity** -- the BFF's own mTLS client cert to the node (a service Principal), exactly as Torch enrolls. | **torch/crdb** -- **EXISTS** (ZTP + the `:7878` mTLS gateway are live; admit-enrolled). Task: provision + enroll the Console BFF service identity and grant it the operator-broker capability. |
| Read bindings (F0.4, all surfaces) | **CrucibleQL over `QuerySubmit`** with cursor paging + `AS OF` + `EXPLAIN`, authorization-in-candidate-generation. | **crdb** -- **EXISTS** (`WireRequest::QuerySubmit` / `CursorFetch` / `CursorClose`; read spine live). CrucibleQL-first bindings ship against it. |
| Command bindings (F0.4, later surfaces) | The **admin + govern command surface** (config/report/egress/model/legal-hold/agent-grant/... over the mTLS admin plane, the `cdb-actl` op set) and Torch/Forge govern/contain commands. | **crdb/torch/forge** -- **EXISTS** for the crdb admin ops (the `cdb-actl` surface); Torch/Forge containment + VTZ management commands are **PENDING** per the surface IPs (`CONSOLE-02/07/12`), out of Phase-0 scope. |
| Operator login -> Principal + tier (F0.5) | An **operator OIDC session -> Crucible Principal + EXPLAIN tier** binding (the trust edge: OIDC/1Source authorizes; the engine authenticates the principal and returns its tier). | **crdb/1Source** -- **PARTIAL/PENDING**: the mTLS + principal model + EXPLAIN tiers exist (TRD-04); the operator-OIDC-session -> Principal mapping brokered by the BFF is the seam to confirm/land. Enumerate the exact op; ship live only when it resolves. |
| The live decision/audit stream (F0.6) | A **streamed subscribe surface over the wire** for a client to receive DecisionObject / audit deltas (a push/subscribe frame). **No wire subscribe surface exists today** -- the wire is request/reply (`QuerySubmit`/cursors/txn); `DecisionObject` + the audit chain + `cdb-observe` exist but are not client-streamable over `:7878`. | **crdb -- owned by the pre-req `IP-CONSOLE-READINESS` Part B** (`INV-WIRE-DECISION-STREAM-GOVERNED`, steps CR.B1-CR.B.N): a bounded, resumable, authorization-scoped subscribe frame family reusing the wire's existing `StreamCredit`/`CreditWindow` flow control. F0.6 lands the BFF/SPA plumbing behind a `PENDING` binding and ships live when Part B lands (first or in lockstep). Also serves `CONSOLE-09` (Logs) / `CONSOLE-07` (AIOps). |
| Admin plane 8443 hybrid-PQC (F0.7) | The **installer-provisioned node-IP 8443 listener** + the hybrid (X25519+ML-KEM) / CNSA-1.0-fallback TLS config + cert. The engine already negotiates X25519MLKEM768 by default on `:7878` (aws-lc-rs); the 8443 *user* leg is Console-owned. | **ForgeCentral + installer** -- Console-owned (F0.7 builds the listener + fail-closed bind); the exact hybrid group + cert profile pinned by `TRD-CONSOLE-11`; installer provisioning is a deploy task. |

**The two genuine PENDING blockers for a fully-live foundation** -- (1) the codegen-able DTO schema
(F0.1) and (2) the **wire decision/audit stream** (F0.6, `INV-CONSOLE-LIVE`) -- are both owned by a single
**crdb pre-req IP, `IP-CONSOLE-READINESS`** (Part A + Part B), authored to make the engine Console-ready
before the UI builds against it. Per the product decision (2026-07-09), that crdb IP lands first or in
lockstep so these bindings ship **live, not `PENDING`**; the Console plumbing (F0.1 hand-authored subset;
F0.6 BFF/SPA channel) can proceed in parallel and swaps to the live surface the moment each part lands.
No fabricated data in the interim.

---

## 6. Testing and acceptance

- **Per PR:** the touched invariant proven by its tier(s) above; the full `scripts/ci.sh` green
  (`--skip-net`/`--skip-e2e` allowed locally, full gate before merge). Failure paths are first-class
  (engine down, unauthorized, empty, stale) per `TRD-CONSOLE-00` Section 11.
- **Contract (tier 3) every PR** once F0.4 lands: no unbound control, no reachable mock provider in a
  release build, no client/OpenAPI drift.
- **E2E (tier 4):** the shell empty-state journey (login -> shell -> open drawer host) lands with F0.8;
  the per-surface `<=3-click` E2Es land with their surfaces.
- **Phase exit:** the exit criteria of Section 1, and every `INV-CROSS` binding either live or `PENDING`
  with its crdb task in flight.

## 7. Cadence

One PR at a time, branch-per-PR off local `main` -> code + test -> full gate -> **review with the
maintainer** -> no-ff merge -> push local + GitHub (`github-forgecentral`), delete branch. No em dashes;
scoped commits (code separate from docs). A landing ledger (`IP-CONSOLE-FOUNDATION-LEDGER.md`) is created
when F0.1 starts building and tracks each step (step, invariant, status, commit).

## 8. What this IP deliberately does NOT do

- No operator **surface** (`CONSOLE-01..12`) -- those are their own IPs on this foundation.
- No Torch/Forge containment/VTZ **command** implementations -- named as `INV-CROSS` for the surface IPs.
- No exact admin-plane hybrid group / cert profile pinning -- owned by `TRD-CONSOLE-11`.
- No performance hardening beyond the Section 7 budgets' plumbing (virtualization/stream/prefetch are
  wired; per-surface tuning is per-surface).
