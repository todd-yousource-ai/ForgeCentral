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

Reviewed per-package exceptions (`PACKAGE_EXCEPTIONS` in `scripts/check-licenses.mjs`): a package that is
**dev-only and data-only** may sit outside the code allowlist when it ships no code into `dist/`. A
prohibited family (GPL/AGPL/...) is never exceptable. Current entries:

- **`caniuse-lite` (CC-BY-4.0)** -- browser-compatibility data, dev-only (build-time, pulled by
  `browserslist` under `@babel/core` under `@vitejs/plugin-react`). It is a data table, not code, and is
  never bundled into a release artifact. Permitted as a reviewed exception.

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

`scripts/audit-bulk.mjs --level=high` runs in the gate (skipped under `--skip-net`, which needs the
advisory DB; the npm quick-audit endpoint `pnpm audit` calls was retired 2026-07, so this script queries
the documented bulk endpoint over the same lockfile-derived package set). High/critical advisories fail
the gate. Remediation deadlines follow CRAFTED standards: Critical 24h, High 7 days, Medium 30 days.

**Remediation is a version bump, not a suppression** -- prefer upgrading the affected package (or forcing
a patched transitive version through `pnpm.overrides`, as done for `vite`/`esbuild`/`postcss`).

**Waivers (documented not-applicable advisories).** A single advisory may be waived ONLY when the
vulnerable code path is provably unreachable in this codebase, via the `WAIVERS` table in
`scripts/audit-bulk.mjs`. A waiver is fail-closed and never a silent drop: it is keyed by GHSA id, must
name the affected package + the reason the path is unreachable + the real fix, and carries an **expiry**
after which it stops suppressing (forcing review). A waived advisory is still printed on every gate run;
an expired waiver, an unparseable expiry, or a package mismatch fails the gate. Current waivers:

- **`GHSA-qwww-vcr4-c8h2`** (`react-router`, High) -- an RSC-mode-only CSRF; the advisory states it "only
  affects your application if you are using the unstable RSC APIs". The Console is a Vite `BrowserRouter`
  SPA and imports no react-router RSC API, so the path is unreachable. The fix is `react-router@8.3.0`, a
  v7->v8 migration (`react-router-dom` is removed in v8); revisit at that upgrade (waiver expires
  2026-10-24).

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

## The Console-owned Rust projects (`sidecar/`, `enroll/`)

The AWS-LC crypto sidecar (`IP-CONSOLE-00-CRYPTO-SIDECAR`) and the ZTP enrollment client (`enroll/`,
`IP-CONSOLE-00-DEPLOY` D.3a-console) are standalone Rust crates, **not** npm dependencies and **not** in the
pnpm workspace, so they never enter the Node supply chain (the empty-runtime `dependencies` rule and the
install-script lockdown above are unaffected). Each is an installer-provisioned binary (`sidecar/deploy/`;
the enroll client is run once at provisioning).

Each mirrors the engine repos' Rust policy:

- **Pinned, committed lockfile** (`sidecar/Cargo.lock`, `enroll/Cargo.lock`) -- the exact dependency set and
  the SBOM source. Deps are pinned, minimal, and feature-scoped (e.g. `rcgen` is forced onto its `aws_lc_rs`
  backend so the enroll client stays on AWS-LC, not `ring`).
- **License allowlist + bans + sources** enforced by each project's `deny.toml` (`cargo deny check`) -- the
  same allowlist as the Console's npm policy (AGPL/GPL/LGPL denied), plus `OpenSSL` for the `aws-lc` FIPS
  module. The **only** allowed git source is the pinned CrucibleDB repo (the sidecar's `cdb-mtls` contract
  crate; the enroll client has none); every other git source and any crates.io `*` version fails the gate.
- **Advisories** via `cargo audit` (RustSec).
- All run as the `scripts/ci.sh` `[11] Rust projects` leg (network-gated, like the npm audit); CI provisions
  `cargo-deny`/`cargo-audit`. A release build emits each project's CycloneDX SBOM (`cargo-cyclonedx`)
  alongside the npm SBOM.
