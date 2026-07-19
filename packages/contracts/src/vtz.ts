// packages/contracts/src/vtz.ts -- the Virtual Trust Zones contract (IP-CONSOLE-02 V2.1).
//
// The VTZ surface (TRD-CONSOLE-02) is the first governance surface: the operator sees and steers the
// platform's hierarchical trust zones -- their tree, each zone's own + effective posture, and its
// authoring lifecycle. This module is the ONE home for its data contract (INV-CONSOLE-CONTRACTS-SINGLE-
// SOURCE): the view models the SPA renders and the BFF resolver produces. Both tiers import it -- the BFF
// (V2.2/V2.3) projects these from the crdb `VtzTree` / `VtzDetail` reads and the audited mutation verbs,
// the SPA (V2.4/V2.5) renders them -- so a drifted field fails compilation on both sides (the cross-module
// gap guard, AI Quality Guide bug category 3).
//
// The engine half is the crdb VTZ system of record (`IP-CONSOLE-VTZ-SUBSTRATE`, VZ.1-VZ.N, live over
// :7878). V2.1 lands the TYPES + the projections only; no route, no surface.
//
// GROUNDED-DESIGN NOTE (INV-CONSOLE-VTZ-REAL). The substrate diverged from the mockups; the wire contract
// is the model, the screenshots are layout guidance:
//   * NO TRUST SCORE anywhere. The wire carries none (`WireVtzTreeNode` has no score field), so the
//     Console shows a zone's health as its POSTURE plus the decision-LOG risk band joined from the
//     Overview substrate. The same removal precedent as the drawer's DR.1 and the Overview redesign.
//   * Posture is a PER-DOMAIN matrix ({@link DomainPosture} over the eleven TRD-32 v2 object domains),
//     not a single dropdown; {@link VtzZone.zoneType} is a coarse archetype badge, separate from it.
//   * `effectivePostures` is the tighten-only composition up the lexical ancestor chain (deny wins);
//     `ownPostures` is what this zone itself authored.
//   * The read-only catastrophic floor is carried per entry as {@link DomainPosture.floor} -- the ENGINE
//     flags it, the Console never hardcodes which domains are floors (it renders locked what the engine
//     says is locked, and the engine re-enforces it on write regardless).
//   * Hierarchy is the dotted name; {@link VtzZone.parent} is the lexical prefix the engine derived, not
//     a stored pointer. "Re-scope" is therefore a rename (`vtz.rescope`).
//
// Every narrowing below is FAIL-CLOSED: an engine tag the Console does not know collapses the whole
// projection to `null` rather than rendering a zone with a guessed posture. A mis-rendered posture is a
// security-relevant lie on a governance surface, so the resolver surfaces unavailability instead.

import { vtzId } from './ids.js';
import type { VtzId } from './ids.js';
import type {
  WireDomainPosture,
  WireVtzDetail,
  WireVtzMutation,
  WireVtzSpec,
  WireVtzTree,
  WireVtzTreeNode,
} from './generated/wire-dto.js';

/**
 * The eleven TRD-32 v2 object domains a zone carries a posture for, in the fixed order the editor and the
 * detail view render them (the catastrophic-floor pair first, then the rest by descending blast radius).
 * The engine emits its own order; the Console orders for the operator without dropping or inventing an
 * entry (an unknown domain fails the projection closed, see {@link toDomainPosture}).
 */
export const VTZ_OBJECT_DOMAINS = [
  'governed-egress',
  'execution',
  'privilege-escalation',
  'kernel-module',
  'credential-store',
  'persistence',
  'ordinary-network',
  'file-and-config',
  'memory',
  'ipc',
  'device',
] as const;

/** One governed object domain (`WireDomainPosture.domain`), narrowed closed. */
export type VtzObjectDomain = (typeof VTZ_OBJECT_DOMAINS)[number];

/**
 * A domain's default posture. `deny` refuses the domain outright; `permit-deny-risky` permits it but
 * denies the risky subset. The TRD-32 v2 lattice is `Permit < Monitor < Quarantine < Deny`; these two are
 * the zone-level DEFAULTS the substrate persists (individual rules refine within them).
 */
