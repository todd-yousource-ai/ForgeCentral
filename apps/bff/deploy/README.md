# Deploying the Console BFF

The Console runs as **two processes** on the node: this Node **BFF** and the AWS-LC **crypto sidecar**
(`sidecar/deploy/`). The BFF performs **no TLS**: it speaks plaintext over loopback to the sidecar in both
directions, and the sidecar owns every handshake (`INV-CONSOLE-CRYPTO-AWSLC`). The BFF owns no durable data
(`INV-CONSOLE-NO-2ND-DB`); Crucible is the sole system of record.

```
browser =[TLS 1.3 hybrid PQC / P-384 floor]=> sidecar :8443 (node IP)
                                    --loopback--> BFF admin http (FC_HTTP_PORT)
BFF --loopback--> sidecar egress (FC_ENGINE_PORT) =[mTLS: cdb-mtls]=> engine :7878
```

## What the installer provisions

1. **The built BFF** at `/usr/local/lib/console-bff/` (the `apps/bff` `dist/` output + its production
   `node_modules`). The platform `node` (>= 22) is the runtime.
2. **A dedicated non-root user** `console-bff` that owns nothing writable at runtime.
3. **`/etc/console-bff/config.env`** (from `config.example.env`): the `FC_*` environment. The engine host
   is the sidecar egress on loopback (`FC_ENGINE_HOST` is refused if routable); `FC_HTTP_PORT` is the
   sidecar's `admin_upstream`. The OIDC + RBAC block enables operator auth.
4. **The unit** `console-bff.service` (see the file), enabled to start on boot after the sidecar.

## Running

```bash
install -m 0644 apps/bff/deploy/console-bff.service /etc/systemd/system/
install -d -m 0755 /etc/console-bff
install -m 0640 apps/bff/deploy/config.example.env /etc/console-bff/config.env   # then edit
systemctl daemon-reload
systemctl enable --now console-bff
```

The unit runs unprivileged and read-only with a private tmp; it needs no capabilities (its ports are
unprivileged and it writes nothing). See `console-bff.service`.

## Pairing with the sidecar

`FC_ENGINE_PORT` must equal the sidecar's `egress_addr` port, and the sidecar's `admin_upstream` must be
`127.0.0.1:FC_HTTP_PORT`. The full two-process provisioning + the post-install self-check (the CS.N proofs)
is `IP-CONSOLE-00-DEPLOY` D.2 / D.4; this directory is the BFF's D.1 half.
