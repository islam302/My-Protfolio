#!/usr/bin/env bash
# certbot --deploy-hook: runs (as root) after every successful issuance/renewal.
# Copies the live cert + key into the directory mounted read-only into the web
# container (/etc/nginx/certs), readable only by nginx's uid 101, then reloads
# nginx gracefully (no dropped connections).
#
# Install:  sudo install -m 0755 infrastructure/deployment/certbot-deploy-hook.sh \
#             /etc/letsencrypt/renewal-hooks/deploy/portfolio.sh
set -euo pipefail

ROOT="${PORTFOLIO_ROOT:-/srv/portfolio}"
DEST="$ROOT/shared/certs"
NGINX_UID=101

# certbot sets RENEWED_LINEAGE (/etc/letsencrypt/live/<name>); allow manual runs too.
LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/${CERT_NAME:-islambadran.com}}"
[[ -f "$LINEAGE/fullchain.pem" && -f "$LINEAGE/privkey.pem" ]] || { echo "no cert in $LINEAGE" >&2; exit 1; }

install -d -m 0750 -o "$NGINX_UID" -g "$NGINX_UID" "$DEST"
install -m 0644 -o "$NGINX_UID" -g "$NGINX_UID" "$LINEAGE/fullchain.pem" "$DEST/fullchain.pem.new"
install -m 0600 -o "$NGINX_UID" -g "$NGINX_UID" "$LINEAGE/privkey.pem"   "$DEST/privkey.pem.new"
mv -f "$DEST/fullchain.pem.new" "$DEST/fullchain.pem"
mv -f "$DEST/privkey.pem.new"   "$DEST/privkey.pem"

# Reload nginx if the stack is up (container name from compose project "portfolio").
if docker ps --format '{{.Names}}' | grep -qx portfolio-web-1; then
  docker exec portfolio-web-1 nginx -t && docker exec portfolio-web-1 nginx -s reload
  echo "nginx reloaded with the new certificate"
fi
