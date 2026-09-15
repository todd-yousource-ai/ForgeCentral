#!/usr/bin/env bash
# deploy/uninstall.sh -- reverse deploy/install.sh, so the installer can be proven from a clean box.
#
# Removes exactly what install.sh authors and nothing else: the two units, the deployed binary and BFF
# tree, both /etc config dirs (admin leaf, engine leaf copy, signing seed + anchor, BFF config.env), and
# the two service users. A rebuild that inherits yesterday's state proves nothing (the crucible
# cdb-wipe.sh rationale), so an install validated from clean starts here.
#
# KEPT, deliberately:
#   * /etc/cdb/control (the node installer's software Console-CA leaf) -- crucible owns it.
#   * /etc/cdb/secrets (the IdAM connector secret an OPERATOR entered through the Console, ID.4) --
#     data, not deployment state. --with-secrets takes it too.
#   * The console peer pin in /etc/cdb/node.cbor: the engine identity is the SAME control-plane leaf on
#     every install, so the pin is re-asserted unchanged by the next install.sh ([4b] is idempotent);
#     there is no unpin primitive and a stale pin admits nothing without the key.
#   * The repo's build outputs (.bff-deploy/, dist/): the owner's, rebuilt by install.sh.
#
# Usage (as root):
#   sudo deploy/uninstall.sh              # DRY RUN: print what would go, change nothing
#   sudo deploy/uninstall.sh --yes        # do it
#   sudo deploy/uninstall.sh --yes --with-secrets
set -euo pipefail
die() { echo "uninstall: $*" >&2; exit 1; }
log() { echo "==> $*"; }

DRY=1; WITH_SECRETS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) DRY=0 ;;
    --with-secrets) WITH_SECRETS=1 ;;
    -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done
[ "$(id -u)" = "0" ] || die "run as root"

UNITS=(console-bff console-crypto-sidecar)
PATHS=(
  /etc/systemd/system/console-bff.service
  /etc/systemd/system/console-crypto-sidecar.service
  /etc/systemd/system/console-bff.service.d
  /etc/systemd/system/console-crypto-sidecar.service.d
  /usr/local/bin/console-crypto-sidecar
  /usr/local/lib/console-bff
  /etc/console-bff
  /etc/console-sidecar
)
[ "$WITH_SECRETS" = 1 ] && PATHS+=(/etc/cdb/secrets)
USERS=(console-bff console-sidecar)

run() { if [ "$DRY" = 1 ]; then echo "    would: $*"; else "$@"; fi; }

log "[1] units"
for u in "${UNITS[@]}"; do
  if systemctl list-unit-files "$u.service" --no-legend 2>/dev/null | grep -q "$u.service"; then
    run systemctl disable --now "$u.service"
  else
    echo "    absent: $u.service"
  fi
done

log "[2] files"
for p in "${PATHS[@]}"; do
  if [ -e "$p" ]; then run rm -rf "$p"; else echo "    absent: $p"; fi
done
[ "$WITH_SECRETS" = 1 ] || echo "    kept: /etc/cdb/secrets (operator-entered connector secret; --with-secrets removes it)"
run systemctl daemon-reload

log "[3] service users"
for u in "${USERS[@]}"; do
  if id "$u" >/dev/null 2>&1; then run userdel "$u"; else echo "    absent: $u"; fi
done

if [ "$DRY" = 1 ]; then
  log "DRY RUN -- nothing changed. Re-run with --yes to remove the Console."
else
  # Fail closed: an uninstall that leaves any of its paths behind would let the next install inherit
  # state and call itself clean.
  for p in "${PATHS[@]}"; do [ -e "$p" ] && die "still present after uninstall: $p"; done
  for u in "${USERS[@]}"; do id "$u" >/dev/null 2>&1 && die "user still present after uninstall: $u"; done
  log "Console removed. /etc/cdb/control and the node.cbor peer pin are left for the next install."
fi
