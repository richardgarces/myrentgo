#!/usr/bin/env bash
# Enlaza platform-caddy (kit ubuntu) con MyRent Go.
# Ejecutar en el BMAX desde la raíz del repo MyRent Go.
# Si platform/caddy/.env es 600/root, se copia a un temp legible (sin romper docker compose).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM_CADDY="${PLATFORM_CADDY_DIR:-${HOME}/platform-kit/ubuntu/platform/caddy}"
SRC="${ROOT_DIR}/deploy/caddy/Caddyfile.platform-edge"
PROJECT_NAME="platform-caddy"

info() { echo "==> $*"; }
warn() { echo "WARN: $*" >&2; }
error() { echo "ERROR: $*" >&2; }

detect_compose() {
  # Preferir plugin v2 (evita KeyError ContainerConfig de docker-compose 1.29)
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  # A veces el plugin existe solo para root
  if command -v sudo >/dev/null 2>&1 && sudo docker compose version >/dev/null 2>&1; then
    echo "sudo docker compose"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi
  return 1
}

compose_up() {
  local env_file="$1"
  # shellcheck disable=SC2086
  (
    cd "$PLATFORM_CADDY"
    case "$COMPOSE_BIN" in
      docker-compose|*/docker-compose)
        # v1 + Docker nuevo: --force-recreate falla con KeyError ContainerConfig
        warn "Usando docker-compose v1 (legacy). Mejor: instalar plugin 'docker compose' (kit menú 4)."
        info "Workaround: down + rm + up (sin recreate)"
        $COMPOSE_BIN -p "$PROJECT_NAME" --env-file "$env_file" -f docker-compose.yml down || true
        docker rm -f platform-caddy 2>/dev/null || true
        $COMPOSE_BIN -p "$PROJECT_NAME" --env-file "$env_file" -f docker-compose.yml up -d
        ;;
      *)
        $COMPOSE_BIN -p "$PROJECT_NAME" --env-file "$env_file" -f docker-compose.yml up -d --force-recreate
        ;;
    esac
  )
}

as_priv_cp() {
  local src="$1" dst="$2"
  if [[ -w "$(dirname "$dst")" ]] && { [[ ! -e "$dst" ]] || [[ -w "$dst" ]]; }; then
    cp "$src" "$dst"
  elif command -v sudo >/dev/null 2>&1; then
    sudo cp "$src" "$dst"
  else
    error "No se puede escribir $dst (usa sudo)"
    return 1
  fi
}

read_env_var() {
  local key="$1" file="${PLATFORM_CADDY}/.env"
  local line=""
  if [[ -r "$file" ]]; then
    line="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -1 || true)"
  elif command -v sudo >/dev/null 2>&1 && sudo test -f "$file" 2>/dev/null; then
    line="$(sudo grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -1 || true)"
  else
    return 0
  fi
  [[ -n "$line" ]] || return 0
  echo "${line#*=}" | sed 's/^["'\'']//;s/["'\'']$//'
}

# Copia .env a un temp legible por el usuario (compose lo necesita)
prepare_env_file() {
  local file="${PLATFORM_CADDY}/.env"
  local tmp
  tmp="$(mktemp)"
  chmod 600 "$tmp"
  if [[ -r "$file" ]]; then
    cp "$file" "$tmp"
  elif command -v sudo >/dev/null 2>&1 && sudo test -f "$file" 2>/dev/null; then
    sudo cat "$file" >"$tmp"
  else
    rm -f "$tmp"
    error "No hay ${file}"
    return 1
  fi
  echo "$tmp"
}

if [[ ! -f "$SRC" ]]; then
  error "no existe $SRC"
  exit 1
fi

if [[ ! -d "$PLATFORM_CADDY" ]]; then
  error "no existe $PLATFORM_CADDY"
  echo "  Define PLATFORM_CADDY_DIR=... o instala el kit en ~/platform-kit"
  exit 1
fi

COMPOSE_BIN="$(detect_compose)" || {
  error "No hay 'docker compose' ni 'docker-compose'."
  echo "  Instala Docker (kit: sudo ~/platform-kit/ubuntu/bootstrap.sh → 4)"
  exit 1
}
info "Compose: ${COMPOSE_BIN}"

if ! docker network inspect platform-net >/dev/null 2>&1; then
  info "Creando red platform-net"
  docker network create platform-net
fi

info "Instalando Caddyfile de borde MyRent → ${PLATFORM_CADDY}/Caddyfile"
as_priv_cp "$SRC" "${PLATFORM_CADDY}/Caddyfile"

if [[ -f "${PLATFORM_CADDY}/.env" ]] || sudo test -f "${PLATFORM_CADDY}/.env" 2>/dev/null; then
  SITE_ADDRESS="$(read_env_var SITE_ADDRESS || true)"
  ACME_EMAIL="$(read_env_var ACME_EMAIL || true)"
  if [[ -z "${SITE_ADDRESS:-}" || "${SITE_ADDRESS}" == *example* ]]; then
    warn "SITE_ADDRESS en ${PLATFORM_CADDY}/.env debe ser rent.meincart.com"
  else
    info "SITE_ADDRESS=${SITE_ADDRESS}"
  fi
  if [[ "${ACME_EMAIL:-}" == *example* || "${ACME_EMAIL:-}" == CHANGE_ME* ]]; then
    warn "ACME_EMAIL debe ser un correo real"
  fi
else
  warn "falta ${PLATFORM_CADDY}/.env — créalo desde .env.example (menú platform/caddy)"
fi

ENV_TMP="$(prepare_env_file)"
trap 'rm -f "${ENV_TMP:-}"' EXIT

info "Recreando ${PROJECT_NAME}"
compose_up "$ENV_TMP"

info "Listo. Siguiente: EDGE=platform ./scripts/deploy-prod.sh"
echo "    Health: curl -sf http://127.0.0.1/health && curl -sfI https://rent.meincart.com | head -5"