export type VtzPosture = 'deny' | 'permit-deny-risky';

/** A zone's authoring lifecycle. Save is a real state transition, not a client flag. */
export type VtzLifecycle = 'draft' | 'published';

/**
 * The coarse posture archetype badge a zone carries. A preset label over the per-domain matrix, NOT a
 * substitute for it: two `standard` zones can hold different per-domain postures.
 */
export type VtzArchetype = 'standard' | 'trusted' | 'isolation' | 'public';

/** How much telemetry the zone's members emit. */
export type VtzTelemetry = 'full' | 'sampled' | 'off';

/**
 * One domain's posture on a zone, projected from a `WireDomainPosture`. `floor` marks the read-only
 * catastrophic floor: the engine pins the domain to `deny` and refuses any edit that relaxes it, so the
 * editor renders the row locked. The flag is the ENGINE's, never a Console-side table.
 */
export interface DomainPosture {
  readonly domain: VtzObjectDomain;
  readonly posture: VtzPosture;
  readonly floor: boolean;
}

/**
 * One trust zone, projected from a `WireVtzTreeNode`. `ownPostures` is what this zone authored;
 * `effectivePostures` is the tighten-only composition up its ancestor chain -- the surface shows both so
 * the operator can see what they set against what actually applies.
 */
export interface VtzZone {
  /** The zone's stable id: its dotted `VtzName` (e.g. `YouSource.Corp.Finance`). */
  readonly id: VtzId;
  /** The display name; the same dotted name (the renderer stacks it at the dots). */
  readonly name: string;
  /**
   * The parent zone's dotted name, derived by the engine as this name's lexical prefix, or `null` for a
   * root zone. Not a stored pointer: re-parenting is a rename (`vtz.rescope`).
   */
  readonly parent: string | null;
  readonly zoneType: VtzArchetype;
  readonly lifecycle: VtzLifecycle;
  readonly microSegmentation: boolean;
  readonly telemetry: VtzTelemetry;
  /** Re-authentication interval in hours (1-24); the surface labels it "Session Duration". */
  readonly reauthIntervalHours: number;
  /** The postures this zone itself authored, ordered by {@link VTZ_OBJECT_DOMAINS}. */
  readonly ownPostures: readonly DomainPosture[];
  /** The composed tighten-only postures actually in force, ordered by {@link VTZ_OBJECT_DOMAINS}. */
  readonly effectivePostures: readonly DomainPosture[];
  /** How many zones are this zone's direct lexical children. A real engine count. */
  readonly subZoneCount: number;
}

/**
 * The tenant's zone tree (`vtz.tree`), projected from a `WireVtzTree`. Flat: the hierarchy is carried in
 * the dotted names + {@link VtzZone.parent}, so the surface builds the tree without a second read. An
 * empty tenant yields the seeded root zone alone -- never a fabricated zone (INV-CONSOLE-VTZ-REAL).
 */
export interface VtzTree {
  readonly zones: readonly VtzZone[];
  /**
   * True iff the engine's zone scan hit its ceiling: the tree is a prefix of the store and the surface
   * badges it rather than presenting the prefix as the whole (the same discipline as the Overview).
   */
  readonly truncated: boolean;
}

/** One ancestor contributing to a zone's effective posture, projected from a `WireVtzAncestor`. */
export interface VtzAncestorRef {
  readonly id: VtzId;
  readonly name: string;
}

/**
 * One zone's detail (`vtz.detail`), projected from a `WireVtzDetail`: the zone plus the ancestor chain
 * that contributed to its effective posture, so the editor can name WHICH ancestor tightened a domain.
 * `zone` is `null` when the id names no zone in this tenant -- the honest not-found state, never an empty
 * synthesized zone.
 */
export interface VtzDetailView {
  readonly zone: VtzZone | null;
  readonly ancestors: readonly VtzAncestorRef[];
}

