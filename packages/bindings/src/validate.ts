// packages/bindings/src/validate.ts -- the no-stub enforcement (F0.4, INV-CONSOLE-NO-STUB).
//
// Two layers:
//  - validateManifest: structural rules that always hold (dev + release). A malformed binding is a bug at
//    any time: a key/id mismatch, an empty op, a command that is not audited, a mock/fixture op, or a
//    PENDING binding that does not name its gating engine task (so a deferral is always traceable).
//  - assertReleaseReady: the release gate. No PENDING binding may ship (a deferral is a plan artifact,
//    never a shipped stub) and no mock op may ship. `pnpm test:contract` runs both.

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
    if (binding.kind === 'command' && binding.audited !== true) {
      violations.push({ bindingId: key, problem: 'command binding must be audited' });
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

/** Release gate: throws if the manifest is malformed, ships a PENDING binding, or ships a mock op. */
export function assertReleaseReady(manifest: BindingManifest): void {
  const problems = validateManifest(manifest).map((v) => `${v.bindingId}: ${v.problem}`);
  const pending = Object.values(manifest)
    .filter((b) => b.status.kind === 'pending')
    .map((b) => b.id);
  if (pending.length > 0) {
    problems.push(`PENDING bindings must not ship in a release build: ${pending.join(', ')}`);
  }
  if (problems.length > 0) {
    throw new Error(`INV-CONSOLE-NO-STUB violated:\n  ${problems.join('\n  ')}`);
  }
}
