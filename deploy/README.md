# Deploying the YouSource Console

The end-to-end install of the two-process Console (`IP-CONSOLE-00-DEPLOY`). `install.sh` lays down the
whole stack -- the AWS-LC **crypto sidecar**, the Node **BFF**, and the ZTP-enrolled **engine identity** --
and self-checks. It ties together the per-component pieces:

- **D.1** the BFF unit (`apps/bff/deploy/`).
- **D.2** the sidecar admin cert + config (`sidecar/deploy/provision-sidecar.sh`).
- **D.3a-console** the ZTP enrollment client (`enroll/`, the `console-enroll` binary).

```
browser =[TLS 1.3 hybrid PQC / P-384 floor]=> sidecar :8443 (node IP) --loopback--> BFF admin http
BFF --loopback--> sidecar egress =[mTLS: cdb-mtls, the ENROLLED engine identity]=> engine :7878
```

The engine identity is **ZTP-enrolled** (operator MFA + step-ca + AIG registration), so the engine's
enrolled-role grant admits it with `[Data, Delegation]`. The key is **software** (the sidecar reads it as a
PEM); the AWS-LC posture is unchanged. Hardware-bound custody is the parked `IP-CONSOLE-00-SIDECAR-TPM`.

## What `install.sh` does

1. **Service users** `console-sidecar`, `console-bff` (system, non-login).
2. **Binaries** `console-crypto-sidecar` + `console-enroll` into `/usr/local/bin`, the built BFF into
   `/usr/local/lib/console-bff`.
3. **Sidecar provisioning** (D.2): the admin P-384 leaf + `config.json`, engine cert/key paths aligned to
   the enrollment output.
4. **Enrollment** (D.3a-console): runs `console-enroll` -- **the one interactive step: the operator approves
   the printed device code (MFA)** -- which mints the engine cert + key the sidecar presents. Skipped when
   an identity is already present, or with `CONSOLE_SKIP_ENROLL=1`.
5. **Config + units**: the BFF `config.env`, both systemd units, enabled + started.
6. **Validate** (`validate.sh`): the CS.N proofs as an install gate (both units up, `/readyz` green through
   the enrolled engine leg, the admin P-384 floor admitted + the sub-floor refused). A red leg aborts.

## Running

Provide the built binaries + the enrollment config, then:

```bash
sudo CONSOLE_NODE_IP=10.0.0.5 \
     CONSOLE_BIN_DIR=/path/to/built/bins \
     CONSOLE_BFF_DIST=/path/to/apps/bff/dist-bundle \
     CONSOLE_ENROLL_ENV=/etc/console-enroll/config.env \
     deploy/install.sh
```

The enrollment env is `deploy/console-enroll.env.example` (the IdP device-code client -- **DPoP must be
enabled**, since a software key admits only via a `cnf`-bound token -- the node enroll address + pinned
enroll-CA, and the `console-bff` FQDN). The operator's IdP group must map to the `operator` AdminRole
(`CDB_ENROLL_GROUP_ROLES`) and the node must grant that role `[Data, Delegation]`
(`CDB_WIRE_ROLE_GRANTS='operator=data,delegation'`) for the delegated-read path.

## Re-running

Idempotent where the steps are: an existing engine identity is kept (remove the cert/key to re-enroll, each
device code is single-use). `validate.sh` is safe to run standalone (`sudo CONSOLE_NODE_IP=... deploy/validate.sh`).
