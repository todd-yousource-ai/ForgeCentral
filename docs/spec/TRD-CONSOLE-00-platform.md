# TRD-CONSOLE-00 -- YouSource Console: Platform and Architecture

**Status:** DRAFT (authored 2026-07-07). The foundational TRD of the Console suite. Every
per-surface TRD (`TRD-CONSOLE-01..12`) inherits the architecture, data contract, design system,
information architecture, authorization model, and invariants defined here. Where a per-surface TRD
conflicts with this document, this document wins unless it explicitly cites the exception.

**Product:** the YouSource Console -- the single operator pane of glass over the YouSource platform:
the **Crucible** engine (data + policy + audit, the `crdb` TRD-01..08 core), the **Torch** agent edge
(sensing, discovery, wrap, govern; TRD-09/25), and **Forge** governance (Virtual Trust Zones, the
runtime-control lattice; TRD-32/34). The Console renders and drives that platform. It is **not** a
system of record and holds **no** durable domain data of its own.

---

## 1. Purpose and scope

Give operators one intuitive, fast, real-time surface to see and steer everything the platform is
doing: who and what is connecting to what (the live connectivity graph), how every autonomous decision
was made and can be replayed, which policies govern which zones, and the levers to correct course
(isolate, re-scope, rotate, remediate). The mock UI in `docs/assets/mock/` is the visual and
interaction target; its trust-era terminology is updated per Section 3.

**In scope (this TRD):** the Console platform -- the TypeScript/Node backend-for-frontend (BFF), the
web application shell, the data contract binding every surface to real platform data, the design
system and brand, the information architecture and navigation, authentication and authorization,
real-time streaming, performance, and the cross-cutting invariants.

**In scope (the suite):** every operator surface, each owned by a per-surface TRD (Section 12).

**Out of scope:** the engine/edge internals (owned by the crdb/torch/forge TRDs); the Console never
reimplements policy evaluation, detection, or the audit chain -- it reads and commands them.

**Non-negotiable product rules (from the product owner), realized as invariants in Section 10:**

1. **No UI stubs.** Every rendered value and every clickable control resolves to real data or a real
   action from Crucible, Torch, or Forge. No mocked, synthesized, or placeholder data ships.
2. **No second database.** Crucible is the sole source of truth. The Console persists no durable domain
   state; any cache is ephemeral, invalidatable, and never authoritative.
3. **Three clicks maximum.** Every defined operator task is reachable in three clicks or fewer from the
   home graph.
4. **Near-instant.** Interactions feel instantaneous; the live surfaces are streamed, not polled
   snapshots.

---

## 2. Architecture

Three tiers, one system of record.

```
   Browser (TypeScript SPA)                 <-- render + interaction only, no domain state
        |  HTTPS + session (OIDC)
        v
   Console BFF (Node.js / TypeScript)        <-- STATELESS gateway: shape, aggregate, stream
        |  mTLS :7878 CrucibleQL/DTO   |  Torch/Forge admin + govern surfaces
        v                              v
   Crucible engine (crdb)  <----  Torch edge / Forge governance
   THE system of record: data, policy, audit chain, decisions, time-travel
```

### 2.1 System of record: Crucible only (INV-CONSOLE-NO-2ND-DB)

All durable domain state -- principals, policies, VTZs, objects, decisions, the audit/decision stream,
the connectivity LOG, construction reports, config -- lives in Crucible and is read through its wire
interfaces (CrucibleQL over the mTLS `:7878` seam, the typed DTO contract, and the Torch/Forge admin +
govern surfaces). The Console **originates no schema, no table, no durable store.** A write from the
Console is a Crucible/Torch/Forge command that commits through the engine's atomic commit batch and its
audit chain (TRD-02 Section 8), exactly as any other client's write.

### 2.2 The BFF: a stateless shaping gateway, not a datastore

The Node/TypeScript BFF exists for UI *flexibility and speed*, never for storage. Its jobs:

