#!/usr/bin/env bash
#
# MyRent Go — menú interactivo para desarrollo local (principal + submenús)
# Uso: ./myrent.sh  |  Guía rápida: ./myrent.sh modes  o  ./myrent.sh help-ports
#
# Modos (ver tabla con ./myrent.sh modes):
#   NATIVO  — Vite :4000 + API :7070  (local-start, watch, local-restart)
#   DOCKER  — nginx :3000 + API :7070 (docker-up, docker-restart)
#   No correr API nativa y contenedor Docker a la vez (mismo :7070).
#
# CLI nativo:  local-start | local-stop | local-status | local-restart | watch
#              (alias: start, stop, restart)
# CLI Docker:  docker-up | docker-down | docker-restart | docker-build-all
# Tests:       test, test-all, test-unit, test-e2e, …
# Sync Docker: start/restart/quickstart actualizan imágenes (MYRENT_SYNC_DOCKER=0 para desactivar)
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
MYRENT_SYNC_DOCKER="${MYRENT_SYNC_DOCKER:-1}"

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
native_api_active() {
  if is_running "$API_PID_FILE"; then
    return 0
  fi
  if port_in_use "$API_PORT" && ! docker_container_running "myrent-api"; then
    return 0
  fi
  return 1
}

docker_api_active() {
  docker_container_running "myrent-api" && port_in_use "$API_PORT"
}

detect_dev_mode_summary() {
  local native_fe=false native_api=false docker_fe=false docker_api=false

  is_running "$FRONTEND_PID_FILE" && native_fe=true
  native_api_active && native_api=true
  docker_container_running "myrent-frontend" 2>/dev/null && docker_fe=true
  docker_api_active && docker_api=true

  if $native_api && $native_fe; then
    echo -e "${GREEN}NATIVO${NC} — App :${FRONTEND_PORT}, API :${API_PORT}"
  elif $docker_api && $docker_fe; then
    echo -e "${CYAN}DOCKER${NC} — App :${DOCKER_FRONTEND_PORT}, API :${API_PORT}"
  elif $native_api || $native_fe; then
    echo -e "${YELLOW}NATIVO (parcial)${NC} — :${FRONTEND_PORT} / :${API_PORT}"
  elif $docker_api || $docker_fe; then
    echo -e "${YELLOW}DOCKER (parcial)${NC} — :${DOCKER_FRONTEND_PORT} / :${API_PORT}"
  else
    echo -e "${YELLOW}ninguno${NC} — ./myrent.sh modes"
  fi
}

show_dev_modes_help() {
  echo ""
  echo -e "  ${BOLD}Modos de desarrollo — puertos y recarga${NC}"
  echo ""
  printf "  %-20s %-12s %-8s %s\n" "Modo" "Frontend" "API" "Cuándo reiniciar"
  echo "  ───────────────────────────────────────────────────────────────────────────"
  printf "  %-20s %-12s %-8s %s\n" "Nativo + watch" ":${FRONTEND_PORT} (Vite)" ":${API_PORT}" "Auto (air + HMR)"
  printf "  %-20s %-12s %-8s %s\n" "Nativo manual" ":${FRONTEND_PORT} (Vite)" ":${API_PORT}" "local-restart"
  printf "  %-20s %-12s %-8s %s\n" "Docker" ":${DOCKER_FRONTEND_PORT} (nginx)" ":${API_PORT}" "docker-restart"
  echo ""
  echo -e "  ${YELLOW}Regla clave:${NC} API nativa y Docker comparten :${API_PORT} — solo una a la vez."
  echo "  Nativo usa Vite en :${FRONTEND_PORT}; Docker sirve build estático en :${DOCKER_FRONTEND_PORT}."
  echo ""
  echo "  Comandos:"
  echo "    ./myrent.sh local-start      Nativo en segundo plano"
  echo "    ./myrent.sh watch            Nativo con recarga automática"
  echo "    ./myrent.sh local-restart    Reiniciar nativo tras cambios"
  echo "    ./myrent.sh docker-up        Levantar stack Docker"
  echo "    ./myrent.sh docker-restart   Rebuild + reinicio Docker"
  echo "    ./myrent.sh docker-down      Detener stack Docker"
  echo ""
}

show_active_mode_banner() {
  local mode="$1"
  echo ""
  case "$mode" in
    native)
      echo -e "  ${GREEN}${BOLD}▶ Modo activo: NATIVO${NC}"
      echo "    App:      http://localhost:${FRONTEND_PORT}  (Vite dev)"
      echo "    API:      http://localhost:${API_PORT}"
      echo "    Recarga:  ./myrent.sh watch  (auto)  |  ./myrent.sh local-restart  (manual)"
      ;;
    native-watch)
      echo -e "  ${GREEN}${BOLD}▶ Modo activo: NATIVO + WATCH${NC}"
      echo "    App:      http://localhost:${FRONTEND_PORT}  (Vite HMR)"
      echo "    API:      http://localhost:${API_PORT}  (air)"
      echo "    Recarga:  automática al guardar — Ctrl+C para detener"
      ;;
    docker)
      echo -e "  ${CYAN}${BOLD}▶ Modo activo: DOCKER${NC}"
      echo "    App:      http://localhost:${DOCKER_FRONTEND_PORT}  (nginx)"
      echo "    API:      http://localhost:${API_PORT}"
      echo "    Recarga:  ./myrent.sh docker-restart  (rebuild + up)"
      ;;
  esac
  echo ""
}

