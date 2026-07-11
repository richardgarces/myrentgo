#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Endurecer SSH"
SSH_CFG="/etc/ssh/sshd_config"
BACKUP="/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$SSH_CFG" ]]; then
  error "No existe ${SSH_CFG}"
  exit 1
fi

cp -a "$SSH_CFG" "$BACKUP"
info "Backup: ${BACKUP}"

warn "Asegúrate de tener una clave pública en ~/.ssh/authorized_keys ANTES de desactivar PasswordAuthentication."
if ! ask_yes_no "¿Continuar con endurecimiento SSH?"; then
  info "Cancelado."
  exit 0
fi

# Droplet de overrides modernos (no reescribir todo el archivo)
mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-platform-hardening.conf <<'EOF'
# Hardening SSH — generado por ubuntu/scripts/security/01-harden-ssh.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
AllowAgentForwarding no
# yes: permite ssh -L desde la LAN (Prometheus/Grafana en 127.0.0.1).
# Sigue requiriendo clave SSH; no expone esos puertos a Internet.
AllowTcpForwarding yes
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
LoginGraceTime 30
DebianBanner no
EOF

if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh
  info "sshd recargado con hardening."
else
  error "Config SSH inválida — restaurando backup."
  cp -a "$BACKUP" "$SSH_CFG"
  rm -f /etc/ssh/sshd_config.d/99-platform-hardening.conf
  exit 1
fi
