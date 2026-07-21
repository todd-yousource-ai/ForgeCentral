// packages/contracts/src/index.ts -- the @forge/contracts barrel (F0.1).
//
// The single import surface both tiers use (`import { WireReply, principalId, ConsoleError } from
// '@forge/contracts'`). Everything shared -- generated engine DTO types, branded ids, the error taxonomy,
// the binding-manifest shape, the schema version anchor, and the (placeholder) BFF OpenAPI types -- has
// exactly one home under src/ and is re-exported here (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE).

export * from './generated/wire-dto.js';
export * from './ids.js';
export * from './errors.js';
export * from './binding.js';
export * from './entity.js';
export * from './logs.js';
export * from './overview.js';
export * from './vtz.js';
export * from './users.js';
export * from './forge.js';
export * from './openapi.js';
export * from './schema.js';
