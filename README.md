# ForgeCentral -- YouSource Console

The operator pane of glass over the YouSource platform -- **Crucible** (the data/policy/audit engine),
**Torch** (the agent edge), and **Forge** (governance / Virtual Trust Zones). One intuitive, live,
near-instant surface to see the connectivity happening across the network, understand every autonomous
decision, and steer the platform.

Proprietary software of YouSource.ai.

## What this is (and is not)

- A **TypeScript / Node.js** backend-for-frontend (BFF) + **React** web application over the platform.
- **Not** a system of record. Crucible is the sole source of truth; the Console persists no durable
  domain data. Any cache is ephemeral and never authoritative.

## Governing rules

1. **No UI stubs** -- every value and action binds to real Crucible/Torch/Forge data (enforced by a
   build-time contract test; no mock provider in release builds).
2. **No second database** -- Crucible is the source of truth.
3. **<= 3 clicks** to any operator task.
4. **Near-instant** -- streamed, not polled.

These are formalized as invariants in the TRD suite (`INV-CONSOLE-NO-STUB`, `NO-2ND-DB`, `3-CLICKS`,
`ENGINE-AUTHZ`, `LIVE`, `AUDITED`).

## Specification

The design is a TRD suite in [`docs/spec/`](docs/spec/SUITE.md):

- [`TRD-CONSOLE-00`](docs/spec/TRD-CONSOLE-00-platform.md) -- Platform and Architecture (the foundation).
- [`TRD-CONSOLE-01`](docs/spec/TRD-CONSOLE-01-overview.md) -- the live connectivity graph (home).
- `TRD-CONSOLE-02..12` -- the remaining surfaces (see the suite index).

## Implementation plans

Plans live in [`docs/implementation-plans/`](docs/implementation-plans/). **An IP is named for the TRD it
implements**: an IP for `TRD-CONSOLE-NN` is `IP-CONSOLE-NN-<slug>.md`, so every plan traces to its spec
(e.g. [`IP-CONSOLE-00-FOUNDATION`](docs/implementation-plans/IP-CONSOLE-00-FOUNDATION.md) implements
`TRD-CONSOLE-00`). The suite roadmap
[`IP-CONSOLE-ROADMAP`](docs/implementation-plans/IP-CONSOLE-ROADMAP.md) is the one exception -- it indexes
the whole suite, not a single TRD.

## Engineering standards

TypeScript/Node standards live in [`docs/standards/`](docs/standards/) -- the counterparts of the engine
repos' Rust standards:

- [`CLAUDE.md`](docs/standards/CLAUDE.md) -- code-generation standards (Console edition)
- [`TypeScript_Dev_Rules.md`](docs/standards/TypeScript_Dev_Rules.md) -- canonical TypeScript rules
- [`CRAFTED_ENGINEERING_STANDARDS.md`](docs/standards/CRAFTED_ENGINEERING_STANDARDS.md) -- neutral floor
- [`AI_Generated_Software_Quality_Guide.md`](docs/standards/AI_Generated_Software_Quality_Guide.md)
- [`AGENTS.md`](docs/standards/AGENTS.md)

The repo-root [`CLAUDE.md`](CLAUDE.md) is the entry point for build/test invocation and the per-PR
workflow.

## The gate

`scripts/ci.sh` is the single entry point, local and CI: repo hygiene (including the no-em-dash rule)
-> install (frozen lockfile) -> strict typecheck -> lint at zero warnings -> format -> unit +
integration tests -> **the contract stage** (no-stub bindings + generated-client/OpenAPI drift) ->
Playwright e2e (the <=3-click tasks on a seeded engine) -> supply chain (audit, install-script
lockdown, source pinning, licenses, SBOM) -> build. `--skip-net` skips the networked audit and the
live-engine e2e; nothing else is skippable. The terminal line is `==> ALL GATES PASSED`.

## Stack

- **SPA** (`apps/console`): TypeScript + React (dynamic surfaces: TanStack Query for reads, an
  SSE/WebSocket store for live deltas, virtualization for large feeds, a canvas/WebGL viz layer for the
  connectivity graph).
- **BFF** (`apps/bff`): TypeScript on Node LTS -- a stateless, OpenAPI-first gateway over the platform
  wire protocols. Owns no domain data; reaches the engine ONLY through the crypto sidecar's loopback
  egress (the BFF holds no TLS material).
