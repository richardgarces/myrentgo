#!/usr/bin/env bash
#
# MyRent Go — liberar espacio en disco (tareas pendientes del audit).
# Uso: ./scripts/cleanup-disk.sh [--safe|--all-safe|--docker-only|…]
# También: ./myrent.sh cleanup-disk  |  menú Utilidades → Liberar espacio
#
# Nunca borra: volúmenes MongoDB, storage/documents, .env
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

DRY_RUN=false
MODE="safe"
DO_EXPORTS=false
DO_VSCODE=false
DO_CURSOR_CACHE=false

CURSOR_BACKUP="${HOME}/Library/Application Support/Cursor/User/globalStorage/state.vscdb.backup"
CURSOR_CACHE_DIR="${HOME}/Library/Application Support/Cursor/CachedData"
VSCODE_SUPPORT="${HOME}/Library/Application Support/Code"
RESPALDOS_DIR="${HOME}/desarrollo/go/RESPALDOS"
EXPORTS_DIR="${ROOT_DIR}/exports"

usage() {
  cat <<EOF
Uso: $(basename "$0") [opciones]

Modos (uno por ejecución; --safe es el predeterminado):
  --safe                 Docker prune (sin volúmenes) + backup Cursor si está cerrado
  --all-safe             Igual que --safe (pasos seguros completos)
  --cursor-backup-only   Solo borrar state.vscdb.backup de Cursor (si no está abierto)
  --docker-only          Solo docker builder/image/system prune (sin volúmenes)
  --respaldos            Borrar ~/desarrollo/go/RESPALDOS (pide confirmación)

Opcionales (combinables con los modos anteriores):
  --exports              Borrar exports/ del proyecto (p. ej. myrent-dump; pide confirmación)
  --vscode               Borrar caché de VS Code Application Support (pide confirmación)
  --cursor-cache         Borrar Cursor CachedData (pide confirmación)

General:
  --dry-run              Mostrar qué se haría sin borrar nada
  -h, --help             Esta ayuda

Ejemplos:
  ./scripts/cleanup-disk.sh
  ./scripts/cleanup-disk.sh --dry-run
  ./scripts/cleanup-disk.sh --docker-only
  ./scripts/cleanup-disk.sh --all-safe --exports
  ./myrent.sh cleanup-disk
EOF
}

human_size() {
  local path="$1"
  if [[ -e "$path" ]]; then
    du -sh "$path" 2>/dev/null | cut -f1
  else
    echo "—"
  fi
}

run_with_timeout() {
  local secs="$1"
  shift
  "$@" &
  local pid=$!
  local i=0
  while kill -0 "$pid" 2>/dev/null && [[ $i -lt secs ]]; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    return 124
  fi
  wait "$pid"
}

docker_daemon_ready() {
  command -v docker &>/dev/null || return 1
  run_with_timeout 5 docker info &>/dev/null
}

show_disk() {
  local label="$1"
  echo ""
  echo -e "  ${BOLD}${label}${NC}"
  df -h / 2>/dev/null | awk 'NR==1 {print "    "$0} NR==2 {print "    "$0}'
  if docker_daemon_ready; then
    echo ""
    docker system df 2>/dev/null | sed 's/^/    /' || true
  fi
}

cursor_running() {
  pgrep -xq Cursor 2>/dev/null || pgrep -f '/Cursor.app/' &>/dev/null
}

confirm() {
  local prompt="$1"
  if $DRY_RUN; then
    warn "[dry-run] Se pediría confirmación: $prompt"
    return 0
  fi
  read -r -p "  ${prompt} [s/N]: " ans
  [[ "$ans" =~ ^[Ss]$ ]]
}

remove_path() {
  local path="$1"
  local label="${2:-$path}"

  if [[ ! -e "$path" ]]; then
    warn "No existe: $label"
    return 0
  fi

  local sz
  sz=$(human_size "$path")
  if $DRY_RUN; then
    info "[dry-run] Borraría ${label} (${sz})"
    return 0
  fi

  info "Borrando ${label} (${sz})..."
  rm -rf "$path"
  info "Eliminado: ${label}"
}

remove_cursor_backup() {
  if cursor_running; then
    warn "Cursor está en ejecución — no se borra state.vscdb.backup"
    echo "  Cierra Cursor y vuelve a ejecutar este script."
    return 1
  fi

  if [[ ! -f "$CURSOR_BACKUP" ]]; then
    warn "No hay backup de Cursor: state.vscdb.backup"
    return 0
  fi

  remove_path "$CURSOR_BACKUP" "Cursor state.vscdb.backup"
}

