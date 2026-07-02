#!/usr/bin/env bash
#
# MyRent Go — menú interactivo para desarrollo local
# Uso: ./myrent.sh
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="${ROOT_DIR}/.myrent"
LOG_DIR="${RUN_DIR}/logs"

API_PORT="${MYRENT_API_PORT:-7070}"
FRONTEND_PORT="${MYRENT_FRONTEND_PORT:-4000}"
MONGO_PORT="${MYRENT_MONGO_PORT:-27017}"

API_PID_FILE="${RUN_DIR}/api.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"
API_LOG="${LOG_DIR}/api.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"
MONGO_LOG="${LOG_DIR}/mongodb.log"

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
      error "Bootstrap falló. Verifica que MongoDB esté corriendo (opción 11 del menú)."
      return 1
    fi
  else
    if ! (cd "${ROOT_DIR}/backend" && go run ./cmd/seed); then
      error "Bootstrap falló. Verifica que MongoDB esté corriendo (opción 11 del menú)."
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
    export APP_ENV=development
    export APP_PORT="$API_PORT"
    export MONGODB_URI="mongodb://localhost:${MONGO_PORT}"
    export MONGODB_DATABASE=myrent
    export JWT_SECRET=dev-secret-change-in-production-min-32-chars
    export JWT_ACCESS_TTL=24h
    export CORS_ORIGINS="http://localhost:${FRONTEND_PORT},http://localhost:5173"
    export FRONTEND_URL="$APP_URL"
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
    warn "Frontend activo pero API no responde — el login fallará. Usa opción 12 para levantar la API."
  fi

  echo ""
  echo "  Logs:"
  echo "    API:      $API_LOG"
  echo "    Frontend: $FRONTEND_LOG"
  echo "    MongoDB:  $MONGO_LOG"
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
    echo "    4) Todos (multiplexado)"
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

# ─── Menú principal ───────────────────────────────────────────────────────────

show_menu() {
  header
  echo "    1)  Inicio rápido (instalar + admin + levantar + navegador)"
  echo "    2)  Instalar dependencias"
  echo "    3)  Build (compilar backend + frontend)"
  echo "    4)  Crear admin (admin / admin123)"
  echo "    5)  Levantar todo (MongoDB + API + Frontend)"
  echo "    6)  Detener servicios"
  echo "    7)  Ver logs"
  echo "    8)  Abrir navegador"
  echo "    9)  Estado de servicios"
  echo "    10) Ejecutar tests"
  echo ""
  echo "    ── Servicios individuales ──"
  echo "    11) Solo MongoDB"
  echo "    12) Solo API"
  echo "    13) Solo Frontend"
  echo "    14) Reiniciar API y Frontend"
  echo ""
  echo "    0)  Salir"
  echo ""
}

main_menu() {
  set +e
  while true; do
    show_menu
    read -r -p "  Selecciona una opción: " opt
    echo ""

    case "$opt" in
      1)  do_quickstart; [[ $? -ne 0 ]] && pause ;;
      2)  do_install ;;
      3)  do_build ;;
      4)  do_bootstrap_admin ;;
      5)  do_start_all; [[ $? -ne 0 ]] && pause ;;
      6)  do_stop_all ;;
      7)  do_logs_menu ;;
      8)  do_open_browser ;;
      9)  do_status ;;
      10) do_test ;;
      11) mongo_start; [[ $? -ne 0 ]] && pause || pause ;;
      12) api_start; [[ $? -ne 0 ]] && pause || pause ;;
      13) frontend_start; [[ $? -ne 0 ]] && pause || pause ;;
      14) do_restart_services; [[ $? -ne 0 ]] && pause ;;
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
    *)
      echo "Uso: $0 [install|build|bootstrap|start|stop|restart|status|logs|open|test|quickstart|api|frontend]"
      exit 1
      ;;
  esac
  exit 0
fi

main_menu
