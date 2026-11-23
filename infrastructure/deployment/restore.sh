#!/usr/bin/env bash
# Restore a pg_dump (custom format) into the compose database. DESTRUCTIVE:
# existing objects in the target database are dropped and replaced.
#
#   infrastructure/deployment/restore.sh <dump-file> --confirm-target=<db-name>
#
# --confirm-target must equal the database being restored into (POSTGRES_DB,
# default "portfolio"); without it the script only prints what it would do.
# Stop the API first so nothing writes during the restore:
#   docker compose stop api web
set -euo pipefail

DUMP="${1:-}"
CONFIRM=""
for arg in "${@:2}"; do
  case "$arg" in
    --confirm-target=*) CONFIRM="${arg#--confirm-target=}" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

COMPOSE="${COMPOSE:-docker compose}"
DB_USER="${POSTGRES_USER:-portfolio}"
DB_NAME="${POSTGRES_DB:-portfolio}"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "usage: restore.sh <dump-file> --confirm-target=<db-name>" >&2
  exit 2
fi

if [[ -f "$DUMP.sha256" ]]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256") \
    || { echo "checksum mismatch, aborting" >&2; exit 1; }
fi

# shellcheck disable=SC2086
echo "Archive contents ($(  $COMPOSE exec -T db pg_restore --list < "$DUMP" | grep -c ' TABLE DATA ' ) table data entries)."
echo "Target: database '$DB_NAME' in compose service 'db' (project: ${COMPOSE_PROJECT_NAME:-portfolio})."

if [[ "$CONFIRM" != "$DB_NAME" ]]; then
  echo
  echo "DRY RUN — nothing changed. To restore, re-run with: --confirm-target=$DB_NAME" >&2
  exit 3
fi

if $COMPOSE ps --status running --services 2>/dev/null | grep -qx api; then
  echo "The api service is running. Stop it first: $COMPOSE stop api web" >&2
  exit 1
fi

echo "Restoring $DUMP -> $DB_NAME ..."
# --clean --if-exists drops objects before recreating them; single transaction
# so a failure leaves the database unchanged.
# shellcheck disable=SC2086
$COMPOSE exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error < "$DUMP"

echo "Restore complete. Start the stack: $COMPOSE up -d"