- **Speak the platform's wire protocols** so the browser never holds engine credentials or the mTLS
  identity. The BFF holds the Console service identity (its own enrolled mTLS client cert to the node)
  and brokers every call under the *logged-in operator's* Principal + EXPLAIN tier (Section 8).
- **Shape and aggregate** engine results into view models (join a decision to its principal and its
  policy; fold the LOG into graph nodes/edges) so a surface is one round trip, not N.
- **Stream** the live surfaces (Section 7) from Crucible's decision/audit stream to the browser over a
  single push channel.
- **Enforce the data contract** (Section 4): every route maps to a declared, real backend operation.

The BFF is horizontally scalable and disposable: killing every BFF instance loses nothing. It MAY use
an **ephemeral, non-authoritative cache** (in-process LRU, or a shared cache such as Redis used *only*
as a cache) for hot reads, always tagged with the engine version/watermark it was read at and
invalidated on the next authoritative read or a stream event. A cache miss is never a failure; a cache
is never consulted for a write path.

### 2.3 The web application

A TypeScript single-page application (React, with a typed API client generated from the BFF's OpenAPI
schema so the browser and BFF cannot drift -- AI Quality Guide Section 2.2 cross-module gap defense).
The SPA holds only view state (selection, filters, drawer open/closed). It renders the design system of
Section 6 and navigates the IA of Section 5. It never talks to Crucible directly and never holds a
long-lived secret.

**React is the component and interaction model throughout, and it is what carries the dynamic surfaces**
(the live graph, the streaming decision feeds, the Rewind scrubber, the dashboards). React alone gives
the reactive component model; the dynamic surfaces compose it with four supporting layers, each pinned by
the implementing TRD:

- **Reads + cache:** a query layer (TanStack Query) for engine reads -- loading/error/empty states,
  request dedup, and the ephemeral cache invalidation of Section 2.2.
- **Live deltas:** a small streaming store (SSE/WebSocket -> Zustand or equivalent) that applies
  decision/graph/log deltas into React state in place, so "Live" surfaces update without re-fetching
  (Section 7).
- **Scale:** list/feed virtualization (e.g. TanStack Virtual) so large tables and the Logs/AIOps feeds
  render only what is visible.
- **Visualization:** for the connectivity graph specifically, a **canvas/WebGL renderer under React** --
  React owns the surrounding UI, selection, and the drawer, while the flow's many edges render on a
  canvas layer for 60 fps at scale (a pure-DOM/SVG graph does not hold up at the node/edge counts in the
  mock). Charts (time series, histogram, heatmap) use a React charting layer.

So React is not just "help" for the dynamic pages -- it is the chosen foundation for all of them, and the
above are the reactivity/scale/rendering layers it composes with. No second component framework is
introduced (`TypeScript_Dev_Rules.md` Section 7.1).

### 2.4 Technology decisions

- **TypeScript everywhere** (strict mode), Node LTS for the BFF. One language across the tier.
- **Contract-first:** the BFF publishes an OpenAPI (REST) + an async schema (the stream); the SPA client
  is generated from it. The BFF's engine calls are typed against the Crucible DTO contract.
- **No ORM, no migrations, no domain tables in the BFF.** The only persistence the BFF may own is
  operational (session store if not stateless-JWT, rate-limit counters, the ephemeral cache) -- never
  domain data.

---

## 3. Terminology map (trust-era mock -> AI-native platform)

The mock was authored for a trust-centric product; the Console uses the platform's real vocabulary. The
map is normative -- surfaces use the right-hand column, and the left-hand terms never ship.

