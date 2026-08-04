# @forge/contracts

The single source of shared Console types, imported by both tiers (the BFF and the
SPA) so they cannot drift (`INV-CONSOLE-CONTRACTS-SINGLE-SOURCE`: every shared type
has exactly one home here).

## What it exports

- **Generated engine DTO types** (`src/generated/wire-dto.ts`) -- the TypeScript
  projection of the Crucible wire DTO contract (`WireRequest`, `WireReply`,
  `WireValue`, `WireQuerySubmit`, `WireQueryRows`, `WireDecision`,
  `WireAuditEntry`, `WireStreamEvent`, `WireError`, `WireErrorClass`,
  `RetryClass`, ...). Generated from the vendored schema; never hand-edited.
- **Generated Forge DTO types** (`src/generated/forge-dto.ts`) -- the policy/
  bundle-distribution contract, generated the same way from the crdb
  `forge_schema` export.
- **Branded ids** (`src/ids.ts`) -- `PrincipalId`, `TenantId`, `DecisionId`,
  `VtzId`, `PolicyId`, `ObjectId`, `RequestId`, ...: nominal string types that
  erase to `string` at runtime.
- **Error taxonomy** (`src/errors.ts`) -- `ConsoleErrorCode` (the Crucible
  typed-error names) and `ConsoleError` (the normalized, tier-redacted error the
  BFF hands the SPA).
- **Per-surface view-model contracts** -- `overview.ts` (the Sankey flow),
  `logs.ts`, `objects.ts`, `vtz.ts`, `users.ts`, `policies.ts`, `soc.ts`,
  `entity.ts`, `forge.ts`: the typed shapes each surface renders, shared by the
  BFF projection and the SPA so a surface cannot drift from its backend.
- **Binding-manifest shape** (`src/binding.ts`) -- `Binding` / `ReadBinding` /
  `CommandBinding` / `BindingManifest`, populated by `@forge/bindings`.
- **Schema version anchor** (`src/schema.ts`) and the **BFF OpenAPI types**
  (`src/openapi.ts`).

## The wire DTO contract is generated, not authored

`schema/wire-dto.schema.json` is a vendored copy of the crdb committed artifact
`crates/cdb-wire/schema/wire-dto.schema.json` (a drift-gated JSON Schema; the
engine is the single source of truth), and the Forge schema follows the same
pattern.

```bash
# regenerate the TypeScript from the vendored schemas
node scripts/generate.mjs

# (maintenance) confirm the vendored copy still matches a crdb checkout -- NOT a gated check
node scripts/check-schema-sync.mjs /path/to/crdb
```

The gated integrity check is the **codegen round-trip** in
`test/contracts.test.ts`: the committed generated files must equal the emitter
output, so a wire change that is not regenerated fails the gate. To bump the
contract: re-copy the crdb artifact into `schema/`, run `generate.mjs`, commit
both.

## Tests

`pnpm --filter @forge/contracts test` (Vitest). Tier 1: the codegen drift gates,
the pinned contract version, generated-type usability, branded-id distinctness
(compile-time `@ts-expect-error`), and the error/binding/view-model shapes.
