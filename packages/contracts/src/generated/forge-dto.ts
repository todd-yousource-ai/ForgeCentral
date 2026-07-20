// GENERATED FILE -- DO NOT EDIT BY HAND.
//
// The TypeScript projection of the Crucible Forge policy-bundle contract, emitted from the
// vendored schema schema/forge-dto.schema.json (https://schema.yousource.ai/crucible/forge/dto/v1) by scripts/generate.mjs.
// The engine is the single source of truth (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE); regenerate with
//   node scripts/generate.mjs
// Edit the schema (upstream, in crdb), not this file.

export type AgentGci = string;

export type ApplyError = 'SignatureInvalid' | 'StaleLease' | 'DowngradeRejected' | 'ScopeMismatch' | 'UnknownRuleKind' | 'VtzCannotRealize' | 'AppendFailed';

export type ApplyOutcome =
  | { Applied: BundleVersion; }
  | { Rejected: [BundleVersion, ApplyError]; };

export type BundleVersion = number;

export interface CertIdentity {
  cn: string;
  sans: Array<string>;
}

export type Classification = 'Unclassified' | 'Internal' | 'Confidential' | 'Restricted' | 'Secret';

export interface EndpointPolicy {
  allow_ordinary_internet: boolean;
  brokered: ModelMcpDestSet;
  exec: ExecDisposition;
  max_classification: Classification;
  resource_bound: ResourceBound;
  restricted: Array<string>;
}

export type ExecDisposition = 'DenyUnwrappedExec';

export interface FreshnessLease {
  issued_at: Hlc;
  not_after: Hlc;
}

export type Hlc = number;

export interface IdentityScope {
  members: Array<ScopeMember>;
  vtz: VtzId;
}

export type KeyId = string;

export type ModelMcpDest = string;

export interface ModelMcpDestSet {
  destinations: Array<ModelMcpDest>;
}

export type PolicyId = string;

export interface PolicyVersionRef {
  policy: PolicyId;
  version: Version;
}

export interface ResourceBound {
  cost_micros: number;
  cpu_millicores: number;
  io_bytes_per_sec: number;
  memory_bytes: number;
  pids: number;
  rate_per_sec: number;
  storage_bytes: number;
}

export interface ScopeMember {
  agent: AgentGci | null;
  endpoint: CertIdentity;
}

export type SignatureAlgorithm = 'MlDsa87' | 'BatchAnchoredSha512';

export interface SignedPolicyBundle {
  contributors: Array<PolicyVersionRef>;
  lease: FreshnessLease;
  policy: EndpointPolicy;
  scope: IdentityScope;
  signature: Array<number>;
  signature_algorithm: SignatureAlgorithm;
  signing_key_id: KeyId;
  version: BundleVersion;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export type VtzId = string;

/**
 * The struct field-declaration order a bundle signature binds, per crdb `x-fieldOrder`.
 *
 * The CBOR preimage encodes struct maps in this order (serde + ciborium emit declaration order;
 * they do NOT sort, so it is deterministic but not RFC 8949 canonical form). A preimage built in
 * any other order produces a signature the endpoint refuses.
 */
export const FORGE_FIELD_ORDER = {
  CertIdentity: ['cn', 'sans'],
  EndpointPolicy: ['max_classification', 'brokered', 'restricted', 'allow_ordinary_internet', 'exec', 'resource_bound'],
  FreshnessLease: ['issued_at', 'not_after'],
  IdentityScope: ['vtz', 'members'],
  ModelMcpDestSet: ['destinations'],
  PolicyVersionRef: ['policy', 'version'],
  ResourceBound: ['cpu_millicores', 'memory_bytes', 'pids', 'io_bytes_per_sec', 'cost_micros', 'storage_bytes', 'rate_per_sec'],
  ScopeMember: ['endpoint', 'agent'],
  SignedPolicyBundle: ['version', 'policy', 'contributors', 'scope', 'lease', 'signing_key_id', 'signature_algorithm', 'signature'],
  Version: ['major', 'minor', 'patch'],
} as const;
