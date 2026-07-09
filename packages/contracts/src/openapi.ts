// packages/contracts/src/openapi.ts -- the BFF OpenAPI types anchor (F0.1 placeholder).
//
// The SPA's API client is generated from the BFF's OpenAPI document so the two tiers cannot drift. That
// document does not exist until the BFF skeleton lands (F0.3), so this module is an explicit, honest
// placeholder: it declares the shape the generated module will take (a `paths` map) as empty, and names
// the step that fills it. It is intentionally NOT a set of fabricated endpoints -- an empty paths map is
// the truthful state of the API surface today, and the contract test (F0.4) will fail if the generated
// client and the real OpenAPI ever diverge.

/**
 * The generated BFF OpenAPI `paths` map. Empty until F0.3 emits the real document and F0.4 wires the
 * client-vs-OpenAPI drift check. Regenerated, never hand-authored.
 */
export type BffOpenApiPaths = Record<string, never>;
