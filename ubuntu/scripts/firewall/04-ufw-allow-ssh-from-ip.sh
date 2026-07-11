#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Permitir SSH solo desde una IP"
read -r -p "IP o CIDR permitida (ej. 203.0.113.10 o 203.0.113.0/24): " IP
if [[ -z "${IP}" ]]; then
  error "IP vacía."
  exit 1
fi

# Insertar regla allow from IP to OpenSSH; eliminar allow OpenSSH genérico es manual
ufw allow from "${IP}" to any port 22 proto tcp comment "SSH desde ${IP}"
info "Regla añadida. Si quieres cerrar SSH al mundo:"
echo "  ufw status numbered"
echo "  ufw delete <n>   # borra la regla 'Anywhere' de OpenSSH"
ufw status numbered || true
