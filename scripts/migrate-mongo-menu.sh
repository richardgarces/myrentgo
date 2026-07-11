#!/usr/bin/env bash
# =============================================================================
# Menú: migrar MongoDB (y opcionalmente documentos) Mac → BMAX
#
# Uso (en la Mac, raíz del repo):
#   ./scripts/migrate-mongo-menu.sh
#   ./migrate-mongo.sh
#   ./migrate-mongo.sh 5          # dump + subir + restaurar
#
# Defaults SSH: .push-defaults / ubuntu/.push-defaults
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups/migrate}"
MONGODB_DATABASE="${MONGODB_DATABASE:-myrent}"
ARCHIVE_NAME="myrent-mongo.archive"
DOCS_TAR_NAME="myrent-documents.tar.gz"
REMOTE_ARCHIVE_NAME="myrent-mongo.archive"
REMOTE_DOCS_NAME="myrent-documents.tar.gz"

REMOTE_USER="${REMOTE_USER:-richard}"
REMOTE_IP="${REMOTE_IP:-192.168.1.198}"
REMOTE_DIR="${REMOTE_DIR:-~/my-rent-go}"
SSH_PORT="${SSH_PORT:-2222}"
SSH_IDENTITY="${SSH_IDENTITY:-}"

info() { echo "[✓] $*"; }
warn() { echo "[!] $*"; }
error() { echo "[✗] $*" >&2; }
pause() { read -r -p "Pulsa Enter..." _; }

load_push_defaults() {
  if [[ -f "${ROOT_DIR}/ubuntu/.push-defaults" ]]; then
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/ubuntu/.push-defaults"
  fi
  if [[ -f "${ROOT_DIR}/.push-defaults" ]]; then
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.push-defaults"
  fi
  if [[ -z "${REMOTE_DIR}" || "${REMOTE_DIR}" == *platform-kit* ]]; then
    REMOTE_DIR='~/my-rent-go'
  fi
  REMOTE_DIR="${REMOTE_DIR:-~/my-rent-go}"
  # BMAX: SSH en 2222 (si algún default viejo dejó 22, forzar)
  if [[ "${SSH_PORT}" == "22" ]]; then
    SSH_PORT=2222
  fi
}

ssh_opts() {
  local opts=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
  if [[ -n "$SSH_IDENTITY" ]]; then
    opts+=(-i "$SSH_IDENTITY")
  fi
  printf '%s\n' "${opts[@]}"
}

scp_opts() {
  local opts=(-P "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
  if [[ -n "$SSH_IDENTITY" ]]; then
    opts+=(-i "$SSH_IDENTITY")
  fi
  printf '%s\n' "${opts[@]}"
}

remote_host() {
  echo "${REMOTE_USER}@${REMOTE_IP}"
}

local_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    error "No hay docker compose / docker-compose"
    return 1
  fi
}

mongo_running_local() {
  local_compose ps mongodb 2>/dev/null | grep -Eqi 'running|up' \
    || docker ps --format '{{.Names}}' 2>/dev/null | grep -Eqx 'myrent-mongodb|my-rent-go-mongodb-1|my-rent-go_mongodb_1'
}

archive_path() {
  echo "${BACKUP_DIR}/${ARCHIVE_NAME}"
}

docs_path() {
  echo "${BACKUP_DIR}/${DOCS_TAR_NAME}"
}

ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR"
}

# ── 1) Dump local ────────────────────────────────────────────────────────────
cmd_dump() {
  ensure_backup_dir
  local out
  out="$(archive_path)"

  if ! command -v docker >/dev/null 2>&1; then
    error "Docker no está instalado en esta máquina"
    return 1
  fi
  if ! mongo_running_local; then
    error "Mongo local no está arriba. Arranca con: docker compose up -d mongodb"
    return 1
  fi

  echo "==> Dump local DB=${MONGODB_DATABASE} → ${out}"
  if local_compose exec -T mongodb mongodump --db="$MONGODB_DATABASE" --archive >"$out" 2>/tmp/myrent-mongodump.err; then
    :
  else
    # Contenedor con nombre fijo (compose antiguo)
    if docker exec -i myrent-mongodb mongodump --db="$MONGODB_DATABASE" --archive >"$out" 2>/tmp/myrent-mongodump.err; then
      :
    else
      error "mongodump falló"
      cat /tmp/myrent-mongodump.err >&2 || true
      return 1
    fi
  fi

  local size
  size="$(du -h "$out" | awk '{print $1}')"
  info "Dump listo: ${out} (${size})"
}

