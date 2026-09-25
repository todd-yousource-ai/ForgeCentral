// packages/contracts/src/binding.ts -- the typed binding-manifest shape (F0.1).
//
// The no-stub contract (INV-CONSOLE-NO-STUB): every value the Console renders and every control it
// exposes binds to a REAL Crucible/Torch/Forge operation. F0.1 lands the TYPE of that binding; F0.4
// populates the registry and its structural contract test; IP-CONSOLE-11-guide GD.1 makes the registry
// the enforced index of the BFF's routes: every `/api` route is declared with the bindings it realizes
// (apps/bff/src/routes.ts), an undeclared route is refused at dispatch, and the contract test proves every
// LIVE binding is served by a declared route (INV-BINDING-ROUTE-COVERAGE). A binding whose op is not built
// yet is explicitly PENDING with its owning engine task (INV-CROSS). This module is the single home for
// those shapes so the BFF and the SPA share one definition.

/** A stable identifier for one binding (e.g. `overview.graph.read`, `vtz.isolate.command`). */
export type BindingId = string & { readonly __binding: 'BindingId' };

export const bindingId = (raw: string): BindingId => raw as BindingId;

/**
 * Which surface a binding resolves against: an engine's (`cruciblql`, `admin`, `torch`, `forge`), or
 * `console` -- ForgeCentral's own installation configuration or its gateway (the operator role map, the
 * admin session lookup, the connector secret store), which are real platform state but not an engine op.
 */
export type EngineSurface = 'cruciblql' | 'admin' | 'torch' | 'forge' | 'console';

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

/**
 * How a command is audited: by the engine (`audited: true`, the rule), or not yet, in which case the
 * binding names the tracked defect (`auditGap`) -- the same honest-deferral discipline as PENDING. A
 * command never claims an audit the engine does not write, and never omits the question.
 */
export type CommandAudit =
  { readonly audited: true } | { readonly audited: false; readonly auditGap: string };

/** A command binding: resolves to a mutating op and is authorized by the engine (or the gateway). */
export type CommandBinding = {
  readonly id: BindingId;
  readonly kind: 'command';
  readonly surface: EngineSurface;
  /** The concrete mutating op the BFF handler calls. */
  readonly op: string;
  /** The authorization this command is meant to require (a label; see the engine for what it checks). */
  readonly authz: string;
  readonly status: BindingStatus;
} & CommandAudit;

export type Binding = ReadBinding | CommandBinding;

/** The registry shape: bindings keyed by their id. Populated in F0.4. */
export type BindingManifest = Readonly<Record<string, Binding>>;

/** Whether a binding is PENDING (must not ship in a release build). */
export function isPending(binding: Binding): boolean {
  return binding.status.kind === 'pending';
}
