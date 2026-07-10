# IP-CONSOLE-00-DEPLOY -- the Console is installer-provisioned (no manual stitching)

**Status:** OPEN (authored 2026-07-10). A third implementation plan under `TRD-CONSOLE-00` (with
`IP-CONSOLE-00-FOUNDATION` and `IP-CONSOLE-00-CRYPTO-SIDECAR`). It makes the whole Console stack -- the
Node **BFF** + the AWS-LC **crypto sidecar** -- come up on a fresh box **from the installer**, with every
certificate, config file, engine grant, and systemd unit **provisioned automatically**. Nothing that made
the Phase-0 live proofs work may remain a manual command.

Read with `IP-CONSOLE-00-CRYPTO-SIDECAR` (the two-process topology + `deploy/`), the crdb node installer
(`crdb deploy/cdb-install/`, the engine-side counterpart), and `TRD-CONSOLE-00` Sections 2 + 8.

---

## 1. Why this plan exists (the rule that forces it)

Standing rule (product owner, 2026-07-10): **every live-proof "stitching" must land in production code /
the installer, not manual scratchpad, so it re-executes when we move boxes.** The platform is torn down and
rebuilt on fresh hardware regularly; a wiring that only works because someone ran a one-off command by hand
is not done -- on the next box it silently does not execute.

Phase 0 is functionally complete and **proven live**, but several proofs were stitched by hand. This IP is
the debt paydown: each manual step below gets a durable home, and the exit is a clean-box install that
reproduces the entire CS.N capstone with zero hand steps.

### The manual-stitching inventory (what CS.N / F0.5c did by hand -> the production home)

| Manual step in the live proof | Production home (this IP) |
|-------------------------------|---------------------------|
| Ran `node apps/bff/dist/index.js` with env by hand | **D.1** BFF systemd unit + `/etc/console-bff/` env config |
| Hand-wrote the sidecar `config.json` in scratchpad | **D.2** installer generates `/etc/console-sidecar/config.json` |
| `openssl`-minted the admin P-384 leaf by hand | **D.2** installer provisions the admin-plane leaf (P-384/RSA-3072) |
| Reused a scratchpad `console-bff` wire cert | **D.3** the Console engine identity is enrolled/provisioned (not a stray file) |
| Added the `console-bff` wire peer grant with a throwaway Rust bin | **D.3** the grant is authored by the engine installer (`CDB_WIRE_ENROLL`) or a supported Day-2 edit (INV-CROSS, crdb) |
| Started both processes by hand, checked ports | **D.4** the installer enables both units; a post-install self-check runs the round-trip |

## 2. Objective, invariant, exit

**Objective.** A wiped box, rebuilt from the installer, brings up the whole Console stack -- BFF + sidecar,
both TLS legs, the engine grant -- with no manual step, and the CS.N capstone passes against the
installer-provisioned artifacts.

**Named invariant -- `INV-CONSOLE-DEPLOY-REPRODUCIBLE`.** No Console runtime wiring exists only as a manual
command: (a) both processes are systemd units the installer enables; (b) every cert + config file is
installer-generated into its owned, mode-restricted path; (c) the engine-side `console-bff` wire peer grant
is authored by a committed, re-runnable mechanism (never an ad-hoc bin); (d) a post-install self-check
proves both legs (admin `:8443` floor + engine `:7878` round-trip via `/readyz`) and fails the install if
either is down.

**Exit criteria.**
- The installer provisions and enables `console-bff.service` + `console-crypto-sidecar.service`; both start
  on boot and restart on failure.
- On a clean box, an operator can reach the admin plane on `node-IP:8443` (hybrid PQC + P-384 floor) and
  `/readyz` is green (BFF -> sidecar -> engine mTLS `:7878`), with Node holding no key and running no TLS --
  **all from provisioned artifacts, no hand steps.**
- The `console-bff` engine identity + wire peer grant `[data, delegation]` are provisioned by the committed
  path chosen in D.3; a fresh engine install admits the Console without a manual `node.cbor` edit.
- A `deploy/`-level self-check script reproduces the CS.N proofs and is run by the installer's validate
  phase.

## 3. Roster

Each row is a branch-per-PR through the gate, a named acceptance, and its tests/proof.

| Step | Deliverable | Repo | Notes |
|------|-------------|------|-------|
| **D.1** | **BFF service.** `apps/bff/deploy/`: a hardened `console-bff.service` (dedicated non-root user, `ReadOnlyPaths`, no caps) + a `config.example.env` (the `FC_*` env, engine host/port = the sidecar egress loopback, admin upstream = the BFF http) + a deploy README with the two-process topology. Mirrors the sidecar's CS.5 deploy dir. | ForgeCentral | Self-contained; decision-independent. |
| **D.2** | **Sidecar + admin-cert provisioning.** A committed provisioning script that (a) generates the sidecar `config.json` from the node IP + the loopback ports, (b) provisions the admin-plane leaf (P-384 or RSA-3072, node-IP + admin-DNS SAN), (c) installs both units. Turns the scratchpad `openssl` steps into a re-runnable script under `deploy/`. | ForgeCentral | Self-contained. |
| **D.3** | **The Console engine identity + wire peer grant (INV-CROSS).** The `console-bff` wire client cert is provisioned and the engine admits its fingerprint with the `[data, delegation]` planes -- by a committed mechanism, not a throwaway bin. **Open decision (Section 4).** | crdb (+ForgeCentral hook) | The cross-repo piece; needs the product owner's call. |
| **D.4** | **End-to-end installer + productionized capstone.** An installer entrypoint that lays down both processes from D.1/D.2 (+ the D.3 identity) and a `validate` self-check that runs the CS.N proofs (admin floor + `/readyz` round-trip) and fails the install on a red leg. Then the full stitched run (operator OIDC login -> delegated tenant-scoped read through the sidecar -> engine) executed from provisioned artifacts on a clean box. | ForgeCentral (+crdb install hook) | The capstone; depends on D.1-D.3. |

