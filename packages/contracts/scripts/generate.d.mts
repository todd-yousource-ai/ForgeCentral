// Type declaration for the plain-ESM codegen module (scripts/generate.mjs), so the round-trip test can
// import the emitter with types under strict tsc.

/** Render the generated wire-DTO TypeScript module from a parsed wire DTO JSON Schema object. */
export function renderWireDtoTypes(schema: unknown): string;
