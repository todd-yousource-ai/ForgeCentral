# Deploying the YouSource Console

The end-to-end install of the two-process Console (`IP-CONSOLE-00-DEPLOY`). `install.sh` lays down the
whole stack -- the AWS-LC **crypto sidecar**, the Node **BFF** (which serves the SPA + the API), and the
**software Console-CA engine identity** -- and self-checks. It ties together the per-component pieces:

- **D.1** the BFF unit (`apps/bff/deploy/`).
- **D.2** the sidecar admin cert + config (`sidecar/deploy/provision-sidecar.sh`).
- **Control-plane engine identity** the node installer mints the software Console-CA leaf; `install.sh`
  delivers it (no separate enrollment client). See `IP-CONSOLE-CONTROL-PLANE.md`.

## Topology (Console + Crucible on the same box)

The Console runs on the **same node as Crucible** (the engine). The operator's browser is remote; the
engine leg is loopback.

```
operator browser =[TLS 1.3 hybrid PQC / P-384 floor]=> sidecar node-IP:8443 --loopback--> BFF (SPA + API)
BFF --loopback plaintext--> sidecar egress =[mTLS, software P-384]=> control plane 127.0.0.1:7879  (same box)
```

The engine identity is the permanent **software Console-CA leaf** the node installer generates for the
dedicated `:7879` control plane (IP-CONSOLE-CONTROL-PLANE D2): a long-lived (10y, admin-rotated) P-384 key
at `/etc/cdb/control/client.key`, pinned as an all-planes static wire peer. `install.sh` copies that leaf
into the sidecar's cert dir and the sidecar signs the engine-leg handshake **in-process** -- **no operator
MFA, no ZTP, no TPM**. Software (not TPM) is deliberate (D2): it decouples the Console identity from the
box TPM so it never collides with a TPM-resident Torch edge. The retired ZTP/TPM `console-enroll` path is
gone.

Because the Console and the engine share a host, the security boundary is the **engine's per-peer
authorization**, not a network gap: the Console's pinned peer holds its grant on the dedicated control
plane, and tenant isolation bounds a Console compromise. Keep customer torch **edge** agents off this box;
torch runs on the endpoints it governs, not on the operator's Crucible+Console node.

## What `install.sh` does

1. **Service users** `console-sidecar`, `console-bff` (system, non-login).
2. **Binaries** `console-crypto-sidecar` into `/usr/local/bin`; the built BFF into
   `/usr/local/lib/console-bff`; the built SPA (`apps/console/dist`) where `FC_SPA_DIST` points.
3. **Sidecar provisioning** (D.2): the admin P-384 leaf + `config.json` (engine_cert/engine_key = the
   software Console-CA leaf on the `:7879` control plane).
4. **Engine identity delivery**: copies the node installer's software Console-CA leaf
   (`ca.pem`/`client.pem`/`client.key` from `/etc/cdb/control`, override with `CONSOLE_CONTROL_SRC`) into
   the sidecar's cert dir -- **no MFA, no ZTP, no TPM**; the leaf is a permanent pinned identity. Skipped
   when an identity is already present, or with `CONSOLE_SKIP_ENROLL=1`.
5. **Config + units**: the BFF `config.env`, both systemd units, enabled + started.
6. **Validate** (`validate.sh`): the install gate (both units up, `/readyz` green through the TPM-signed
   engine leg, the admin P-384 floor admitted + the sub-floor refused). A red leg aborts.

## Running

Provide the built binaries + the enrollment config, then:

```bash
sudo CONSOLE_NODE_IP=10.0.0.5 \
     CONSOLE_BIN_DIR=/path/to/built/bins \
     CONSOLE_BFF_DIST=/path/to/apps/bff/dist-bundle \
     CONSOLE_ENROLL_ENV=/etc/console-enroll/config.env \
     deploy/install.sh
```

The enrollment env is `deploy/console-enroll.env.example` (the IdP device-code client, the node enroll
listener `:7443` + its pinned enroll-CA, the TPM `TCTI`, the device **EK cert**, and the **attestation
nonce** = the node's `attestation_nonce_b64u`). DPoP is **not** required (the TPM key binds the token via
attestation). For the delegated-read path, the operator's IdP group must map to the `operator` AdminRole
(`CDB_ENROLL_GROUP_ROLES`) and the node must grant that role `[Data, Delegation]`
(`CDB_WIRE_ROLE_GRANTS='operator=data,delegation'`, i.e. `wire.enrolled_role_grants`).

## Browsing the Console (`:8443`)

The BFF serves the built SPA behind the admin plane (`FC_SPA_DIST` -> `apps/console/dist`), so once the
stack is up the operator browses to **`https://<node-IP>:8443`**:

1. the sidecar terminates the browser TLS (hybrid PQC / P-384 floor) and forwards to the BFF;
2. the BFF serves the SPA (and its same-origin `/auth/*` + engine-brokered API);
3. the operator signs in via the OIDC **device flow** (the login screen shows a code + URL, same MFA as
   enrollment); the session cookie persists, so subsequent reloads land straight in the shell.

Auth requires the BFF `FC_OIDC_*` block set; without it the SPA renders but the login cannot complete. With
`FC_SPA_DIST` unset the BFF is API-only (no UI).

## Re-running

Idempotent where the steps are: an existing engine identity (the leaf cert) is kept -- remove it to
re-enroll (each device code is single-use). `provision-sidecar.sh` keeps an existing admin cert unless
`FORCE=1`. `validate.sh` is safe to run standalone (`sudo CONSOLE_NODE_IP=... deploy/validate.sh`).