| Mock term | Console term | Grounded in |
|-----------|--------------|-------------|
| TrustOps | **AIOps** | the AI-operations command center (per the product owner) |
| Trust Overview (home) | **Overview** (the live connectivity graph) | the LOG-driven connectivity graph (`TRD-CONSOLE-01`) |
| Trust Reflex | **Reflex** | Torch/Crucible detection -> automated response (the DecisionObject -> action) |
| Trust Score | **Trust Score** (retained) | the engine's confidence/risk score per entity (a real, computed value) |
| TrustFlow | **TrustFlow** (retained) | the real `torch-trustflow` brokered-egress/inference plane |
| TrustLock (rotations) | **KeyLock** | the TRD-04 key hierarchy + rotation (SignatureEnvelope) |
| Trust Replay / Rewind | **Rewind** (retained) | Crucible time-travel, `AS OF` (TRD-02 Section 5) |
| Virtual Trust Zones (VTZ) | **Virtual Trust Zones (VTZ)** (retained) | the real Forge TRD-32 v2 hierarchical VTZ model |
| TrustSims | **Simulations** | policy/decision what-if over the engine (dry-run planning) |
| Reflex actions (Auto Isolate, Re Auth, Block, Limit Scope, Allow With Monitor) | same, mapped to the **TRD-32 v2 action lattice** | Permit < Monitor < Quarantine < Deny + attested re-auth |

"Trust" is retained ONLY where it names a real computed quantity (Trust Score) or a real component
(TrustFlow, VTZ). Everywhere it was branding for the product category, it becomes the AI-native term.

---

## 4. The data contract -- the no-stub invariant (INV-CONSOLE-NO-STUB)

The defining rule: **every datum the Console renders and every action it exposes is bound to a real
platform operation.** This is enforced structurally, not by convention.

**This does NOT mean the UI is capped by what the backend supports today.** The product may design and
plan any surface the user experience calls for, even when Crucible, Torch, or Forge cannot yet satisfy
its data contract. The rule is about *shipping* and about *planning*, not about ambition:

- **We build toward the intended UX.** A surface's contract expresses what the operator needs, and it is
  legitimate to define a binding whose backing engine operation does not exist yet.
- **The implementation plan owns the cross-surface work.** When a surface needs data or an action that
  Crucible/Torch/Forge does not yet provide, the surface's IP MUST enumerate the concrete work on those
  other surfaces to make the contract real -- the CrucibleQL read to add, the DTO/wire field to expose,
  the Torch/Forge command to implement -- each as a named, sequenced task with its owning repo and TRD.
  A binding is never left dangling in the plan: it is either satisfied by an existing engine operation or
  paired with the engine work (and the engine PR lands first or in lockstep). This is the `INV-CROSS`
  invariant (Section 10).
- **What ships is real.** Only when a binding's backing operation exists does the surface ship it. Until
  then the surface is not "stubbed with fake data"; it is *not yet built*, and its IP tracks the gating
  engine work. No mock/synthesized datum ever reaches a release build.

So the sequence is: UX-driven contract -> IP that covers the engine work -> engine work lands -> the
surface ships against real data. The no-stub rule bites at build/ship time; the cross-surface-coverage
rule bites at plan time.

### 4.1 The binding registry

Each surface declares, in a typed **binding manifest**, every read and every command it uses:

- A **read binding** names a BFF query resolver, which names the concrete Crucible read (**a CrucibleQL
  statement preferred** -- see below) or Torch/Forge read it issues, and the view-model shape it returns.
- A **command binding** names a BFF command handler, which names the concrete Crucible/Torch/Forge
  mutating operation it invokes (e.g. publish policy, isolate entity, rotate key), its authorization
  requirement, and its audited effect.
- A binding whose backing operation does not exist yet is marked `PENDING` and names the gating engine
  task (repo + TRD/IP step); a `PENDING` binding cannot ship (the contract test fails a release build
  that references one) but is a legitimate, tracked plan artifact.

A UI control with no binding cannot be built: the component API requires a binding id, and the build
fails on a dangling or absent binding.

### 4.1a CrucibleQL is the preferred read surface