# ── 2) Empaquetar documentos locales ─────────────────────────────────────────
cmd_pack_docs() {
  ensure_backup_dir
  local out src
  out="$(docs_path)"
  src="${ROOT_DIR}/storage/documents"

  if [[ ! -d "$src" ]]; then
    warn "No existe ${src} — nada que empaquetar"
    return 0
  fi

  echo "==> Empaquetando documentos → ${out}"
  tar -czf "$out" -C "${ROOT_DIR}/storage" documents
  info "Documentos: ${out} ($(du -h "$out" | awk '{print $1}'))"
}

# ── Configurar / mostrar destino ─────────────────────────────────────────────
cmd_configure_remote() {
  load_push_defaults
  echo "Destino actual: $(remote_host)  dir=${REMOTE_DIR}  puerto=${SSH_PORT}"
  read -r -p "Usuario SSH [${REMOTE_USER}]: " u
  REMOTE_USER="${u:-$REMOTE_USER}"
  read -r -p "IP/hostname [${REMOTE_IP}]: " ip
  REMOTE_IP="${ip:-$REMOTE_IP}"
  read -r -p "Directorio remoto [${REMOTE_DIR}]: " d
  REMOTE_DIR="${d:-$REMOTE_DIR}"
  read -r -p "Puerto SSH [${SSH_PORT}]: " p
  SSH_PORT="${p:-$SSH_PORT}"
  info "OK → $(remote_host):${REMOTE_DIR} (puerto ${SSH_PORT})"
}

# ── 3) Subir archive ─────────────────────────────────────────────────────────
cmd_upload() {
  load_push_defaults
  local out
  out="$(archive_path)"
  if [[ ! -f "$out" ]]; then
    error "No hay dump local. Ejecuta primero la opción 1."
    return 1
  fi

  echo "==> SCP ${out} → $(remote_host):${REMOTE_DIR}/${REMOTE_ARCHIVE_NAME}"
  # shellcheck disable=SC2046
  scp $(scp_opts) "$out" "$(remote_host):${REMOTE_DIR}/${REMOTE_ARCHIVE_NAME}"
  info "Archive subido"

  local docs
  docs="$(docs_path)"
  if [[ -f "$docs" ]]; then
    read -r -p "También hay documentos empaquetados. ¿Subirlos? [Y/n]: " yn
    yn="${yn:-Y}"
    if [[ "$yn" =~ ^[Yy] ]]; then
      # shellcheck disable=SC2046
      scp $(scp_opts) "$docs" "$(remote_host):${REMOTE_DIR}/${REMOTE_DOCS_NAME}"
      info "Documentos subidos"
    fi
  fi
}

