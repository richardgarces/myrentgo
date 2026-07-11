#!/usr/bin/env bash
# Backup MyRent Go: local (mongodump + documentos) + off-site con Restic.
# Uso: ./scripts/backup-restic.sh
# Requiere: deploy/platform/restic.env, restic (o Docker), app en docker-compose.prod.yml
#
# Variables opcionales:
#   RESTIC_INIT=1     — inicializar repositorio si no existe
#   RESTIC_CHECK=1    — ejecutar restic check tras el backup
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RESTIC_ENV="${ROOT_DIR}/deploy/platform/restic.env"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.17.3}"

if [[ ! -f "$RESTIC_ENV" ]]; then
  echo "ERROR: falta ${RESTIC_ENV}"
  echo "  cp deploy/platform/restic.env.example deploy/platform/restic.env"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$RESTIC_ENV"
set +a

for var in RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]] || [[ "${!var}" == CHANGE_ME* ]]; then
    echo "ERROR: define ${var} en deploy/platform/restic.env"
    exit 1
  fi
done

APP_ID="${APP_ID:-myrentgo}"
APP_ENV="${APP_ENV:-prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${RESTIC_KEEP_DAILY:-30}"
KEEP_WEEKLY="${RESTIC_KEEP_WEEKLY:-12}"
KEEP_MONTHLY="${RESTIC_KEEP_MONTHLY:-12}"

restic_cmd() {
  docker run --rm \
    -e RESTIC_REPOSITORY \
    -e RESTIC_PASSWORD \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}" \
    -v "${ROOT_DIR}/${BACKUP_DIR}:/backup:ro" \
    "$RESTIC_IMAGE" "$@"
}

echo "==> Backup local (MongoDB + documentos)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}" \
BACKUP_DIR="${BACKUP_DIR}" \
KEEP_DAYS="${KEEP_DAYS:-14}" \
./scripts/backup-prod.sh

LATEST="$(ls -t "${ROOT_DIR}/${BACKUP_DIR}"/myrent_prod_*.tar.gz 2>/dev/null | head -1)"
if [[ -z "$LATEST" ]]; then
  echo "ERROR: no se encontró archivo myrent_prod_*.tar.gz en ${BACKUP_DIR}"
  exit 1
fi
ARCHIVE_NAME="$(basename "$LATEST")"
echo "==> Archivo local: ${ARCHIVE_NAME}"

if [[ "${RESTIC_INIT:-0}" == "1" ]]; then
  echo "==> restic init (si el repositorio no existe)"
  restic_cmd init || true
fi

HOST_TAG="${APP_ID}-${APP_ENV}"
echo "==> restic backup → ${RESTIC_REPOSITORY} (host ${HOST_TAG})"

restic_cmd backup \
  --host "$HOST_TAG" \
  --tag "$APP_ID" \
  --tag "$APP_ENV" \
  "/backup/${ARCHIVE_NAME}"

echo "==> restic forget --prune (daily=${KEEP_DAILY}, weekly=${KEEP_WEEKLY}, monthly=${KEEP_MONTHLY})"
restic_cmd forget \
  --tag "$APP_ID" \
  --keep-daily "$KEEP_DAILY" \
  --keep-weekly "$KEEP_WEEKLY" \
  --keep-monthly "$KEEP_MONTHLY" \
  --prune

if [[ "${RESTIC_CHECK:-0}" == "1" ]]; then
  echo "==> restic check"
  restic_cmd check
fi

echo "==> Snapshots recientes:"
restic_cmd snapshots --tag "$APP_ID" | tail -10

echo "==> Backup Restic completado"
