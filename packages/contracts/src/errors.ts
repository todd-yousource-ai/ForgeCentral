// packages/contracts/src/errors.ts -- the platform error taxonomy for the Console (F0.1).
//
// Two layers, neither re-declared elsewhere (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE):
//
//  1. The WIRE error class + retry classification come straight from the generated engine types
//     (`WireErrorClass`, `RetryClass`) -- re-exported here, never re-listed by hand.
//  2. The Crucible typed-error TAXONOMY (`PrepareError`, `AsOfError`, `PolicyError`, ...) is the engine's
//     domain error surface (CRAFTED_ENGINEERING_STANDARDS "Interface Surface"). It is NOT carried in the
//     wire DTO schema (the wire only distinguishes the coarse `WireErrorClass`), so the Console owns the
//     one canonical enumeration of it here. The BFF maps an engine error to a `ConsoleError` for the SPA.
//
// The Console never fabricates an error reason: an error shown to the operator is the engine's sanitized,
// tier-redacted error (TRD-04 Section 13), correlated by `RequestId`.

import type { RequestId } from './ids.js';
import type { RetryClass, WireErrorClass } from './generated/wire-dto.js';

export type { RetryClass, WireErrorClass } from './generated/wire-dto.js';

/**
 * The Crucible engine's typed error taxonomy (the interface-surface error names). These are the exact
 * variant names the engine returns across the CrucibleQL / wire boundary; the Console renders them and
 * maps each to operator-facing copy. Sourced from CRAFTED_ENGINEERING_STANDARDS "Interface Surface".
 */
export type ConsoleErrorCode =
  | 'PrepareError'
  | 'CommitError'
  | 'ReadError'
  | 'AsOfError'
  | 'ForkError'
  | 'PhantomConflict'
  | 'WorkspaceConflict'
  | 'PolicyError'
  | 'AuditError'
  | 'KeyError'
  | 'BudgetError'
  | 'ResidencyViolation'
  | 'RoutingTenantMismatch'
  | 'KeyEpochMismatch'
  | 'ModelNotAvailableInRegion'
  | 'ModelVersionRetired'
  | 'ClassificationExceedsModel'
  | 'SnapshotNotReady'
  | 'AsOfDependencyMissing';

/**
 * A normalized, tier-redacted error the BFF hands to the SPA. `code` is the engine taxonomy variant,
 * `wireClass` the coarse transport class, `retry` how the caller may retry, `requestId` the correlation
 * handle for support. `message` is already sanitized to the operator's EXPLAIN tier by the engine/BFF --
 * it never carries stack traces, internal paths, or above-tier detail.
 */
export interface ConsoleError {
  code: ConsoleErrorCode;
  wireClass: WireErrorClass;
  retry: RetryClass;
  message: string;
  requestId: RequestId;
}
