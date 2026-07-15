#!/usr/bin/env bash
# provision-sidecar.sh -- provision the Console crypto sidecar's config + admin-plane cert
# (IP-CONSOLE-00-DEPLOY D.2). Idempotent: safe to re-run; it only (re)generates what is missing unless
# FORCE=1. It turns the CS.N hand steps (openssl-minted admin leaf + a hand-written config.json) into a
# committed, re-runnable script so a box move re-executes it (INV-CONSOLE-DEPLOY-REPRODUCIBLE).
#
# It provisions the ADMIN leg (the :8443 server cert) and writes the sidecar config. The ENGINE leg
# identity (engine_cert/engine_key = the software Console-CA leaf on the :7879 control plane,
# IP-CONSOLE-CONTROL-PLANE D2) is only referenced here. Installing the systemd units + enabling them is the
# installer's job (D.4); this script prints the follow-up commands.
#
# Usage (env-configured; all have sane defaults except the engine cert paths):
#   NODE_IP=10.0.0.5 \
#   ENGINE_CA=/etc/console-sidecar/engine-ca.pem \
#   ENGINE_CERT=/etc/console-sidecar/engine-client.pem \
#   sidecar/deploy/provision-sidecar.sh
set -euo pipefail

# ---- inputs (env, with defaults) -----------------------------------------------------------------
OUT_DIR="${OUT_DIR:-/etc/console-sidecar}"
NODE_IP="${NODE_IP:-}"
ADMIN_PORT="${ADMIN_PORT:-8443}"
ADMIN_DNS="${ADMIN_DNS:-console-admin.localhost}"
BFF_HTTP_PORT="${BFF_HTTP_PORT:-8787}"          # the BFF admin http (the sidecar admin_upstream)
EGRESS_PORT="${EGRESS_PORT:-8789}"              # the sidecar egress the BFF dials (loopback)
# Default to the dedicated Console/Control plane (IP-CONSOLE-CONTROL-PLANE): a permanent software P-384
# identity on :7879, separate from the ZTP wire seam. ENGINE_KEY (a software key) selects the software
# path; the certs are the Console-CA leaf the node installer generates, copied into OUT_DIR by install.sh.
ENGINE_ADDR="${ENGINE_ADDR:-127.0.0.1:7879}"
ENGINE_SERVERNAME="${ENGINE_SERVERNAME:-control.localhost}"
ENGINE_CA="${ENGINE_CA:-$OUT_DIR/engine-ca.pem}"
ENGINE_CERT="${ENGINE_CERT:-$OUT_DIR/engine-client.pem}"
ENGINE_KEY="${ENGINE_KEY:-$OUT_DIR/engine-client.key}"
SIDECAR_USER="${SIDECAR_USER:-console-sidecar}"
FORCE="${FORCE:-0}"

die() { echo "provision-sidecar: $*" >&2; exit 1; }

[ -n "$NODE_IP" ] || die "NODE_IP is required (the node's own IP; the admin leg binds it, never a wildcard)"
command -v openssl >/dev/null 2>&1 || die "openssl not found"

mkdir -p "$OUT_DIR"
ADMIN_KEY="$OUT_DIR/admin-key.pem"
ADMIN_CERT="$OUT_DIR/admin-cert.pem"

# ---- admin-plane leaf: ECDSA P-384 (CNSA-1.0 classical), SAN = node IP + admin DNS -------------------
# A self-signed P-384 leaf is the provisioning default; in a federal deployment supply an org-CA-signed
# CNSA-grade cert instead (P-384 or RSA-3072) by pre-placing admin-cert.pem/admin-key.pem and re-running
# (this step is skipped when both exist and FORCE!=1).
if [ "$FORCE" = "1" ] || [ ! -f "$ADMIN_CERT" ] || [ ! -f "$ADMIN_KEY" ]; then
    echo "provision-sidecar: minting admin-plane P-384 leaf (SAN IP:$NODE_IP, DNS:$ADMIN_DNS)"
    tmpkey="$(mktemp)"
    openssl ecparam -name secp384r1 -genkey -noout -out "$tmpkey"
    openssl pkcs8 -topk8 -nocrypt -in "$tmpkey" -out "$ADMIN_KEY"
    rm -f "$tmpkey"
    ext="$(mktemp)"
    cat > "$ext" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = console-admin
[v3]
subjectAltName = @alt
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt]
IP.1 = $NODE_IP
DNS.1 = $ADMIN_DNS
EOF
    openssl req -new -x509 -key "$ADMIN_KEY" -out "$ADMIN_CERT" -days 365 -config "$ext" -extensions v3
    rm -f "$ext"
    chmod 0600 "$ADMIN_KEY"
    chmod 0644 "$ADMIN_CERT"
else
    echo "provision-sidecar: admin leaf present, keeping it (FORCE=1 to re-mint)"
fi

# ---- the sidecar config ---------------------------------------------------------------------------
CONFIG="$OUT_DIR/config.json"
echo "provision-sidecar: writing $CONFIG"
cat > "$CONFIG" <<EOF
{
  "admin_bind_ip": "$NODE_IP",
  "admin_port": $ADMIN_PORT,
  "admin_upstream": "127.0.0.1:$BFF_HTTP_PORT",
  "engine_addr": "$ENGINE_ADDR",
  "engine_servername": "$ENGINE_SERVERNAME",
  "engine_ca": "$ENGINE_CA",
  "engine_cert": "$ENGINE_CERT",
  "engine_key": "$ENGINE_KEY",
  "egress_addr": "127.0.0.1:$EGRESS_PORT",
  "admin_cert": "$ADMIN_CERT",
  "admin_key": "$ADMIN_KEY"
}
EOF
chmod 0644 "$CONFIG"

# Own the material by the service user when it exists (the installer creates it; skip if absent/no root).
if id "$SIDECAR_USER" >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    chown -R "$SIDECAR_USER":"$SIDECAR_USER" "$OUT_DIR"
fi

echo "provision-sidecar: OK. config + admin leaf in $OUT_DIR"
echo "provision-sidecar: engine identity = the software Console-CA leaf (engine_cert + engine_key) on the :7879 control plane (install.sh copies it from the node's /etc/cdb/control)."
echo "provision-sidecar: next -> install + enable the units:"
echo "    install -m0644 sidecar/deploy/console-crypto-sidecar.service /etc/systemd/system/"
echo "    install -m0644 apps/bff/deploy/console-bff.service            /etc/systemd/system/"
echo "    systemctl daemon-reload && systemctl enable --now console-crypto-sidecar console-bff"
