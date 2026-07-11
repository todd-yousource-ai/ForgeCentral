# IP-CONSOLE-ROADMAP -- the Console build order across the TRD suite

**Status:** OPEN (authored 2026-07-07). The implementation ordering for the YouSource Console TRD suite
(`docs/spec/`, `TRD-CONSOLE-00..12`). It sequences the surfaces into gated phases, states the
dependencies between them, and -- critically -- makes the **cross-surface engine work** each surface
depends on explicit and owned (`INV-CROSS`), so the plan drives the Crucible/Torch/Forge work rather than
the UI faking it. This document is the counterpart of the engine repos' IP roadmaps.

Read with `TRD-CONSOLE-00` Section 13 (the platform sequencing note); this expands it into a full plan.

---

## 1. Principles

- **Foundation before surfaces.** Nothing that makes "no stubs" and "3 clicks" *enforceable* -- the
  binding registry + contract test, the design system, the BFF core, auth, streaming, the admin plane --
  is optional or deferrable; it lands first (Phase 0).
- **Shared substrates before their consumers.** The entity drawer (`CONSOLE-12`) and the LOG stream
  (`CONSOLE-09`) are reused by almost every surface; they land in the first surface phase so later
  surfaces compose them, not reinvent them.
- **No surface ships until its bindings are real** (`INV-CONSOLE-NO-STUB`). Where a surface's contract
  needs engine work not yet done, the binding is `PENDING`, the cross-surface work is a named task in
  Section 6, and the surface ships the real parts now and the `PENDING` parts when the engine work lands
  (`INV-CROSS`). A surface is never blocked wholesale by one `PENDING` panel.
- **One PR at a time, gated.** Every step is a branch-per-PR through `scripts/ci.sh`, no-ff merged, per
  `CONTRIBUTING.md`. A phase is a set of such PRs; each PR names its TRD acceptance criterion + invariant.
- **CrucibleQL-first.** Read bindings are parameterized CrucibleQL wherever it serves
  (`INV-CONSOLE-CRUCIBLEQL-FIRST`); the preferred cross-surface work is to extend CrucibleQL, not add a
  one-off BFF endpoint.

## 2. Dependency graph (what must exist first)

```
Phase 0 Foundation
  @forge/contracts ── design system ── BFF core (mTLS :7878 client, cache, OpenAPI)
        │                   │                 │
        │                   │                 ├── streaming channel (decision/audit stream)
        │                   │                 ├── auth (OIDC -> Principal + EXPLAIN tier)
        │                   │                 └── admin plane (8443 node-IP, hybrid PQC + CNSA-1.0)
        │                   │                 └── binding registry + contract test (no-stub enforcement)
        v                   v                 v
Phase 1  Overview (01) ── Entity drawer (12) ── Logs (09)          [the live-graph + drawer + LOG proof]
              │                 │                    │
              v                 v                    v
Phase 2  AIOps (07)  ....................  reuses drawer + the decision-stream plumbing
Phase 3  Policies (05) · VTZ (02) · Objects (10) · Users (04)      [governance CRUD, reuse drawer]
Phase 4  Dashboards (03) · Reports (08)                            [aggregate reads]
Phase 5  TrustFlow (06)                                            [gated on the Torch llm.* tap]
Phase 6  Settings (11)                                             [admin surfaces; on the 8443 plane]
```

## 3. Phase 0 -- Foundation (no surface yet)

The platform packages that make the invariants enforceable. Delivered as workspace members under
`packages/` and `apps/` (the first PRs that move the gate out of the scaffold stage).

| Step | Deliverable | Establishes |
|------|-------------|-------------|
| F.1 | `@forge/contracts` -- the generated engine DTO types + BFF OpenAPI types + binding ids + error codes | the cross-package single source of truth (no drift) |
| F.2 | Design system package -- tokens (brand/honeycomb/color per `TRD-CONSOLE-00` Section 6), the shared components (graph, drawer shell, table, cards, charts, badges) | the look + the reusable UI |
| F.3 | BFF core -- the stateless Node service: the mTLS `:7878` engine client, the ephemeral cache, the OpenAPI surface, health/readiness, structured logging | engine access (always `:7878`), no 2nd DB |
| F.4 | The **binding registry + contract test** -- the typed binding manifest + `test:contract` (every control bound to a real op; no prod mock provider; `PENDING` support) | `INV-CONSOLE-NO-STUB` is now enforced |
| F.5 | Auth -- OIDC login -> Crucible Principal + EXPLAIN tier; engine-side authorization brokered by the BFF; tier-correct rendering | `INV-CONSOLE-ENGINE-AUTHZ` |
| F.6 | The streaming channel -- one subscription to the Crucible decision/audit stream, fanned to the browser (SSE/WebSocket), backpressured, reconnect + resync | `INV-CONSOLE-LIVE` |
| F.7 | The **admin plane** -- the 8443 listener bound to the node IP, hybrid PQC + CNSA-1.0-fallback TLS, fail-closed on a widened bind (installer-provisioned); admin routing separate from the general plane | `INV-CONSOLE-ADMIN-PLANE` |
| F.8 | The SPA shell -- the nav (IA), the drawer host, routing, the query/live-store/virtualization layers, error boundaries, empty/loading/stale states | the IA + the `<=3-click` frame |

