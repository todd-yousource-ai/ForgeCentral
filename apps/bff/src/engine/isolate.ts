// apps/bff/src/engine/isolate.ts -- the Isolate quick-action command (IP-CONSOLE-12 DR.5c).
//
// Brokers the operator "Isolate from network" action to crdb's Contain verb over the OperatorEngine
// (IP-CONTAIN-COMMAND): it records an audited, operator-attributed Quarantine/Deny disposition on the
// subject, idempotent by the client-supplied commandId. Enforcement is deliberately OFF (AG.7): the
// returned IsolateEffect reports enforcementActive false -- the command records intent and audits it,
// never fabricated enforcement. The operator delegation is injected server-side by the OperatorEngine.

import type { Action, EntityRef, IsolateEffect, IsolateRequest } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** The containment-lattice action for a posture (a restriction; TRD-32 v2). */
function actionForPosture(posture: 'quarantine' | 'deny'): Action {
  return posture === 'deny' ? 'Deny' : 'Quarantine';
}

/** The posture an engine effect's action maps back to (for the returned IsolateEffect). */
function postureForAction(action: Action): 'quarantine' | 'deny' {
  return action === 'Deny' ? 'deny' : 'quarantine';
}

/**
 * Resolve the Isolate command for `ref`, brokered on behalf of `principal`.
 *
 * Builds the ContainmentRequest (subject = the entity id, action from the posture, idempotent by the
 * client `commandId`) and sends the live Contain verb through the OperatorEngine, which injects the
 * operator delegation server-side. Returns the honest effect -- `enforcementActive` is `false` today
 * (AG.7). A denial (beyond-tier / no Delegation grant) throws `EngineRefusedError`, which the route
 * sanitizes.
 */
export async function resolveIsolate(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  ref: EntityRef,
  request: IsolateRequest,
  now: number,
  opts?: EngineCallOptions,
): Promise<IsolateEffect> {
  const effect = await engine.contain(
    principal,
    {
      operator: null,
      request: {
        subject: ref.id,
        action: actionForPosture(request.posture),
        reason: `Operator isolate from the Console (${request.posture})`,
        command_id: request.commandId,
        issued_at: now,
        derived_from_decision_id: null,
        ai_assist: null,
      },
    },
    opts,
  );
  return {
    posture: postureForAction(effect.action),
    enforcementActive: effect.enforcement_active,
    summary: effect.summary,
  };
}
