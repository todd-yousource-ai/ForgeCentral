# @forge/bindings

The Console **binding registry** and the **no-stub contract** it enforces
(`INV-CONSOLE-NO-STUB`).

Every value the Console renders and every control it exposes must bind to a
**real** Crucible/Torch/Forge operation. This package is where those bindings live
and where the rule is enforced.

## The registry

`bindings` (`src/manifest.ts`) is the `BindingManifest` (shape from
`@forge/contracts`): read bindings name a BFF resolver -> a concrete
CrucibleQL/DTO/Torch/Forge op + a view-model; command bindings name a handler -> a
real mutating op + engine-side authz + an audited effect. The manifest is
populated by the shipped surfaces -- Overview/Connectivity, Logs, Objects, VTZ,
Users, Policies/Distribution, SOC, entity detail -- and each surface IP registers
its bindings in the same PR that builds the surface.

## The enforcement (`src/validate.ts`)

- **`validateManifest`** -- always-on structural rules: key/id agreement,
  non-empty op, commands are audited, no `mock:`/`fixture:`/`stub:` op, and a
  **PENDING binding must name its owning repo + gating task** (a deferral is
  always traceable).
- **`assertReleaseReady`** -- the release gate: a **PENDING binding never ships**
  and no mock op ships.

`pnpm test:contract` runs both against the committed manifest plus fixtures. A
`PENDING` binding is a legitimate development artifact (a tracked plan item) that
passes dev validation but **fails a release build** -- so nothing fake ever ships,
and no deferral is ever silent.

## Tests

`pnpm --filter @forge/bindings test` (Vitest) plus the workspace-level
`pnpm test:contract` (the no-stub gate, run as the contract stage of
`scripts/ci.sh`).
