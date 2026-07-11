#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Red Docker compartida ${PLATFORM_NET}"
ensure_platform_network
ensure_platform_dirs
docker network inspect "${PLATFORM_NET}" --format '{{.Name}} {{.Id}}' || true
info "Los servicios de plataforma se unen a esta red como external: true."
