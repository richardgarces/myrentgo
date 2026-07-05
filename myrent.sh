#!/usr/bin/env bash
#
# MyRent Go — menú interactivo para desarrollo local (principal + submenús)
# Uso: ./myrent.sh  |  Atajos CLI: ./myrent.sh git-status, start, quickstart, docker-up, …
#
# Docker (dev): docker-build-all, docker-build-api, docker-build-frontend,
#   docker-up, docker-up-api, docker-up-frontend, docker-down, docker-restart,
#   docker-logs, docker-logs-api, docker-logs-frontend, docker-up-prod
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="${ROOT_DIR}/.myrent"
LOG_DIR="${RUN_DIR}/logs"

API_PORT="${MYRENT_API_PORT:-7070}"
FRONTEND_PORT="${MYRENT_FRONTEND_PORT:-4000}"
MONGO_PORT="${MYRENT_MONGO_PORT:-27017}"
MAIL_SMTP_PORT="${MYRENT_MAIL_SMTP_PORT:-1025}"
MAIL_UI_PORT="${MYRENT_MAIL_UI_PORT:-8025}"
MAILCOW_DIR="${ROOT_DIR}/mailcow"
MAILCOW_HOSTNAME="${MYRENT_MAILCOW_HOSTNAME:-mail.meincart.com}"

API_PID_FILE="${RUN_DIR}/api.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"
API_LOG="${LOG_DIR}/api.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"
MONGO_LOG="${LOG_DIR}/mongodb.log"
MAIL_LOG="${LOG_DIR}/mailpit.log"
MAILCOW_LOG="${LOG_DIR}/mailcow.log"

DOCKER_COMPOSE_DEV="${ROOT_DIR}/docker-compose.yml"
DOCKER_COMPOSE_PROD="${ROOT_DIR}/docker-compose.prod.yml"
DOCKER_IMAGE_API="myrent-api"
DOCKER_IMAGE_FRONTEND="myrent-frontend"
DOCKER_FRONTEND_PORT="${MYRENT_DOCKER_FRONTEND_PORT:-3000}"

ADMIN_USER="admin"
ADMIN_PASS="admin123"
APP_URL="http://localhost:${FRONTEND_PORT}"

# ─── Utilidades ───────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }
header() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║           MyRent Go — Dev Menu           ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  App:    ${BOLD}${APP_URL}${NC}"
  echo -e "  API:    http://localhost:${API_PORT}"
  echo -e "  Login:  ${BOLD}${ADMIN_USER}${NC} / ${BOLD}${ADMIN_PASS}${NC}"
  echo ""
  echo -e "  ${YELLOW}Navegación:${NC} menú principal → submenús  |  ${BOLD}0${NC} = volver o salir"
  echo ""
}

pause() {
  echo ""
  read -r -p "  Presiona Enter para continuar..."
}

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "Comando requerido no encontrado: $1"
    return 1
  fi
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid=$(cat "$pid_file")
  kill -0 "$pid" 2>/dev/null
}

port_in_use() {
  lsof -i ":$1" -sTCP:LISTEN -t &>/dev/null
}

wait_for_port() {
  local port="$1" max="${2:-30}" i=0
  while ! port_in_use "$port"; do
    sleep 1
    i=$((i + 1))
    if [[ $i -ge $max ]]; then
      return 1
    fi
  done
  return 0
}

wait_for_http() {
  local url="$1" max="${2:-30}" i=0
  while ! curl -sf "$url" &>/dev/null; do
    sleep 1
    i=$((i + 1))
    if [[ $i -ge $max ]]; then
      return 1
    fi
  done
  return 0
}

open_browser() {
  local url="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$url"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url"
  elif command -v wslview &>/dev/null; then
    wslview "$url"
  else
    warn "No se pudo abrir el navegador automáticamente. Visita: $url"
    return 1
  fi
  info "Navegador abierto en $url"
}

mkdir -p "$RUN_DIR" "$LOG_DIR"

