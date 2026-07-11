#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Reglas base UFW (22, 80, 443)"
ufw allow OpenSSH comment 'SSH admin'
ufw allow 80/tcp comment 'HTTP ACME/redirect'
ufw allow 443/tcp comment 'HTTPS público'
info "Reglas añadidas. Revisa con: ufw status numbered"
ufw status numbered || true
warn "NO abras 27017, 5432, 6379, 9000, 8200, 9090 a Internet."
