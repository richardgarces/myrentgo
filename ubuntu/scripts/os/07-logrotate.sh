#!/usr/bin/env bash
# Logrotate para logs del kit (apt full upgrade, healthcheck, restic).
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Logrotate — logs de plataforma"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y logrotate

ensure_platform_dirs
mkdir -p /var/log/platform-apt "${PLATFORM_ROOT}/logs"

cat >/etc/logrotate.d/platform-kit <<'EOF'
# Logs del kit ubuntu/platform
/var/log/platform-apt/*.log
/opt/platform/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    dateext
}
EOF

info "Config: /etc/logrotate.d/platform-kit"
info "Prueba: logrotate -d /etc/logrotate.d/platform-kit"
logrotate -d /etc/logrotate.d/platform-kit 2>&1 | tail -20 || true
info "Logrotate instalado (rotación diaria, 14 días)."