- **Crypto sidecar** (`sidecar/`, Rust): the AWS-LC TLS boundary -- terminates the operator-facing
  admin TLS, originates the engine mTLS as the pinned control-plane peer, and holds the ML-DSA-87
  policy-bundle signing plane and the secret store. Key material never enters the Node process.
- **Shared packages** (`packages/`):
  - `@forge/contracts` -- the single source of truth for every shared type: generated engine DTOs, BFF
    OpenAPI types, binding ids, error codes. A drifted identifier fails compilation.
  - `@forge/bindings` -- the binding registry: the one manifest mapping every rendered value and every
    control to a REAL engine operation, or to an honestly-tracked `PENDING` naming its gating engine
    task. The contract gate enforces it.
  - `@forge/wire` -- the TypeScript wire client: a faithful port of the engine's client handshake and
    CBOR frame codec, speaking plaintext frames to the sidecar egress.
  - `@forge/design` -- the design-system tokens and shared components realizing `TRD-CONSOLE-00`
    Section 6.

## Design reference (ground yourself here before building UI)

The canonical Console mockups live in [`docs/ui-examples/`](docs/ui-examples/README.md) -- 14
annotated screenshots of every primary surface (the visual realization of `TRD-CONSOLE-00`
Section 6). They are the visual ground truth for look, information architecture, the shared
component library, and the interaction model. Read them before designing or implementing any
surface, and check your output against them: if a surface does not look like it belongs in that
set, it is wrong. They are grounding, not a second source of truth -- where a pixel and the spec
disagree, `TRD-CONSOLE-00` Section 6 and the surface TRD win.

## Brand assets

Canonical in [`docs/assets/`](docs/assets/): the YouSource logo (`.png`/`.gif`) and the honeycomb
background. The design-system tokens in `TRD-CONSOLE-00` Section 6 reproduce the mock; the assets are the
source of truth.

## Status

Active development. **Phase 0 (Foundation)** and **Phase 1 (Overview + Entity drawer + Logs)** are
built and live: the AWS-LC crypto sidecar and the BFF speak the platform wire protocols over a
dedicated control plane, and the flagship live connectivity graph, the shared entity drawer, and the
decision-LOG surface render real engine data (contract-tested, no stubs, Playwright-capstoned).

Since then the governance and operations surfaces have landed over their now-live engine substrates:

- **SOC Operations** -- the operations shell and KPI strip, the ranked decision queue, the
  investigation dock, the incident lineage graph, the FORGE VERDICT panel, the response-plan editor
  with real modify/approve commands, and the evidence-depth reads (raw telemetry, audit trail,
  impact) with a Generate action that runs missing cognition legs engine-side.
- **Policies** -- the grouped read-only surface, authoring (publish / delete with semver
  re-minting), and distribution from the Policy tab through the sidecar's ML-DSA-87 signing plane.
  The producer half of the distribution loop is live-proven; the endpoint's policy lane fetches
  fail-closed until a bundle is distributed to it.
- **Virtual Trust Zones** -- the zone tree and editor over the engine's audited VTZ system of
  record (own + effective posture, tighten-only inheritance).
- **Users + IdAM** -- the users ribbon and directory over the Local User Graph, plus Auth0
  connector onboarding whose secret travels a dedicated sidecar plane and never touches the BFF's
  engine wire.
- **Objects** -- the policy-noun directory (members resolved at read time by the engine).
- The **2026-07-24 IA revision** (Network Ops / Agent Ops / SOC Ops groupings) and the
  floating-glass visual pass.

**The numbers, honestly.** ~47k lines of TypeScript across the two apps and four packages, plus a
~2.7k-line Rust crypto sidecar; **66 registered bindings, 54 live and 12 `PENDING`** -- each PENDING
names its owning repo and gating engine task, and the contract gate fails a release build that
reaches for a mock; **7 Playwright capstones** (shell, overview, vtz, users, policies, objects,
logs) prove the <=3-click tasks against a seeded real engine.

Remaining: the SOC Ops Playwright capstone (S3.N), the first real policy bundle through the full
distribute -> fetch -> apply -> converge loop (the producer half is proven; the endpoint half awaits
its anchor), the IdAM live capstone against a real synced tenant, and the Dashboards/Reports,
TrustFlow, AIOps, and Settings surfaces, which render honest placeholders today (AIOps resequenced
to land last). Every surface ships against real bindings PR by PR -- a binding without a real
backing engine operation is a tracked `PENDING`, never a stub -- and enforcement stays OFF
platform-wide, so surfaces that would claim containment say so honestly (the drawer's Isolate is
real end to end and says exactly that).
