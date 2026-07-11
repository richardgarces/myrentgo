#!/usr/bin/env bash
# Librería común — scripts bajo ubuntu/
# shellcheck disable=SC2034

: "${UBUNTU_ROOT:=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

PLATFORM_ROOT="${PLATFORM_ROOT:-/opt/platform}"
PLATFORM_NET="${PLATFORM_NET:-platform-net}"
COMPOSE_BIN="${COMPOSE_BIN:-}"

# Colores (si hay TTY)
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'
  C_GRN=$'\033[0;32m'
  C_YEL=$'\033[0;33m'
  C_BLU=$'\033[0;34m'
  C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_RST=""
fi

info()  { echo "${C_GRN}==>${C_RST} $*"; }
warn()  { echo "${C_YEL}WARN:${C_RST} $*"; }
error() { echo "${C_RED}ERROR:${C_RST} $*" >&2; }
header(){ echo; echo "${C_BLU}════════════════════════════════════════${C_RST}"; echo "${C_BLU} $*${C_RST}"; echo "${C_BLU}════════════════════════════════════════${C_RST}"; }

pause() {
  read -r -p "Pulsa Enter para continuar..." _
}

require_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    return 0
  fi

  # Quién invocó (bootstrap.sh o scripts/os/….sh). $0 suele ser el script en ejecución.
  local invoker="${0}"
  if [[ ! -f "${invoker}" ]]; then
    # shellcheck disable=SC2128
    invoker="${BASH_SOURCE[${#BASH_SOURCE[@]}-1]:-}"
  fi
  if [[ ! -f "${invoker}" ]]; then
    error "Se necesitan privilegios de root. Ejecuta: sudo ./bootstrap.sh"
    exit 1
  fi

  if command -v sudo >/dev/null 2>&1; then
    warn "Esta opción necesita root. Relanzando con sudo…"
    # Conserva argumentos del script invocador (si los hay)
    exec sudo -E bash "${invoker}" "$@"
  fi

  error "Ejecuta como root: sudo bash ${invoker} $*"
  exit 1
}

is_ubuntu_or_debian() {
  [[ -f /etc/os-release ]] || return 1
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" || "${ID_LIKE:-}" == *debian* ]]
}

require_debian_family() {
  if ! is_ubuntu_or_debian; then
    error "Este kit está pensado para Ubuntu/Debian."
    exit 1
  fi
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN="docker-compose"
    # v1 no soporta top-level name:; el kit usa -p y version: "3.8"
  else
    COMPOSE_BIN=""
  fi
}

ensure_platform_dirs() {
  mkdir -p "${PLATFORM_ROOT}"/{data,backups,logs,secrets}
  chmod 750 "${PLATFORM_ROOT}" "${PLATFORM_ROOT}/secrets"
}

ensure_platform_network() {
  if ! command -v docker >/dev/null 2>&1; then
    error "Docker no está instalado."
    return 1
  fi
  if ! docker network inspect "${PLATFORM_NET}" >/dev/null 2>&1; then
    info "Creando red Docker ${PLATFORM_NET}"
    docker network create "${PLATFORM_NET}"
  else
    info "Red ${PLATFORM_NET} ya existe"
  fi
}

copy_env_if_missing() {
  local example="$1"
  local dest="$2"
  if [[ ! -f "$dest" ]]; then
    cp "$example" "$dest"
    chmod 600 "$dest"
    warn "Creado ${dest} — edítalo antes de producción (secretos CHANGE_ME)."
    return 0
  fi
  info "Ya existe ${dest}"
  return 1
}

ask_yes_no() {
  local prompt="${1:-Continuar?}"
  local reply
  read -r -p "${prompt} [y/N]: " reply
  [[ "${reply}" =~ ^[Yy]$ ]]
}

rand_secret() {
  openssl rand -base64 32 2>/dev/null || head -c 48 /dev/urandom | base64
}
