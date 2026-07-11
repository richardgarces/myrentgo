#!/usr/bin/env bash
# Despliegue de producción — MyRent Go
# Uso:
#   ./scripts/deploy-prod.sh
#   EDGE=platform ./scripts/deploy-prod.sh   # BMAX / kit ubuntu (platform-caddy)
#   EDGE=auto ./scripts/deploy-prod.sh       # usa platform si platform-caddy está up
#
# Requiere: .env (desde .env.production.example), Docker, docker compose v2
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
PLATFORM_OVERRIDE="docker-compose.prod.platform.yml"
EDGE="${EDGE:-auto}"

echo "==> Desplegando MyRent Go (producción)"

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env. Copia la plantilla:"
  echo "  cp .env.production.example .env"
  exit 1
fi

# Leer KEY del .env sin `source` (valores con espacios rompen el shell, ej. APP_NAME=MyRent Go)
env_get() {
  local key="$1" line val
  line="$(grep -E "^[[:space:]]*${key}=" .env 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || { echo ""; return 0; }
  val="${line#*=}"
  val="${val%$'\r'}"
  # Quitar comillas envolventes si las hay
  if [[ "$val" =~ ^\".*\"$ ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" =~ ^\'.*\'$ ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

JWT_SECRET="$(env_get JWT_SECRET)"
MONGO_ROOT_USER="$(env_get MONGO_ROOT_USER)"
MONGO_ROOT_PASSWORD="$(env_get MONGO_ROOT_PASSWORD)"
CORS_ORIGINS="$(env_get CORS_ORIGINS)"
FRONTEND_URL="$(env_get FRONTEND_URL)"
DOMAIN="$(env_get DOMAIN)"
SMTP_HOST="$(env_get SMTP_HOST)"
SMTP_FROM="$(env_get SMTP_FROM)"

for var in JWT_SECRET MONGO_ROOT_USER MONGO_ROOT_PASSWORD CORS_ORIGINS FRONTEND_URL DOMAIN; do
  if [[ -z "${!var:-}" ]] || [[ "${!var}" == CHANGE_ME* ]]; then
    echo "ERROR: define ${var} en .env (sin valores CHANGE_ME)"
    exit 1
  fi
done

if [[ -z "${SMTP_HOST:-}" ]] || [[ -z "${SMTP_FROM:-}" ]]; then
  echo "WARN: SMTP_HOST/SMTP_FROM vacíos — los correos de la app no se enviarán hasta configurar SMTP gratuito (Brevo/SendGrid/Gmail)."
fi

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
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

COMPOSE_BIN="$(detect_compose)" || {
  echo "ERROR: no hay 'docker compose' ni 'docker-compose'"
  exit 1
}

use_platform=false
case "$EDGE" in
  platform|1|yes|true) use_platform=true ;;
  builtin|app|myrent) use_platform=false ;;
  auto)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'platform-caddy'; then
      use_platform=true
    fi
    ;;
  *)
    echo "ERROR: EDGE debe ser auto|platform|builtin (recibido: $EDGE)"
    exit 1
    ;;
esac

# shellcheck disable=SC2206
compose=($COMPOSE_BIN -f "$COMPOSE_FILE")
if [[ "$use_platform" == true ]]; then
  if [[ ! -f "$PLATFORM_OVERRIDE" ]]; then
    echo "ERROR: falta $PLATFORM_OVERRIDE"
    exit 1
  fi
  if ! docker network inspect platform-net >/dev/null 2>&1; then
    echo "==> Creando red platform-net"
    docker network create platform-net
  fi
  compose+=(-f "$PLATFORM_OVERRIDE")
  echo "==> Modo EDGE=platform (Caddy del kit ubuntu; sin Caddy de MyRent en :80/:443)"
  echo "==> Compose: ${COMPOSE_BIN}"
  if [[ ! -f "${PLATFORM_CADDY_DIR:-${HOME}/platform-kit/ubuntu/platform/caddy}/Caddyfile" ]] \
    || ! grep -q 'myrent-api' "${PLATFORM_CADDY_DIR:-${HOME}/platform-kit/ubuntu/platform/caddy}/Caddyfile" 2>/dev/null; then
    echo "WARN: platform-caddy aún no apunta a myrent-api."
    echo "      Ejecuta: ./scripts/link-platform-caddy.sh"
  fi
else
  echo "==> Modo EDGE=builtin (Caddy de docker-compose.prod.yml en :80/:443)"
  echo "==> Compose: ${COMPOSE_BIN}"
fi

"${compose[@]}" pull 2>/dev/null || true
"${compose[@]}" build

# docker-compose v1 + Docker nuevo: recreate falla con KeyError ContainerConfig
compose_up() {
  case "$COMPOSE_BIN" in
    docker-compose|*/docker-compose)
      echo "==> Workaround docker-compose v1: down + rm + up (evita ContainerConfig)"
      "${compose[@]}" down || true
      docker rm -f myrent-api myrent-frontend 2>/dev/null || true
      # nombres legacy del proyecto
      docker ps -aq --filter name=my-rent-go_api --filter name=my-rent-go_frontend \
        | xargs -r docker rm -f 2>/dev/null || true
      "${compose[@]}" up -d
      ;;
    *)
      "${compose[@]}" up -d --remove-orphans
      ;;
  esac
}
compose_up

echo "==> Esperando health checks..."
sleep 10

HEALTH_OK=false
if curl -sf "http://127.0.0.1/health" >/dev/null 2>&1; then
  echo "==> Health OK: http://127.0.0.1/health"
  HEALTH_OK=true
elif curl -sf "http://127.0.0.1:7070/health" >/dev/null 2>&1; then
  echo "==> Health OK: http://127.0.0.1:7070/health"
  HEALTH_OK=true
elif docker exec myrent-api wget -qO- "http://127.0.0.1:7070/health" >/dev/null 2>&1; then
  echo "==> Health OK: myrent-api (interno)"
  HEALTH_OK=true
fi

if [[ "$HEALTH_OK" != true ]]; then
  echo "WARN: health check local falló — revisa:"
  "${compose[@]}" ps
  echo
  echo "==> Logs api (últimas 40 líneas):"
  docker logs myrent-api --tail=40 2>&1 || true
  echo
  echo "==> Health api:"
  docker inspect myrent-api --format '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' 2>&1 || true
  if [[ "$use_platform" == true ]]; then
    echo "  Tip: ./scripts/link-platform-caddy.sh && docker compose -p platform-caddy logs --tail=30"
  fi
  exit 1
fi

if [[ -n "$DOMAIN" ]]; then
  echo "==> App pública (tras DNS): https://${DOMAIN}"
fi

echo "==> Despliegue completado"
