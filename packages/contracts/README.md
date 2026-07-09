# @forge/contracts

The single source of shared Console types, imported by both tiers (the BFF and the SPA) so they cannot
drift. Implements the F0.1 row of `IP-CONSOLE-00-FOUNDATION` and the invariant
`INV-CONSOLE-CONTRACTS-SINGLE-SOURCE`: every shared type has exactly one home here.

## What it exports

- **Generated engine DTO types** (`src/generated/wire-dto.ts`) -- the TypeScript projection of the
  Crucible wire DTO contract (`WireRequest`, `WireReply`, `WireValue`, `WireQuerySubmit`,
  `WireQueryRows`, `WireDecision`, `WireAuditEntry`, `WireStreamEvent`, `WireError`, `WireErrorClass`,
  `RetryClass`, ...). Generated from the vendored schema; never hand-edited.
- **Branded ids** (`src/ids.ts`) -- `PrincipalId`, `TenantId`, `DecisionId`, `VtzId`, `PolicyId`,
  `ObjectId`, `RequestId`: nominal string types that erase to `string` at runtime.
- **Error taxonomy** (`src/errors.ts`) -- `ConsoleErrorCode` (the Crucible typed-error names) and
  `ConsoleError` (the normalized, tier-redacted error the BFF hands the SPA), composed over the generated
  `WireErrorClass` / `RetryClass`.
- **Binding-manifest shape** (`src/binding.ts`) -- `Binding` / `ReadBinding` / `CommandBinding` /
  `BindingManifest`, the typed contract the no-stub registry (F0.4) populates.
- **Schema version anchor** (`src/schema.ts`) and the **BFF OpenAPI types placeholder**
  (`src/openapi.ts`, filled in F0.3).

## The wire DTO contract is generated, not authored

`schema/wire-dto.schema.json` is a vendored copy of the crdb committed artifact
`crates/cdb-wire/schema/wire-dto.schema.json` (produced there by `IP-CONSOLE-READINESS` Part A, a
drift-gated JSON Schema). The engine is the single source of truth.

```bash
# regenerate the TypeScript from the vendored schema
node scripts/generate.mjs

# (maintenance) confirm the vendored copy still matches a crdb checkout -- NOT a gated check
node scripts/check-schema-sync.mjs /path/to/crdb
```

The gated integrity check is the **codegen round-trip** in `test/contracts.test.ts`: it asserts the
committed `src/generated/wire-dto.ts` equals the emitter output, so a wire change that is not regenerated
fails the gate. To bump the contract: re-copy the crdb artifact into `schema/`, run `generate.mjs`, and
commit both.

## Tests

`pnpm --filter @forge/contracts test` (Vitest). Tier 1: the codegen drift gate, the pinned contract
version, generated-type usability, branded-id distinctness (compile-time `@ts-expect-error`), and the
error/binding shapes.
