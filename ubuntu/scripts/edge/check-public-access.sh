#!/usr/bin/env bash
# =============================================================================
# Checklist + diagnóstico: acceso público (DNS / router / Caddy / Tunnel)
# Docs: ../../docs/help/public-access.md
# =============================================================================
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

print_guide() {
  if [[ -f "${UBUNTU_ROOT}/docs/help/public-access.txt" ]]; then
    less -F "${UBUNTU_ROOT}/docs/help/public-access.txt" 2>/dev/null \
      || cat "${UBUNTU_ROOT}/docs/help/public-access.txt"
  else
    cat <<'EOF'
Ver docs/help/public-access.txt (paso a paso DNS + router + Caddy / Tunnel).
EOF
  fi
}

lan_ip() {
  ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' \
    || hostname -I 2>/dev/null | awk '{print $1}'
}

public_ip() {
  curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null \
    || curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null \
    || true
}

check_ufw() {
  header "1/6 UFW (80 y 443)"
  if ! command -v ufw >/dev/null 2>&1; then
    warn "UFW no instalado"
    return
  fi
  ufw status | sed 's/^/  /' || true
  if ufw status 2>/dev/null | grep -qE '80/tcp.*ALLOW'; then
    info "80/tcp permitido"
  else
    warn "Falta: sudo ufw allow 80/tcp"
  fi
  if ufw status 2>/dev/null | grep -qE '443/tcp.*ALLOW'; then
    info "443/tcp permitido"
  else
    warn "Falta: sudo ufw allow 443/tcp"
  fi
}

check_listen() {
  header "2/6 Puertos en escucha (host)"
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep -E ':80 |:443 ' | sed 's/^/  /' || warn "Nadie escucha en 80/443"
  else
    warn "ss no disponible"
  fi
  echo
  echo -n "  curl http://127.0.0.1/ → "
  local code
  code="$(curl -sI --connect-timeout 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/ 2>/dev/null || echo fail)"
  echo "${code}"
  if [[ "$code" == "308" || "$code" == "301" || "$code" == "200" ]]; then
    info "Caddy (u otro proxy) responde en localhost — OK local"
  else
    warn "Local no responde como se espera. ¿platform-caddy up?"
  fi
}

check_caddy_env() {
  header "3/6 Caddy .env (ACME_EMAIL / SITE_ADDRESS)"
  local envf="${UBUNTU_ROOT}/platform/caddy/.env"
  if [[ ! -f "$envf" ]]; then
    warn "No existe ${envf} — copia .env.example y edita"
    return
  fi
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  source "$envf" 2>/dev/null || true
  set +a
  echo "  SITE_ADDRESS=${SITE_ADDRESS:-"(vacío)"}"
  echo "  ACME_EMAIL=${ACME_EMAIL:-"(vacío)"}"
  if [[ "${ACME_EMAIL:-}" == *"@example.com"* ]] || [[ "${ACME_EMAIL:-}" == CHANGE_ME* ]]; then
    warn "ACME_EMAIL inválido para Let's Encrypt. Usa un correo real (Gmail u otro)."
  else
    info "ACME_EMAIL parece usable"
  fi
  if [[ -z "${SITE_ADDRESS:-}" || "${SITE_ADDRESS:-}" == *"example.com"* ]]; then
    warn "SITE_ADDRESS debe ser tu dominio real (ej. rent.meincart.com)"
  fi
}

check_caddy_container() {
  header "4/6 Contenedor platform-caddy"
  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker no instalado"
    return
  fi
  docker ps -a --filter name=platform-caddy --format '  {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
    || warn "No se pudo listar contenedores"
}

check_ips() {
  header "5/6 IPs (LAN vs pública)"
  local lan pub
  lan="$(lan_ip)"
  pub="$(public_ip)"
  echo "  IP LAN del host:  ${lan:-"(desconocida)"}"
  echo "  IP pública:       ${pub:-"(no se pudo obtener)"}"
  echo
  if [[ -n "${lan:-}" ]]; then
    info "En el router: reenvía TCP 80 y 443 → ${lan}:80 y ${lan}:443"
  fi
  if [[ -n "${pub:-}" ]]; then
    info "En Cloudflare DNS: A rent → ${pub} (gris mientras ACME)"
    echo
    echo "  Desde tu Mac (fuera de la LAN) prueba:"
    echo "    curl -sI --connect-timeout 5 http://${pub}/ | head -8"
    echo
    echo "  Interpretación:"
    echo "    308 / Location https…     → llega a Caddy (bien)"
    echo "    Server: micro_httpd 501   → responde el ROUTER, no este host"
    echo "    timeout                   → sin port-forward o ISP bloquea 80"
  fi
}

check_tunnel_hint() {
  header "6/6 Alternativa: Cloudflare Tunnel"
  cat <<'EOF'
  Si el ISP o el router se quedan con el puerto 80 (micro_httpd),
  no abras el router: usa Tunnel.

    bootstrap → 7) Borde → 1) Instalar cloudflared
    docs/help/cloudflared.txt

  Tip: Tunnel → http://platform-caddy:80 → tus apps.
EOF
}

run_checks() {
  check_ufw
  echo
  check_listen
  echo
  check_caddy_env
  echo
  check_caddy_container
  echo
  check_ips
  echo
  check_tunnel_hint
}

main_menu() {
  while true; do
    clear || true
    header "Acceso público — checklist"
    cat <<'EOF'
  1) Ver guía completa (paso a paso)
  2) Ejecutar diagnóstico en este host
  3) Ambos (guía + diagnóstico)
  4) HELP public-access
  5) Ir a menú Caddy (compose)
  6) Ir a menú Tunnel (cloudflared)
  0) Volver / salir
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) print_guide; pause ;;
      2) run_checks; pause ;;
      3) print_guide; pause; run_checks; pause ;;
      4)
        less -F "${UBUNTU_ROOT}/docs/help/public-access.txt" 2>/dev/null \
          || cat "${UBUNTU_ROOT}/docs/help/public-access.txt"
        pause
        ;;
      5) bash "${UBUNTU_ROOT}/scripts/platform/manage.sh" caddy ;;
      6) bash "${UBUNTU_ROOT}/scripts/edge/manage-tunnel.sh" ;;
      0) exit 0 ;;
      *) warn "Opción inválida"; sleep 1 ;;
    esac
  done
}

case "${1:-}" in
  --guide|-g) print_guide ;;
  --check|-c) run_checks ;;
  --help|-h)
    echo "Uso: $0 [--guide|--check]   (sin args: menú)"
    ;;
  *) main_menu ;;
esac
