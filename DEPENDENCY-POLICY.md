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

## Supply-chain hardening (malicious-package defense)

`pnpm audit` catches _disclosed_ CVEs; it does nothing against a _malicious_ package (a typosquat, a
compromised maintainer release, a self-replicating install-script worm). Those need a different layer.
The controlling principle: **you cannot prove 100+ transitive packages safe -- you shrink what must be
trusted, block what code may run, pin every source, and make compromise detectable.**

- **Near-zero runtime surface.** The Console _ships_ only its own code: `dependencies` is empty across the
  workspace; every third-party package is a `devDependency` (build/test tooling) that never runs in the
  deployed BFF or SPA (`dist/` is our code only). Keep it that way -- every new runtime `dependencies`
  entry is a review event. This is the single biggest lever: a compromised dev tool can poison a build,
  but it is not code running in production.
- **Install-script lockdown (deny-by-default).** Lifecycle scripts (preinstall/install/postinstall) are
  the primary worm vector. pnpm runs a lifecycle script only for packages listed in
  `package.json > pnpm.onlyBuiltDependencies`; every other package is blocked. The allowlist is currently
  `["esbuild"]` (it links its platform binary). `scripts/check-supply-chain.mjs` fails the gate the moment
  any non-allowlisted package in the tree carries a script, so a poisoned update cannot smuggle an install
  payload in. Extend the allowlist only after reviewing why the tool needs to execute on install.
- **Source pinning + integrity.** `.npmrc` pins the registry to `https://registry.npmjs.org/` and sets
  `verify-store-integrity=true`; the committed lockfile carries a SHA-512 content hash per package and CI
  installs `--frozen-lockfile`. `check-supply-chain.mjs` additionally refuses any off-registry tarball or
  git/VCS dependency source in the lockfile (dependency-substitution defense).
- **SBOM per build.** `scripts/sbom.mjs` emits `sbom.cdx.json` (CycloneDX 1.5) from the installed tree
  each gate run, so a newly disclosed CVE maps to "are we affected?" immediately. It is generated, not
  committed (derivable from the lockfile).

**Recommended next hardening (own PR): a release-age cooldown.** The recent worms were auto-pulled within
hours of a compromised publish. pnpm 10.4+ `minimumReleaseAge` refuses to install a version newer than N
days, so the ecosystem yanks a bad release before it reaches us. This rides on a pnpm 9 -> 10 major bump
(which also makes install-script deny-by-default the default) and belongs in its own focused, verified PR.

Networked scanners beyond `pnpm audit` (OSV-Scanner for broad advisory coverage; a behavioral scanner
such as Socket for obfuscation / unexpected network+filesystem / typosquat detection) are a CI-side
addition; they are not wired into the hermetic local gate.

## SBOM and signing (from the first release build)

An SBOM (CycloneDX) is produced per build (`scripts/sbom.mjs`, above) and per release artifact and stored
with it; release artifacts are signed and verified at deploy. Container images do not run as root and bake
no secrets. Runtime containment (the deployed BFF reaches only the loopback sidecar, the IdP, and the
browser; unexpected egress is blocked) is the last layer, owned by the deploy + admin-plane work.

## The Rust crypto sidecar (`sidecar/`)

The AWS-LC crypto sidecar (`IP-CONSOLE-00-CRYPTO-SIDECAR`) is a standalone Rust crate, **not** an npm
dependency and **not** in the pnpm workspace, so it never enters the Node supply chain (the empty-runtime
`dependencies` rule and the install-script lockdown above are unaffected). It is provisioned as an
installer-built binary (`sidecar/deploy/`).

Its own supply chain mirrors the engine repos' Rust policy:

- **Pinned, committed lockfile** (`sidecar/Cargo.lock`) -- the exact dependency set and the SBOM source for
  the binary. Deps are pinned, minimal, and feature-scoped.
- **License allowlist + bans + sources** enforced by `sidecar/deny.toml` (`cargo deny check`) -- the same
  allowlist as the Console's npm policy (AGPL/GPL/LGPL denied), plus `OpenSSL` for the `aws-lc` FIPS module.
  The **only** allowed git source is the pinned CrucibleDB repo (the `cdb-mtls` contract crate); every other
  git source and any crates.io `*` version fails the gate.
- **Advisories** via `cargo audit` (RustSec).
- Both run as the `scripts/ci.sh` `[11] sidecar` leg (network-gated, like the npm audit); CI provisions
  `cargo-deny`/`cargo-audit`. A release build emits the sidecar's CycloneDX SBOM (`cargo-cyclonedx`)
  alongside the npm SBOM.
