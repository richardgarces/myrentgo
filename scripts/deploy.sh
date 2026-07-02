#!/usr/bin/env bash
set -euo pipefail

ENV="${1:-production}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Deploying MyRent Go ($ENV)"

if [ ! -f .env ]; then
  echo "ERROR: .env file required. Copy .env.example to .env"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" pull 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Running health check..."
sleep 5
curl -sf http://localhost/health || curl -sf http://localhost:7070/health

echo "==> Deploy complete"
