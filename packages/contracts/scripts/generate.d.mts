// Type declaration for the plain-ESM codegen module (scripts/generate.mjs), so the round-trip test can
// import the emitter with types under strict tsc.

/** Render the generated wire-DTO TypeScript module from a parsed wire DTO JSON Schema object. */
export function renderWireDtoTypes(schema: unknown): string;

/**
 * Render the generated Forge policy-bundle TypeScript module from a parsed Forge DTO JSON Schema
 * object: the type projection plus the `FORGE_FIELD_ORDER` declaration-order arrays.
 */
export function renderForgeDtoTypes(schema: unknown): string;