CrucibleQL was developed deliberately as a strong query surface for the UI layer, so **read bindings
express their data need as a CrucibleQL statement wherever CrucibleQL can serve it**, rather than a
bespoke DTO endpoint. Benefits: the shaping/filtering/aggregation/pagination the UI needs is pushed into
the engine (one round trip, server-paged, `AS OF`-capable for Rewind), `EXPLAIN` gives the Rationale
surfaces their real rationale, and authorization + classification redaction happen inside candidate
generation (TRD-04) rather than in the BFF. Values bind as parameters -- literals are never interpolated
(`TypeScript_Dev_Rules.md` Section 9.3). A DTO/wire call is used only where CrucibleQL genuinely cannot
express the need (a Torch/Forge command, a control-plane action); that choice is noted on the binding.
When a needed read is *almost* expressible in CrucibleQL, the preferred cross-surface work (Section 4
above) is to extend CrucibleQL, not to add a one-off BFF endpoint.

### 4.2 Contract enforcement

- **Build-time:** a contract test walks every route and every interactive component and asserts each
  resolves to a registered binding whose backend operation exists in the Crucible DTO / Torch / Forge
  surface (typed against the generated clients). A binding pointing at a non-existent operation fails
  the build (the cross-module-gap defense).
- **Run-time:** the BFF has **no mock provider in production builds.** A fixture/mock data source exists
  ONLY under a test flag and is compiled out of release bundles; a release build that references it
  fails CI. Empty real data renders an explicit empty state (Section 9), never fabricated rows.
- **Demo mode:** the mock's `DEMO` badge is honored as a *labeled, seeded-but-real* dataset served by a
  real Crucible tenant provisioned with demo data -- not synthesized in the UI. Demo is a data
  provisioning choice, never a UI stub.

---

## 5. Information architecture and navigation

### 5.1 Primary navigation (left rail, persistent)

Eleven destinations, matching the mock, retermed per Section 3:

`Overview` (home, the live graph) · `Virtual Trust Zones` · `Dashboards` · `Users` · `Policies` ·
`TrustFlow` · `AIOps` · `Reports` · `Logs` · `Objects` · `Settings`. A persistent account menu
(bottom) and the YouSource mark + environment badge (top).

### 5.2 The three-click rule (INV-CONSOLE-3-CLICKS)

Every defined operator task completes in <= 3 clicks from the Overview graph. The canonical paths (each
owned + tested by a per-surface TRD):

| Task | Path (clicks) |
|------|---------------|
| Inspect an entity + its live connections | Overview -> click entity node (1) -> drawer opens (data already there) |
| Isolate a misbehaving agent | Overview -> click entity (1) -> "Isolate from network" (2) -> confirm (3) |
| See why a decision was made | AIOps or Logs -> click decision (1) -> "Rationale/EXPLAIN" (2) |
| Replay the last hour of decisions | AIOps (1) -> Rewind tab (2) -> scrub timeline (interaction) |
| Publish a policy edit | Policies (1) -> edit a policy (2) -> Publish (3) |
| Re-scope a VTZ | Virtual Trust Zones (1) -> a zone (2) -> edit boundary + save (3) |

The three-click budget is a hard acceptance gate: any surface TRD introducing a task deeper than three
clicks must either restructure or cite an explicit exception approved in this TRD.

### 5.3 Recurring interaction patterns

- **The entity drawer.** Clicking any entity anywhere (graph node, table row, decision card) opens a
  right-side drawer with its identity, score, connected VTZs, capabilities (from its Construction
  Report when it is a wrapped agent), effective policies, recent decisions, and Quick Actions. One
  click to open; actions inside are the second click. (`TRD-CONSOLE-12`.)
- **Top tabs** scope a surface (All / Users / Devices / AI Agents on Overview; the dashboard/report/
  settings tab strips). Tabs are same-surface filters, never new destinations, so they do not spend a
  click against the budget for entity tasks.
- **Time range + Live.** Time-scoped surfaces carry a range control; "Live"-badged panels stream.

---

## 6. Design system and brand

The committed assets in `docs/assets/` are canonical: `yousource-logo.png` / `.gif` (the swirling
teal-to-navy torus mark + "YouSource.ai" wordmark), `yousource-honeycomb.jpg` (the dark hex-mesh
field). The tokens below reproduce the mock; the assets, not the hex approximations, are the source of
truth, and the implementing TRD locks exact values by sampling them.