cleanup_docker() {
  if ! command -v docker &>/dev/null; then
    warn "Docker no instalado — omitiendo prune"
    return 0
  fi
  if ! docker_daemon_ready; then
    warn "Docker no responde — omitiendo prune"
    return 0
  fi

  echo ""
  info "Docker prune (sin volúmenes — MongoDB y datos persistentes intactos)"
  if $DRY_RUN; then
    info "[dry-run] docker builder prune -f"
    info "[dry-run] docker image prune -f"
    info "[dry-run] docker system prune -f"
    return 0
  fi

  docker builder prune -f
  docker image prune -f
  docker system prune -f
  info "Docker prune completado (volúmenes no tocados)"
}

cleanup_respaldos() {
  echo ""
  echo -e "  Carpeta: ${BOLD}${RESPALDOS_DIR}${NC} ($(human_size "$RESPALDOS_DIR"))"
  if ! confirm "¿Borrar todo RESPALDOS?"; then
    warn "RESPALDOS — cancelado"
    return 0
  fi
  remove_path "$RESPALDOS_DIR" "RESPALDOS"
}

cleanup_exports() {
  echo ""
  echo -e "  Carpeta: ${BOLD}${EXPORTS_DIR}${NC} ($(human_size "$EXPORTS_DIR"))"
  warn "No se toca storage/documents ni .env"
  if ! confirm "¿Borrar exports/ del proyecto?"; then
    warn "exports/ — cancelado"
    return 0
  fi
  remove_path "$EXPORTS_DIR" "exports/"
}

cleanup_vscode() {
  if [[ ! -d "$VSCODE_SUPPORT" ]]; then
    warn "VS Code Application Support no encontrado"
    return 0
  fi
  echo ""
  echo -e "  Ruta: ${BOLD}${VSCODE_SUPPORT}${NC} ($(human_size "$VSCODE_SUPPORT"))"
  if ! confirm "¿Borrar caché de VS Code Application Support?"; then
    warn "VS Code — cancelado"
    return 0
  fi
  remove_path "$VSCODE_SUPPORT" "VS Code Application Support"
}

cleanup_cursor_cache() {
  if [[ ! -d "$CURSOR_CACHE_DIR" ]]; then
    warn "Cursor CachedData no encontrado"
    return 0
  fi
  echo ""
  echo -e "  Ruta: ${BOLD}${CURSOR_CACHE_DIR}${NC} ($(human_size "$CURSOR_CACHE_DIR"))"
  if ! confirm "¿Borrar Cursor CachedData?"; then
    warn "Cursor CachedData — cancelado"
    return 0
  fi
  remove_path "$CURSOR_CACHE_DIR" "Cursor CachedData"
}

run_safe_steps() {
  cleanup_docker
  remove_cursor_backup || true
}

parse_args() {
  local had_mode=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --safe)
        MODE="safe"
        had_mode=true
        ;;
      --all-safe)
        MODE="all-safe"
        had_mode=true
        ;;
      --cursor-backup-only)
        MODE="cursor-backup-only"
        had_mode=true
        ;;
      --docker-only)
        MODE="docker-only"
        had_mode=true
        ;;
      --respaldos)
        MODE="respaldos"
        had_mode=true
        ;;
      --exports)     DO_EXPORTS=true ;;
      --vscode)      DO_VSCODE=true ;;
      --cursor-cache) DO_CURSOR_CACHE=true ;;
      --dry-run)     DRY_RUN=true ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        error "Opción desconocida: $1"
        usage >&2
        exit 1
        ;;
    esac
    shift
  done

  if ! $had_mode; then
    MODE="safe"
  fi
}

main() {
  parse_args "$@"

  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║     MyRent Go — Limpieza de disco        ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"

  if $DRY_RUN; then
    warn "Modo dry-run — no se borrará nada"
  fi

  echo ""
  echo -e "  ${BOLD}Protegido:${NC} volúmenes MongoDB, storage/documents, .env"
  echo -e "  ${BOLD}Modo:${NC} ${MODE}"
  $DO_EXPORTS && echo -e "  ${BOLD}+${NC} exports/"
  $DO_VSCODE && echo -e "  ${BOLD}+${NC} VS Code Application Support"
  $DO_CURSOR_CACHE && echo -e "  ${BOLD}+${NC} Cursor CachedData"

  show_disk "Espacio en disco (antes)"

  case "$MODE" in
    safe|all-safe)
      run_safe_steps
      ;;
    cursor-backup-only)
      remove_cursor_backup || true
      ;;
    docker-only)
      cleanup_docker
      ;;
    respaldos)
      cleanup_respaldos
      ;;
  esac

  $DO_EXPORTS && cleanup_exports
  $DO_VSCODE && cleanup_vscode
  $DO_CURSOR_CACHE && cleanup_cursor_cache

  show_disk "Espacio en disco (después)"

  echo ""
  info "Limpieza finalizada"
}

main "$@"
