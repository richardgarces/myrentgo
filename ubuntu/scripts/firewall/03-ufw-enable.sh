#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Activar UFW"
warn "Si estás conectado por SSH, asegúrate de que la regla OpenSSH ya está permitida."
if ! ask_yes_no "¿Activar UFW ahora?"; then
  info "Cancelado."
  exit 0
fi
ufw --force enable
ufw status verbose
info "UFW activo."
