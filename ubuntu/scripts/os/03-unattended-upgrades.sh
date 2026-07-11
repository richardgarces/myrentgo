#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Configurar unattended-upgrades (seguridad automática)"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y unattended-upgrades apt-listchanges

# Activar el servicio
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
// Actualizar índices de paquetes diariamente
APT::Periodic::Update-Package-Lists "1";
// Descargar actualizaciones diariamente
APT::Periodic::Download-Upgradeable-Packages "1";
// Instalar actualizaciones de seguridad automáticamente
APT::Periodic::Unattended-Upgrade "1";
// Limpiar paquetes descargados antiguos (días)
APT::Periodic::AutocleanInterval "7";
EOF

# Política: solo seguridad por defecto; opcionalmente todo el origin
cat >/etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
// Orígenes permitidos para upgrade automático
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};

// Reiniciar automáticamente si un parche de seguridad lo requiere (kernel)
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";

// Eliminar kernels antiguos
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";

// No notificar por correo (configura Mail si quieres)
// Unattended-Upgrade::Mail "admin@example.com";
Unattended-Upgrade::MailReport "on-change";

Unattended-Upgrade::SyslogEnable "true";
EOF

dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now unattended-upgrades || true

info "Unattended-upgrades activo: solo parches de seguridad diarios."
warn "Reinicio automático ante kernel: DESACTIVADO (cambia Automatic-Reboot a true si lo deseas)."
info "Config: /etc/apt/apt.conf.d/20auto-upgrades y 50unattended-upgrades"
