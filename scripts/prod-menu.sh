#!/usr/bin/env bash
# =============================================================================
# Menú de producción en el SERVIDOR (BMAX) — estilo platform/manage.sh
#
#   cd ~/my-rent-go && ./prod-menu.sh
#   ./prod-menu.sh 10          # todo en un paso
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.production.example"
COMPOSE_PROD="${ROOT_DIR}/docker-compose.prod.yml"
COMPOSE_PLATFORM="${ROOT_DIR}/docker-compose.prod.platform.yml"

chmod +x "${ROOT_DIR}/scripts/"*.sh 2>/dev/null || true

info() { echo "[✓] $*"; }
warn() { echo "[!] $*"; }
error() { echo "[✗] $*" >&2; }
pause() { read -r -p "Pulsa Enter..." _; }

compose_prod() {
  local args=(-f "$COMPOSE_PROD")
  if [[ -f "$COMPOSE_PLATFORM" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx platform-caddy; then
    args+=(-f "$COMPOSE_PLATFORM")
  fi
  docker compose "${args[@]}" "$@"
}

# 1) Igual que manage.sh ensure_env — solo copia plantilla
ensure_env() {
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    error "Falta ${ENV_EXAMPLE}"
    return 1
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    warn "Creado ${ENV_FILE} desde .env.production.example — edita CHANGE_ME (opción 2) o genera secretos (opción 3)."
  else
    info ".env ya existe: ${ENV_FILE}"
    chmod 600 "$ENV_FILE" 2>/dev/null || true
  fi
  return 0
}

edit_env() {
  ensure_env || return 1
  info "Editando ${ENV_FILE}"
  nano "$ENV_FILE" || vi "$ENV_FILE" || "${EDITOR:-true}" "$ENV_FILE" || true
}

cmd_generate_secrets() {
  ensure_env || return 1
  bash "${ROOT_DIR}/scripts/prod-prepare-env.sh" "$@"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    error "Docker no instalado. Kit: sudo ~/platform-kit/ubuntu/bootstrap.sh → 4"
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    error "Docker no responde (¿grupo docker?)"
    return 1
  fi
}

cmd_link_caddy() {
  bash "${ROOT_DIR}/scripts/link-platform-caddy.sh"
}

cmd_deploy() {
  ensure_docker || return 1
  ensure_env || return 1
  EDGE="${EDGE:-platform}" bash "${ROOT_DIR}/scripts/deploy-prod.sh"
}

cmd_logs() {
  ensure_docker || return 1
  compose_prod logs -f --tail=100 || true
}

cmd_status() {
  echo "=== Compose ==="
  compose_prod ps 2>/dev/null || true
  echo
  echo "=== Contenedores myrent / caddy ==="
  docker ps -a --filter name=myrent --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  docker ps -a --filter name=platform-caddy --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  echo
  echo -n "Health: "
  if curl -sf --connect-timeout 5 http://127.0.0.1/health >/dev/null 2>&1; then
    info "http://127.0.0.1/health OK"
  elif docker exec myrent-api wget -qO- http://127.0.0.1:7070/health >/dev/null 2>&1; then
    info "myrent-api interno OK"
  else
    warn "health falló"
  fi
}

cmd_restart() {
  ensure_docker || return 1
  compose_prod restart || warn "restart falló"
  docker compose -p platform-caddy -f "${HOME}/platform-kit/ubuntu/platform/caddy/docker-compose.yml" restart 2>/dev/null || true
}

cmd_show_example() {
  less -F "$ENV_EXAMPLE" 2>/dev/null || cat "$ENV_EXAMPLE"
}

cmd_oneshot() {
  echo; echo "======== 1/5 Preparar .env ========"
  ensure_env
  echo; echo "======== 2/5 Generar secretos CHANGE_ME ========"
  cmd_generate_secrets
  echo; echo "======== 3/5 Enlazar platform-caddy ========"
  if [[ -d "${PLATFORM_CADDY_DIR:-$HOME/platform-kit/ubuntu/platform/caddy}" ]]; then
    cmd_link_caddy
  else
    warn "No hay platform-caddy en ~/platform-kit"
  fi
  echo; echo "======== 4/5 Deploy (EDGE=platform) ========"
  EDGE=platform cmd_deploy
  echo; echo "======== 5/5 Estado ========"
  cmd_status
  echo
  info "Listo. Si falta SMTP, opción 2) Editar .env"
  info "Abre https://rent.meincart.com"
}

show_menu() {
  clear 2>/dev/null || true
  cat <<EOF
════════════════════════════════════════
 MyRent Go — producción
════════════════════════════════════════
  Directorio: ${ROOT_DIR}
  Env:        ${ENV_FILE}
  Compose:    ${COMPOSE_PROD}

  1) Preparar .env (copiar .env.production.example si falta)
  2) Editar .env (nano)
  3) Generar secretos automáticos (JWT / Mongo / metrics)
  4) Enlazar platform-caddy (borde)
  5) Levantar / deploy (EDGE=platform)
  6) Logs (tail -f)
  7) Estado (ps + health)
  8) Reiniciar
  9) Mostrar .env.production.example (documentación)
 10) TODO EN UN PASO (1→3→4→5→7)
  0) Salir
EOF
  read -r -p "Opción: " o
  case "$o" in
    1) ensure_env; pause ;;
    2) edit_env ;;
    3) cmd_generate_secrets; pause ;;
    4) cmd_link_caddy; pause ;;
    5) EDGE=platform cmd_deploy; pause ;;
    6) cmd_logs ;;
    7) cmd_status; pause ;;
    8) cmd_restart; pause ;;
    9) cmd_show_example; pause ;;
    10) cmd_oneshot; pause ;;
    0|q|Q) exit 0 ;;
    *) warn "Opción inválida"; sleep 1 ;;
  esac
}

case "${1:-}" in
  1|ensure-env) ensure_env ;;
  2|edit) edit_env ;;
  3|secrets) cmd_generate_secrets "${2:-}" ;;
  4|link) cmd_link_caddy ;;
  5|deploy) EDGE=platform cmd_deploy ;;
  6|logs) cmd_logs ;;
  7|status|health) cmd_status ;;
  8|restart) cmd_restart ;;
  9|example) cmd_show_example ;;
  10|oneshot|--oneshot|-y) cmd_oneshot ;;
  --help|-h)
    cat <<'EOF'
Uso: ./prod-menu.sh [opción]

  1  Preparar .env (copiar plantilla)
  2  Editar .env (nano)
  3  Generar secretos
  4  link-platform-caddy
  5  deploy EDGE=platform
  6  logs
  7  estado
  8  reiniciar
  9  ver .env.production.example
 10  todo en un paso

Sin argumentos: menú interactivo (como platform/manage.sh).
EOF
    ;;
  "")
    while true; do show_menu; done
    ;;
  *)
    error "Opción desconocida: $1 (usa --help)"
    exit 1
    ;;
esac
