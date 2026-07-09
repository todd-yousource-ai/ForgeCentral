// packages/contracts/src/schema.ts -- the wire DTO contract version anchor (F0.1).
//
// The versioned `$id` of the wire DTO schema the generated types are projected from. The Console pins
// this version; the codegen round-trip / sync tests assert the vendored schema carries exactly this id,
// so a silent contract-version bump is caught at the gate.

/** The versioned identifier of the Crucible wire DTO contract this package is generated against. */
export const WIRE_DTO_SCHEMA_ID = 'https://schema.yousource.ai/crucible/wire/dto/v1';
