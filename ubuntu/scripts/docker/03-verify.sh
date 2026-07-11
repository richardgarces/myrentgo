#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

header "Verificar Docker"
command -v docker >/dev/null || { error "docker no encontrado"; exit 1; }
docker run --rm hello-world
docker compose version
info "OK."
