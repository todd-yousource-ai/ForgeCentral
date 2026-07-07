# Contributing to ForgeCentral (YouSource Console)

ForgeCentral follows the same disciplined, gated process as the CrucibleDB engine and the Torch edge,
instantiated for the TypeScript/Node Console. The standard for every change: would a senior engineer be
comfortable shipping this into a federal-customer deployment?

Read the standards in `docs/standards/` and the Console TRD suite in `docs/spec/` before writing code.

## Branch-per-PR workflow (mandatory)

1. Keep a local `main` tracking `origin/main`; **never commit directly to main**.
2. One PR = one branch off main aligned to a `TRD-CONSOLE` acceptance criterion or one focused change:
   `git checkout main && git pull --ff-only && git checkout -b <type>/<name>`.
3. Develop, then **gate before merge**: `scripts/ci.sh` (hygiene -> typecheck -> lint -> format ->
   test -> contract -> e2e -> audit -> licenses -> build). Use `--skip-net` to skip the networked
   dependency audit + the e2e stage against a live engine. The same gate runs in CI
   (`.github/workflows/ci.yml`).
4. Merge to main only when green: `git checkout main && git merge --no-ff <branch> && git push origin main`.
5. Delete the merged branch locally and on the remote:
   `git branch -d <branch> && git push origin --delete <branch>`.

The GitHub remote is `github-forgecentral` (`git@github-forgecentral:todd-yousource-ai/ForgeCentral.git`,
a dedicated deploy key). Push local `main` and GitHub `main` together.

## Conventions

- **One PR at a time**, a complete testable unit aligned to one TRD acceptance criterion. Review it with
  the maintainer and get approval before starting the next; stop after each merge.
- **Named invariant / acceptance per PR**, proven by a tiered test (unit -> integration -> contract ->
  e2e). The touched surface's TRD names it.
- **No stubs.** Every value and control binds to a real Crucible/Torch/Forge operation. A binding whose
  engine op does not exist yet is marked `PENDING` and its cross-surface work is named in the IP
  (`INV-CROSS`); a `PENDING` binding never ships. No mock provider reaches a release build.
- **No second database.** The Console persists no durable domain data; Crucible is the sole source of
  truth.
- **Fail closed.** Defaults are closed; an enabled surface carries its bound; absent data renders an
  explicit empty state, never a fabricated value.
- **No em dashes** in code, comments, or committed prose. Use `--`. This is enforced by the gate.
- **Scoped commits**; separate code from docs. Commit message `<type>(<scope>): <imperative summary>`
  under 72 chars, no trailing period (types: feat, fix, refactor, test, docs, chore, security).
- **One source of truth.** Shared identifiers (engine DTO types, binding ids, error codes) come from
  `@forge/contracts`; do not re-declare them.

## Dependency and license policy

See `DEPENDENCY-POLICY.md` (the counterpart of the engine repos' `deny.toml`). In short: pinned exact
versions, no wildcards, committed lockfile; `pnpm audit` clean at high/critical; licenses in the
allowlist (Apache-2.0, MIT, BSD, ISC, Unicode); **AGPL and GPL are prohibited.** The gate enforces the
audit + the license allowlist.

## Branch protection (operator, one-time -- repo Settings -> Branches)

The workflow above is enforced by hand until these are set on GitHub. Configure a branch-protection rule
on `main`:

- **Require a pull request before merging** (no direct pushes to `main`).
- **Require status checks to pass** -> select the `gate` check.
- **Require branches to be up to date before merging.**

## Build / test

The Node version is pinned in `.nvmrc`; the package manager (pnpm) is pinned in `package.json`
(`packageManager` + `engines`). Enable it with `corepack enable`. Run the full gate locally with
`scripts/ci.sh` before every push. Until the first implementation PR lands the TypeScript workspace, the
gate runs the repo-hygiene checks (including the no-em-dash rule) and reports the workspace as pending.
