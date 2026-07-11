#!/usr/bin/env bash
# Levanta Prometheus + Grafana para MyRent Go (red Docker myrentgo-prod).
# Uso: ./scripts/deploy-monitoring.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM_DIR="${ROOT_DIR}/deploy/platform"
ENV_FILE="${PLATFORM_DIR}/.env.monitoring"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.monitoring.yml"
TOKEN_FILE="${PLATFORM_DIR}/prometheus/metrics_token"

cd "$ROOT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: falta ${ENV_FILE}"
  echo "  cp deploy/platform/.env.monitoring.example deploy/platform/.env.monitoring"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${METRICS_SCRAPE_TOKEN:-}" ]] || [[ "${METRICS_SCRAPE_TOKEN}" == CHANGE_ME* ]]; then
  echo "ERROR: define METRICS_SCRAPE_TOKEN en .env.monitoring (openssl rand -base64 32)"
  exit 1
fi

if [[ -z "${GRAFANA_ADMIN_PASSWORD:-}" ]] || [[ "${GRAFANA_ADMIN_PASSWORD}" == CHANGE_ME* ]]; then
  echo "ERROR: define GRAFANA_ADMIN_PASSWORD en .env.monitoring"
  exit 1
fi

if ! docker network inspect myrentgo-prod >/dev/null 2>&1; then
  echo "ERROR: red Docker myrentgo-prod no existe. Despliega primero la app:"
  echo "  ./scripts/deploy-prod.sh"
  exit 1
fi

# Token sin salto de línea (formato credentials_file de Prometheus)
umask 077
printf '%s' "$METRICS_SCRAPE_TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

# Mismo token en .env de la app (advertencia si difiere)
MONITORING_TOKEN="$METRICS_SCRAPE_TOKEN"
if [[ -f .env ]]; then
  APP_METRICS_TOKEN=""
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source .env
  APP_METRICS_TOKEN="${METRICS_SCRAPE_TOKEN:-}"
  set +a
  if [[ -n "$APP_METRICS_TOKEN" ]] && [[ "$APP_METRICS_TOKEN" != "$MONITORING_TOKEN" ]]; then
    echo "WARN: METRICS_SCRAPE_TOKEN en .env difiere de .env.monitoring — Prometheus no podrá scrapear."
  elif [[ -z "$APP_METRICS_TOKEN" ]]; then
    echo "WARN: METRICS_SCRAPE_TOKEN no está en .env — añádelo y reinicia api."
  fi
fi

echo "==> Generando configuración Alertmanager"
chmod +x "${ROOT_DIR}/scripts/render-alertmanager-config.sh"
"${ROOT_DIR}/scripts/render-alertmanager-config.sh" \
  "${PLATFORM_DIR}/alertmanager/alertmanager.yml" \
  "$ENV_FILE"

echo "==> Levantando Prometheus + Alertmanager + Grafana (localhost)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

PROM_PORT="${PROMETHEUS_PORT:-9090}"
GRAF_PORT="${GRAFANA_PORT:-3001}"
AM_PORT="${ALERTMANAGER_PORT:-9093}"

echo "==> Prometheus:    http://127.0.0.1:${PROM_PORT}"
echo "==> Alertmanager:  http://127.0.0.1:${AM_PORT}"
echo "==> Grafana:       http://127.0.0.1:${GRAF_PORT} (usuario: ${GRAFANA_ADMIN_USER:-admin})"
echo ""
echo "Añade METRICS_SCRAPE_TOKEN al .env de la app si aún no está:"
echo "  METRICS_SCRAPE_TOKEN=<mismo valor que .env.monitoring>"
echo "  docker compose -f docker-compose.prod.yml up -d api"