load_dotenv() {
  local env_file="${ROOT_DIR}/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

# ─── MongoDB ──────────────────────────────────────────────────────────────────

mongo_available() {
  port_in_use "$MONGO_PORT"
}

mongo_start() {
  if mongo_available; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mongodb$'; then
      info "MongoDB (Docker) ya está corriendo"
    else
      info "MongoDB detectado en puerto ${MONGO_PORT}"
    fi
    return 0
  fi

  if ! command -v docker &>/dev/null; then
    error "MongoDB no está disponible en puerto ${MONGO_PORT} y Docker no está instalado."
    echo ""
    echo "  Opciones:"
    echo "    • Instala e inicia Docker Desktop, luego reintenta"
    echo "    • O instala MongoDB local: brew install mongodb-community && brew services start mongodb-community"
    return 1
  fi

  if ! docker info &>/dev/null; then
    error "Docker no está corriendo."
    echo ""
    echo "  Inicia Docker Desktop y vuelve a ejecutar esta opción."
    return 1
  fi

  info "Iniciando MongoDB con Docker..."
  if ! docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d mongodb >>"$MONGO_LOG" 2>&1; then
    error "No se pudo levantar el contenedor MongoDB."
    echo ""
    tail -10 "$MONGO_LOG" 2>/dev/null | sed 's/^/    /'
    return 1
  fi

  if wait_for_port "$MONGO_PORT" 60; then
    info "MongoDB listo en puerto ${MONGO_PORT}"
  else
    error "MongoDB no respondió a tiempo. Ver logs: $MONGO_LOG"
    tail -10 "$MONGO_LOG" 2>/dev/null | sed 's/^/    /'
    return 1
  fi
}

mongo_stop() {
  if docker ps --format '{{.Names}}' | grep -q '^myrent-mongodb$'; then
    info "Deteniendo MongoDB..."
    docker compose -f "${ROOT_DIR}/docker-compose.yml" stop mongodb >>"$MONGO_LOG" 2>&1
    info "MongoDB detenido"
  else
    warn "MongoDB no está corriendo"
  fi
}

mongo_logs() {
  if docker ps --format '{{.Names}}' | grep -q '^myrent-mongodb$'; then
    docker logs -f --tail 100 myrent-mongodb
  else
    warn "MongoDB no está corriendo"
    [[ -f "$MONGO_LOG" ]] && tail -50 "$MONGO_LOG"
  fi
}

# ─── Mailpit (opcional — solo desarrollo sin SMTP real) ───────────────────────

mailpit_available() {
  port_in_use "$MAIL_SMTP_PORT"
}

mailpit_start() {
  if mailpit_available; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mailpit$'; then
      info "Mailpit (Docker) ya está corriendo → http://localhost:${MAIL_UI_PORT}"
    else
      info "SMTP detectado en puerto ${MAIL_SMTP_PORT}"
    fi
    return 0
  fi

  if ! command -v docker &>/dev/null; then
    warn "Mailpit no disponible: Docker no está instalado."
    echo "  Para correo real configura SMTP en .env (ver .env.example)."
    return 0
  fi

  if ! docker info &>/dev/null; then
    warn "Mailpit no disponible: Docker no está corriendo."
    return 0
  fi

  info "Iniciando Mailpit con Docker..."
  if ! docker compose -f "${ROOT_DIR}/docker-compose.mail.yml" up -d >>"$MAIL_LOG" 2>&1; then
    error "No se pudo levantar Mailpit."
    tail -10 "$MAIL_LOG" 2>/dev/null | sed 's/^/    /'
    return 1
  fi

  if wait_for_port "$MAIL_SMTP_PORT" 30; then
    info "Mailpit listo — bandeja: http://localhost:${MAIL_UI_PORT}  SMTP: localhost:${MAIL_SMTP_PORT}"
  else
    error "Mailpit no respondió a tiempo. Ver logs: $MAIL_LOG"
    tail -10 "$MAIL_LOG" 2>/dev/null | sed 's/^/    /'
    return 1
  fi
}

mailpit_stop() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mailpit$'; then
    info "Deteniendo Mailpit..."
    docker compose -f "${ROOT_DIR}/docker-compose.mail.yml" stop >>"$MAIL_LOG" 2>&1
    info "Mailpit detenido"
  else
    warn "Mailpit no está corriendo"
  fi
}

mailpit_open() {
  open_browser "http://localhost:${MAIL_UI_PORT}"
}

mailpit_logs() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mailpit$'; then
    docker logs -f --tail 100 myrent-mailpit
  else
    warn "Mailpit no está corriendo"
    [[ -f "$MAIL_LOG" ]] && tail -50 "$MAIL_LOG"
  fi
}

# ─── Mailcow (producción — VPS dedicado, no combinar con stack dev) ───────────

mailcow_installed() {
  [[ -f "${MAILCOW_DIR}/mailcow.conf" && -f "${MAILCOW_DIR}/docker-compose.yml" ]]
}

mailcow_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qE 'mailcow|postfix-mailcow|nginx-mailcow'
}

mailcow_setup() {
  if [[ ! -x "${ROOT_DIR}/scripts/setup-mailcow.sh" ]]; then
    error "No se encontró scripts/setup-mailcow.sh"
    return 1
  fi
  MAILCOW_HOSTNAME="$MAILCOW_HOSTNAME" "${ROOT_DIR}/scripts/setup-mailcow.sh"
}

mailcow_start() {
  if ! mailcow_installed; then
    warn "Mailcow no está instalado. Ejecuta primero: ./myrent.sh mailcow-setup"
    echo "  Documentación: docs/Cloudflare/mailcow.md"
    return 1
  fi

  if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
    error "Docker no está disponible."
    return 1
  fi

  if mailcow_running; then
    info "Mailcow ya está corriendo → https://${MAILCOW_HOSTNAME}/admin"
    return 0
  fi

  info "Iniciando Mailcow (puede tardar varios minutos)..."
  if ! (cd "$MAILCOW_DIR" && docker compose pull >>"$MAILCOW_LOG" 2>&1 && docker compose up -d >>"$MAILCOW_LOG" 2>&1); then
    error "No se pudo levantar Mailcow."
    tail -15 "$MAILCOW_LOG" 2>/dev/null | sed 's/^/    /'
    return 1
  fi

  info "Mailcow iniciado — panel: https://${MAILCOW_HOSTNAME}/admin"
  echo "  SMTP submission para MyRent Go: ${MAILCOW_HOSTNAME}:587"
}

mailcow_stop() {
  if ! mailcow_installed; then
    warn "Mailcow no está instalado en mailcow/"
    return 1
  fi

  if ! mailcow_running; then
    warn "Mailcow no parece estar corriendo"
    return 0
  fi

  info "Deteniendo Mailcow..."
  (cd "$MAILCOW_DIR" && docker compose down >>"$MAILCOW_LOG" 2>&1)
  info "Mailcow detenido"
}

