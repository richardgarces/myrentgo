#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "sysctl de red básicos"
cat >/etc/sysctl.d/99-platform-hardening.conf <<'EOF'
# Endurecimiento red — kit ubuntu/platform
# Ignorar redirects ICMP
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
# No enviar redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
# Anti spoofing / source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
# SYN cookies contra flood SYN
net.ipv4.tcp_syncookies = 1
# Log martians
net.ipv4.conf.all.log_martians = 1
# ASLR
kernel.randomize_va_space = 2
EOF

sysctl --system
info "sysctl aplicado: /etc/sysctl.d/99-platform-hardening.conf"
