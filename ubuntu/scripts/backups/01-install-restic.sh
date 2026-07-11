#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Instalar restic"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y restic
restic version
info "restic instalado. Configura platform/restic/.env y cron (menú backups)."