### 6.1 Color tokens (dark theme, the only theme)

- **Surfaces:** near-black navy canvas (`~#0A0E17`), panel (`~#0D1322`), elevated card
  (`~#111A2E`), hairline border (`~#1B2740`).
- **Brand primary:** the logo teal-green (`~#3FBE96`), used for the mark, active nav, positive
  emphasis, and the "good" score ring; its deep-navy counterpart (`~#123A6B`) anchors gradients.
- **Semantic flow colors** (the connectivity graph): Users blue (`~#3B82F6`), Devices teal-green
  (brand), AI Agents purple (`~#8B5CF6`), objects/destinations amber (`~#E8A33D`).
- **Score + status:** good/permit green (`~#2ECC8F`), caution/monitor amber (`~#E8C14A`),
  critical/deny red (`~#E2574C`), quarantine/isolate orange-red, info blue.
- **Text:** primary (`~#F4F7FB`), muted (`~#8A93A5`), on-brand-fill dark.

### 6.2 Brand furniture

- The **honeycomb field** is the ambient background on content-light surfaces (list/detail pages),
  low-contrast so it never competes with data. The Overview graph renders it faintly behind the flow.
- The **YouSource mark** sits top-left with an environment badge (`DEMO` / `PROD` / tenant). The mark
  animation (`.gif`) is reserved for load/splash; static elsewhere.

### 6.3 Components (the shared library)

Flow/Sankey graph (Overview), score ring (numeric 0-100 in a colored ring), KPI card, data table
(virtualized, sortable, filterable, server-paged), tab strip, right drawer, badge/chip (status,
compliance, action), timeline scrubber (Rewind), time-series + histogram + heatmap charts, policy row,
group/object card, connector card (federation), confirm dialog (for destructive actions). Motion is
subtle and purposeful (the flow's gentle animation, drawer slide); never decorative jank.

### 6.4 Accessibility

WCAG AA contrast on all text/data (the dark theme is tuned for it), full keyboard navigation, focus
states, ARIA on the graph (entities + edges are focusable with text equivalents), reduced-motion honored.

---

## 7. Real-time and performance (INV-CONSOLE-LIVE)

**Target feel: instantaneous.** Concrete budgets (a named workload profile per CRAFTED standards; the
implementing TRD attaches the profile):

- First meaningful paint of a navigated surface: < 300 ms with warm cache, < 1 s cold.
- Interaction response (open drawer, filter, sort, tab): < 100 ms p95 (view state is local; data is
  prefetched or streamed).
- Live graph + decision stream: end-to-end freshness < 2 s from engine commit to on-screen.

**How:**

- **Stream, don't poll.** The BFF subscribes once to Crucible's decision/audit stream and pushes deltas
  to the browser over a single channel (Server-Sent Events default; WebSocket where bidirectional). The
  graph and Logs/AIOps feeds apply deltas; they never full-refetch on a tick. A "Live" badge means
  streamed, and a staleness indicator appears if the stream lags.
- **Server-shaped, server-paged.** Tables and the graph are paginated/aggregated engine-side; the
  browser never loads an unbounded set (all `FIND` results are `LIMIT`/cursor-paged, TRD-04 interface
  rules). The graph aggregates the LOG into bounded node/edge summaries with drill-down on demand.
- **Prefetch on intent.** Hovering an entity prefetches its drawer payload so the click is instant.
- **Ephemeral cache** (Section 2.2) for hot reads, invalidated by stream events.

---

## 8. Authentication and authorization (INV-CONSOLE-ENGINE-AUTHZ)

- **Login is federated OIDC** against the platform IdP (the same enrollment IdP family used by Torch;
  the connectors surface on `Users -> External IDAM`). The session maps the operator to a Crucible
  **Principal** with an **EXPLAIN tier** (User / Developer / Admin / SecurityAudit, TRD-03 Section 8.1).
- **Every action is authorized engine-side.** The BFF brokers each read/command under the operator's
  Principal; Crucible/Torch/Forge enforce policy and tier on every operation (TRD-04). **Client-side
  gating is UX only** -- hiding a button never substitutes for engine authorization, and the Console
  assumes a hostile client.
- **Tier-correct rendering.** The Console shows only what the operator's tier authorizes; redacted
  fields are absent (not masked-but-present), matching the engine's `RedactionDecision` (TRD-04
  Section 7.3). An unauthorized action returns the engine's sanitized error (Section 9), never a
  specific internal reason.
