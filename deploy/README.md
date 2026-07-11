# Deploying the YouSource Console

The end-to-end install of the two-process Console (`IP-CONSOLE-00-DEPLOY`). `install.sh` lays down the
whole stack -- the AWS-LC **crypto sidecar**, the Node **BFF** (which serves the SPA + the API), and the
**TPM-enrolled engine identity** -- and self-checks. It ties together the per-component pieces:

- **D.1** the BFF unit (`apps/bff/deploy/`).
- **D.2** the sidecar admin cert + config (`sidecar/deploy/provision-sidecar.sh`).
- **D.3a-console** the ZTP enrollment client (`enroll/`, the `console-enroll` binary).

## Topology (Console + Crucible on the same box)

The Console runs on the **same node as Crucible** (the engine). The operator's browser is remote; the
engine leg is loopback.

```
operator browser =[TLS 1.3 hybrid PQC / P-384 floor]=> sidecar node-IP:8443 --loopback--> BFF (SPA + API)
BFF --loopback plaintext--> sidecar egress =[mTLS, TPM-signed]=> engine 127.0.0.1:7878  (same box)
```

The engine identity is **ZTP-enrolled to the TPM** (operator MFA + step-ca + AIG registration): the private
key is **non-exportable and TPM-resident** -- `console-enroll` writes only the leaf cert, and the sidecar
**re-derives the same deterministic TPM key at runtime** and signs the engine-leg handshake **in the
device** (`cdb_device_identity::tpm_mtls_client_config`). There is no key file. The node's
`require_attestation` stays enforced (the Console attests like a torch edge device); the AWS-LC posture is
unchanged. See `IP-CONSOLE-00-SIDECAR-TPM.md`.

Because the Console and the engine share a host, the security boundary is the **engine's per-peer
authorization**, not a network gap: the Console's enrolled peer holds a least-privilege grant
(`[Data, Delegation]`, not god-mode), and tenant isolation bounds a Console compromise to that grant. Keep
customer torch **edge** agents off this box (one vTPM = one device identity); torch runs on the endpoints
it governs, not on the operator's Crucible+Console node.

## What `install.sh` does

1. **Service users** `console-sidecar`, `console-bff` (system, non-login).
2. **Binaries** `console-crypto-sidecar` + `console-enroll` into `/usr/local/bin`; the built BFF into
   `/usr/local/lib/console-bff`; the built SPA (`apps/console/dist`) where `FC_SPA_DIST` points.
3. **Sidecar provisioning** (D.2): the admin P-384 leaf + `config.json` (engine_cert = the enrolled leaf,
   `tcti` = the host TPM; no key file).
4. **Enrollment** (D.3a-console): runs `console-enroll` -- **the one interactive step: the operator
   approves the printed device code (MFA)** -- which attests the TPM identity and writes the minted leaf
   the sidecar presents. Skipped when an identity is already present, or with `CONSOLE_SKIP_ENROLL=1`.
5. **Config + units**: the BFF `config.env`, both systemd units (the sidecar unit carries
   `DeviceAllow=/dev/tpmrm0` + `SupplementaryGroups=tss`), enabled + started.
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
