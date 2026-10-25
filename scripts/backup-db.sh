#!/bin/sh
# Hot-backup the Picolah SQLite database, gzip it and keep the newest N files.
# Usage: PICOLAH_DB_PATH=/app/data/picolah.db sh scripts/backup-db.sh
set -eu

DB="${PICOLAH_DB_PATH:-/app/data/picolah.db}"
DIR="${BACKUP_DIR:-$(dirname "$DB")/backups}"
KEEP="${BACKUP_KEEP:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$DIR/picolah-$STAMP.db"

if [ ! -f "$DB" ]; then
  echo "backup: database not found: $DB" >&2
  exit 1
fi

mkdir -p "$DIR"
# .backup is safe while the API is writing; it produces a consistent snapshot.
sqlite3 "$DB" ".backup '$TARGET'"
gzip -f "$TARGET"
echo "backup: wrote $TARGET.gz"

# Keep only the newest $KEEP archives.
find "$DIR" -name 'picolah-*.db.gz' -type f -print0 \
  | xargs -0 ls -1t \
  | tail -n +$((KEEP + 1)) \
  | xargs -r rm -f
