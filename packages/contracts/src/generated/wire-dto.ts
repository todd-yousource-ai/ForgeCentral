// GENERATED FILE -- DO NOT EDIT BY HAND.
//
// The TypeScript projection of the Crucible wire DTO contract, emitted from the vendored schema
// schema/wire-dto.schema.json (https://schema.yousource.ai/crucible/wire/dto/v1) by scripts/generate.mjs.
// The engine is the single source of truth (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE); regenerate with
//   node scripts/generate.mjs
// A codegen round-trip test asserts this file equals the emitter output, so an un-regenerated wire
// change fails the gate. Edit the schema (upstream, in crdb), not this file.

export interface OperatorDelegation {
  principal: string;
  tenant: string;
}

export type RetryClass = 'Never' | 'SafeSameRequest' | 'SafeAfterRefresh' | 'CallerDecision';

export type StreamKind = 'Decision' | 'Audit';

export interface WireAuditEntry {
  action: string;
  commit_version: number;
  effect: string;
  principal_id: string;
  resource: string;
  seq: number;
  timestamp: number;
}

export interface WireDecision {
  anchor: string;
  confidence: string;
  decision_id: string;
  finding: string;
  recommended_action: string;
  rule_id: string;
  scope: string;
  source_subjects: Array<string>;
  tactics: Array<string>;
}

export type WireDriftTrigger = 'Schema' | 'Policy' | 'Statistics' | 'Model' | 'AsOf' | 'Workspace';

export interface WireError {
  class: WireErrorClass;
  code: number;
  correlation_id: number;
  retry: RetryClass;
}

export type WireErrorClass = 'Unauthenticated' | 'Denied' | 'VersionUnsupported' | 'Conflict' | 'IdempotencyConflict' | 'AsOfUnavailable' | 'StorageUnavailable' | 'AuditFailure' | 'IntegrityFailure' | 'LimitExceeded' | 'Framing' | 'Internal';

export interface WireQueryRows {
  cursor: Array<number> | null;
  redacted_fields: Array<string>;
  rows: Array<Array<[string, WireValue]>>;
}

export interface WireQuerySubmit {
  operator?: OperatorDelegation | null;
  params: Array<[string, WireValue]>;
  request_id: number;
  text: string;
}

export type WireReply =
  | { QueryRows: WireQueryRows; }
  | 'CursorClosed'
  | { TxnBegun: { txn: Array<number>; }; }
  | { Staged: { affected: number; }; }
  | { TxnCommitted: { version: number; }; }
  | 'TxnAborted'
  | { WorkspaceForked: { txn: Array<number>; }; }
  | { WorkspacePromoted: { version: number; }; }
  | { Remembered: { memory_id: number; }; }
  | { Prepared: { handle: Array<number>; plan_id: string; statement_hash: string; }; }
  | { ReprepareRequired: { trigger: WireDriftTrigger; }; }
  | { NotYetWired: { verb: string; }; }
  | { Refused: { error: WireError; }; };

export type WireRequest =
  | { QuerySubmit: WireQuerySubmit; }
  | { Prepare: { params: Array<[string, WireValue]>; text: string; }; }
  | { ExecutePrepared: { handle: Array<number>; params: Array<[string, WireValue]>; }; }
  | { CursorFetch: { handle: Array<number>; }; }
  | { CursorClose: { handle: Array<number>; }; }
  | 'TxnBegin'
  | { TxnWrite: { params: Array<[string, WireValue]>; text: string; txn: Array<number>; }; }
  | { TxnCommit: { request_id: number; txn: Array<number>; }; }
  | { TxnAbort: { txn: Array<number>; }; }
  | { SubmitMemoryWrite: WireQuerySubmit; };

export type WireStreamDelta =
  | { Decision: WireDecision; }
  | { Audit: WireAuditEntry; };

export interface WireStreamEvent {
  delta: WireStreamDelta;
  watermark: number;
}

export interface WireStreamSubscribe {
  from_watermark: number | null;
  kinds: Array<StreamKind>;
}

export type WireValue =
  | { Bool: boolean; }
  | { Int: number; }
  | { Float: number; }
  | { Text: string; }
  | { Bytes: Array<number>; }
  | { Timestamp: number; }
  | { Vector: Array<number>; };
