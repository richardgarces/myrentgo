#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
MONGODB_DATABASE="${MONGODB_DATABASE:-myrent}"

mkdir -p "$BACKUP_DIR"

echo "==> Backing up MongoDB database: $MONGODB_DATABASE"
mongodump --uri="$MONGODB_URI" --db="$MONGODB_DATABASE" --out="$BACKUP_DIR/dump_$TIMESTAMP"

tar -czf "$BACKUP_DIR/myrent_$TIMESTAMP.tar.gz" -C "$BACKUP_DIR" "dump_$TIMESTAMP"
rm -rf "$BACKUP_DIR/dump_$TIMESTAMP"

echo "==> Backup saved: $BACKUP_DIR/myrent_$TIMESTAMP.tar.gz"
