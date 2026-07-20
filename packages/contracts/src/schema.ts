// packages/contracts/src/schema.ts -- the engine contract version anchors (F0.1, FD.1).
//
// The versioned `$id` of each engine schema the generated types are projected from. The Console pins
// these versions; the codegen round-trip / sync tests assert each vendored schema carries exactly its
// id, so a silent contract-version bump is caught at the gate.

/** The versioned identifier of the Crucible wire DTO contract this package is generated against. */
export const WIRE_DTO_SCHEMA_ID = 'https://schema.yousource.ai/crucible/wire/dto/v1';

/**
 * The versioned identifier of the Crucible Forge policy-bundle contract (TRD-32 Section 12).
 *
 * Separate from the wire DTO contract: a different plane, a different encoding (the bundle preimage
 * is CBOR, not JSON), and a different lifecycle. It versions independently.
 */
export const FORGE_DTO_SCHEMA_ID = 'https://schema.yousource.ai/crucible/forge/dto/v1';
