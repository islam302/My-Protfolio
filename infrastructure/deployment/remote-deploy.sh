#!/usr/bin/env bash
# Runs ON the Hetzner VM (called over SSH by .github/workflows/deploy.yml, or by
# hand). Deploys one release, verifies it, and rolls back automatically to the
# previously deployed images if the new stack is unhealthy.
#
#   remote-deploy.sh <release-dir> <api-image@sha256:…> <web-image@sha256:…>
#   remote-deploy.sh --rollback          # redeploy the previous release
#
# Layout (PORTFOLIO_ROOT, default /srv/portfolio):
#   shared/.env            secrets, chmod 600, never in a release
#   shared/certs/          TLS cert + key (certbot deploy hook)
#   shared/acme/           ACME http-01 webroot
#   shared/backups/        pg_dump archives (copied off-server by cron)
#   shared/deployed.env    RELEASE / API_IMAGE / WEB_IMAGE of the live release
#   shared/previous.env    same for the release before it (rollback target)
#   releases/<git-sha>/    compose files + infrastructure/{nginx,deployment}
#   current -> releases/<git-sha>
set -euo pipefail
umask 027

ROOT="${PORTFOLIO_ROOT:-/srv/portfolio}"
SHARED="$ROOT/shared"
ENV_FILE="$SHARED/.env"
export PORTFOLIO_SHARED="$SHARED"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-240}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE missing"
if [[ "$(stat -c %a "$ENV_FILE")" != "600" ]]; then die "$ENV_FILE must be chmod 600"; fi

compose_cmd() { # release-dir -> command string (paths contain no spaces)
  printf 'docker compose -f %s/docker-compose.yml -f %s/docker-compose.prod.yml --env-file %s' "$1" "$1" "$ENV_FILE"
}
dc() { # release-dir, args…
  local dir="$1"; shift
  # shellcheck disable=SC2046
  $(compose_cmd "$dir") "$@"
}

public_origin() {
  local v
  v="$(grep -E '^PUBLIC_ORIGIN=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d "\"'" )"
  [[ "$v" == https://* ]] || die "PUBLIC_ORIGIN in .env must be the https:// origin"
  printf '%s' "$v"
}

start_release() { # dir api web
  local dir="$1"
  export API_IMAGE="$2" WEB_IMAGE="$3"
  # Explicit && chain: this function is called in `if` context, where set -e
  # does not apply, so every step must gate the next one.
  dc "$dir" config -q \
    && dc "$dir" up -d --no-build --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" \
    && bash "$dir/infrastructure/deployment/smoke-test.sh" "$(public_origin)"
}

record() { # file release api web
  local tmp="$1.tmp"
  printf 'RELEASE=%s\nAPI_IMAGE=%s\nWEB_IMAGE=%s\nDEPLOYED_AT=%s\n' "$2" "$3" "$4" "$(date -u +%FT%TZ)" > "$tmp"
  mv "$tmp" "$1"
}

load_state() { # file -> sets S_RELEASE S_API S_WEB
  S_RELEASE="" S_API="" S_WEB=""
  [[ -f "$1" ]] || return 1
  S_RELEASE="$(grep -E '^RELEASE=' "$1" | cut -d= -f2-)"
  S_API="$(grep -E '^API_IMAGE=' "$1" | cut -d= -f2-)"
  S_WEB="$(grep -E '^WEB_IMAGE=' "$1" | cut -d= -f2-)"
  [[ -n "$S_RELEASE" && -n "$S_API" && -n "$S_WEB" ]]
}

rollback_to() { # file
  load_state "$1" || die "no rollback target recorded in $1 — manual intervention needed"
  [[ -d "$S_RELEASE" ]] || die "release dir $S_RELEASE is gone — manual intervention needed"
  log "ROLLBACK to $S_RELEASE"
  log "  api=$S_API"
  log "  web=$S_WEB"
  start_release "$S_RELEASE" "$S_API" "$S_WEB" || die "ROLLBACK FAILED — manual intervention needed"
  ln -sfn "$S_RELEASE" "$ROOT/current"
  log "rollback OK (note: database migrations are forward-only and were NOT reverted)"
}

# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--rollback" ]]; then
  load_state "$SHARED/deployed.env" || die "nothing deployed yet"
  cur_release="$S_RELEASE" cur_api="$S_API" cur_web="$S_WEB"
  rollback_to "$SHARED/previous.env"
  record "$SHARED/previous.env" "$cur_release" "$cur_api" "$cur_web"
  record "$SHARED/deployed.env" "$S_RELEASE" "$S_API" "$S_WEB"
  exit 0
fi

NEW="${1:?usage: remote-deploy.sh <release-dir> <api-image@sha256:…> <web-image@sha256:…>}"
NEW_API="${2:?api image ref required}"
NEW_WEB="${3:?web image ref required}"
NEW="$(cd "$NEW" && pwd -P)"

digest_re='^[a-z0-9./_-]+(:[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$'
[[ "$NEW_API" =~ $digest_re ]] || die "API image must be pinned by digest: $NEW_API"
[[ "$NEW_WEB" =~ $digest_re ]] || die "web image must be pinned by digest: $NEW_WEB"
[[ "$NEW" == "$ROOT/releases/"* ]] || die "release dir must be under $ROOT/releases"

log "release  $NEW"
log "api      $NEW_API"
log "web      $NEW_WEB"

export API_IMAGE="$NEW_API" WEB_IMAGE="$NEW_WEB"
dc "$NEW" config -q

log "pulling images"
dc "$NEW" pull --quiet

# Backup before migrating (skipped on the very first deploy: no database yet).
if dc "$NEW" ps --status running --services 2>/dev/null | grep -qx db; then
  log "backup before migration"
  COMPOSE="$(compose_cmd "$NEW")" bash "$NEW/infrastructure/deployment/backup.sh" "$SHARED/backups"
fi

log "migrations"
# Each migration runs in its own transaction: a failure leaves the schema and
# the running (old) stack untouched, so no rollback is needed here.
dc "$NEW" run --rm migrate || die "migration failed — old release still serving"

log "starting new release"
if start_release "$NEW" "$NEW_API" "$NEW_WEB"; then
  if load_state "$SHARED/deployed.env"; then
    record "$SHARED/previous.env" "$S_RELEASE" "$S_API" "$S_WEB"
  fi
  record "$SHARED/deployed.env" "$NEW" "$NEW_API" "$NEW_WEB"
  ln -sfn "$NEW" "$ROOT/current"
  log "DEPLOY OK"
else
  log "new release unhealthy"
  dc "$NEW" ps -a || true
  dc "$NEW" logs --no-color --tail=100 api web || true
  if [[ -f "$SHARED/deployed.env" ]]; then
    rollback_to "$SHARED/deployed.env" || true
  else
    log "first deploy failed — nothing to roll back to"
  fi
  exit 1
fi

# Keep the newest $KEEP_RELEASES release dirs (never the live/previous ones).
live="$(readlink -f "$ROOT/current")"
prev=""; load_state "$SHARED/previous.env" && prev="$S_RELEASE"
# shellcheck disable=SC2012  # release dirs are git SHAs
ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | while read -r d; do
  d="${d%/}"
  [[ "$d" == "$live" || "$d" == "$prev" ]] && continue
  rm -rf -- "$d" && log "pruned $d"
done
