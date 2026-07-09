// packages/bindings/src/manifest.ts -- the Console binding registry (F0.4).
//
// The single manifest that maps every value the Console renders and every control it exposes to a REAL
// Crucible/Torch/Forge operation (INV-CONSOLE-NO-STUB). Surfaces (CONSOLE-01..12) register their read and
// command bindings here as they are built; each entry names a concrete engine op (or is PENDING with its
// gating engine task, INV-CROSS -- a PENDING binding is a tracked plan artifact that never ships).
//
// It is EMPTY at the foundation stage: no operator surface exists yet, so there are no bindings. The
// foundation ships the ENFORCEMENT (validate.ts + the contract test), not fabricated bindings; a surface
// adds its bindings in the same PR that builds it, and the contract test then proves each is real.

import type { BindingManifest } from '@forge/contracts';

/** The Console binding registry. Keyed by `BindingId`; populated by the surface IPs. */
export const bindings: BindingManifest = {};
