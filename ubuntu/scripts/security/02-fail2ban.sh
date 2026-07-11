#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "fail2ban (protección SSH)"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y fail2ban

cat >/etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
# Tiempo de bloqueo tras rebasar maxretry (segundos)
bantime = 1h
# Ventana de conteo de fallos
findtime = 10m
# Intentos fallidos antes de ban
maxretry = 5
# IP nunca bloqueada (añade tu IP de casa/oficina)
# ignoreip = 127.0.0.1/8 ::1 203.0.113.10

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
backend = systemd
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd || fail2ban-client status || true
info "fail2ban activo para sshd."
warn "Añade tu IP fija en ignoreip de /etc/fail2ban/jail.local si tu IP pública es estable."
