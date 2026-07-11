#!/usr/bin/env bash
# Crea swapfile si no hay swap (útil en hosts 4–8 GB).
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Swap"

if swapon --show | grep -q .; then
  info "Ya hay swap activo:"
  swapon --show
  free -h
  if ! ask_yes_no "¿Reconfigurar / crear swap adicional de todos modos?"; then
    exit 0
  fi
fi

read -r -p "Tamaño del swapfile en GB [2]: " gb_in
GB="${gb_in:-2}"
if ! [[ "$GB" =~ ^[0-9]+$ ]] || (( GB < 1 || GB > 32 )); then
  error "Tamaño inválido (1–32 GB)."
  exit 1
fi

SWAPFILE="/swapfile"
if [[ -f "$SWAPFILE" ]]; then
  warn "${SWAPFILE} ya existe."
  if ask_yes_no "¿Recrear ${SWAPFILE}?"; then
    swapoff "$SWAPFILE" 2>/dev/null || true
    rm -f "$SWAPFILE"
  else
    exit 0
  fi
fi

info "Creando ${SWAPFILE} (${GB}G)..."
fallocate -l "${GB}G" "$SWAPFILE" 2>/dev/null || dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((GB * 1024)) status=progress
chmod 600 "$SWAPFILE"
mkswap "$SWAPFILE"
swapon "$SWAPFILE"

if ! grep -q "^${SWAPFILE} " /etc/fstab 2>/dev/null; then
  echo "${SWAPFILE} none swap sw 0 0" >>/etc/fstab
  info "Añadido a /etc/fstab"
fi

# swappiness moderado (menos agresivo que default 60 en servidores)
cat >/etc/sysctl.d/99-platform-swap.conf <<'EOF'
# Preferir RAM; usar swap solo bajo presión
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF
sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/99-platform-swap.conf

info "Swap activo:"
swapon --show
free -h