port_conflict_check() {
  local context="${1:-any}"
  local blocked=false
  local has_native=false has_docker_api=false

  if is_running "$API_PID_FILE"; then
    has_native=true
  elif port_in_use "$API_PORT"; then
    if docker_container_running "myrent-api"; then
      has_docker_api=true
    else
      has_native=true
    fi
  elif docker_container_running "myrent-api"; then
    has_docker_api=true
  fi

  if $has_native && $has_docker_api; then
    warn "Conflicto en puerto ${API_PORT}: API nativa y contenedor Docker activos a la vez"
    echo "  Detén uno:"
    echo "    Nativo:  ./myrent.sh local-stop"
    echo "    Docker:  ./myrent.sh docker-down"
    blocked=true
  elif [[ "$context" == "native" ]] && $has_docker_api; then
    warn "Puerto ${API_PORT} ocupado por contenedor Docker myrent-api"
    echo "  Para dev nativo: ./myrent.sh docker-down"
    echo "  Para seguir con Docker: no uses local-start (app en :${DOCKER_FRONTEND_PORT})"
    blocked=true
  elif [[ "$context" == "docker" ]] && $has_native; then
    warn "Puerto ${API_PORT} ocupado por API nativa (dev local)"
    echo "  Para Docker: ./myrent.sh local-stop"
    echo "  Para seguir nativo: no uses docker-up (app en :${FRONTEND_PORT})"
    blocked=true
  fi

  $blocked && return 1
  return 0
}

header() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║           MyRent Go — Dev Menu           ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  Activo: $(detect_dev_mode_summary)"
  echo -e "  Login:  ${BOLD}${ADMIN_USER}${NC} / ${BOLD}${ADMIN_PASS}${NC}  |  Guía: ${BOLD}./myrent.sh modes${NC}"
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
  [[ -f "$env_file" ]] || return 0

  set -a
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue

    if [[ "$line" == export[[:space:]]* ]]; then
      line="${line#export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    [[ "$line" != *"="* ]] && continue

    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"

    # Valores entre comillas (ej. SMTP_FROM_NAME="MyRent Go")
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi

    printf -v "$key" '%s' "$val"
    export "$key"
  done < "$env_file"
  set +a
}

# ─── MongoDB ──────────────────────────────────────────────────────────────────

mongo_available() {
  port_in_use "$MONGO_PORT"
}

mongo_docker_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mongodb$'
}

mongo_brew_formulas() {
  local formula
  for formula in mongodb-community@7.0 mongodb-community mongodb-community@8.3 mongodb-community@8.2 mongodb-community@8.0; do
    if command -v brew &>/dev/null && brew list "$formula" &>/dev/null 2>&1; then
      echo "$formula"
    fi
  done
}

mongo_brew_formula() {
  mongo_brew_formulas | head -1
}

mongo_brew_installed() {
  mongo_brew_formulas | grep -q .
}

mongo_brew_install_hint() {
  echo "    brew tap mongodb/brew"
  echo "    brew trust mongodb/brew   # si Homebrew pide confiar el tap"
  echo "    brew install mongodb-community@7.0   # o mongodb-community"
  echo "    brew services start mongodb-community@7.0"
}

mongo_report_running() {
  if mongo_docker_running; then
    info "MongoDB (Docker) ya está corriendo"
  else
    info "MongoDB detectado en puerto ${MONGO_PORT}"
  fi
}

mongo_start_brew() {
  local formula wait_secs="${1:-15}"
  local started=false

  if ! mongo_brew_installed; then
    return 1
  fi

  while IFS= read -r formula; do
    [[ -z "$formula" ]] && continue
    info "Iniciando MongoDB con Homebrew (${formula})..."
    if ! brew services start "$formula" >>"$MONGO_LOG" 2>&1; then
      warn "No se pudo iniciar ${formula} con brew services."
      tail -5 "$MONGO_LOG" 2>/dev/null | sed 's/^/    /'
      continue
    fi
    started=true
    if wait_for_port "$MONGO_PORT" "$wait_secs"; then
      info "MongoDB listo en puerto ${MONGO_PORT} (Homebrew, ${formula})"
      return 0
    fi
    warn "${formula} no respondió en ${wait_secs}s — probando otra fórmula si existe..."
    brew services stop "$formula" >>"$MONGO_LOG" 2>&1 || true
  done < <(mongo_brew_formulas)

  if $started; then
    warn "MongoDB (Homebrew) no respondió en puerto ${MONGO_PORT}."
  fi
  return 1
}

mongo_start_docker() {
  if ! command -v docker &>/dev/null; then
    error "Docker no está instalado."
    echo ""
    echo "  Opciones:"
    echo "  MongoDB nativo:"
    mongo_brew_install_hint | sed 's/^/    /'
    echo "    • O instala Docker Desktop para usar solo el contenedor MongoDB"
    return 1
  fi

  if ! docker info &>/dev/null; then
    error "Docker no está corriendo."
    echo ""
    echo "  Inicia Docker Desktop o usa MongoDB nativo:"
    mongo_brew_install_hint | sed 's/^/    /'
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
    info "MongoDB listo en puerto ${MONGO_PORT} (Docker)"
    return 0
  fi

  error "MongoDB no respondió a tiempo. Ver logs: $MONGO_LOG"
  tail -10 "$MONGO_LOG" 2>/dev/null | sed 's/^/    /'
  return 1
}