mailcow_status() {
  header
  echo "  Mailcow (${MAILCOW_HOSTNAME}):"
  echo ""

  if mailcow_installed; then
    echo -e "  Instalación: ${GREEN}mailcow/ presente${NC}"
  else
    echo -e "  Instalación: ${RED}no instalado${NC} — ./myrent.sh mailcow-setup"
    pause
    return
  fi

  if mailcow_running; then
    echo -e "  Estado:      ${GREEN}corriendo${NC}"
    echo "  Panel:       https://${MAILCOW_HOSTNAME}/admin"
    echo "  SMTP:        ${MAILCOW_HOSTNAME}:587 (submission)"
  else
    echo -e "  Estado:      ${YELLOW}detenido${NC}"
  fi

  echo ""
  echo "  Puertos Mailcow: 25, 80, 443, 587, 465 (+ IMAP/POP)"
  echo "  MyRent Go dev:   7070, 3000/4000, 27017 — evitar mismo host que Mailcow"
  echo "  Docs:            docs/Cloudflare/mailcow.md"
  echo "  Logs:            $MAILCOW_LOG"
  pause
}

mailcow_open() {
  open_browser "https://${MAILCOW_HOSTNAME}/admin"
}

mailcow_logs() {
  if mailcow_running; then
    (cd "$MAILCOW_DIR" && docker compose logs -f --tail 100)
  else
    warn "Mailcow no está corriendo"
    [[ -f "$MAILCOW_LOG" ]] && tail -50 "$MAILCOW_LOG"
  fi
}

# ─── Docker (stack en contenedores) ───────────────────────────────────────────

docker_require() {
  require_cmd docker || return 1
  if ! docker info &>/dev/null; then
    error "Docker no está corriendo."
    echo ""
    echo "  Inicia Docker Desktop y vuelve a intentar."
    return 1
  fi
}

docker_compose_env_args() {
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    echo --env-file "${ROOT_DIR}/.env"
  fi
}

docker_compose_dev() {
  load_dotenv
  local env_args
  env_args=$(docker_compose_env_args)
  # shellcheck disable=SC2086
  docker compose -f "$DOCKER_COMPOSE_DEV" $env_args "$@"
}

docker_compose_prod() {
  load_dotenv
  if [[ ! -f "${ROOT_DIR}/.env" ]]; then
    warn "No se encontró .env — producción requiere JWT_SECRET, CORS_ORIGINS, FRONTEND_URL, etc."
  fi
  local env_args
  env_args=$(docker_compose_env_args)
  # shellcheck disable=SC2086
  docker compose -f "$DOCKER_COMPOSE_PROD" $env_args "$@"
}

docker_build_api() {
  docker_require || return 1
  info "Construyendo imagen API (${DOCKER_IMAGE_API})..."
  docker build -t "$DOCKER_IMAGE_API" "${ROOT_DIR}/backend"
  info "Imagen lista: ${DOCKER_IMAGE_API}"
}

docker_build_frontend() {
  docker_require || return 1
  info "Construyendo imagen Frontend (${DOCKER_IMAGE_FRONTEND})..."
  docker build -t "$DOCKER_IMAGE_FRONTEND" "${ROOT_DIR}/frontend"
  info "Imagen lista: ${DOCKER_IMAGE_FRONTEND}"
}

docker_build_all() {
  docker_build_api && docker_build_frontend
}