/**
 * The result of an audited zone mutation (`vtz.create` / `vtz.edit` / `vtz.rescope` / `vtz.delete`),
 * projected from a `WireVtzMutation`. `lifecycle` is the committed post-mutation state for create/edit;
 * it is `null` for rescope and delete, where the engine deliberately returns no lifecycle (the Console
 * re-reads the moved zone). Absent, never guessed.
 */
export interface VtzMutationResult {
  readonly id: VtzId;
  readonly lifecycle: VtzLifecycle | null;
}

/** Narrow an engine domain tag to a {@link VtzObjectDomain}, or `null` if the Console does not know it. */
export function toVtzObjectDomain(domain: string): VtzObjectDomain | null {
  return VTZ_OBJECT_DOMAINS.find((known) => known === domain) ?? null;
}

/** Narrow an engine posture tag to a {@link VtzPosture}, or `null` if unknown. */
export function toVtzPosture(posture: string): VtzPosture | null {
  return posture === 'deny' || posture === 'permit-deny-risky' ? posture : null;
}

/** Narrow an engine lifecycle tag to a {@link VtzLifecycle}, or `null` if unknown. */
export function toVtzLifecycle(lifecycle: string): VtzLifecycle | null {
  return lifecycle === 'draft' || lifecycle === 'published' ? lifecycle : null;
}

/** Narrow an engine zone-type tag to a {@link VtzArchetype}, or `null` if unknown. */
export function toVtzArchetype(zoneType: string): VtzArchetype | null {
  return zoneType === 'standard' ||
    zoneType === 'trusted' ||
    zoneType === 'isolation' ||
    zoneType === 'public'
    ? zoneType
    : null;
}

/** Narrow an engine telemetry tag to a {@link VtzTelemetry}, or `null` if unknown. */
export function toVtzTelemetry(telemetry: string): VtzTelemetry | null {
  return telemetry === 'full' || telemetry === 'sampled' || telemetry === 'off' ? telemetry : null;
}

/**
 * Project one `WireDomainPosture`, or `null` if either tag is unknown. `floor` passes through from the
 * engine verbatim: the Console renders locked what the engine locked, and never decides that itself.
 */
export function toDomainPosture(wire: WireDomainPosture): DomainPosture | null {
  const domain = toVtzObjectDomain(wire.domain);
  const posture = toVtzPosture(wire.posture);
  if (domain === null || posture === null) {
    return null;
  }
  return { domain, posture, floor: wire.floor };
}

/**
 * Project a posture list, ordered by {@link VTZ_OBJECT_DOMAINS} for stable rendering, or `null` if any
 * entry fails to narrow. A domain the engine omitted is simply absent (the engine emits the full matrix
 * today; the Console does not invent a default posture for a missing row).
 */
function toDomainPostures(wire: readonly WireDomainPosture[]): DomainPosture[] | null {
  const projected: DomainPosture[] = [];
  for (const entry of wire) {
    const posture = toDomainPosture(entry);
    if (posture === null) {
      return null;
    }
    projected.push(posture);
  }
  const rank = new Map(VTZ_OBJECT_DOMAINS.map((domain, index) => [domain, index]));
  return projected.sort((a, b) => (rank.get(a.domain) ?? 0) - (rank.get(b.domain) ?? 0));
}

/**
 * Project a generated `WireVtzTreeNode` to the {@link VtzZone} view model, or `null` if any enum tag is
 * unknown (fail-closed: the resolver reports the tree unavailable rather than rendering a zone whose
 * posture it had to guess). A drifted wire field is a compile error here (the cross-module guard).
 */
