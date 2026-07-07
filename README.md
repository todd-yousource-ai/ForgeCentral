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

## Stack

- **SPA:** TypeScript + React (dynamic surfaces: TanStack Query for reads, an SSE/WebSocket store for
  live deltas, virtualization for large feeds, a canvas/WebGL viz layer for the connectivity graph).
- **BFF:** TypeScript on Node LTS -- a stateless, OpenAPI-first gateway over the platform wire protocols.
- **Shared:** `@forge/contracts` -- generated engine DTO + BFF OpenAPI types, imported by both tiers.

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

Specification in progress; no application code yet. Per `TRD-CONSOLE-00`, the data contract (real
bindings, no stubs) and the design system land before any surface is built.
