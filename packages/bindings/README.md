# @forge/bindings

The Console **binding registry** and the **no-stub contract** it enforces (`INV-CONSOLE-NO-STUB`, F0.4).

Every value the Console renders and every control it exposes must bind to a **real** Crucible/Torch/Forge
operation. This package is where those bindings live and where the rule is enforced.

## The registry

`bindings` (`src/manifest.ts`) is the `BindingManifest` (from `@forge/contracts`): read bindings name a
BFF resolver -> a concrete CrucibleQL/DTO/Torch/Forge op + a view-model; command bindings name a handler ->
a real mutating op + engine-side authz + an audited effect. It is **empty at the foundation stage** -- no
operator surface exists yet -- and each surface IP (`CONSOLE-01..12`) registers its bindings in the same
PR that builds the surface.

## The enforcement (`src/validate.ts`)

- **`validateManifest`** -- always-on structural rules: key/id agreement, non-empty op, commands are
  audited, no `mock:`/`fixture:`/`stub:` op, and a **PENDING binding must name its owning repo + gating
  task** (INV-CROSS -- a deferral is always traceable).
- **`assertReleaseReady`** -- the release gate: a **PENDING binding never ships** and no mock op ships.

`pnpm test:contract` runs both against the committed manifest plus fixtures. A `PENDING` binding is a
legitimate development artifact (a tracked plan item) that passes dev validation but **fails a release
build** -- so nothing fake ever ships, and no deferral is ever silent.

## Deferred (arrive with the surfaces / SPA)

Route/control -> binding coverage (needs routes), binding-op -> generated-client existence (needs the
per-surface ops), and SPA-client vs BFF-OpenAPI drift (needs the SPA) extend the contract test as those
land. F0.4 ships the registry + the manifest-level enforcement they build on.