docker_up() {
  docker_require || return 1
  info "Levantando stack completo (MongoDB + API + Frontend)..."
  docker_compose_dev up -d --build || return 1
  info "Stack Docker listo"
  echo "  API:      http://localhost:${API_PORT}"
  echo "  Frontend: http://localhost:${DOCKER_FRONTEND_PORT}"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_up_api() {
  docker_require || return 1
  info "Levantando MongoDB + API..."
  docker_compose_dev up -d --build mongodb api || return 1
  if wait_for_http "http://localhost:${API_PORT}/health" 60; then
    info "API lista → http://localhost:${API_PORT}/health"
  else
    warn "API aún no responde. Ver: ./myrent.sh docker-logs-api"
  fi
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_up_frontend() {
  docker_require || return 1
  info "Levantando Frontend (+ API y MongoDB)..."
  docker_compose_dev up -d --build frontend || return 1
  info "Frontend listo → http://localhost:${DOCKER_FRONTEND_PORT}"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_down() {
  docker_require || return 1
  info "Deteniendo stack Docker (dev)..."
  docker_compose_dev down
  info "Stack detenido"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_restart() {
  docker_require || return 1
  info "Reconstruyendo y reiniciando API + Frontend..."
  docker_compose_dev up -d --build --force-recreate api frontend || return 1
  info "API y Frontend reiniciados"
  echo "  API:      http://localhost:${API_PORT}"
  echo "  Frontend: http://localhost:${DOCKER_FRONTEND_PORT}"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_logs() {
  docker_require || return 1
  docker_compose_dev logs -f --tail 100
}

docker_logs_api() {
  docker_require || return 1
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-api$'; then
    docker logs -f --tail 100 myrent-api
  else
    warn "Contenedor myrent-api no está corriendo"
    docker_compose_dev logs --tail 50 api 2>/dev/null || true
  fi
}

docker_logs_frontend() {
  docker_require || return 1
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-frontend$'; then
    docker logs -f --tail 100 myrent-frontend
  else
    warn "Contenedor myrent-frontend no está corriendo"
    docker_compose_dev logs --tail 50 frontend 2>/dev/null || true
  fi
}

docker_up_prod() {
  docker_require || return 1
  if [[ "${1:-}" != "--yes" ]]; then
    header
    echo "  Levantando stack de producción..."
    echo ""
    warn "Usa docker-compose.prod.yml — requiere .env con JWT_SECRET, CORS_ORIGINS, FRONTEND_URL"
    echo ""
    read -r -p "  ¿Continuar? [s/N]: " confirm
    if [[ ! "$confirm" =~ ^[Ss]$ ]]; then
      warn "Cancelado"
      pause
      return 0
    fi
  fi
  docker_compose_prod up -d --build || return 1
  info "Stack de producción levantado"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

do_docker_logs_menu() {
  while true; do
    header
    echo "  Logs Docker (Ctrl+C para salir del tail):"
    echo ""
    echo "    1) Todos los servicios (compose)"
    echo "    2) API"
    echo "    3) Frontend"
    echo "    4) MongoDB"
    echo "    0) Volver"
    echo ""
    read -r -p "  Opción: " log_opt

    case "$log_opt" in
      1) docker_logs ;;
      2) docker_logs_api ;;
      3) docker_logs_frontend ;;
      4)
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mongodb$'; then
          docker logs -f --tail 100 myrent-mongodb
        else
          warn "Contenedor myrent-mongodb no está corriendo"
        fi
        ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

# ─── Instalar / Build ─────────────────────────────────────────────────────────

do_install() {
  header
  echo "  Instalando dependencias..."
  echo ""

  require_cmd go || return 1
  require_cmd npm || return 1

  info "Go modules..."
  (cd "${ROOT_DIR}/backend" && go mod download)

  info "npm packages..."
  (cd "${ROOT_DIR}/frontend" && npm install)

  info "Dependencias instaladas"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

do_build() {
  header
  echo "  Compilando proyecto..."
  echo ""

  require_cmd go || return 1
  require_cmd npm || return 1

  mkdir -p "${ROOT_DIR}/bin"

  info "Backend..."
  (cd "${ROOT_DIR}/backend" && CGO_ENABLED=0 go build -o "${ROOT_DIR}/bin/api" ./cmd/api)

  info "Frontend..."
  (cd "${ROOT_DIR}/frontend" && npm run build)

  info "Build completado"
  info "  Binario API: ${ROOT_DIR}/bin/api"
  info "  Frontend:    ${ROOT_DIR}/frontend/dist/"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

do_bootstrap_admin() {
  header
  echo "  Creando usuario admin y organización..."
  echo ""

  mongo_start || return 1

  local force=""
  if [[ "${1:-}" == "--force" ]]; then
    force="1"
  else
    read -r -p "  ¿Recrear admin si ya existe? [s/N]: " reset_ans
    [[ "$reset_ans" =~ ^[Ss]$ ]] && force="1"
  fi

  if [[ "$force" == "1" ]]; then
    warn "Recreando usuario admin..."
    if ! (cd "${ROOT_DIR}/backend" && SEED_FORCE=1 go run ./cmd/seed); then
      error "Bootstrap falló. Verifica que MongoDB esté corriendo (menú «Base de datos y servicios» → Solo MongoDB)."
      return 1
    fi
  else
    if ! (cd "${ROOT_DIR}/backend" && go run ./cmd/seed); then
      error "Bootstrap falló. Verifica que MongoDB esté corriendo (menú «Base de datos y servicios» → Solo MongoDB)."
      return 1
    fi
  fi

  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

# ─── API ──────────────────────────────────────────────────────────────────────

api_start() {
  if [[ -f "$API_PID_FILE" ]] && ! is_running "$API_PID_FILE"; then
    warn "PID file obsoleto; limpiando..."
    rm -f "$API_PID_FILE"
  fi

  if is_running "$API_PID_FILE"; then
    info "API ya está corriendo (PID $(cat "$API_PID_FILE"))"
    return 0
  fi

  if port_in_use "$API_PORT"; then
    error "Puerto ${API_PORT} ya está en uso"
    return 1
  fi

  mongo_start || return 1

  info "Iniciando API en puerto ${API_PORT}..."
  : >"$API_LOG"

  api_needs_build=0
  if [[ ! -x "${ROOT_DIR}/bin/api" ]]; then
    api_needs_build=1
  elif find "${ROOT_DIR}/backend" -name '*.go' -newer "${ROOT_DIR}/bin/api" -print -quit | grep -q .; then
    api_needs_build=1
  fi
  if [[ "$api_needs_build" -eq 1 ]]; then
    info "Compilando API..."
    mkdir -p "${ROOT_DIR}/bin"
    (cd "${ROOT_DIR}/backend" && CGO_ENABLED=0 go build -o "${ROOT_DIR}/bin/api" ./cmd/api) || return 1
  fi

  (
    load_dotenv
    export APP_ENV="${APP_ENV:-development}"
    export APP_PORT="${APP_PORT:-$API_PORT}"
    export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:${MONGO_PORT}}"
    export MONGODB_DATABASE="${MONGODB_DATABASE:-myrent}"
    export JWT_SECRET="${JWT_SECRET:-dev-secret-change-in-production-min-32-chars}"
    export JWT_ACCESS_TTL="${JWT_ACCESS_TTL:-24h}"
    export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${FRONTEND_PORT},http://localhost:5173}"
    export FRONTEND_URL="${FRONTEND_URL:-$APP_URL}"
    nohup "${ROOT_DIR}/bin/api" >>"$API_LOG" 2>&1 &
    echo $! >"$API_PID_FILE"
  )

  if wait_for_http "http://localhost:${API_PORT}/health" 45; then
    info "API lista → http://localhost:${API_PORT}/health"
  else
    error "API no respondió. Ver: tail -f $API_LOG"
    return 1
  fi
}

api_stop() {
  if is_running "$API_PID_FILE"; then
    local pid
    pid=$(cat "$API_PID_FILE")
    info "Deteniendo API (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$API_PID_FILE"
    info "API detenida"
  else
    warn "API no está corriendo"
    rm -f "$API_PID_FILE"
  fi
}

# ─── Frontend ─────────────────────────────────────────────────────────────────

frontend_start() {
  if [[ -f "$FRONTEND_PID_FILE" ]] && ! is_running "$FRONTEND_PID_FILE"; then
    warn "PID file obsoleto; limpiando..."
    rm -f "$FRONTEND_PID_FILE"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    info "Frontend ya está corriendo (PID $(cat "$FRONTEND_PID_FILE"))"
    return 0
  fi

  if ! curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; then
    warn "API no responde; iniciándola primero..."
    api_start || return 1
  fi

  if port_in_use "$FRONTEND_PORT"; then
    error "Puerto ${FRONTEND_PORT} ya está en uso"
    return 1
  fi

  require_cmd npm || return 1

  info "Iniciando frontend en puerto ${FRONTEND_PORT}..."
  : >"$FRONTEND_LOG"

  (
    cd "${ROOT_DIR}/frontend"
    export VITE_PORT="$FRONTEND_PORT"
    export VITE_API_PROXY="http://localhost:${API_PORT}"
    nohup npm run dev -- --host >>"$FRONTEND_LOG" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )

  if wait_for_port "$FRONTEND_PORT" 60; then
    info "Frontend listo → ${APP_URL}"
  else
    error "Frontend no respondió. Ver: tail -f $FRONTEND_LOG"
    return 1
  fi
}

frontend_stop() {
  if is_running "$FRONTEND_PID_FILE"; then
    local pid
    pid=$(cat "$FRONTEND_PID_FILE")
    info "Deteniendo frontend (PID $pid)..."
    # npm run dev spawns child; kill process group
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$FRONTEND_PID_FILE"
    # cleanup vite/node on port
    if port_in_use "$FRONTEND_PORT"; then
      lsof -ti ":${FRONTEND_PORT}" | xargs kill -9 2>/dev/null || true
    fi
    info "Frontend detenido"
  else
    warn "Frontend no está corriendo"
    rm -f "$FRONTEND_PID_FILE"
    if port_in_use "$FRONTEND_PORT"; then
      lsof -ti ":${FRONTEND_PORT}" | xargs kill -9 2>/dev/null || true
      info "Proceso huérfano en puerto ${FRONTEND_PORT} liberado"
    fi
  fi
}

# ─── Orquestación ─────────────────────────────────────────────────────────────

do_start_all() {
  header
  echo "  Levantando stack completo..."
  echo ""

  api_start || return 1
  frontend_start || return 1

  echo ""
  info "Stack listo"
  echo -e "  ${BOLD}${APP_URL}${NC}"
  echo -e "  Usuario: ${BOLD}${ADMIN_USER}${NC}  Contraseña: ${BOLD}${ADMIN_PASS}${NC}"
  echo ""

  read -r -p "  ¿Abrir navegador? [S/n]: " open_ans
  if [[ ! "$open_ans" =~ ^[Nn]$ ]]; then
    open_browser "$APP_URL"
  fi
  pause
}

do_stop_all() {
  header
  echo "  Deteniendo servicios..."
  echo ""

  frontend_stop
  api_stop

  read -r -p "  ¿Detener MongoDB también? [s/N]: " stop_mongo
  if [[ "$stop_mongo" =~ ^[Ss]$ ]]; then
    mongo_stop
  fi

  info "Servicios detenidos"
  pause
}

do_restart_services() {
  header
  echo "  Reiniciando API y Frontend..."
  echo ""

  frontend_stop
  api_stop

  api_start || return 1
  frontend_start || return 1

  echo ""
  info "API y Frontend reiniciados"
  echo -e "  ${BOLD}${APP_URL}${NC}"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

do_status() {
  header
  echo "  Estado de servicios:"
  echo ""

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mongodb$'; then
    echo -e "  MongoDB:   ${GREEN}corriendo${NC} (puerto ${MONGO_PORT})"
  else
    echo -e "  MongoDB:   ${RED}detenido${NC}"
  fi

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mailpit$'; then
    echo -e "  Mailpit:   ${YELLOW}opcional (dev)${NC} — corriendo (UI http://localhost:${MAIL_UI_PORT})"
  elif mailpit_available; then
    echo -e "  Mailpit:   ${YELLOW}puerto ${MAIL_SMTP_PORT} en uso (sin contenedor myrent-mailpit)${NC}"
  fi

  if mailcow_installed; then
    if mailcow_running; then
      echo -e "  Mailcow:   ${GREEN}corriendo${NC} (https://${MAILCOW_HOSTNAME}/admin)"
    else
      echo -e "  Mailcow:   ${YELLOW}instalado, detenido${NC} (mailcow/)"
    fi
  fi

  load_dotenv
  if [[ -n "${SMTP_HOST:-}" && -n "${SMTP_USER:-}" && -n "${SMTP_PASSWORD:-}" && -n "${SMTP_FROM:-${FROM_EMAIL:-}}" ]]; then
    echo -e "  SMTP:      ${GREEN}configurado${NC} (${SMTP_HOST}:${SMTP_PORT:-587}, ${SMTP_FROM:-${FROM_EMAIL:-—}})"
  elif [[ -n "${SMTP_HOST:-}" ]]; then
    echo -e "  SMTP:      ${YELLOW}incompleto${NC} — faltan credenciales o SMTP_FROM en .env"
  else
    echo -e "  SMTP:      ${RED}no configurado${NC} — completa .env para envío real (ver .env.example)"
  fi

  if is_running "$API_PID_FILE"; then
    echo -e "  API:       ${GREEN}corriendo${NC} (PID $(cat "$API_PID_FILE"), puerto ${API_PORT})"
  elif port_in_use "$API_PORT"; then
    echo -e "  API:       ${YELLOW}puerto ${API_PORT} en uso (sin PID file)${NC}"
  else
    echo -e "  API:       ${RED}detenida${NC}"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    echo -e "  Frontend:  ${GREEN}corriendo${NC} (PID $(cat "$FRONTEND_PID_FILE"), puerto ${FRONTEND_PORT})"
  elif port_in_use "$FRONTEND_PORT"; then
    echo -e "  Frontend:  ${YELLOW}puerto ${FRONTEND_PORT} en uso (sin PID file)${NC}"
  else
    echo -e "  Frontend:  ${RED}detenido${NC}"
  fi

  if port_in_use "$FRONTEND_PORT" && ! curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; then
    echo ""
    warn "Frontend activo pero API no responde — el login fallará. Usa «Base de datos y servicios» → Solo API."
  fi

  echo ""
  echo "  Logs:"
  echo "    API:      $API_LOG"
  echo "    Frontend: $FRONTEND_LOG"
  echo "    MongoDB:  $MONGO_LOG"
  echo "    Mailpit:  $MAIL_LOG"
  pause
}

do_logs_menu() {
  while true; do
    header
    echo "  Ver logs (Ctrl+C para salir del tail):"
    echo ""
    echo "    1) API"
    echo "    2) Frontend"
    echo "    3) MongoDB (docker)"
    echo "    4) Mailpit (opcional, solo dev)"
    echo "    5) Todos (multiplexado)"
    echo "    0) Volver"
    echo ""
    read -r -p "  Opción: " log_opt

    case "$log_opt" in
      1)
        [[ -f "$API_LOG" ]] && tail -f "$API_LOG" || warn "Sin logs de API"
        ;;
      2)
        [[ -f "$FRONTEND_LOG" ]] && tail -f "$FRONTEND_LOG" || warn "Sin logs de frontend"
        ;;
      3)
        mongo_logs
        ;;
      4)
        mailpit_logs
        ;;
      5)
        if require_cmd multitail 2>/dev/null; then
          multitail "$API_LOG" "$FRONTEND_LOG"
        else
          warn "Instala 'multitail' para ver ambos, mostrando API+Frontend alternados:"
          tail -f "$API_LOG" "$FRONTEND_LOG" 2>/dev/null || warn "Sin logs"
        fi
        ;;
      0) return ;;
      *) warn "Opción inválida" ; sleep 1 ;;
    esac
  done
}

