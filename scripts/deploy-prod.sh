#!/usr/bin/env bash
# Despliegue de producción — MyRent Go
# Uso: ./scripts/deploy-prod.sh
# Requiere: .env (copiar desde .env.production.example), Docker, docker compose v2
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Desplegando MyRent Go (producción)"

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env. Copia la plantilla:"
  echo "  cp .env.production.example .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

for var in JWT_SECRET MONGO_ROOT_USER MONGO_ROOT_PASSWORD CORS_ORIGINS FRONTEND_URL; do
  if [[ -z "${!var:-}" ]] || [[ "${!var}" == CHANGE_ME* ]]; then
    echo "ERROR: define ${var} en .env (sin valores CHANGE_ME)"
    exit 1
  fi
done

docker compose -f "$COMPOSE_FILE" pull 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Esperando health checks..."
sleep 10

HEALTH_URL="http://localhost/health"
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "==> Health OK: $HEALTH_URL"
elif curl -sf "http://localhost:7070/health" >/dev/null 2>&1; then
  echo "==> Health OK: http://localhost:7070/health"
else
  echo "WARN: health check local falló — revisa: docker compose -f $COMPOSE_FILE ps"
  docker compose -f "$COMPOSE_FILE" ps
  exit 1
fi

DOMAIN="${DOMAIN:-}"
if [[ -n "$DOMAIN" ]]; then
  echo "==> App pública (tras DNS): https://${DOMAIN}"
fi

echo "==> Despliegue completado"