# Para dev nativo (local-start): brew → Docker (solo mongodb) → aviso claro.
mongo_ensure_for_local() {
  local with_docker_mongo="${1:-false}"

  if mongo_available; then
    mongo_report_running
    return 0
  fi

  if mongo_start_brew 15; then
    return 0
  fi

  if command -v docker &>/dev/null && docker info &>/dev/null; then
    if mongo_start_docker; then
      return 0
    fi
  elif [[ "$with_docker_mongo" == true ]]; then
    mongo_start_docker || true
    mongo_available && return 0
  fi

  warn "MongoDB no está disponible en puerto ${MONGO_PORT}."
  echo ""
  if ! mongo_brew_installed; then
    echo "  MongoDB (servidor) no está instalado con Homebrew. Instala e inicia:"
    mongo_brew_install_hint | sed 's/^/    /'
    echo ""
  fi
  if command -v docker &>/dev/null && ! docker info &>/dev/null; then
    echo "  Docker está instalado pero apagado. Para MongoDB + Mailpit sin instalar brew:"
    echo "    Inicia Docker Desktop y ejecuta:"
    echo "      docker compose -f docker-compose.yml up -d mongodb"
    echo "      docker compose -f docker-compose.mail.yml up -d"
    echo "    Luego: ./myrent.sh local-restart"
    echo ""
  fi
  echo "  Se iniciarán API y Frontend; /health y login fallarán hasta que MongoDB esté activo."
  echo "  Atajo: ./myrent.sh local-start --with-docker-mongo  (requiere Docker en marcha)"
  return 1
}

# Menú / bootstrap: puerto existente → Homebrew → Docker (requiere daemon si no hay nativo).
mongo_start() {
  if mongo_available; then
    mongo_report_running
    return 0
  fi

  if mongo_start_brew 60; then
    return 0
  fi

  mongo_start_docker
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

smtp_configured() {
  load_dotenv
  [[ -n "${SMTP_HOST:-}" && -n "${SMTP_USER:-}" && -n "${SMTP_PASSWORD:-}" && -n "${SMTP_FROM:-${FROM_EMAIL:-}}" ]]
}

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
    if smtp_configured; then
      info "Mailpit omitido — SMTP real configurado en .env (${SMTP_HOST})"
    else
      warn "Mailpit no disponible (Docker no instalado). Opcional en dev."
      echo "  Configura SMTP en .env (ver .env.example) o instala Docker para Mailpit."
    fi
    return 0
  fi

  if ! docker info &>/dev/null; then
    if smtp_configured; then
      info "Mailpit omitido — SMTP real configurado en .env (${SMTP_HOST})"
    else
      warn "Mailpit no disponible (Docker apagado). Opcional en dev."
      echo "  Inicia Docker y: docker compose -f docker-compose.mail.yml up -d"
      echo "  O configura SMTP real en .env (ver .env.example)."
    fi
    return 0
  fi

  info "Iniciando Mailpit con Docker..."
  if ! docker compose -f "${ROOT_DIR}/docker-compose.mail.yml" up -d >>"$MAIL_LOG" 2>&1; then
    warn "No se pudo levantar Mailpit (opcional en dev)."
    tail -10 "$MAIL_LOG" 2>/dev/null | sed 's/^/    /'
    echo "  Configura SMTP real en .env o inicia Mailpit cuando Docker esté disponible."
    return 0
  fi

  if wait_for_port "$MAIL_SMTP_PORT" 30; then
    info "Mailpit listo — bandeja: http://localhost:${MAIL_UI_PORT}  SMTP: localhost:${MAIL_SMTP_PORT}"
  else
    warn "Mailpit no respondió a tiempo (opcional). Ver logs: $MAIL_LOG"
    tail -10 "$MAIL_LOG" 2>/dev/null | sed 's/^/    /'
  fi
  return 0
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

docker_container_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${1}$"
}

