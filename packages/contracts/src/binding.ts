// packages/contracts/src/binding.ts -- the typed binding-manifest shape (F0.1).
//
// The no-stub contract (INV-CONSOLE-NO-STUB): every value the Console renders and every control it
// exposes binds to a REAL Crucible/Torch/Forge operation. F0.1 lands the TYPE of that binding; F0.4
// populates the registry and adds the contract test that asserts every route/control references a
// registered binding and every binding's backend op exists (or is explicitly PENDING with its owning
// engine task, INV-CROSS). This module is the single home for those shapes so the BFF and the SPA share
// one definition.

/** A stable identifier for one binding (e.g. `overview.graph.read`, `vtz.isolate.command`). */
export type BindingId = string & { readonly __binding: 'BindingId' };

export const bindingId = (raw: string): BindingId => raw as BindingId;

/** Which engine surface a binding resolves against. */
export type EngineSurface = 'cruciblql' | 'admin' | 'torch' | 'forge';

/**
 * A binding is either LIVE (its backend op exists today) or PENDING (the op is not built yet; the
 * binding is a tracked plan artifact naming the gating engine work, and NEVER ships -- the contract test
 * fails a release build that references a pending binding). This mirrors the engine repos' honest
 * deferral discipline rather than a silent stub.
 */
export type BindingStatus =
  | { readonly kind: 'live' }
  | { readonly kind: 'pending'; readonly owningRepo: string; readonly gatingTask: string };

/** A read binding: resolves to a read op (CrucibleQL-first) and a named view-model shape. */
export interface ReadBinding {
  readonly id: BindingId;
  readonly kind: 'read';
  readonly surface: EngineSurface;
  /** The concrete op the BFF resolver calls (e.g. a parameterized CrucibleQL statement id). */
  readonly op: string;
  /** The view-model type name this read produces (documentation + contract-test anchor). */
  readonly viewModel: string;
  readonly status: BindingStatus;
}

/** A command binding: resolves to a mutating op, is authorized engine-side, and is always audited. */
export interface CommandBinding {
  readonly id: BindingId;
  readonly kind: 'command';
  readonly surface: EngineSurface;
  /** The concrete mutating op the BFF handler calls. */
  readonly op: string;
  /** The engine-side authorization this command requires (rendered for the contract test). */
  readonly authz: string;
  /** Every command produces an audit entry; this is `true` by construction, never omitted. */
  readonly audited: true;
  readonly status: BindingStatus;
}

export type Binding = ReadBinding | CommandBinding;

/** The registry shape: bindings keyed by their id. Populated in F0.4. */
export type BindingManifest = Readonly<Record<string, Binding>>;

/** Whether a binding is PENDING (must not ship in a release build). */
export function isPending(binding: Binding): boolean {
  return binding.status.kind === 'pending';
}
