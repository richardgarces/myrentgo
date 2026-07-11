#!/usr/bin/env bash
# Gestiona un servicio de plataforma: redis | minio | vault | ...
# Uso: manage.sh <servicio>
set -uo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

SERVICE="${1:-}"
if [[ -z "$SERVICE" ]]; then
  error "Uso: manage.sh <servicio>"
  exit 1
fi

SVC_DIR="${UBUNTU_ROOT}/platform/${SERVICE}"
if [[ ! -d "$SVC_DIR" ]]; then
  error "No existe platform/${SERVICE}"
  exit 1
fi

require_root
detect_compose
if [[ -z "$COMPOSE_BIN" ]]; then
  error "Docker Compose no disponible. Instala Docker (menú 4)."
  pause
  exit 1
fi
if [[ "$COMPOSE_BIN" == "docker-compose" ]]; then
  warn "Usando docker-compose v1 (legacy). Preferible: plugin 'docker compose' (menú 4)."
fi

COMPOSE_FILE="${SVC_DIR}/docker-compose.yml"
ENV_FILE="${SVC_DIR}/.env"
ENV_EXAMPLE="${SVC_DIR}/.env.example"

ensure_env() {
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    error "Falta ${ENV_EXAMPLE}"
    return 1
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    warn "Creado ${ENV_FILE} desde .env.example — edita CHANGE_ME antes de producción."
  fi
  return 0
}

compose() {
  local project app_id
  app_id="$(grep -E '^[[:space:]]*APP_ID=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\"' | tr -d "'" | tr -d ' ' || true)"
  app_id="${app_id:-platform}"
  project="${app_id}-${SERVICE}"
  # -p: compatible con docker compose v2 y docker-compose v1 (no usan top-level name:)
  # shellcheck disable=SC2086
  (cd "$SVC_DIR" && $COMPOSE_BIN -p "$project" --env-file "$ENV_FILE" -f docker-compose.yml "$@")
}

bring_up() {
  ensure_env || return 1
  ensure_platform_network || return 1
  ensure_platform_dirs || true

  if [[ ! -f "$COMPOSE_FILE" ]]; then
    error "Falta ${COMPOSE_FILE}"
    return 1
  fi

  if [[ "$SERVICE" == "alertmanager" && -x "${SVC_DIR}/render-config.sh" ]]; then
    info "Regenerando alertmanager.yml desde .env"
    bash "${SVC_DIR}/render-config.sh" || {
      error "Falló render-config.sh"
      return 1
    }
    # Por si el YAML quedó 600 de un render anterior
    chmod 644 "${SVC_DIR}/alertmanager.yml" 2>/dev/null || true
  fi

  info "Red platform-net:"
  docker network inspect platform-net --format '{{.Name}} {{.Driver}}' 2>/dev/null \
    || warn "No se pudo inspeccionar platform-net"

  info "Descargando imagen (si hace falta)..."
  if ! compose pull; then
    warn "compose pull falló (¿sin Internet?). Se intentará up con imagen local."
  fi

  info "Levantando ${SERVICE} (compose up -d)..."
  local up_log
  up_log="$(mktemp)"
  if ! compose up -d 2>"$up_log"; then
    error "Falló compose up -d para ${SERVICE}"
    echo
    echo "──── Error completo ────"
    cat "$up_log"
    echo "────────────────────────"
    echo
    info "Diagnóstico rápido:"
    echo "  docker network ls | grep platform"
    docker network ls | grep platform || true
    echo "  ss -tlnp | grep ${SERVICE:0:4} || ss -tlnp | grep 8200"
    ss -tlnp 2>/dev/null | grep -E '8200|5432|6379|9000|9090|27017' || true
    echo "  docker ps -a --filter name=platform-${SERVICE}"
    docker ps -a --filter "name=platform-${SERVICE}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
    rm -f "$up_log"
    return 1
  fi
  rm -f "$up_log"

  compose ps || true
  info "${SERVICE} levantado (o ya estaba up)."
  if [[ "$SERVICE" == "vault" ]]; then
    echo
    info "Vault: API en http://127.0.0.1:8200 (solo localhost)."
    info "Si VAULT_DEV_MODE=false, el siguiente paso es:"
    echo "  docker exec -it platform-vault vault operator init"
    echo "  docker exec -it platform-vault vault operator unseal"
  fi
  return 0
}

menu_svc() {
  while true; do
    clear || true
    header "Plataforma → ${SERVICE}"
    cat <<EOF
  Directorio: ${SVC_DIR}
  Compose:    ${COMPOSE_FILE}
  Env:        ${ENV_FILE}

  1) Preparar .env (copiar .env.example si falta)
  2) Editar .env (nano)
  3) Crear red platform-net (si falta)
  4) Levantar (up -d)
  5) Parar (down)
  6) Logs (tail)
  7) Estado (ps)
  8) Reiniciar
  9) Ver README / help del servicio
 10) Mostrar .env.example (documentación de parámetros)
  0) Volver
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) ensure_env; pause ;;
      2)
        ensure_env || true
        nano "$ENV_FILE" || vi "$ENV_FILE" || true
        ;;
      3)
        if ensure_platform_network; then
          info "Red lista."
          docker network ls | grep platform || true
        else
          error "No se pudo crear/verificar platform-net"
        fi
        pause
        ;;
      4)
        if ! bring_up; then
          warn "No se instaló/levantó ${SERVICE}. Lee el error de arriba."
        fi
        pause
        ;;
      5)
        ensure_env || true
        if ask_yes_no "¿Parar ${SERVICE}?"; then
          compose down || warn "down falló"
        fi
        pause
        ;;
      6)
        ensure_env || true
        compose logs -f --tail=100 || true
        ;;
      7)
        ensure_env || true
        compose ps || true
        docker ps -a --filter "name=platform-${SERVICE}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
        pause
        ;;
      8)
        ensure_env || true
        compose restart || warn "restart falló"
        pause
        ;;
      9)
        if [[ -f "${SVC_DIR}/README.txt" ]]; then
          less -F "${SVC_DIR}/README.txt" 2>/dev/null || cat "${SVC_DIR}/README.txt"
        elif [[ -f "${SVC_DIR}/README.md" ]]; then
          less -F "${SVC_DIR}/README.md" 2>/dev/null || cat "${SVC_DIR}/README.md"
        elif [[ -f "${UBUNTU_ROOT}/docs/help/${SERVICE}.txt" ]]; then
          less -F "${UBUNTU_ROOT}/docs/help/${SERVICE}.txt" 2>/dev/null || cat "${UBUNTU_ROOT}/docs/help/${SERVICE}.txt"
        elif [[ -f "${UBUNTU_ROOT}/docs/help/${SERVICE}.md" ]]; then
          less -F "${UBUNTU_ROOT}/docs/help/${SERVICE}.md" 2>/dev/null || cat "${UBUNTU_ROOT}/docs/help/${SERVICE}.md"
        else
          warn "Sin README."
        fi
        pause
        ;;
      10)
        less -F "$ENV_EXAMPLE" 2>/dev/null || cat "$ENV_EXAMPLE"
        pause
        ;;
      0) return 0 ;;
      *) warn "Opción inválida" ;;
    esac
  done
}

menu_svc