# Reconstruye imágenes Docker tras reinicio dev nativo; reinicia contenedores solo si ya corrían.
docker_sync_after_restart() {
  if [[ "$MYRENT_SYNC_DOCKER" == "0" ]]; then
    return 0
  fi

  if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
    warn "Docker no disponible — omitiendo actualización de imágenes"
    return 0
  fi

  echo ""
  info "Actualizando imágenes Docker (api + frontend)..."
  if ! docker_compose_dev build api frontend; then
    warn "Build Docker falló — dev nativo sigue activo"
    return 0
  fi
  info "Imágenes Docker actualizadas"

  local api_docker=false frontend_docker=false
  docker_container_running "myrent-api" && api_docker=true
  docker_container_running "myrent-frontend" && frontend_docker=true

  if ! $api_docker && ! $frontend_docker; then
    info "Stack Docker detenido — solo imágenes actualizadas (sin conflicto de puertos)"
    return 0
  fi

  # Dev nativo y Docker API comparten puerto 7070
  local native_api=false
  if is_running "$API_PID_FILE"; then
    native_api=true
  elif port_in_use "$API_PORT" && ! docker_container_running "myrent-api"; then
    native_api=true
  fi

  local services=()
  if $api_docker; then
    if $native_api; then
      warn "Puerto ${API_PORT} en uso por dev nativo — contenedor API Docker no se reiniciará"
    else
      services+=(api)
    fi
  fi
  if $frontend_docker; then
    services+=(frontend)
  fi

  if [[ ${#services[@]} -eq 0 ]]; then
    return 0
  fi

  info "Reiniciando contenedores Docker: ${services[*]}..."
  if ! docker_compose_dev up -d "${services[@]}"; then
    warn "No se pudieron reiniciar algunos contenedores Docker"
  else
    info "Contenedores Docker actualizados"
  fi
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
  port_conflict_check docker || return 1
  info "Levantando stack Docker (MongoDB + API + Frontend)..."
  docker_compose_dev up -d --build || return 1
  info "Stack Docker listo"
  show_active_mode_banner docker
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_up_api() {
  docker_require || return 1
  port_conflict_check docker || return 1
  info "Levantando MongoDB + API (Docker)..."
  docker_compose_dev up -d --build mongodb api || return 1
  if wait_for_http "http://localhost:${API_PORT}/health" 60; then
    info "API Docker lista → http://localhost:${API_PORT}/health"
    echo "  Frontend nativo: :${FRONTEND_PORT}  |  Docker: :${DOCKER_FRONTEND_PORT}"
  else
    warn "API aún no responde. Ver: ./myrent.sh docker-logs-api"
  fi
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

docker_up_frontend() {
  docker_require || return 1
  port_conflict_check docker || return 1
  info "Levantando Frontend Docker (+ API y MongoDB)..."
  docker_compose_dev up -d --build frontend || return 1
  info "Frontend Docker listo"
  show_active_mode_banner docker
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
  port_conflict_check docker || return 1
  info "Reconstruyendo y reiniciando API + Frontend (Docker)..."
  docker_compose_dev up -d --build --force-recreate api frontend || return 1
  info "API y Frontend Docker reiniciados"
  show_active_mode_banner docker
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
  local deploy_script="${ROOT_DIR}/scripts/deploy-prod.sh"
  if [[ ! -x "$deploy_script" ]]; then
    error "No se encontró scripts/deploy-prod.sh"
    echo "  chmod +x scripts/deploy-prod.sh"
    pause
    return 1
  fi
  if [[ "${1:-}" == "--yes" ]]; then
    SKIP_PAUSE=1 "$deploy_script" --yes
  else
    "$deploy_script"
  fi
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

  if air_available; then
    info "air (hot reload API) ya instalado"
  else
    warn "air no instalado — recarga automática de API no disponible"
    echo "  Instala con: go install github.com/air-verse/air@latest"
    echo "  Asegúrate de tener \$HOME/go/bin en PATH."
  fi

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

api_env_export() {
  load_dotenv
  export APP_ENV="${APP_ENV:-development}"
  export APP_PORT="${APP_PORT:-$API_PORT}"
  export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:${MONGO_PORT}}"
  export MONGODB_DATABASE="${MONGODB_DATABASE:-myrent}"
  export JWT_SECRET="${JWT_SECRET:-dev-secret-change-in-production-min-32-chars}"
  export JWT_ACCESS_TTL="${JWT_ACCESS_TTL:-24h}"
  export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${FRONTEND_PORT},http://localhost:5173}"
  export FRONTEND_URL="${FRONTEND_URL:-$APP_URL}"
}

air_bin() {
  if command -v air &>/dev/null; then
    command -v air
  elif [[ -x "${HOME}/go/bin/air" ]]; then
    echo "${HOME}/go/bin/air"
  else
    return 1
  fi
}

air_available() {
  air_bin &>/dev/null
}

air_install_hint() {
  error "air no está instalado (recarga automática de API)."
  echo ""
  echo "  Instala con: go install github.com/air-verse/air@latest"
  echo "  Luego agrega \$HOME/go/bin a PATH si hace falta."
  return 1
}

api_release_port() {
  if port_in_use "$API_PORT"; then
    lsof -ti ":${API_PORT}" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

api_start() {
  local lenient="${1:-false}"
  local with_docker_mongo="${2:-false}"
  local skip_mongo="${3:-false}"

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

  if [[ "$skip_mongo" != true ]]; then
    if [[ "$lenient" == true ]]; then
      mongo_ensure_for_local "$with_docker_mongo" || true
    else
      mongo_start || return 1
    fi
  fi

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

  api_env_export
  nohup "${ROOT_DIR}/bin/api" >>"$API_LOG" 2>&1 &
  echo $! >"$API_PID_FILE"
  disown 2>/dev/null || true

  if wait_for_http "http://localhost:${API_PORT}/health" 45; then
    info "API lista → http://localhost:${API_PORT}/health"
  elif [[ "$lenient" == true ]] && ! mongo_available; then
    if is_running "$API_PID_FILE"; then
      warn "API en ejecución pero /health no responde — MongoDB no está disponible."
    else
      rm -f "$API_PID_FILE"
      warn "API no pudo mantenerse en marcha sin MongoDB."
      echo "  Levanta MongoDB y ejecuta: ./myrent.sh local-restart"
    fi
    echo "  Ver logs: tail -f $API_LOG"
    return 0
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

  if port_in_use "$API_PORT"; then
    api_release_port
    info "Puerto ${API_PORT} liberado"
  fi
}

api_watch_run() {
  air_available || air_install_hint || return 1

  api_stop

  if port_in_use "$API_PORT"; then
    error "Puerto ${API_PORT} sigue en uso"
    return 1
  fi

  mongo_start || return 1

  info "API con recarga automática (air) en puerto ${API_PORT}..."
  echo "  Ctrl+C para detener"
  echo ""

  (
    cd "${ROOT_DIR}/backend"
    api_env_export
    exec "$(air_bin)"
  )
}

do_watch() {
  header
  echo "  Desarrollo con recarga automática..."
  echo ""

  air_available || { air_install_hint; pause; return 1; }

  mongo_start || { pause; return 1; }

  api_stop
  frontend_stop

  frontend_start || { pause; return 1; }

  echo ""
  info "Recarga automática activa"
  show_active_mode_banner native-watch

  trap 'frontend_stop; api_release_port; trap - EXIT INT TERM' EXIT INT TERM

  api_watch_run
  local rc=$?

  trap - EXIT INT TERM
  frontend_stop
  api_release_port

  return "$rc"
}

# ─── Frontend ─────────────────────────────────────────────────────────────────

frontend_start() {
  local lenient="${1:-false}"
  local with_docker_mongo="${2:-false}"

  if [[ -f "$FRONTEND_PID_FILE" ]] && ! is_running "$FRONTEND_PID_FILE"; then
    warn "PID file obsoleto; limpiando..."
    rm -f "$FRONTEND_PID_FILE"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    info "Frontend ya está corriendo (PID $(cat "$FRONTEND_PID_FILE"))"
    return 0
  fi

  if ! curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; then
    if is_running "$API_PID_FILE"; then
      warn "API en ejecución pero /health no responde (¿MongoDB no disponible?). Continuando con frontend..."
    elif [[ "$lenient" == true ]]; then
      warn "API no responde — iniciando frontend igualmente (levanta MongoDB y usa ./myrent.sh local-restart)."
    else
      warn "API no responde; iniciándola primero..."
      api_start || return 1
    fi
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
  disown 2>/dev/null || true

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

local_show_urls() {
  show_active_mode_banner native
  echo -e "  Login:    ${BOLD}${ADMIN_USER}${NC} / ${BOLD}${ADMIN_PASS}${NC}"
  if ! mongo_available; then
    warn "MongoDB no está en puerto ${MONGO_PORT} — el login no funcionará hasta iniciarlo."
  fi
  if ! mailpit_available; then
    if smtp_configured; then
      info "Mailpit no activo — correo vía SMTP en .env (${SMTP_HOST})"
    else
      warn "Mailpit no activo (opcional) — correo de prueba no disponible."
      echo "  Docker: docker compose -f docker-compose.mail.yml up -d"
      echo "  O configura SMTP en .env (ver .env.example)"
    fi
  fi
  echo "  PIDs:     API → ${API_PID_FILE}  Frontend → ${FRONTEND_PID_FILE}"
  echo "  Logs:     tail -f ${API_LOG} ${FRONTEND_LOG}"
  echo "  Detener:  ./myrent.sh local-stop"
}

local_start() {
  local with_docker_mongo=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-docker-mongo) with_docker_mongo=true ;;
      -h|--help)
        echo "Uso: $0 local-start [--with-docker-mongo]"
        echo ""
        echo "  Modo NATIVO — API :${API_PORT}, Frontend Vite :${FRONTEND_PORT}."
        echo "  Tras cambios: ./myrent.sh local-restart  (o watch para auto-recarga)."
        echo "  MongoDB: puerto existente → Homebrew → --with-docker-mongo."
        return 0
        ;;
      *)
        error "Opción desconocida: $1"
        echo "  Uso: $0 local-start [--with-docker-mongo]"
        return 1
        ;;
    esac
    shift
  done

  port_conflict_check native || return 1

  if is_running "$API_PID_FILE" && is_running "$FRONTEND_PID_FILE"; then
    info "API y Frontend ya están corriendo"
    local_show_urls
    return 0
  fi

  mongo_ensure_for_local "$with_docker_mongo" || true

  api_start true "$with_docker_mongo" true || return 1
  frontend_start true "$with_docker_mongo" || return 1
  mailpit_start || true

  local_show_urls
  docker_sync_after_restart
}

local_stop() {
  frontend_stop
  api_stop
  info "API y Frontend detenidos (MongoDB sigue activo si lo levantaste antes)"
}

local_status() {
  header
  echo "  Dev local (API + Frontend, nativo):"
  echo ""

  if is_running "$API_PID_FILE"; then
    echo -e "  API:       ${GREEN}corriendo${NC} (PID $(cat "$API_PID_FILE"), :${API_PORT})"
  elif port_in_use "$API_PORT"; then
    if docker_container_running "myrent-api" 2>/dev/null; then
      echo -e "  API:       ${YELLOW}Docker myrent-api${NC} (:${API_PORT}) — no es dev nativo"
    else
      echo -e "  API:       ${YELLOW}puerto ${API_PORT} en uso (sin PID file)${NC}"
    fi
  else
    echo -e "  API:       ${RED}detenida${NC}"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    echo -e "  Frontend:  ${GREEN}corriendo${NC} (PID $(cat "$FRONTEND_PID_FILE"), :${FRONTEND_PORT})"
  elif port_in_use "$FRONTEND_PORT"; then
    echo -e "  Frontend:  ${YELLOW}puerto ${FRONTEND_PORT} en uso (sin PID file)${NC}"
  else
    echo -e "  Frontend:  ${RED}detenido${NC}"
  fi

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^myrent-mongodb$'; then
    echo -e "  MongoDB:   ${GREEN}corriendo${NC} (Docker, :${MONGO_PORT})"
  elif mongo_available; then
    echo -e "  MongoDB:   ${GREEN}disponible${NC} (:${MONGO_PORT})"
  else
    echo -e "  MongoDB:   ${RED}no disponible${NC}"
  fi

  load_dotenv
  if [[ -n "${SMTP_HOST:-}" && -n "${SMTP_USER:-}" && -n "${SMTP_PASSWORD:-}" && -n "${SMTP_FROM:-${FROM_EMAIL:-}}" ]]; then
    echo -e "  SMTP:      ${GREEN}configurado${NC} (${SMTP_FROM_NAME:-MyRent Go} <${SMTP_FROM:-${FROM_EMAIL:-—}}>)"
  fi

  echo ""
  echo "  Logs: API ${API_LOG}  |  Frontend ${FRONTEND_LOG}"
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

local_restart() {
  local with_docker_mongo=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-docker-mongo) with_docker_mongo=true ;;
      -h|--help)
        echo "Uso: $0 local-restart [--with-docker-mongo]"
        return 0
        ;;
      *)
        error "Opción desconocida: $1"
        return 1
        ;;
    esac
    shift
  done

  local_stop

  if [[ "$with_docker_mongo" == true ]]; then
    local_start --with-docker-mongo
  else
    local_start
  fi
}

do_local_dev_menu() {
  while true; do
    header
    echo -e "  ${BOLD}Desarrollo nativo${NC}  (sin Docker para API/Frontend)"
    echo "  App Vite :${FRONTEND_PORT}  |  API :${API_PORT}  |  PIDs en .myrent/"
    echo ""
    echo "    1)  Levantar en segundo plano (local-start)"
    echo "    2)  Detener API + Frontend (local-stop)"
    echo "    3)  Estado (local-status)"
    echo "    4)  Reiniciar tras cambios (local-restart)"
    echo "    5)  Abrir navegador (:${FRONTEND_PORT})"
    echo ""
    echo "    0)  Volver"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1)
        local_start || true
        if [[ "${SKIP_PAUSE:-}" != "1" ]]; then
          read -r -p "  ¿Abrir navegador? [S/n]: " open_ans
          if [[ ! "$open_ans" =~ ^[Nn]$ ]]; then
            open_browser "$APP_URL"
          fi
          pause
        fi
        ;;
      2) local_stop; pause ;;
      3) local_status ;;
      4) local_restart; [[ $? -ne 0 ]] && pause || pause ;;
      5) do_open_browser ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