## 4. The one open decision (D.3): how the Console gets its engine identity

The `console-bff` must present a wire client cert that (a) chains to the engine's Wire CA and (b) is
admitted as a wire peer with the `[data, delegation]` planes, in the operator's tenant. Three grounded
options (crdb facts: the installer's `50-config.sh` enrolls wire peers via `cdb-mkconfig`
`CDB_WIRE_ENROLL='fp=tenant=clearance=planes'`; `cdb-config-edit` overlays cognition only, not wire peers):

- **A. ZTP enrollment (platform-native).** The Console enrolls like a torch device through the enrollment
  service; it receives a Wire-CA-chained cert and rotation for free, and the engine admits ZTP-chained
  leaves on `:7878`. Most production-faithful; heaviest to wire (the Console runs the enrollment client).
- **B. Engine-installer enroll (`CDB_WIRE_ENROLL`).** The crdb installer authors the `console-bff`
  fingerprint into `node.cbor` at install time (the Console publishes its cert/FP to the engine install).
  Simple and already the mechanism for `cdb-wire-client`; couples the Console cert to engine-install time.
- **C. Extend `cdb-config-edit` for a Day-2 wire-peer overlay.** A supported surgical add-a-wire-peer to an
  already-installed node (mirrors its cognition overlay). Best for adding the Console to an existing engine
  without a full reconfig; a small crdb feature.

Recommendation: **A (ZTP)** as the north star (identity + rotation the platform way), with **C** as the
pragmatic Day-2 bridge so the Console can be added to a running node now. B is the minimal fallback.

### Decision (product owner, 2026-07-10): **A -- ZTP enrollment.**

The Console acquires its wire identity through the platform enrollment service, exactly like a torch edge
device: it gets a ZTP-CA-chained leaf (+ rotation), and the engine admits it on `:7878` via the existing
`admit_wire_peer` path (an enrolled device is admitted by ZTP-CA chain, not a static `wire.peers` entry).

Grounded scope (from the torch ZTP program + crdb enrolled-device grant, `[[torch-ztp-enrollment]]`):

- **D.3a -- the Console enrollment client.** The `console-bff` (or its provisioner) runs the enrollment
  flow, yielding a ZTP-CA-chained wire cert the sidecar presents on the engine leg. **Device-identity
  decision (product owner, 2026-07-10): full TPM attestation (torch-style)** -- the Console enrolls with a
  real vTPM device key + operator MFA + hardware attestation + node-established binding + step-ca mint,
  exactly like a torch edge device. **Reuse, do not reimplement:** the torch installer's `30-enroll.sh`
  already drives `torch-enroll` interactively (operator MFA device code) with a `TORCH_PROPOSED_FQDN` + EK
  cert against the bootstrap addr, producing `device.pem` (the ZTP-CA identity). D.3a is a Console enroll
  step that invokes that same client with a distinct `console-bff` FQDN, producing the wire cert the sidecar
  points `engine_cert`/`engine_key` at. The live enrollment is **operator-MFA-gated** (a human step, as in
  the F0.5a / ZTP capstones).
- **D.3b -- the engine grants the enrolled Console `[Data, Delegation]` (crdb, INV-CROSS).** Grounded
  finding: `wire.enrolled_device_grant` (`config.rs`, `default_enrolled_device_grant`) is a **single global
  default** applied to *every* admitted enrolled device (today `[Data, Agent, Cognition, Otlp]`). Flipping
  it to `[Data, Delegation]` is wrong twice over -- it would strip torch's planes AND widen `Delegation` to
  every enrolled device. So D.3b is a real, security-sensitive crdb change: a **per-identity (or enrolled-
  role) grant override** so the `console-bff` fingerprint/FQDN resolves to `[Data, Delegation]` while every
  other enrolled device keeps the global default. Least-privilege, fail-closed, minimal-change, reviewed
  with the maintainer (the crdb min-change + never-weaken rules). Buildable + hermetically testable without
  live MFA; it is the crux cross-repo PR (crdb repo, its own naming/gate).
- **D.3c -- live proof, productionized.** The installer runs the enrollment during provisioning; the
  sidecar's `engine_cert`/`engine_key` point at the enrolled material; the CS.N engine-leg round-trip passes
  with the ZTP identity (replacing the F0.3b hand-minted `console-bff` cert), and rotation is wired.

D.3 is therefore a multi-PR sub-program spanning ForgeCentral (the enrollment client + sidecar wiring) and
crdb (the `Delegation`-capable enrolled grant). It is sequenced after D.2 and pinned by the device-identity
sub-decision in D.3a.

## 5. Cadence

One PR at a time, branch-per-PR through `scripts/ci.sh`, no-ff merge, docs separate from code. D.1 and D.2
are self-contained ForgeCentral PRs and can land first. D.3 is a crdb PR (its own repo naming/gate) plus a
ForgeCentral hook; it is gated on the Section-4 decision. D.4 depends on D.1-D.3. Each PR names its slice
of `INV-CONSOLE-DEPLOY-REPRODUCIBLE` and proves it (a unit lints/loads; a provisioning script is idempotent
and produces a valid config; the self-check runs the CS.N proofs).
