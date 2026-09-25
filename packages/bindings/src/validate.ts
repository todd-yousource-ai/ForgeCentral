// packages/bindings/src/validate.ts -- the no-stub enforcement (F0.4, INV-CONSOLE-NO-STUB).
//
// Two layers:
//  - validateManifest: structural rules that always hold (dev + release). A malformed binding is a bug at
//    any time: a key/id mismatch, an empty op, a command that is neither audited nor names its tracked
//    audit gap, a mock/fixture op, or a PENDING binding that does not name its gating engine task (so a
//    deferral, like an audit gap, is always traceable).
//  - assertReleaseReady: the release gate. No PENDING binding may ship (a deferral is a plan artifact,
//    never a shipped stub), no command with a tracked audit gap may ship (TRD-CONSOLE-00 AUDITED holds
//    at release), and no mock op may ship. `pnpm test:contract` runs both.

import type { BindingManifest } from '@forge/contracts';

/** A binding registry rule violation. */
export interface BindingViolation {
  readonly bindingId: string;
  readonly problem: string;
}

const MOCK_OP = /^(mock|fixture|stub):/i;

/** Structural + always-on no-stub rules. Returns every violation (empty = valid). */
export function validateManifest(manifest: BindingManifest): BindingViolation[] {
  const violations: BindingViolation[] = [];
  for (const [key, binding] of Object.entries(manifest)) {
    if (binding.id !== key) {
      violations.push({
        bindingId: key,
        problem: `manifest key '${key}' does not match binding id '${binding.id}'`,
      });
    }
    if (binding.op.trim() === '') {
      violations.push({ bindingId: key, problem: 'binding has an empty op' });
    }
    if (MOCK_OP.test(binding.op)) {
      violations.push({
        bindingId: key,
        problem: `op '${binding.op}' names a mock/fixture provider`,
      });
    }
    // `!binding.auditGap` also catches a gap that is absent at runtime (a manifest built through a cast).
    if (
      binding.kind === 'command' &&
      !binding.audited &&
      (!binding.auditGap || binding.auditGap.trim() === '')
    ) {
      violations.push({
        bindingId: key,
        problem: 'command binding must be audited, or name its tracked audit gap',
      });
    }
    if (
      binding.status.kind === 'pending' &&
      (!binding.status.owningRepo || !binding.status.gatingTask)
    ) {
      violations.push({
        bindingId: key,
        problem: 'PENDING binding must name its owning repo and gating task (INV-CROSS)',
      });
    }
  }
  return violations;
}

/**
 * Release gate: throws if the manifest is malformed, ships a PENDING binding, ships a command the engine
 * does not audit (a tracked audit gap), or ships a mock op.
 */
export function assertReleaseReady(manifest: BindingManifest): void {
  const problems = validateManifest(manifest).map((v) => `${v.bindingId}: ${v.problem}`);
  const pending = Object.values(manifest)
    .filter((b) => b.status.kind === 'pending')
    .map((b) => b.id);
  if (pending.length > 0) {
    problems.push(`PENDING bindings must not ship in a release build: ${pending.join(', ')}`);
  }
  const unaudited = Object.values(manifest)
    .filter((b) => b.kind === 'command' && !b.audited)
    .map((b) => b.id);
  if (unaudited.length > 0) {
    problems.push(`unaudited commands must not ship in a release build: ${unaudited.join(', ')}`);
  }
  if (problems.length > 0) {
    throw new Error(`INV-CONSOLE-NO-STUB violated:\n  ${problems.join('\n  ')}`);
  }
}
