# Dependency and supply-chain policy

The TypeScript/Node counterpart of the engine repos' `deny.toml`. Enforced by the gate
(`scripts/ci.sh`): `pnpm audit --audit-level=high` for advisories and `scripts/check-licenses.mjs` for
the license allowlist. This document is the policy of record; the scripts are its enforcement.

## Licenses

Permitted (allowlist, SPDX): **Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Unicode-DFS-2016,
Unicode-3.0, CC0-1.0, BlueOak-1.0.0, Python-2.0**.

Prohibited: **AGPL (any version), GPL (any version), LGPL, SSPL, BUSL, CC-BY-NC**, and any license
incompatible with proprietary distribution. A dual-licensed package (e.g. `MIT OR GPL-3.0`) is permitted
only via its allowlisted option.

The allowlist in `scripts/check-licenses.mjs` is authoritative for enforcement; keep the two in sync. A
new license requires an explicit, reviewed addition to both.

## Versions and provenance

- **Pin exact versions** for runtime dependencies; no `*`/`x`/`latest`. Dev tooling may use caret ranges,
  but the committed lockfile (`pnpm-lock.yaml`) pins everything exactly and is the source of truth.
- **Commit the lockfile.** CI installs with `--frozen-lockfile`; a drifted or missing lockfile fails the
  gate.
- Every added dependency: verify it exists on npm, has recent maintenance, has no unresolved
  high/critical advisories (`pnpm audit`), and its license is allowlisted.
- **Minimize the tree.** Do not add a dependency for what the standard library, the platform, or an
  existing dependency does in under ~30 lines. Every transitive dependency is attack surface and bundle
  weight.

## Advisories

`pnpm audit --audit-level=high` runs in the gate (skipped under `--skip-net`, which needs the advisory
DB). High/critical advisories fail the gate. Remediation deadlines follow CRAFTED standards: Critical
24h, High 7 days, Medium 30 days.

## SBOM and signing (from the first release build)

An SBOM (CycloneDX) is produced per release artifact and stored with it; release artifacts are signed and
verified at deploy. Container images do not run as root and bake no secrets.