do_start_all() {
  header
  echo "  Levantando stack local (MongoDB + API + Frontend)..."
  echo ""

  local_start || { pause; return 1; }

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

  local_restart || return 1

  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
}

do_status() {
  header
  echo "  Estado de servicios:"
  echo ""
  echo -e "  Modo app:  $(detect_dev_mode_summary)"
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
    echo -e "  API:       ${GREEN}corriendo${NC} (nativo, PID $(cat "$API_PID_FILE"), :${API_PORT})"
  elif docker_container_running "myrent-api" 2>/dev/null && port_in_use "$API_PORT"; then
    echo -e "  API:       ${CYAN}Docker myrent-api${NC} (:${API_PORT})"
  elif port_in_use "$API_PORT"; then
    echo -e "  API:       ${YELLOW}puerto ${API_PORT} en uso (sin PID file)${NC}"
  else
    echo -e "  API:       ${RED}detenida${NC}"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    echo -e "  Frontend:  ${GREEN}corriendo${NC} (nativo Vite, PID $(cat "$FRONTEND_PID_FILE"), :${FRONTEND_PORT})"
  elif docker_container_running "myrent-frontend" 2>/dev/null && port_in_use "$DOCKER_FRONTEND_PORT"; then
    echo -e "  Frontend:  ${CYAN}Docker myrent-frontend${NC} (:${DOCKER_FRONTEND_PORT})"
  elif port_in_use "$FRONTEND_PORT"; then
    echo -e "  Frontend:  ${YELLOW}puerto ${FRONTEND_PORT} en uso (sin PID file)${NC}"
  else
    echo -e "  Frontend:  ${RED}detenido${NC}"
  fi

  if port_in_use "$FRONTEND_PORT" && ! curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; then
    echo ""
    warn "Frontend activo pero API no responde — el login fallará."
    echo "  Nativo: ./myrent.sh local-restart  |  Docker: ./myrent.sh docker-restart"
  fi

  port_conflict_check any || true

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

run_tests() {
  local mode="${1:-all}"
  if [[ ! -x "${ROOT_DIR}/scripts/run-tests.sh" ]]; then
    error "No se encontró scripts/run-tests.sh"
    return 1
  fi
  set +e
  SKIP_PAUSE=1 "${ROOT_DIR}/scripts/run-tests.sh" "$mode"
  local rc=$?
  set -e
  [[ "${SKIP_PAUSE:-}" != "1" ]] && pause
  return "$rc"
}

do_tests_menu() {
  while true; do
    header
    echo -e "  ${BOLD}Ejecutar tests${NC}"
    echo ""
    echo "    1)  Todos (backend + frontend unit + E2E)"
    echo "    2)  Solo unitarios (backend + frontend)"
    echo "    3)  Solo E2E (Playwright)"
    echo "    4)  Solo backend (go test)"
    echo "    5)  Solo frontend unitarios (Vitest)"
    echo ""
    echo "  E2E requiere API (:${API_PORT}) y frontend (:${FRONTEND_PORT}); ver docs/TESTING.md"
    echo ""
    echo "    0)  Volver"
    echo ""
    read -r -p "  Opción: " test_opt
    echo ""

    case "$test_opt" in
      1) run_tests all ;;
      2) run_tests unit ;;
      3) run_tests e2e ;;
      4) run_tests backend ;;
      5) run_tests frontend-unit ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

