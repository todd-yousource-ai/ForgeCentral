#!/usr/bin/env bash
# scripts/ci.sh -- the ForgeCentral (YouSource Console) quality gate.
#
# The same script runs in local development and in CI (.github/workflows/ci.yml). Exit non-zero halts
# the gate. This is the TypeScript/Node counterpart of the engine repos' Rust gate; the order mirrors
# TypeScript_Dev_Rules.md Section 14:
#   hygiene -> typecheck -> lint -> format -> test -> contract -> e2e -> audit -> licenses -> build.
#
# Usage:
#   scripts/ci.sh              # full gate
#   scripts/ci.sh --skip-net   # skip the networked steps (dependency audit; e2e vs a live engine)
#   scripts/ci.sh --skip-e2e   # skip only the Playwright e2e stage
#
# Until the first implementation PR lands the TypeScript workspace, the gate runs the repo-hygiene
# checks (which need no dependencies) and reports the workspace as pending.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

skip_net=false
skip_e2e=false
for arg in "$@"; do
    case "$arg" in
        --skip-net) skip_net=true ;;
        --skip-e2e) skip_e2e=true ;;
        *) echo "unknown arg: $arg" >&2; exit 2 ;;
    esac
done

# ---- [1] repo hygiene: no em/en dashes in committed text (the standing discipline) ----------------
# U+2014 (em) and U+2013 (en) are banned in code, comments, and committed prose; use --.
# --untracked scans new (not-yet-committed) work too, while respecting .gitignore (skips node_modules).
echo "==> [1] repo hygiene (no em/en dashes in tracked + untracked text)"
if git grep --untracked -nI -e $'—' -e $'–' -- \
    '*.md' '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' '*.css' 2>/dev/null; then
    echo "ERROR: em/en dashes found above. Use -- per the standards (no-em-dash rule)." >&2
    exit 1
fi
echo "    ok: no em/en dashes"

# ---- the code gate (activates once the workspace has member packages) -----------------------------
members=$(ls packages/*/package.json apps/*/package.json 2>/dev/null || true)
if [ -z "$members" ]; then
    echo "==> no workspace member packages yet -- the TypeScript workspace lands with the first"
    echo "    implementation PR (design system + BFF skeleton + binding registry + auth)."
    echo "==> ALL GATES PASSED (scaffold stage: hygiene only)"
    exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo "ERROR: pnpm not found. Run 'corepack enable' (pinned in package.json) or install pnpm." >&2
    exit 1
fi
echo "==> node: $(node --version)  pnpm: $(pnpm --version)"

echo "==> [2] install (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [3] typecheck (tsc --noEmit, strict)"
pnpm run typecheck

echo "==> [4] lint (eslint --max-warnings 0)"
pnpm run lint

echo "==> [5] format (prettier --check)"
pnpm run format:check

echo "==> [6] test (unit + integration)"
pnpm run test

echo "==> [7] contract (no-stub bindings + generated-client/OpenAPI drift)"
pnpm run test:contract

if [ "$skip_e2e" = "false" ] && [ "$skip_net" = "false" ]; then
    echo "==> [8] e2e (<=3-click tasks on a seeded engine)"
    pnpm run test:e2e
else
    echo "==> [8] e2e SKIPPED (--skip-e2e / --skip-net)"
fi

echo "==> [9] supply chain (audit + install-script lockdown + source pinning + licenses + SBOM)"
if [ "$skip_net" = "false" ]; then
    pnpm audit --audit-level=high
else
    echo "    dependency audit skipped (--skip-net; the advisory DB needs network)"
fi
pnpm run check:supply-chain
pnpm run check:licenses
pnpm run sbom

echo "==> [10] build"
pnpm run build

echo "==> ALL GATES PASSED"
