#!/usr/bin/env bash
# Crea un archivo .tar.gz listo para subir a Google Drive.
# Incluye: dump MongoDB + PDFs en storage/documents (+ exports opcional).
# Excluye: .env, node_modules, informes raw de pentest (pueden tener secretos).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="myrent-archive_${TIMESTAMP}.tar.gz"
INCLUDE_EXPORTS="${INCLUDE_EXPORTS:-1}"

MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
MONGODB_DATABASE="${MONGODB_DATABASE:-myrent}"

mkdir -p "$BACKUP_DIR"
STAGING="$BACKUP_DIR/staging_$TIMESTAMP"
mkdir -p "$STAGING"

cleanup() {
  rm -rf "$STAGING"
}
trap cleanup EXIT

echo "==> 1/3 Volcado MongoDB ($MONGODB_DATABASE)"
if command -v mongodump >/dev/null 2>&1; then
  mongodump --uri="$MONGODB_URI" --db="$MONGODB_DATABASE" --archive="$STAGING/mongo.archive"
elif docker compose ps mongodb 2>/dev/null | grep -q 'running\|Up'; then
  docker compose exec -T mongodb mongodump \
    --db="$MONGODB_DATABASE" \
    --archive > "$STAGING/mongo.archive"
else
  echo "WARN: mongodump no disponible y MongoDB no corre en Docker. Se omite el dump."
fi

echo "==> 2/3 Copiando documentos (storage/documents)"
if [[ -d storage/documents ]]; then
  mkdir -p "$STAGING/storage"
  cp -a storage/documents "$STAGING/storage/"
else
  echo "WARN: storage/documents no existe; se omite."
fi

if [[ "$INCLUDE_EXPORTS" == "1" && -d exports ]]; then
  echo "==> Incluyendo exports/"
  cp -a exports "$STAGING/"
fi

echo "==> 3/3 Empaquetando $BACKUP_DIR/$ARCHIVE_NAME"
tar -czf "$BACKUP_DIR/$ARCHIVE_NAME" -C "$STAGING" .

SIZE=$(du -h "$BACKUP_DIR/$ARCHIVE_NAME" | cut -f1)
echo ""
echo "Listo: $BACKUP_DIR/$ARCHIVE_NAME ($SIZE)"
echo "Sube este archivo a Google Drive. No incluye .env ni node_modules."
echo ""
echo "Para liberar disco local (solo tras verificar la subida):"
echo "  rm -rf exports/                    # copias antiguas de dump"
echo "  rm -rf security/reports/*/raw      # ~34 MB; regenerable, puede tener secretos"
echo "  rm -rf frontend/node_modules && cd frontend && npm ci  # ~267 MB; reinstalable"
