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
