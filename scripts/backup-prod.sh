#!/usr/bin/env bash
# Backup de producción MyRent Go (MongoDB dentro de Docker + documentos).
# Uso (en el VPS, raíz del proyecto):
#   ./scripts/backup-prod.sh
# Variables opcionales:
#   BACKUP_DIR=./backups  KEEP_DAYS=14  COMPOSE_FILE=docker-compose.prod.yml
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WORKDIR="${BACKUP_DIR}/work_${TIMESTAMP}"

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env en ${ROOT_DIR}"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

MONGODB_DATABASE="${MONGODB_DATABASE:-myrent}"
MONGO_ROOT_USER="${MONGO_ROOT_USER:?MONGO_ROOT_USER requerido en .env}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD requerido en .env}"

mkdir -p "$BACKUP_DIR" "$WORKDIR"

echo "==> Backup MongoDB (${MONGODB_DATABASE}) vía contenedor mongodb"
docker compose -f "$COMPOSE_FILE" exec -T mongodb \
  mongodump \
  -u "$MONGO_ROOT_USER" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db "$MONGODB_DATABASE" \
  --archive > "${WORKDIR}/mongo.archive"

echo "==> Backup documentos (volumen api_storage si está montado)"
# Copia desde el contenedor api si existe el path
if docker compose -f "$COMPOSE_FILE" exec -T api test -d /app/storage/documents 2>/dev/null; then
  docker compose -f "$COMPOSE_FILE" cp api:/app/storage/documents "${WORKDIR}/documents" 2>/dev/null \
    || docker compose -f "$COMPOSE_FILE" exec -T api tar -C /app/storage -cf - documents \
      > "${WORKDIR}/documents.tar"
else
  echo "WARN: no se encontró /app/storage/documents en el contenedor api"
fi

ARCHIVE="${BACKUP_DIR}/myrent_prod_${TIMESTAMP}.tar.gz"
tar -czf "$ARCHIVE" -C "$BACKUP_DIR" "work_${TIMESTAMP}"
rm -rf "$WORKDIR"

echo "==> Guardado: ${ARCHIVE}"

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  echo "==> Rotación: eliminar backups locales > ${KEEP_DAYS} días"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'myrent_prod_*.tar.gz' -mtime "+${KEEP_DAYS}" -print -delete || true
fi

echo "==> Backup completado"
echo "Copia este archivo fuera del VPS (disco externo / cloud)."