**Phase 0 exit:** the gate runs the full TS suite (workspace out of scaffold stage); a logged-in
operator sees the shell with no surface data yet, and the contract test forbids any unbound control or
mock provider. No fabricated data anywhere.

## 4. Phase 1 -- the live graph, the drawer, the LOG

> **Build order is P1.1 -> P1.2 -> P1.3 (drawer -> Logs -> Overview), NOT the file number.** IP files are
> named for their TRD (`IP-CONSOLE-12`/`-09`/`-01`), so listing by number reverses the order; THIS table is
> the authoritative sequence. The drawer is first (Logs + Overview click through to it); Logs is second (it
> establishes + proves the LOG substrate the Overview aggregates); the Overview flagship is third.

| Step | TRD | Notes |
|------|-----|-------|
| P1.1 | `CONSOLE-12` Entity drawer | the shared detail + quick-actions pattern; every later surface reuses it (**`IP-CONSOLE-12-ENTITY-DRAWER.md`**, roster DR.1-DR.N) |
| P1.2 | `CONSOLE-09` Logs | the LOG decision/audit stream (CrucibleQL + the live tail); the shared decision substrate (**`IP-CONSOLE-09-LOGS.md`**, roster LG.1-LG.N) |
| P1.3 | `CONSOLE-01` Overview | the live connectivity graph over the LOG aggregation + the canvas/WebGL renderer; the flagship (**`IP-CONSOLE-01-OVERVIEW.md`**, roster O1.1-O1.N) |

**Phase 1 exit:** the home graph is live and streamed; clicking any entity opens the real drawer;
Logs shows the real decision stream with EXPLAIN. The three flagship canonical tasks pass E2E.

## 5. Phases 2-6

| Phase | TRDs | Rationale / dependency |
|-------|------|------------------------|
| 2 -- Command center | `CONSOLE-07` AIOps | reuses Phase 1's drawer + decision-stream plumbing; Rewind uses `AS OF` |
| 3 -- Governance CRUD | `CONSOLE-05` Policies, `CONSOLE-02` VTZ, `CONSOLE-10` Objects, `CONSOLE-04` Users | read/author/publish surfaces; each reuses the drawer; order: Policies + VTZ (the access contract) before Objects + Users |
| 4 -- Aggregates | `CONSOLE-03` Dashboards, `CONSOLE-08` Reports | read-only CrucibleQL aggregates + EXPLAIN; depend on the LOG + policy/decision data being surfaced |
| 5 -- Brokered plane + conversation intelligence | `CONSOLE-06` TrustFlow | the sensor-tap flows, the **captured-conversation reader**, and **content search for malicious intent** (CrucibleQL `NEAR`/`TEXT`/`FUSE`) land now; the *live* `llm.*` inference stream and the **automated intent detector** are `PENDING` behind engine legs (Section 6) |
| 6 -- Administration | `CONSOLE-11` Settings | the admin surfaces on the Phase-0 admin plane; last because it is operator config over already-exposed engine admin surfaces |

## 6. Cross-surface engine work (INV-CROSS) -- the plan owns the backend

Each row is a `PENDING` binding a surface carries and the concrete engine work that makes it real, with
the owning repo. A surface ships its non-`PENDING` parts on its phase; each `PENDING` binding lands when
its engine task does. These are the tasks the Console plan drives on the other surfaces.

