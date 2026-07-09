// packages/bindings/src/index.ts -- the @forge/bindings barrel (F0.4).
//
// The Console binding registry (the no-stub contract) + its enforcement. Both tiers depend on it: the SPA
// resolves a control to a registered binding, the BFF resolves a binding to an engine op, and the contract
// test proves every binding is real (or an honestly-tracked PENDING that never ships).

export * from './manifest.js';
export * from './validate.js';