# ── 4) Restaurar en BMAX ─────────────────────────────────────────────────────
cmd_restore_remote() {
  load_push_defaults
  echo
  warn "Esto REEMPLAZA colecciones de '${MONGODB_DATABASE}' en el BMAX (--drop)."
  read -r -p "¿Continuar? Escribe SI: " conf
  if [[ "$conf" != "SI" ]]; then
    warn "Cancelado"
    return 0
  fi

  echo "==> Restaurando en $(remote_host)…"
  # shellcheck disable=SC2046
  ssh $(ssh_opts) "$(remote_host)" bash -s -- "$REMOTE_DIR" "$REMOTE_ARCHIVE_NAME" "$MONGODB_DATABASE" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="${1/#\~/$HOME}"
ARCHIVE_NAME="$2"
DB="$3"
cd "$REMOTE_DIR"

ARCHIVE="${REMOTE_DIR}/${ARCHIVE_NAME}"
if [[ ! -f "$ARCHIVE" ]]; then
  echo "ERROR: no está ${ARCHIVE} — súbelo antes (opción 3 del menú)"
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "ERROR: falta .env en ${REMOTE_DIR}"
  exit 1
fi

env_get() {
  local key="$1"
  grep -E "^${key}=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

MONGO_ROOT_USER="$(env_get MONGO_ROOT_USER)"
MONGO_ROOT_PASSWORD="$(env_get MONGO_ROOT_PASSWORD)"
MONGODB_DATABASE="$(env_get MONGODB_DATABASE)"
MONGODB_DATABASE="${MONGODB_DATABASE:-$DB}"

if [[ -z "$MONGO_ROOT_USER" || -z "$MONGO_ROOT_PASSWORD" ]]; then
  echo "ERROR: MONGO_ROOT_USER / MONGO_ROOT_PASSWORD vacíos en .env"
  exit 1
fi

COMPOSE_ARGS=(-f docker-compose.prod.yml)
if [[ -f docker-compose.prod.platform.yml ]]; then
  COMPOSE_ARGS+=(-f docker-compose.prod.platform.yml)
fi

run_restore() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "${COMPOSE_ARGS[@]}" exec -T mongodb \
      mongorestore \
        -u "$MONGO_ROOT_USER" \
        -p "$MONGO_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --nsInclude="${MONGODB_DATABASE}.*" \
        --archive \
        --drop
  else
    docker-compose "${COMPOSE_ARGS[@]}" exec -T mongodb \
      mongorestore \
        -u "$MONGO_ROOT_USER" \
        -p "$MONGO_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --nsInclude="${MONGODB_DATABASE}.*" \
        --archive \
        --drop
  fi
}

echo "==> mongorestore --drop DB=${MONGODB_DATABASE}"
run_restore < "$ARCHIVE"

if docker ps --format '{{.Names}}' | grep -qx myrent-api; then
  docker restart myrent-api >/dev/null
  echo "==> myrent-api reiniciado"
fi

echo "==> Restore OK"
REMOTE
  info "Restore remoto completado"
}

# ── 5) Restaurar documentos en BMAX ──────────────────────────────────────────
cmd_restore_docs_remote() {
  load_push_defaults
  echo "==> Restaurando documentos en $(remote_host)…"
  # shellcheck disable=SC2046
  ssh $(ssh_opts) "$(remote_host)" bash -s -- "$REMOTE_DIR" "$REMOTE_DOCS_NAME" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="${1/#\~/$HOME}"
DOCS_NAME="$2"
cd "$REMOTE_DIR"
TAR="${REMOTE_DIR}/${DOCS_NAME}"
if [[ ! -f "$TAR" ]]; then
  echo "ERROR: no está ${TAR} — empaqueta (2) y sube (3) antes"
  exit 1
fi

COMPOSE_ARGS=(-f docker-compose.prod.yml)
[[ -f docker-compose.prod.platform.yml ]] && COMPOSE_ARGS+=(-f docker-compose.prod.platform.yml)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$TAR" -C "$TMP"

if docker compose version >/dev/null 2>&1; then
  docker compose "${COMPOSE_ARGS[@]}" exec -T api mkdir -p /app/storage/documents
  docker compose "${COMPOSE_ARGS[@]}" cp "${TMP}/documents/." api:/app/storage/documents/
else
  docker-compose "${COMPOSE_ARGS[@]}" exec -T api mkdir -p /app/storage/documents
  # docker-compose v1: copiar vía tar pipe
  tar -C "${TMP}/documents" -cf - . | docker-compose "${COMPOSE_ARGS[@]}" exec -T api tar -C /app/storage/documents -xf -
fi
echo "==> Documentos restaurados en api:/app/storage/documents"
REMOTE
  info "Documentos remotos OK"
}

# ── 6) Probar SSH / listar remoto ────────────────────────────────────────────
cmd_test_ssh() {
  load_push_defaults
  echo "==> Probando SSH $(remote_host):${SSH_PORT}"
  # shellcheck disable=SC2046
  ssh $(ssh_opts) "$(remote_host)" "echo OK; ls -lh ${REMOTE_DIR}/${REMOTE_ARCHIVE_NAME} ${REMOTE_DIR}/${REMOTE_DOCS_NAME} 2>/dev/null || echo '(aún no hay archives en remoto)'; docker ps --filter name=myrent --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null || true"
}

