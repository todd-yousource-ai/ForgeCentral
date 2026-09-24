// apps/bff/src/engine/settings.ts -- the governed settings resolvers (IP-CONSOLE-11 ST.1 over crdb
// IP-CONSOLE-SETTINGS-WIRE SET.1).
//
// The engine gates the read by tier (Admin / SecurityAudit) and renders every value itself; this
// resolver projects fail-closed and never renders a value of its own. Nothing is cached: a Settings
// read must show what was just committed.

import type { SettingsView, WireSettingsQuery } from '@forge/contracts';
import { toSettingsView } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';
import { requestId } from './soc.js';

/** The settings read could not be projected honestly (an origin this build does not know). */
export class SettingsUnavailableError extends Error {
  constructor(detail: string) {
    super(`settings unavailable: ${detail}`);
    this.name = 'SettingsUnavailableError';
  }
}

/**
 * Read the governed settings of one registry surface, or all of them. `null` is the engine's
 * refusal (a tier below Admin / SecurityAudit, or an unknown surface).
 */
export async function resolveSettings(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  surface: string | null,
  opts?: EngineCallOptions,
): Promise<SettingsView | null> {
  const request: WireSettingsQuery =
    surface === null ? { request_id: requestId() } : { request_id: requestId(), surface };
  const wire = await engine.settingsRead(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const view = toSettingsView(wire);
  if (view === null) {
    throw new SettingsUnavailableError('a setting carries an origin this build does not know');
  }
  return view;
}