export function toVtzZone(node: WireVtzTreeNode): VtzZone | null {
  const zoneType = toVtzArchetype(node.zone_type);
  const lifecycle = toVtzLifecycle(node.lifecycle);
  const telemetry = toVtzTelemetry(node.telemetry);
  const ownPostures = toDomainPostures(node.own_postures);
  const effectivePostures = toDomainPostures(node.effective_postures);
  if (
    zoneType === null ||
    lifecycle === null ||
    telemetry === null ||
    ownPostures === null ||
    effectivePostures === null
  ) {
    return null;
  }
  return {
    id: vtzId(node.id),
    name: node.name,
    parent: node.parent ?? null,
    zoneType,
    lifecycle,
    microSegmentation: node.micro_segmentation,
    telemetry,
    reauthIntervalHours: node.reauth_interval_hours,
    ownPostures,
    effectivePostures,
    subZoneCount: node.sub_zone_count,
  };
}

/**
 * Project a generated `WireVtzTree` to the {@link VtzTree} view model, or `null` if any zone fails to
 * narrow. Order is the engine's; an empty tenant yields an empty list, which the surface renders as the
 * honest empty state (in practice the seeded root zone is always present).
 */
export function toVtzTree(reply: WireVtzTree): VtzTree | null {
  const zones: VtzZone[] = [];
  for (const node of reply.nodes) {
    const zone = toVtzZone(node);
    if (zone === null) {
      return null;
    }
    zones.push(zone);
  }
  return { zones, truncated: reply.truncated };
}

/**
 * Project a generated `WireVtzDetail` to the {@link VtzDetailView} view model, or `null` if the zone is
 * present but fails to narrow. An ABSENT zone is not a failure: it is the honest not-found state, so the
 * detail projects with `zone: null` and the surface says so.
 */
export function toVtzDetail(reply: WireVtzDetail): VtzDetailView | null {
  const wireZone = reply.zone ?? null;
  let zone: VtzZone | null = null;
  if (wireZone !== null) {
    zone = toVtzZone(wireZone);
    if (zone === null) {
      return null;
    }
  }
  return {
    zone,
    ancestors: reply.ancestors.map((ancestor) => ({
      id: vtzId(ancestor.id),
      name: ancestor.name,
    })),
  };
}

/**
 * Project a generated `WireVtzMutation` to the {@link VtzMutationResult} view model, or `null` if the
 * engine returned a lifecycle tag the Console does not know. An EMPTY lifecycle is expected and valid: the
 * rescope and delete verbs return the id alone, which projects to `lifecycle: null`.
 */
export function toVtzMutation(reply: WireVtzMutation): VtzMutationResult | null {
  if (reply.lifecycle === '') {
    return { id: vtzId(reply.id), lifecycle: null };
  }
  const lifecycle = toVtzLifecycle(reply.lifecycle);
  if (lifecycle === null) {
    return null;
  }
  return { id: vtzId(reply.id), lifecycle };
}

// ---------------------------------------------------------------------------------------------------------
// The WRITE side (IP-CONSOLE-02 V2.3): what the operator authors. The engine is the authority on every rule
// here -- it re-validates the name shape, the re-auth bound, the read-only catastrophic floor, and
// tighten-only inheritance on commit, and refuses rather than silently correcting. The Console validates
// the same things first only so a malformed edit fails fast at the boundary with a useful message instead
// of burning an engine round-trip; it never relaxes a rule the engine enforces.

/** The lowest re-authentication interval a zone may carry, in hours (the engine re-validates). */
export const MIN_REAUTH_INTERVAL_HOURS = 1;

/** The highest re-authentication interval a zone may carry, in hours (the engine re-validates). */
export const MAX_REAUTH_INTERVAL_HOURS = 24;

/**
 * A zone as the operator authored it (`vtz.create` / `vtz.edit`). The camelCase mirror of `WireVtzSpec`.
 * `name` is the dotted `VtzName` and IS the identity + the hierarchy, so an edit that changes it is a
 * re-scope ({@link VtzRescopeInput}), not an edit.
 *
 * `ownPostures` carries the full per-domain matrix INCLUDING the catastrophic-floor rows. The `floor` flag
 * on each entry is the engine's to determine: whatever the Console sends, the engine re-derives it from the
 * domain and refuses any spec that relaxes a floor. The Console sends the flag back verbatim so a
 * round-trip of an unmodified zone is byte-identical, never to assert what is or is not a floor.
 */
