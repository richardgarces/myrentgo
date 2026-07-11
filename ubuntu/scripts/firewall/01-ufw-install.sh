#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Instalar UFW — políticas por defecto"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing
info "Política: deny incoming / allow outgoing."
warn "UFW aún no está activo. Configura reglas (menú 2) y luego activa (menú 3)."