do_open_browser() {
  header
  if ! port_in_use "$FRONTEND_PORT"; then
    warn "Frontend no está corriendo en puerto ${FRONTEND_PORT}"
    read -r -p "  ¿Levantar stack y abrir? [S/n]: " start_ans
    if [[ ! "$start_ans" =~ ^[Nn]$ ]]; then
      do_start_all
      return
    fi
  fi
  open_browser "$APP_URL"
  pause
}

do_test() {
  header
  echo "  Ejecutando tests..."
  echo ""
  (cd "${ROOT_DIR}/backend" && go test ./... -count=1)
  info "Tests completados"
  pause
}

do_quickstart() {
  header
  echo "  Inicio rápido (instalar + admin + levantar)..."
  echo ""

  SKIP_PAUSE=1 do_install || { error "Falló la instalación de dependencias"; return 1; }
  SKIP_PAUSE=1 do_bootstrap_admin --force || { error "Falló la creación del admin — revisa MongoDB arriba"; return 1; }

  api_start || { error "Falló el inicio de la API"; return 1; }
  frontend_start || { error "Falló el inicio del frontend"; return 1; }

  echo ""
  info "¡Listo para probar!"
  echo -e "  URL:      ${BOLD}${APP_URL}${NC}"
  echo -e "  Usuario:  ${BOLD}${ADMIN_USER}${NC}"
  echo -e "  Password: ${BOLD}${ADMIN_PASS}${NC}"
  open_browser "$APP_URL"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}