export interface VtzSpecInput {
  readonly name: string;
  readonly description: string;
  readonly zoneType: VtzArchetype;
  readonly ownPostures: readonly DomainPosture[];
  readonly microSegmentation: boolean;
  readonly telemetry: VtzTelemetry;
  /** Re-authentication interval in hours, 1-24 ("Session Duration" on the surface). */
  readonly reauthIntervalHours: number;
  /** `draft` keeps the zone unpublished; `published` is a real state transition the engine commits. */
  readonly lifecycle: VtzLifecycle;
}

/** A re-scope: move a zone to a new dotted name (which is what changes its parent). */
export interface VtzRescopeInput {
  readonly id: string;
  readonly newName: string;
}

/** Compile an authored {@link VtzSpecInput} into the engine's `WireVtzSpec`. Total: field renaming only. */
export function toWireVtzSpec(spec: VtzSpecInput): WireVtzSpec {
  return {
    name: spec.name,
    description: spec.description,
    zone_type: spec.zoneType,
    own_postures: spec.ownPostures.map((p) => ({
      domain: p.domain,
      posture: p.posture,
      floor: p.floor,
    })),
    micro_segmentation: spec.microSegmentation,
    telemetry: spec.telemetry,
    reauth_interval_hours: spec.reauthIntervalHours,
    lifecycle: spec.lifecycle,
  };
}

/**
 * Narrow an untrusted authoring payload (a parsed request body) into a {@link VtzSpecInput}, or `null` if
 * ANY field is missing, mistyped, or carries a tag the Console does not know. Fail-closed and total: there
 * is no partial accept and no defaulting, so a malformed edit can never reach the engine as a
 * half-understood spec. The engine re-validates everything regardless; this is the boundary check.
 */
export function toVtzSpecInput(body: unknown): VtzSpecInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const { name, description, zoneType, telemetry, lifecycle } = b;
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (typeof description !== 'string') return null;
  if (typeof b['microSegmentation'] !== 'boolean') return null;
  const archetype = typeof zoneType === 'string' ? toVtzArchetype(zoneType) : null;
  const mode = typeof telemetry === 'string' ? toVtzTelemetry(telemetry) : null;
  const state = typeof lifecycle === 'string' ? toVtzLifecycle(lifecycle) : null;
  if (archetype === null || mode === null || state === null) return null;
  const hours = b['reauthIntervalHours'];
  if (
    typeof hours !== 'number' ||
    !Number.isInteger(hours) ||
    hours < MIN_REAUTH_INTERVAL_HOURS ||
    hours > MAX_REAUTH_INTERVAL_HOURS
  ) {
    return null;
  }
  const rawPostures = b['ownPostures'];
  if (!Array.isArray(rawPostures) || rawPostures.length === 0) return null;
  const ownPostures: DomainPosture[] = [];
  for (const raw of rawPostures) {
    if (typeof raw !== 'object' || raw === null) return null;
    const p = raw as Record<string, unknown>;
    const domain = typeof p['domain'] === 'string' ? toVtzObjectDomain(p['domain']) : null;
    const posture = typeof p['posture'] === 'string' ? toVtzPosture(p['posture']) : null;
    if (domain === null || posture === null || typeof p['floor'] !== 'boolean') return null;
    ownPostures.push({ domain, posture, floor: p['floor'] });
  }
  return {
    name: name.trim(),
    description,
    zoneType: archetype,
    ownPostures,
    microSegmentation: b['microSegmentation'],
    telemetry: mode,
    reauthIntervalHours: hours,
    lifecycle: state,
  };
}

// ---------------------------------------------------------------------------------------------------------
// TIGHTEN-ONLY COMPOSITION (IP-CONSOLE-02 V2.5). The engine composes a zone's effective posture up its
// lexical ancestor chain and DENY WINS -- a child can tighten what an ancestor set, never relax it. The
// editor previews the result of an in-progress edit before the operator commits, so this mirrors the rule
// the engine will apply. It is a PREVIEW, not an authority: the engine recomposes and re-validates on
// commit and refuses a contradiction, so a preview that ever disagreed would be a Console bug, not a new
// policy. The exactness comes from feeding it the PARENT zone's effective postures (a real `vtz.detail`
// read), which already carry the whole chain above this zone.

