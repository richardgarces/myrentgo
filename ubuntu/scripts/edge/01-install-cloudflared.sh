#!/usr/bin/env bash
# Instala cloudflared (Cloudflare Tunnel) — exponer apps sin abrir 80/443 en el router.
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Cloudflare Tunnel (cloudflared)"

export DEBIAN_FRONTEND=noninteractive
# Repo oficial Cloudflare
if [[ ! -f /usr/share/keyrings/cloudflare-main.gpg ]]; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
fi
# shellcheck disable=SC1091
. /etc/os-release
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared ${VERSION_CODENAME} main" \
  >/etc/apt/sources.list.d/cloudflared.list

apt-get update -y
apt-get install -y cloudflared

cloudflared --version
ensure_platform_dirs
mkdir -p "${PLATFORM_ROOT}/cloudflared"

info "cloudflared instalado."
echo
cat <<'EOF'
Siguiente (interactivo, en este servidor):

  1) Login en Cloudflare:
       sudo cloudflared tunnel login

  2) Crear túnel:
       sudo cloudflared tunnel create platform

  3) Copiar plantilla de config:
       sudo cp /ruta/al/kit/ubuntu/platform/cloudflared/config.example.yml \
         /opt/platform/cloudflared/config.yml
       sudo nano /opt/platform/cloudflared/config.yml

  4) Enrutar DNS (ejemplo):
       sudo cloudflared tunnel route dns platform app.example.com

  5) Servicio systemd:
       sudo cloudflared service install
       # o: sudo systemctl enable --now cloudflared

Documentación del kit: platform/cloudflared/README.md
EOF

# Copiar ejemplo al host si existe en el kit
EXAMPLE="${UBUNTU_ROOT}/platform/cloudflared/config.example.yml"
if [[ -f "$EXAMPLE" ]]; then
  cp "$EXAMPLE" "${PLATFORM_ROOT}/cloudflared/config.example.yml"
  info "Ejemplo copiado a ${PLATFORM_ROOT}/cloudflared/config.example.yml"
fi
