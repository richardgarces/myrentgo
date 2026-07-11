#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Docker prune"
warn "Elimina contenedores parados, redes no usadas e imágenes dangling."
if ask_yes_no "¿Ejecutar docker system prune -af?"; then
  docker system prune -af
  info "Limpieza hecha."
else
  info "Cancelado."
fi