/** The tighter of two postures. `deny` beats `permit-deny-risky`; equal is itself. */
export function tighterPosture(a: VtzPosture, b: VtzPosture): VtzPosture {
  return a === 'deny' || b === 'deny' ? 'deny' : 'permit-deny-risky';
}

/**
 * Compose an authored posture matrix with the inherited one (the parent zone's EFFECTIVE postures, which
 * already carry the full ancestor chain), producing what would actually apply. A domain the parent does
 * not carry inherits nothing and stands on its own; a domain only the parent carries passes through, so
 * an inherited deny is never lost by omission. `floor` is preserved from whichever entry carries it -- the
 * engine owns that flag and composition cannot clear it.
 */
export function composeEffectivePostures(
  own: readonly DomainPosture[],
  inherited: readonly DomainPosture[],
): readonly DomainPosture[] {
  const byDomain = new Map<VtzObjectDomain, DomainPosture>();
  for (const entry of inherited) {
    byDomain.set(entry.domain, entry);
  }
  const composed: DomainPosture[] = [];
  const seen = new Set<VtzObjectDomain>();
  for (const entry of own) {
    seen.add(entry.domain);
    const parent = byDomain.get(entry.domain);
    composed.push({
      domain: entry.domain,
      posture: parent === undefined ? entry.posture : tighterPosture(entry.posture, parent.posture),
      floor: entry.floor || (parent?.floor ?? false),
    });
  }
  // A domain the child did not author still applies from the ancestor chain.
  for (const entry of inherited) {
    if (!seen.has(entry.domain)) composed.push(entry);
  }
  const rank = new Map(VTZ_OBJECT_DOMAINS.map((domain, index) => [domain, index]));
  return composed.sort((a, b) => (rank.get(a.domain) ?? 0) - (rank.get(b.domain) ?? 0));
}

// ---------------------------------------------------------------------------------------------------------
// BOOTSTRAP (IP-CONSOLE-02 V2.5b). A tenant with no zones has nothing for the editor to learn a posture
// matrix from -- no parent to inherit, no sibling to copy -- so the very first zone cannot be authored
// against real engine data. This is the ONE place the Console carries a posture table, and it is a
// deliberate, labelled bootstrap value rather than a rendering of engine state.

/**
 * The two object domains TRD-32 v2 pins as the read-only catastrophic floor. Used ONLY to seed the first
 * zone of an empty tenant (see {@link failClosedRootPostures}); everywhere else the floor flag is read
 * from the ENGINE's own per-row `floor`, never from this list, so a change engine-side needs no change
 * here. The engine re-derives and re-enforces the floor on commit regardless of what the Console sends.
 */
export const CATASTROPHIC_FLOOR_DOMAINS: readonly VtzObjectDomain[] = [
  'governed-egress',
  'execution',
];

/**
 * The fail-closed posture matrix for bootstrapping the first zone of an empty tenant: every domain
 * `deny`, with the two catastrophic domains flagged.
 *
 * This mirrors exactly what the engine's own seed does (`cdb_cyber::seed_default_zones`: a zone authored
 * with no postures is all-Deny with the floor intact), so the Console is not inventing a posture -- it is
 * proposing the tightest legal zone, which is also the only safe default for a boundary the operator has
 * not yet described. Nothing here is ever DISPLAYED as engine state: the moment the zone commits, the
 * next read returns the engine's own matrix and flags, which replace these.
 */
export function failClosedRootPostures(): readonly DomainPosture[] {
  return VTZ_OBJECT_DOMAINS.map((domain) => ({
    domain,
    posture: 'deny' as const,
    floor: CATASTROPHIC_FLOOR_DOMAINS.includes(domain),
  }));
}