# ── 7) Listar dumps locales ──────────────────────────────────────────────────
cmd_list_local() {
  ensure_backup_dir
  echo "Directorio: ${BACKUP_DIR}"
  ls -lh "$BACKUP_DIR" 2>/dev/null || echo "(vacío)"
}

# ── 8) Todo en un paso ───────────────────────────────────────────────────────
cmd_oneshot() {
  echo; echo "======== 1/4 Dump Mongo local ========"
  cmd_dump
  echo; echo "======== 2/4 Documentos (opcional) ========"
  read -r -p "¿Empaquetar storage/documents? [y/N]: " yn
  if [[ "${yn:-N}" =~ ^[Yy] ]]; then
    cmd_pack_docs
  fi
  echo; echo "======== 3/4 Subir al BMAX ========"
  cmd_upload
  echo; echo "======== 4/4 Restaurar en BMAX ========"
  cmd_restore_remote
  if [[ -f "$(docs_path)" ]]; then
    read -r -p "¿Restaurar también documentos en el API? [y/N]: " yn2
    if [[ "${yn2:-N}" =~ ^[Yy] ]]; then
      cmd_restore_docs_remote
    fi
  fi
  echo
  info "Migración terminada. Prueba https://rent.meincart.com"
}

show_menu() {
  load_push_defaults
  clear 2>/dev/null || true
  cat <<EOF
════════════════════════════════════════
 MyRent Go — migrar datos Mac → BMAX
════════════════════════════════════════
  Repo:    ${ROOT_DIR}
  Dump:    $(archive_path)
  Destino: $(remote_host):${REMOTE_DIR}  (SSH :${SSH_PORT})

  1) Dump Mongo local (dev → backups/migrate/)
  2) Empaquetar documentos (storage/documents)
  3) Subir archive(s) al BMAX (SCP)
  4) Restaurar Mongo en BMAX (--drop)
  5) Restaurar documentos en BMAX (API volume)
  6) Probar SSH / ver estado remoto
  7) Listar dumps locales
  8) Configurar destino SSH
  9) TODO EN UN PASO (1→3→4)
  0) Salir
EOF
  read -r -p "Opción: " o
  case "$o" in
    1) cmd_dump; pause ;;
    2) cmd_pack_docs; pause ;;
    3) cmd_upload; pause ;;
    4) cmd_restore_remote; pause ;;
    5) cmd_restore_docs_remote; pause ;;
    6) cmd_test_ssh; pause ;;
    7) cmd_list_local; pause ;;
    8) cmd_configure_remote; pause ;;
    9) cmd_oneshot; pause ;;
    0|q|Q) exit 0 ;;
    *) warn "Opción inválida"; sleep 1 ;;
  esac
}

load_push_defaults

case "${1:-}" in
  1|dump) cmd_dump ;;
  2|docs) cmd_pack_docs ;;
  3|upload) cmd_upload ;;
  4|restore) cmd_restore_remote ;;
  5|restore-docs) cmd_restore_docs_remote ;;
  6|test|ssh) cmd_test_ssh ;;
  7|list) cmd_list_local ;;
  8|config) cmd_configure_remote ;;
  9|oneshot|--oneshot|-y) cmd_oneshot ;;
  --help|-h)
    cat <<'EOF'
Uso: ./migrate-mongo.sh [opción]

  1  dump Mongo local
  2  empaquetar documentos
  3  subir al BMAX
  4  restaurar Mongo remoto (--drop)
  5  restaurar documentos remotos
  6  probar SSH
  7  listar dumps locales
  8  configurar destino
  9  todo en un paso

Sin argumentos: menú interactivo.
EOF
    ;;
  "")
    while true; do show_menu; done
    ;;
  *)
    error "Opción desconocida: $1 (usa --help)"
    exit 1
    ;;
esac
