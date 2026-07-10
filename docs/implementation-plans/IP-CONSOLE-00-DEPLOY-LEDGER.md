# IP-CONSOLE-00-DEPLOY -- landing ledger

Per-PR landing record for `IP-CONSOLE-00-DEPLOY.md` (the Console is installer-provisioned; no live-proof
stitching remains manual). One PR per roster row, a named slice of `INV-CONSOLE-DEPLOY-REPRODUCIBLE`, the
full `scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge, push to `origin`, docs separate
from code. Reviewed with the maintainer before each merge.

Status: **D.1 LANDED (BFF service artifacts). D.2 next (sidecar config + admin-cert provisioning, self-
contained). D.3 (the Console engine identity + wire peer grant) BLOCKED on the Section-4 decision (crdb
INV-CROSS). D.4 (end-to-end installer + productionized CS.N self-check) depends on D.1-D.3.**

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| D.1 | INV-CONSOLE-DEPLOY-REPRODUCIBLE (BFF process) | LANDED (review) | (this PR) | `apps/bff/deploy/`: `console-bff.service` (hardened systemd unit -- dedicated non-root `console-bff` user, `EnvironmentFile=/etc/console-bff/config.env`, `ExecStart` the platform node on the built BFF, `After=console-crypto-sidecar.service`, no caps, `ProtectSystem=strict`, `ReadOnlyPaths`, private tmp) + `config.example.env` (the `FC_*` env: `FC_HTTP_PORT` = the sidecar `admin_upstream`, `FC_ENGINE_HOST/PORT` = the sidecar egress loopback, the optional OIDC+RBAC block, `FC_SESSION_COOKIE_SECURE=true`) + a deploy README with the two-process topology + install steps. Turns the CS.N "ran node with env by hand" step into an installer-provisioned unit. Mirrors the sidecar's CS.5 deploy dir. `systemd-analyze verify` clean (bar the node/app paths that only exist post-install). Full `scripts/ci.sh --skip-sidecar` green. |
| D.2 | INV-CONSOLE-DEPLOY-REPRODUCIBLE (sidecar config + admin cert) | OPEN | -- | A committed, idempotent provisioning script: generate the sidecar `config.json` from the node IP + loopback ports; provision the admin-plane P-384 (or RSA-3072) leaf (node-IP + admin-DNS SAN); install both units. Replaces the scratchpad `openssl` + hand-written config. |
| D.3 | INV-CONSOLE-DEPLOY-REPRODUCIBLE (engine identity + grant) | DECIDED = ZTP; sub-plan open | -- | **Decision (product owner 2026-07-10): ZTP enrollment.** The Console enrolls like a torch edge device (ZTP-CA-chained leaf + rotation), admitted on `:7878` via `admit_wire_peer`. Split: **D.3a** the Console enrollment client (reuse the torch enrollment stack; pin the device-identity story for a co-located service); **D.3b** crdb grants the enrolled Console `[Data, Delegation]` (the default enrolled grant is `[Data,Agent,Cognition,Otlp]`, NOT Delegation -- a real least-privilege crdb change, INV-CROSS); **D.3c** installer runs enrollment + the sidecar uses the enrolled cert + the CS.N engine leg passes with the ZTP identity + rotation. Multi-PR, cross-repo. See IP Section 4. |
| D.4 | INV-CONSOLE-DEPLOY-REPRODUCIBLE (end to end) | OPEN | -- | Installer entrypoint that lays down both processes (+ the D.3 identity) and a `validate` self-check that runs the CS.N proofs (admin floor + `/readyz` round-trip) and fails the install on a red leg; then the full stitched run from provisioned artifacts on a clean box. Depends on D.1-D.3. |