# ─── Git / GitHub ─────────────────────────────────────────────────────────────

git_in_repo() {
  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
    error "No es un repositorio Git: $ROOT_DIR"
    return 1
  fi
}

gh_available() {
  command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1
}

do_git_status() {
  header
  echo "  Git — estado del repositorio"
  echo ""
  git_in_repo || { pause; return 1; }
  (cd "$ROOT_DIR" && git status)
  echo ""
  if gh_available; then
    info "GitHub CLI (gh) disponible y autenticado"
  else
    warn "gh no disponible o sin sesión — solo comandos git"
  fi
  pause
}

do_git_commit() {
  header
  echo "  Git — agregar y commit"
  echo ""
  git_in_repo || { pause; return 1; }

  if [[ -z "$(cd "$ROOT_DIR" && git status --porcelain)" ]]; then
    warn "No hay cambios para commitear"
    pause
    return 0
  fi

  echo "  Cambios pendientes:"
  (cd "$ROOT_DIR" && git status --short)
  echo ""

  read -r -p "  Mensaje de commit [chore: actualización desde myrent.sh]: " msg
  msg="${msg:-chore: actualización desde myrent.sh}"

  read -r -p "  ¿Agregar todos los archivos (git add -A)? [S/n]: " add_all
  if [[ ! "$add_all" =~ ^[Nn]$ ]]; then
    (cd "$ROOT_DIR" && git add -A) || { pause; return 1; }
  else
    read -r -p "  Rutas a agregar (espacio entre archivos): " -a paths
    if [[ ${#paths[@]} -eq 0 ]]; then
      warn "No se indicaron rutas"
      pause
      return 1
    fi
    (cd "$ROOT_DIR" && git add -- "${paths[@]}") || { pause; return 1; }
  fi

  if (cd "$ROOT_DIR" && git commit -m "$msg"); then
    info "Commit creado"
  else
    error "Commit falló"
  fi
  pause
}

do_git_push() {
  header
  echo "  Git — push a GitHub (origin)"
  echo ""
  git_in_repo || { pause; return 1; }

  local branch
  branch=$(cd "$ROOT_DIR" && git branch --show-current)
  if [[ -z "$branch" ]]; then
    error "No se pudo determinar la rama actual"
    pause
    return 1
  fi

  info "Rama: ${branch}"
  if ! (cd "$ROOT_DIR" && git remote get-url origin &>/dev/null); then
    error "No hay remoto 'origin'. Configura con: git remote add origin <url>"
    pause
    return 1
  fi

  if gh_available; then
    info "gh detectado — push con git (origin)"
  fi

  if (cd "$ROOT_DIR" && git push -u origin "$branch"); then
    info "Push completado → origin/${branch}"
    if gh_available; then
      echo ""
      gh repo view 2>/dev/null | sed 's/^/    /' || true
    fi
  else
    error "Push falló. Revisa credenciales, rama y remoto (menú «Git / GitHub» → Ver remoto y rama actual)."
  fi
  pause
}

do_git_pull() {
  header
  echo "  Git — pull desde origin"
  echo ""
  git_in_repo || { pause; return 1; }

  local branch
  branch=$(cd "$ROOT_DIR" && git branch --show-current)
  info "Rama actual: ${branch:-desconocida}"

  if (cd "$ROOT_DIR" && git pull --rebase origin "${branch:-}"); then
    info "Pull completado"
  else
    error "Pull falló"
  fi
  pause
}

do_git_remote_info() {
  header
  echo "  Git — remoto y rama"
  echo ""
  git_in_repo || { pause; return 1; }

  echo "  Remotos:"
  (cd "$ROOT_DIR" && git remote -v) | sed 's/^/    /'
  echo ""
  echo "  Ramas:"
  (cd "$ROOT_DIR" && git branch -vv) | sed 's/^/    /'
  echo ""

  if gh_available; then
    echo "  GitHub (gh repo view):"
    gh repo view 2>/dev/null | sed 's/^/    /' || warn "No se pudo obtener info del repo con gh"
  fi
  pause
}

do_git_create_branch() {
  header
  echo "  Git — crear y cambiar de rama"
  echo ""
  git_in_repo || { pause; return 1; }

  read -r -p "  Nombre de la nueva rama: " new_branch
  if [[ -z "$new_branch" ]]; then
    warn "Nombre vacío"
    pause
    return 1
  fi

  if (cd "$ROOT_DIR" && git checkout -b "$new_branch"); then
    info "Rama creada y activa: $new_branch"
    read -r -p "  ¿Push y establecer upstream en origin? [s/N]: " push_new
    if [[ "$push_new" =~ ^[Ss]$ ]]; then
      (cd "$ROOT_DIR" && git push -u origin "$new_branch") && info "Upstream configurado" || error "Push falló"
    fi
  else
    error "No se pudo crear la rama"
  fi
  pause
}


# ─── Menús (principal + submenús) ─────────────────────────────────────────────

show_main_menu() {
  header
  echo -e "  ${BOLD}Menú principal${NC}"
  echo ""
  echo "    1)  Desarrollo e inicio"
  echo "    2)  Base de datos y servicios"
  echo "    3)  Git / GitHub"
  echo "    4)  Utilidades"
  echo "    5)  Docker (imágenes y contenedores)"
  echo ""
  echo "    0)  Salir"
  echo ""
}

menu_desarrollo() {
  while true; do
    header
    echo -e "  ${BOLD}Desarrollo e inicio${NC}"
    echo ""
    echo "    1)  Inicio rápido (instalar + admin + levantar + navegador)"
    echo "    2)  Instalar dependencias"
    echo "    3)  Build (compilar backend + frontend)"
    echo "    4)  Levantar todo (MongoDB + API + Frontend)"
    echo "    5)  Detener servicios"
    echo "    6)  Reiniciar API y Frontend"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_quickstart; [[ $? -ne 0 ]] && pause ;;
      2) do_install ;;
      3) do_build ;;
      4) do_start_all; [[ $? -ne 0 ]] && pause ;;
      5) do_stop_all ;;
      6) do_restart_services; [[ $? -ne 0 ]] && pause ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