- **RBAC** for Console operators is configured on `Settings -> RBAC` and enforced by the engine.

### 8.5 The admin access plane (INV-CONSOLE-ADMIN-PLANE)

Administration of the Console -- the operator surfaces that configure the platform itself (all of
`Settings`, and any privileged action that mutates platform posture: KeyLock rotation, DR/HA, FIPS, RBAC,
Federation) -- is served on a **separate, hardened access plane**, distinct from the general read/observe
UI. Its requirements are fixed here and inherited by every admin surface TRD.

- **Bound to the server's own IP.** The admin plane listens **only on the IP address of the node it is
  installed on** (the host's own address), not a wildcard bind and not a public address. It is reached by
  connecting to that server directly; remote administration is by reaching that node's address (over the
  operator's secured network / jump path), never by exposing the plane on an untrusted interface. The
  bind address is the installed node's IP; a config that would widen it fails startup (fail-closed).
- **Port 8443.** The admin plane is served on **TCP 8443**, separate from the general Console port. (The
  engine's own loopback admin plane, e.g. the crdb admin socket, remains as-is behind it; 8443 is the
  Console admin plane's TLS listener on the node IP.)
- **Quantum-resistant hybrid key exchange, with a CNSA 1.0 classical fallback.** The admin plane's TLS
  negotiates a **hybrid post-quantum key exchange** (a classical + ML-KEM hybrid group, e.g.
  X25519+ML-KEM-768 / P-384+ML-KEM, the CNSA 2.0 direction) so the session key is protected against
  harvest-now-decrypt-later. **If the operator's browser does not support the hybrid group, the plane
  falls back to a strong classical suite meeting CNSA 1.0** (ECDSA P-384 or RSA-3072+ certificate,
  AES-256-GCM, SHA-384; TLS 1.3, TLS 1.2 floor). The fallback is a *strength floor*, never a downgrade to
  a weak suite: a browser that offers only sub-CNSA-1.0 crypto is refused. The server certificate is
  CNSA-1.0-grade at minimum (the hybrid protects the key exchange; the certificate/signature remains a
  strong classical or, where supported end-to-end, a PQC signature).
- **Admin authentication is at least as strong as the general plane** (federated OIDC + engine-side
  authorization + the Admin/SecurityAudit EXPLAIN tier), and admin actions are the audited,
  confirm-gated, engine-committed operations of Section 9. Serving admin on the node-pinned 8443 plane is
  an *additional* boundary, not a replacement for engine-side authorization.

The installer provisions the admin plane's node-IP bind, the 8443 listener, the hybrid+fallback TLS
configuration, and the certificate; these are operator-visible config, not hardcoded. The exact hybrid
group and the certificate profile are pinned by the admin surface TRD (`TRD-CONSOLE-11 Settings`) against
the platform's CNSA 2.0 / FIPS posture.

---

## 9. Cross-cutting behavior

- **Every Console command is an audited Crucible operation** with the operator identity, action,
  target, and outcome on the engine's hash-chained audit log (TRD-04 Section 10). The Console adds no
  parallel audit; it relies on the engine's.
- **States are explicit:** loading (skeleton), empty (a real "no data" state, never fabricated),
  error (the engine's typed, sanitized error surfaced with a request id; no stack traces or internal
  paths), and partial (a streamed panel shows a staleness marker rather than silently freezing).
- **Errors are the engine's taxonomy** (`PolicyError`, `PrepareError`, `AsOfError`, ... TRD-04)
  mapped to human copy; the raw code + request id are available for support.
- **Destructive/irreversible actions** (isolate, revoke, publish, rotate, quarantine) require a confirm
  step and are the click that spends the third click; they display the exact effect before executing.
- **Responsive** to laptop and large operator displays; the mock's 2560-wide layouts degrade to a
  single-column stack with the nav collapsing to icons.

---

## 10. Invariants

- **INV-CONSOLE-NO-STUB.** Every rendered datum and every interactive control resolves to a registered
  binding whose backend operation exists in the real Crucible/Torch/Forge surface; no mock/synthesized
  data or unbound control ships in a release build (build-time contract test + no prod mock provider).
- **INV-CROSS.** Where a surface's contract needs data or an action the engine does not yet provide, the
  surface's IP enumerates the concrete cross-surface work (the CrucibleQL read, the DTO/wire field, the
  Torch/Forge command) as named tasks with owning repo + TRD, and the binding is marked `PENDING` until
  the engine work lands; a `PENDING` binding never ships but is a legitimate, tracked plan artifact (the
  UI drives the vision; the plan owns the backend work).
- **INV-CONSOLE-CRUCIBLEQL-FIRST.** A read binding expresses its data need as a parameterized CrucibleQL
  statement wherever CrucibleQL can serve it (shaping/paging/`AS OF`/`EXPLAIN`/authz-in-candidate-gen
  pushed into the engine); a bespoke DTO/wire read is used only where CrucibleQL cannot express the need,
  and that choice is noted on the binding.
- **INV-CONSOLE-ADMIN-PLANE.** Console administration is served on a plane bound to the installed node's
  own IP on TCP 8443, negotiating a hybrid post-quantum key exchange with a strong classical CNSA-1.0
  fallback (never a downgrade below CNSA 1.0); a config that would widen the bind or weaken the floor
  fails startup.
- **INV-CONSOLE-NO-2ND-DB.** The Console persists no durable domain state; Crucible is the sole system
  of record; any cache is ephemeral, version-tagged, invalidatable, and never authoritative or on a
  write path.
- **INV-CONSOLE-3-CLICKS.** Every defined operator task is reachable in <= 3 clicks from the Overview
  graph; a deeper task is a defect or a TRD-approved exception.
- **INV-CONSOLE-ENGINE-AUTHZ.** Every read/command is authorized engine-side under the operator's
  Principal + EXPLAIN tier; client gating is UX only; the UI never renders above the operator's tier.
- **INV-CONSOLE-LIVE.** "Live" surfaces reflect engine state via a streaming channel with < 2 s
  freshness and an explicit staleness indicator on lag; they are not silent polled snapshots.
- **INV-CONSOLE-AUDITED.** Every Console-originated mutation commits through the engine's atomic batch +
  hash-chained audit; the operator identity is on the audit entry.

---

## 11. Acceptance, failure semantics, and six-bug-category mapping

**Acceptance (platform level; per-surface TRDs add their own):**

- A release build contains no mock data provider and no unbound interactive control (contract test
  green).
- Login yields a Principal + tier; a read/command exceeding the tier is refused engine-side and renders
  the sanitized error.
- The Overview graph and the AIOps/Logs feeds update within 2 s of an engine commit over the stream.
- Each canonical task in Section 5.2 completes within its click budget (interaction test).
- No surface issues an unbounded query; every table is server-paged.

**Failure semantics:**

| Condition | Behavior |
|-----------|----------|
| Engine unreachable | The affected surface shows a typed "engine unavailable" state + retry; no fabricated data; the shell stays usable for cached read-only views (marked stale). |
| Stream disconnect | Live panels mark stale + auto-reconnect with backoff; on reconnect they resync from the engine, not from cache. |
| Unauthorized action | The engine's sanitized error (`ResourceUnavailable`/`PolicyError`) with a request id; the control reflects the denial; no internal reason leaked. |
| Empty result | Explicit empty state; never a placeholder row. |
| Cache/engine version skew | The cache entry is discarded and re-read authoritatively; the UI never renders a value it cannot attribute to an engine watermark. |

**Six-bug-category mapping (AI Quality Guide Section 2.4):**

1. Dead code -> the contract test flags any binding/route/component not reachable from the nav.
2. Async/sync boundary -> the BFF is fully async to the engine; streaming is non-blocking; a load test
   asserts no event-loop starvation under the live feed.
3. Cross-module gap -> the SPA client is generated from the BFF OpenAPI, and BFF calls are typed against
   the Crucible DTO client; a drifted identifier fails compilation.
4. Schema/type bypass -> all engine I/O goes through the typed DTO/CrucibleQL clients; no hand-rolled
   JSON into engine calls.
5. Parallel execution -> aggregation fan-out (join decision+principal+policy) uses tolerant parallelism;
   one failed sub-read degrades that field, not the whole view.
6. Missing failure paths -> every read/command has a tested error path (engine down, unauthorized,
   empty, stale) per the table above.

---

## 12. Surface catalog (the suite index)

Each surface is owned by a per-surface TRD that inherits this platform TRD. Each declares its read
bindings (real data source) and command bindings (real actions), its <= 3-click paths, and its states.

| TRD | Surface | Primary real data source | Key real actions |
|-----|---------|--------------------------|------------------|
| CONSOLE-01 | **Overview** (live connectivity graph) | the Crucible connectivity LOG (LEG/LOG decisions -> aggregated nodes/edges) | trace entity, open drawer, filter by type |
| CONSOLE-02 | **Virtual Trust Zones** | Forge VTZ model (TRD-32 v2 hierarchy) | create/edit zone, set boundary + default posture, view members |
| CONSOLE-03 | **Dashboards** | engine aggregates (decisions, sessions, VTZ, enforcement, anomalies) | switch dashboard, set time range, drill to entity |
| CONSOLE-04 | **Users** (principals) | Crucible Principal registry + External IDAM connectors | add/edit principal, manage groups, sync IdP, set override |
| CONSOLE-05 | **Policies** | Crucible policy engine (TRD-04), per VTZ | create/edit/publish policy, view version, EXPLAIN |
| CONSOLE-06 | **TrustFlow** | `torch-trustflow` brokered egress/inference plane | inspect flows, model/MCP routing, egress posture |
| CONSOLE-07 | **AIOps** (command center) | DecisionObject stream, govern/obs, containment, Rewind (AS OF) | replay, contain/isolate, oversight, run simulation |
| CONSOLE-08 | **Reports** | engine aggregates + EXPLAIN | run report, view rationale, export/share |
| CONSOLE-09 | **Logs** (decision/audit stream) | Crucible audit chain + DecisionObjects (the LOG) | search/filter, open decision, EXPLAIN, export |
| CONSOLE-10 | **Objects** (protected resources) | Crucible resource/object registry (TRD-32 object taxonomy) | create/edit object, view governing policies |
| CONSOLE-11 | **Settings** | engine admin surfaces (HA/DR TRD-07, KeyLock TRD-04, Federation, FIPS, RBAC, Observability, Policy) | rotate leadership, test DR, manage keys, toggle FIPS, RBAC |
| CONSOLE-12 | **Entity drawer** (shared pattern) | per-entity join (identity + score + policies + Construction Report + recent decisions) | isolate, modify VTZ, remediate, open full report |

---

## 13. Sequencing note

Build order: this platform TRD -> the design system + BFF skeleton + the binding registry + auth (the
foundation that makes "no stub" and "3 clicks" enforceable) -> `CONSOLE-01` (Overview, the flagship and
the LOG-streaming proof) -> `CONSOLE-09` (Logs) + `CONSOLE-07` (AIOps), which share the decision/stream
plumbing -> the remaining CRUD-and-detail surfaces (`04/05/10/02`) -> `Dashboards/Reports` (aggregate
read surfaces) -> `Settings` (admin) -> `TrustFlow`. The entity drawer (`CONSOLE-12`) lands with
`CONSOLE-01` since every surface reuses it. No surface ships until its bindings resolve to real engine
operations (INV-CONSOLE-NO-STUB).