| Console binding (surface) | Needs | Owning repo / work |
|---------------------------|-------|--------------------|
| `entity.capabilities` (drawer, `CONSOLE-12`) / AI Governance (`CONSOLE-07`) | expose the agent Construction Report on a read surface | crdb/torch -- a read binding over the Torch `torch-inspect` report (govern-lane output) |
| `entity.isolate` / `aiops.contain` / Containment (`12`, `07`) | a live containment command + (later) kernel-level enforcement | torch/forge -- containment command; **live egress/BPF-LSM enforcement is AG.7, deliberately OFF today** (observe/quarantine posture only until engaged) |
| `trustflow.inference` -- live `llm.*`/`mcp.*` (`CONSOLE-06`) | the *live* inference-intent tap | torch -- stand up the `torch-trustflow` proxy live + route agents through it + land the tap into the govern envelope (the deferred-live leg). **Hard gate: never fabricate inference content.** |
| `trustflow.conversation` (`CONSOLE-06`) | resolve + render a captured agent-to-model chat | **real today**: torch IP-TORCH-CAPTURE stores the conversation content-addressed in Crucible; the Console resolves the `ContentRef` (tier-gated). No new engine work; a read binding. |
| `trustflow.searchContent` (`CONSOLE-06`) | search the captured-conversation corpus for malicious intent | **real today**: CrucibleQL `NEAR`/`TEXT`/`FUSE` over the captured content (`cdb-cql-exec` search), authorization-scoped in candidate generation. No new engine work; a CrucibleQL read binding. |
| `trustflow.intentFindings` (`CONSOLE-06`) | automated malicious-intent detection over chat *content* | **`PENDING` -- NEW engine work**: crdb -- a content-intent detector over the captured corpus (semantic/vector + rule classifier for prompt injection, exfiltration, jailbreak, tool-abuse, secret solicitation) emitting a DecisionObject with a flagged turn + rationale; optionally a Torch-side inline classifier at capture time. **Hard gate: never fabricate a finding**; operator `searchContent` is the interim, the detector is the automation. |
| `aiops.oversightQueue` / `approve` / `reject` (`CONSOLE-07`) | a first-class escalation/approval surface | crdb/forge -- the human-in-the-loop escalation queue as an engine primitive (interim: group real escalated decisions, labelled) |
| `aiops.incidents` (`CONSOLE-07`) | incident grouping as a primitive | crdb -- incident correlation over the attributed DecisionObjects (interim: client-side grouping over real decisions, labelled) |
| `aiops.workflows` (`CONSOLE-07`) | a workflow/remediation engine | crdb/forge -- workflow definitions + runs |
| `aiops.simulate` / `policies.simulate` (`07`, `05`) | a first-class dry-run/simulate surface | crdb -- policy/decision dry-run (the planner in simulate mode, TRD-03/05) |
| `vtz.*` management (`CONSOLE-02`) | VTZ create/edit/re-scope commands | forge -- TRD-32 v2 management operations (some are design-only today) |
| new report/dashboard aggregates (`03`, `08`) | any read not yet expressible | crdb -- **extend CrucibleQL** (the preferred cross-surface work) rather than a one-off BFF endpoint |
| admin operations (`CONSOLE-11`) | admin commands (rotate leadership, DR test, key rotation, FIPS, RBAC) | crdb -- bind to the existing engine admin surfaces over `:7878`; expose any missing ones |

Each `PENDING` binding is tracked in its surface TRD and here; when its owning engine task lands, the
Console PR flips the binding live and the contract test lets it ship.

## 7. Cadence and acceptance

- **Cadence:** one PR at a time, branch-per-PR through `scripts/ci.sh`, no-ff merge, push local + GitHub;
  review each with the maintainer before the next (`CONTRIBUTING.md`).
- **Per-surface acceptance:** the surface's TRD acceptance criteria green (contract + E2E), the surface's
  `<=3-click` tasks proven, no fabricated data, `PENDING` bindings not shipped live.
- **Overall done:** every surface shipped against real data; every `INV-CROSS` binding either live or
  tracked with its owning engine task in flight; the full suite passes the gate.

## 8. Sequencing summary

Phase 0 (foundation) -> Phase 1 (Overview + drawer + Logs) -> Phase 2 (AIOps) -> Phase 3 (Policies, VTZ,
Objects, Users) -> Phase 4 (Dashboards, Reports) -> Phase 5 (TrustFlow) -> Phase 6 (Settings). The
`INV-CROSS` engine work in Section 6 is sequenced alongside: the containment/`llm.*`/workflow/simulate/
incident items are driven onto the Torch/Forge/Crucible roadmaps so the surfaces that need them are not
left carrying permanent `PENDING` bindings.