do_pentest() {
  header
  echo "  Pentest de seguridad (ethical hacking local)..."
  echo ""
  local pentest_script="${ROOT_DIR}/security/run-pentest.sh"
  if [[ ! -x "$pentest_script" ]]; then
    error "No se encontró $pentest_script"
    echo "  Ver docs/SECURITY_TESTING.md"
    pause
    return 1
  fi
  echo "  Alcance: localhost API (${API_PORT}) + frontend (${FRONTEND_PORT})"
  echo "  Informe: security/reports/latest/INFORME.md"
  echo ""
  "$pentest_script" "$@"
  pause
}

do_cleanup_disk() {
  header
  echo "  Liberar espacio en disco (cleanup-disk)..."
  echo ""
  local cleanup_script="${ROOT_DIR}/scripts/cleanup-disk.sh"
  if [[ ! -x "$cleanup_script" ]]; then
    error "No se encontró $cleanup_script"
    echo "  chmod +x scripts/cleanup-disk.sh"
    pause
    return 1
  fi
  echo "  Modo seguro: Docker prune (sin volúmenes) + backup Cursor si está cerrado"
  echo "  Opciones: --dry-run, --docker-only, --respaldos, --exports, …"
  echo ""
  read -r -p "  ¿Modo dry-run (solo simular)? [s/N]: " dry_ans
  if [[ "$dry_ans" =~ ^[Ss]$ ]]; then
    "$cleanup_script" --dry-run
  else
    "$cleanup_script" --safe
  fi
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
  show_active_mode_banner native
  echo -e "  Usuario:  ${BOLD}${ADMIN_USER}${NC}"
  echo -e "  Password: ${BOLD}${ADMIN_PASS}${NC}"
  open_browser "$APP_URL"

  docker_sync_after_restart
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
  echo -e "  ${BOLD}── Desarrollo nativo${NC}  Vite :${FRONTEND_PORT}  API :${API_PORT}"
  echo "    1)  Nativo — inicio, watch, reinicio"
  echo ""
  echo -e "  ${BOLD}── Docker${NC}  App :${DOCKER_FRONTEND_PORT}  API :${API_PORT}"
  echo "    2)  Docker — build, levantar, reiniciar"
  echo ""
  echo -e "  ${BOLD}── Base de datos${NC}  MongoDB :${MONGO_PORT}  Mailpit"
  echo "    3)  MongoDB, Mailpit, Mailcow, admin"
  echo ""
  echo "    4)  Utilidades (logs, estado, tests)"
  echo "    5)  Git / GitHub"
  echo "    6)  Guía de modos y puertos"
  echo ""
  echo "    0)  Salir"
  echo ""
}

