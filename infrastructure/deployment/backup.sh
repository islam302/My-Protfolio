#!/usr/bin/env bash
# Logical backup of the portfolio database (pg_dump custom format, compressed).
#
#   infrastructure/deployment/backup.sh [output-dir]       (default ./backups)
#
# Runs pg_dump INSIDE the db container (no host port, no password on the CLI),
# streams the dump to the host, verifies it with pg_restore --list and keeps
# the newest $KEEP files. Schedule it (cron/systemd timer) and copy backups
# off-host (object storage with versioning + encryption).
#
# Env: COMPOSE (default "docker compose"), KEEP (default 14),
#      POSTGRES_USER / POSTGRES_DB (defaults portfolio/portfolio).
set -euo pipefail
umask 077                                   # dumps contain personal data

OUT_DIR="${1:-./backups}"
COMPOSE="${COMPOSE:-docker compose}"
KEEP="${KEEP:-14}"
DB_USER="${POSTGRES_USER:-portfolio}"
DB_NAME="${POSTGRES_DB:-portfolio}"

mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$OUT_DIR/portfolio-$stamp.dump"
tmp="$file.partial"

echo "Backing up database '$DB_NAME' -> $file"
# shellcheck disable=SC2086
$COMPOSE exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --compress=9 --no-owner --no-privileges > "$tmp"

# Verify the archive is readable before declaring success.
# shellcheck disable=SC2086
$COMPOSE exec -T db pg_restore --list < "$tmp" > /dev/null
mv "$tmp" "$file"
( cd "$OUT_DIR" && name="$(basename "$file")" \
  && { sha256sum "$name" 2>/dev/null || shasum -a 256 "$name"; } > "$name.sha256" )
echo "OK: $(du -h "$file" | cut -f1) $file"

# Retention
# shellcheck disable=SC2012  # our own fixed-pattern filenames
ls -1t "$OUT_DIR"/portfolio-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old" "$old.sha256"
  echo "pruned $old"
done
