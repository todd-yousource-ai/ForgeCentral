# Deploying the Console crypto sidecar

The Console runs as **two processes** on the node: the Node **BFF** and this **AWS-LC crypto sidecar**.
Every Console TLS boundary is terminated or originated by the sidecar (`rustls` + `aws-lc-rs`, FIPS); the
BFF performs no TLS and speaks plaintext over **loopback** to the sidecar in both directions
(`INV-CONSOLE-CRYPTO-AWSLC`). Nothing that leaves the host is unencrypted.

```
browser =[TLS 1.3: X25519MLKEM768 / P-384 floor; aws-lc-rs]=> sidecar :8443 (node IP)
                                                    --loopback--> BFF admin http (admin_upstream)
BFF --loopback--> sidecar egress (egress_addr) =[mTLS: cdb-mtls profile; aws-lc-rs]=> engine :7878
```

## What the installer provisions

1. **The binary** at `/usr/local/bin/console-crypto-sidecar` (built from `sidecar/`, an offline release
   build; the pinned dependency set is `sidecar/Cargo.lock`).
2. **A dedicated non-root user** `console-sidecar` that owns the config + certificate material.
3. **`/etc/console-sidecar/config.json`** (see `config.example.json`) with:
   - `admin_bind_ip` -- the node's own IP (never a wildcard; the sidecar refuses a widened bind).
   - `admin_upstream` / `egress_addr` -- the loopback `ip:port` hops to/from the BFF (must be loopback).
   - `engine_addr` / `engine_servername` -- the engine wire gateway and the name in its server cert.
   - the two certificate pairs (below).
4. **The admin-plane leaf** (`admin_cert` / `admin_key`): a CNSA-1.0-grade server certificate (P-384 or
   RSA-3072) for the browser-facing `:8443` listener.
5. **The engine client identity** (`engine_ca` / `engine_cert` / `engine_key`): the Console's enrolled wire
   mTLS material the sidecar presents to `:7878`, plus the wire CA.

The BFF is configured with `FC_ENGINE_HOST` / `FC_ENGINE_PORT` pointing at the sidecar's `egress_addr`
(loopback; the BFF refuses a routable engine host), and its admin HTTP listener is the sidecar's
`admin_upstream`.

## Running

```bash
install -m 0755 target/release/console-crypto-sidecar /usr/local/bin/
install -m 0644 sidecar/deploy/console-crypto-sidecar.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now console-crypto-sidecar
```

The unit runs unprivileged (8443 and the loopback ports are all unprivileged), read-only, with an empty
capability set. See `console-crypto-sidecar.service`.

## Local-capture posture

The BFF <-> sidecar loopback hops are cleartext but on-box only (`127.0.0.1`, never a routable interface),
so there is no off-host exposure. On-host capture requires `root`/`CAP_NET_RAW`, which already owns the
process memory and keys. See `IP-CONSOLE-00-CRYPTO-SIDECAR.md` Section 9 for the full threat model (a
Unix-domain-socket hardening of these hops is recorded there as future work).