do_modes_help() {
  header
  show_dev_modes_help
  pause
}

menu_desarrollo_nativo() {
  while true; do
    header
    echo -e "  ${BOLD}Desarrollo nativo${NC}  (sin Docker para API/Frontend)"
    echo "  App :${FRONTEND_PORT} (Vite)  |  API :${API_PORT}  |  MongoDB :${MONGO_PORT}"
    echo ""
    echo "    1)  Inicio rápido (instalar + admin + levantar)"
    echo "    2)  Levantar en segundo plano (local-start)"
    echo "    3)  Recarga automática (watch — air + HMR)"
    echo "    4)  Reiniciar tras cambios (local-restart)"
    echo "    5)  Detener API + Frontend (local-stop)"
    echo "    6)  Estado (local-status)"
    echo "    7)  Instalar dependencias"
    echo "    8)  Build (compilar backend + frontend)"
    echo "    9)  Abrir navegador"
    echo ""
    echo -e "  ${YELLOW}Tras cambiar código:${NC} watch (auto)  o  local-restart (manual)"
    echo -e "  ${YELLOW}No mezclar${NC} con Docker API en :${API_PORT} — ./myrent.sh modes"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_quickstart; [[ $? -ne 0 ]] && pause ;;
      2) do_start_all; [[ $? -ne 0 ]] && pause ;;
      3) do_watch ;;
      4) do_restart_services; [[ $? -ne 0 ]] && pause ;;
      5) do_stop_all ;;
      6) local_status ;;
      7) do_install ;;
      8) do_build ;;
      9) do_open_browser ;;
      0) return ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

# Alias interno — mantiene compatibilidad con referencias antiguas
menu_desarrollo() {
  menu_desarrollo_nativo
}