menu_base_datos() {
  while true; do
    header
    echo -e "  ${BOLD}Base de datos y servicios${NC}"
    echo ""
    echo "    1)  Crear admin (admin / admin123)"
    echo "    2)  Solo MongoDB"
    echo "    3)  Solo API"
    echo "    4)  Solo Frontend"
    echo "    5)  Mailpit (opcional — captura local, no envía correos reales)"
    echo "    6)  Abrir bandeja Mailpit (http://localhost:${MAIL_UI_PORT})"
    echo "    7)  Mailcow — instalar (VPS / mail.meincart.com)"
    echo "    8)  Mailcow — iniciar / detener"
    echo "    9)  Mailcow — estado y panel admin"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_bootstrap_admin ;;
      2) mongo_start; [[ $? -ne 0 ]] && pause || pause ;;
      3) api_start; [[ $? -ne 0 ]] && pause || pause ;;
      4) frontend_start; [[ $? -ne 0 ]] && pause || pause ;;
      5) mailpit_start; [[ $? -ne 0 ]] && pause || pause ;;
      6) mailpit_open; pause ;;
      7) mailcow_setup; pause ;;
      8)
        echo "    a) Iniciar  b) Detener"
        read -r -p "  Sub-opción [a/b]: " sub
        case "$sub" in
          a|A) mailcow_start; [[ $? -ne 0 ]] && pause || pause ;;
          b|B) mailcow_stop; pause ;;
          *) warn "Opción inválida"; sleep 1 ;;
        esac
        ;;
      9)
        echo "    a) Estado  b) Abrir panel  c) Logs"
        read -r -p "  Sub-opción [a/b/c]: " sub
        case "$sub" in
          a|A) mailcow_status ;;
          b|B) mailcow_open; pause ;;
          c|C) mailcow_logs ;;
          *) warn "Opción inválida"; sleep 1 ;;
        esac
        ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

