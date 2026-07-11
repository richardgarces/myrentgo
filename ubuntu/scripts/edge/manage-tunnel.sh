#!/usr/bin/env bash
# Docs: ../../docs/help/cloudflared.md
# cloudflared se instala en el host (no es un compose 24/7 del kit).
# Este manage solo abre README / copia ejemplo / recuerda comandos.
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Cloudflare Tunnel"
cat <<'EOF'
  1) Instalar cloudflared (apt)
  2) Ver README / help
  3) Copiar config.example → /opt/platform/cloudflared/
  0) Volver
EOF
read -r -p "Opción: " o
case "$o" in
  1) bash "${UBUNTU_ROOT}/scripts/edge/01-install-cloudflared.sh" ;;
  2)
    less -F "${UBUNTU_ROOT}/platform/cloudflared/README.md" 2>/dev/null \
      || cat "${UBUNTU_ROOT}/platform/cloudflared/README.md"
    ;;
  3)
    ensure_platform_dirs
    mkdir -p "${PLATFORM_ROOT}/cloudflared"
    cp "${UBUNTU_ROOT}/platform/cloudflared/config.example.yml" \
      "${PLATFORM_ROOT}/cloudflared/config.example.yml"
    if [[ ! -f "${PLATFORM_ROOT}/cloudflared/config.yml" ]]; then
      cp "${PLATFORM_ROOT}/cloudflared/config.example.yml" \
        "${PLATFORM_ROOT}/cloudflared/config.yml"
      chmod 600 "${PLATFORM_ROOT}/cloudflared/config.yml"
      warn "Edita ${PLATFORM_ROOT}/cloudflared/config.yml (tunnel ID y hostnames)."
    fi
    info "Listo en ${PLATFORM_ROOT}/cloudflared/"
    ;;
  0) ;;
  *) warn "Opción inválida" ;;
esac