menu_base_datos() {
  while true; do
    header
    echo -e "  ${BOLD}Base de datos y servicios${NC}"
    echo "  MongoDB :${MONGO_PORT}  |  Mailpit UI :${MAIL_UI_PORT}  |  independiente del modo app"
    echo ""
    echo "    1)  Crear admin (admin / admin123)"
    echo "    2)  Iniciar MongoDB"
    echo "    3)  Detener MongoDB (Docker)"
    echo "    4)  Solo API nativa (:${API_PORT})"
    echo "    5)  Solo Frontend nativo (:${FRONTEND_PORT})"
    echo "    6)  Mailpit — iniciar (captura correo local)"
    echo "    7)  Mailpit — detener / abrir bandeja"
    echo "    8)  Mailcow — instalar (VPS / mail.meincart.com)"
    echo "    9)  Mailcow — iniciar / detener / estado"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_bootstrap_admin ;;
      2) mongo_start; [[ $? -ne 0 ]] && pause || pause ;;
      3) mongo_stop; pause ;;
      4) port_conflict_check native || { pause; continue; }; api_start; [[ $? -ne 0 ]] && pause || pause ;;
      5) frontend_start; [[ $? -ne 0 ]] && pause || pause ;;
      6) mailpit_start; [[ $? -ne 0 ]] && pause || pause ;;
      7)
        echo "    a) Detener  b) Abrir bandeja"
        read -r -p "  Sub-opción [a/b]: " sub
        case "$sub" in
          a|A) mailpit_stop; pause ;;
          b|B) mailpit_open; pause ;;
          *) warn "Opción inválida"; sleep 1 ;;
        esac
        ;;
      8) mailcow_setup; pause ;;
      9)
        echo "    a) Iniciar  b) Detener  c) Estado  d) Panel  e) Logs"
        read -r -p "  Sub-opción [a/b/c/d/e]: " sub
        case "$sub" in
          a|A) mailcow_start; [[ $? -ne 0 ]] && pause || pause ;;
          b|B) mailcow_stop; pause ;;
          c|C) mailcow_status ;;
          d|D) mailcow_open; pause ;;
          e|E) mailcow_logs ;;
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
    echo -e "  ${BOLD}Docker${NC}  (tipo producción — imágenes en contenedores)"
    echo "  App :${DOCKER_FRONTEND_PORT} (nginx)  |  API :${API_PORT}  |  MongoDB :${MONGO_PORT}"
    echo ""
    echo "    1)  Levantar stack completo (docker-up)"
    echo "    2)  Reiniciar tras cambios (docker-restart — rebuild)"
    echo "    3)  Detener stack (docker-down)"
    echo "    4)  Build imagen API"
    echo "    5)  Build imagen Frontend"
    echo "    6)  Build ambas imágenes"
    echo "    7)  Levantar solo API (+ MongoDB)"
    echo "    8)  Levantar solo Frontend (+ dependencias)"
    echo "    9)  Ver logs"
    echo "    10) Producción (docker-compose.prod.yml)"
    echo ""
    echo -e "  ${YELLOW}Tras cambiar código:${NC} docker-restart  (rebuild + up)"
    echo -e "  ${YELLOW}No mezclar${NC} con API nativa en :${API_PORT} — ./myrent.sh modes"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) docker_up; [[ $? -ne 0 ]] && pause ;;
      2) docker_restart; [[ $? -ne 0 ]] && pause ;;
      3) docker_down ;;
      4) docker_build_api; [[ $? -ne 0 ]] && pause || pause ;;
      5) docker_build_frontend; [[ $? -ne 0 ]] && pause || pause ;;
      6) docker_build_all; [[ $? -ne 0 ]] && pause || pause ;;
      7) docker_up_api; [[ $? -ne 0 ]] && pause ;;
      8) docker_up_frontend; [[ $? -ne 0 ]] && pause ;;
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
    echo "    4)  Ejecutar tests (unit + E2E)"
    echo "    5)  Pentest de seguridad (ethical hacking)"
    echo "    6)  Liberar espacio en disco (cleanup-disk)"
    echo ""
    echo "    0)  Volver al menú principal"
    echo ""
    read -r -p "  Opción: " opt
    echo ""

    case "$opt" in
      1) do_logs_menu ;;
      2) do_status ;;
      3) do_open_browser ;;
      4) do_tests_menu ;;
      5) do_pentest ;;
      6) do_cleanup_disk ;;
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
      1) menu_desarrollo_nativo ;;
      2) menu_docker ;;
      3) menu_base_datos ;;
      4) menu_utilidades ;;
      5) menu_git ;;
      6) do_modes_help ;;
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
    local-start) shift; SKIP_PAUSE=1 local_start "$@"; [[ $? -ne 0 ]] && exit 1 ;;
    local-stop) SKIP_PAUSE=1 local_stop ;;
    local-status) SKIP_PAUSE=1 local_status ;;
    local-restart) shift; SKIP_PAUSE=1 local_restart "$@"; [[ $? -ne 0 ]] && exit 1 ;;
    local)      do_local_dev_menu ;;
    stop)       do_stop_all ;;
    restart)    do_restart_services ;;
    status)     do_status ;;
    logs)       do_logs_menu ;;
    open|browser) open_browser "$APP_URL" ;;
    test|test-all)     SKIP_PAUSE=1 run_tests all ;;
    test-unit)         SKIP_PAUSE=1 run_tests unit ;;
    test-e2e)          SKIP_PAUSE=1 run_tests e2e ;;
    test-backend)      SKIP_PAUSE=1 run_tests backend ;;
    test-frontend-unit) SKIP_PAUSE=1 run_tests frontend-unit ;;
    pentest)    SKIP_PAUSE=1 do_pentest ;;
    pentest-static) SKIP_PAUSE=1 do_pentest --static-only ;;
    cleanup-disk) SKIP_PAUSE=1 do_cleanup_disk ;;
    quickstart) SKIP_PAUSE=1 do_quickstart ;;
    watch)      do_watch ;;
    api-watch)  api_watch_run ;;
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
    docker-sync)        SKIP_PAUSE=1 docker_sync_after_restart ;;
    docker-logs)        docker_logs ;;
    docker-logs-api)    docker_logs_api ;;
    docker-logs-frontend) docker_logs_frontend ;;
    docker-up-prod)     SKIP_PAUSE=1 docker_up_prod --yes ;;
    deploy-prod)        SKIP_PAUSE=1 "${ROOT_DIR}/scripts/deploy-prod.sh" --yes ;;
    modes|help-ports)
      show_dev_modes_help
      ;;
    help|-h|--help)
      echo "MyRent Go — ./myrent.sh [comando]"
      echo ""
      show_dev_modes_help
      echo "  Más comandos: install, build, bootstrap, start, local-start, watch,"
      echo "  docker-up, docker-restart, test, quickstart, git-status, …"
      echo "  Sin argumentos: menú interactivo."
      ;;
    *)
      echo "Uso: $0 [install|build|bootstrap|start|local-start [--with-docker-mongo]|local-stop|local-status|local-restart|local|"
      echo "         stop|restart|watch|api-watch|status|logs|open|modes|help-ports|help|"
      echo "         test|test-all|test-unit|test-e2e|test-backend|test-frontend-unit|pentest|pentest-static|cleanup-disk|quickstart|"
      echo "         api|frontend|mail|mail-open|mailcow-setup|mailcow-start|mailcow-stop|mailcow-status|mailcow-open|"
      echo "         git-status|git-commit|git-push|git-pull|"
      echo "         docker-build-all|docker-build-api|docker-build-frontend|docker-up|docker-up-api|docker-up-frontend|"
      echo "         docker-down|docker-restart|docker-sync|docker-logs|docker-logs-api|docker-logs-frontend|"
      echo "         docker-up-prod|deploy-prod]"
      exit 1
      ;;
  esac
  exit 0
fi

main_menu