menu_git() {
  while true; do
    header
    echo -e "  ${BOLD}Git / GitHub${NC}"
    echo ""
    echo "    1)  Estado (git status)"
    echo "    2)  Agregar y commit"
    echo "    3)  Push a origin (GitHub)"
    echo "    4)  Pull desde origin"
    echo "    5)  Ver remoto y rama actual"
    echo "    6)  Crear rama"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_git_status ;;
      2) do_git_commit ;;
      3) do_git_push ;;
      4) do_git_pull ;;
      5) do_git_remote_info ;;
      6) do_git_create_branch ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

menu_docker() {
  while true; do
    header
    echo -e "  ${BOLD}Docker${NC}"
    echo ""
    echo "    1)  Build imagen API"
    echo "    2)  Build imagen Frontend"
    echo "    3)  Build ambas imágenes"
    echo "    4)  Levantar stack completo (dev)"
    echo "    5)  Levantar solo API (+ MongoDB)"
    echo "    6)  Levantar solo Frontend (+ dependencias)"
    echo "    7)  Detener stack (dev)"
    echo "    8)  Reiniciar API y Frontend (rebuild)"
    echo "    9)  Ver logs"
    echo "    10) Producción (docker-compose.prod.yml)"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) docker_build_api; [[ $? -ne 0 ]] && pause || pause ;;
      2) docker_build_frontend; [[ $? -ne 0 ]] && pause || pause ;;
      3) docker_build_all; [[ $? -ne 0 ]] && pause || pause ;;
      4) docker_up; [[ $? -ne 0 ]] && pause ;;
      5) docker_up_api; [[ $? -ne 0 ]] && pause ;;
      6) docker_up_frontend; [[ $? -ne 0 ]] && pause ;;
      7) docker_down ;;
      8) docker_restart; [[ $? -ne 0 ]] && pause ;;
      9) do_docker_logs_menu ;;
      10) docker_up_prod; [[ $? -ne 0 ]] && pause ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

menu_utilidades() {
  while true; do
    header
    echo -e "  ${BOLD}Utilidades${NC}"
    echo ""
    echo "    1)  Ver logs"
    echo "    2)  Estado de servicios"
    echo "    3)  Abrir navegador"
    echo "    4)  Ejecutar tests"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_logs_menu ;;
      2) do_status ;;
      3) do_open_browser ;;
      4) do_test ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

main_menu() {
  set +e
  while true; do
    show_main_menu
    read -r -p "  Selecciona una opción: " opt
    echo ""

    case "$opt" in
      1) menu_desarrollo ;;
      2) menu_base_datos ;;
      3) menu_git ;;
      4) menu_utilidades ;;
      5) menu_docker ;;
      0)
        echo "  Hasta pronto."
        exit 0
        ;;
      *)
        warn "Opción inválida"
        sleep 1
        ;;
    esac
  done
}

# ─── CLI directo (sin menú) ───────────────────────────────────────────────────

if [[ "${1:-}" != "" ]]; then
  case "$1" in
    install)    do_install ;;
    build)      do_build ;;
    seed|bootstrap) do_bootstrap_admin "${2:-}" ;;
    start)      do_start_all ;;
    stop)       do_stop_all ;;
    restart)    do_restart_services ;;
    status)     do_status ;;
    logs)       do_logs_menu ;;
    open|browser) open_browser "$APP_URL" ;;
    test)       do_test ;;
    quickstart) SKIP_PAUSE=1 do_quickstart ;;
    api)        SKIP_PAUSE=1 api_start ;;
    frontend)   SKIP_PAUSE=1 frontend_start ;;
    mail|mailpit) SKIP_PAUSE=1 mailpit_start ;;
    mail-open)  mailpit_open ;;
    mailcow-setup) mailcow_setup ;;
    mailcow-start) SKIP_PAUSE=1 mailcow_start ;;
    mailcow-stop) mailcow_stop ;;
    mailcow-status) mailcow_status ;;
    mailcow-open) mailcow_open ;;
    git-status) do_git_status ;;
    git-commit) do_git_commit ;;
    git-push)   do_git_push ;;
    git-pull)   do_git_pull ;;
    docker-build|docker-build-all) SKIP_PAUSE=1 docker_build_all ;;
    docker-build-api)   SKIP_PAUSE=1 docker_build_api ;;
    docker-build-frontend) SKIP_PAUSE=1 docker_build_frontend ;;
    docker-up)          SKIP_PAUSE=1 docker_up ;;
    docker-up-api)      SKIP_PAUSE=1 docker_up_api ;;
    docker-up-frontend) SKIP_PAUSE=1 docker_up_frontend ;;
    docker-down)        SKIP_PAUSE=1 docker_down ;;
    docker-restart)     SKIP_PAUSE=1 docker_restart ;;
    docker-logs)        docker_logs ;;
    docker-logs-api)    docker_logs_api ;;
    docker-logs-frontend) docker_logs_frontend ;;
    docker-up-prod)     SKIP_PAUSE=1 docker_up_prod --yes ;;
    *)
      echo "Uso: $0 [install|build|bootstrap|start|stop|restart|status|logs|open|test|quickstart|"
      echo "         api|frontend|mail|mail-open|mailcow-setup|mailcow-start|mailcow-stop|mailcow-status|mailcow-open|"
      echo "         git-status|git-commit|git-push|git-pull|"
      echo "         docker-build-all|docker-build-api|docker-build-frontend|docker-up|docker-up-api|docker-up-frontend|"
      echo "         docker-down|docker-restart|docker-logs|docker-logs-api|docker-logs-frontend|docker-up-prod]"
      exit 1
      ;;
  esac
  exit 0
fi

main_menu
