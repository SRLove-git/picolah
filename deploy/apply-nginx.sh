#!/usr/bin/env bash
# Re-attach the picolah.com server block to the shared 443 nginx-lb.
#
# Why this exists: port 443 on this host is owned by the diy project's
# `diy-nginx-lb` container, so picolah.com is served as an extra vhost inside
# /opt/diy/docker/nginx/nginx.conf. If the diy stack is redeployed from its
# repo, that file can be overwritten and the picolah vhost disappears.
#
# This script is idempotent: it appends the block only when missing, validates
# the whole nginx config, restores the backup if validation fails, and only
# then reloads. Safe to run from cron.
set -euo pipefail

CONF=/opt/diy/docker/nginx/nginx.conf
BLOCK=/opt/picolah/deploy/nginx/picolah.com.conf
MARKER='server_name picolah.com'

if grep -q "$MARKER" "$CONF"; then
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${CONF}.bak-picolah-${STAMP}"
cp -a "$CONF" "$BACKUP"

{
  echo ''
  echo '# ===== picolah.com (added by picolah deploy) ====='
  cat "$BLOCK"
  echo '# ===== end picolah.com ====='
} >> "$CONF"

if ! docker exec diy-nginx-lb nginx -t >/dev/null 2>&1; then
  mv -f "$BACKUP" "$CONF"
  echo "[picolah] nginx config check failed, restored $CONF" >&2
  exit 1
fi

docker exec diy-nginx-lb nginx -s reload
echo "[picolah] re-attached picolah.com vhost at $STAMP"
