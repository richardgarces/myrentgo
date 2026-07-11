#!/usr/bin/env bash
# Cron: apt update + upgrade completo (no solo seguridad).
# Complementa unattended-upgrades (opción 3), que solo aplica -security.
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Cron — apt update && upgrade automático"

LOG_DIR="/var/log/platform-apt"
SCRIPT_PATH="/usr/local/sbin/platform-apt-full-upgrade.sh"
CRON_FILE="/etc/cron.d/platform-apt-full-upgrade"

# Hora por defecto: 04:15 (antes del reboot típico de unattended si lo activas)
DEFAULT_HOUR=4
DEFAULT_MIN=15

read -r -p "Hora del upgrade diario (0-23) [${DEFAULT_HOUR}]: " hour_in
HOUR="${hour_in:-$DEFAULT_HOUR}"
read -r -p "Minuto (0-59) [${DEFAULT_MIN}]: " min_in
MIN="${min_in:-$DEFAULT_MIN}"

if ! [[ "$HOUR" =~ ^[0-9]+$ ]] || (( HOUR < 0 || HOUR > 23 )); then
  error "Hora inválida: ${HOUR}"
  exit 1
fi
if ! [[ "$MIN" =~ ^[0-9]+$ ]] || (( MIN < 0 || MIN > 59 )); then
  error "Minuto inválido: ${MIN}"
  exit 1
fi

mkdir -p "$LOG_DIR"
chmod 755 "$LOG_DIR"

cat >"$SCRIPT_PATH" <<'EOF'
#!/usr/bin/env bash
# Generado por ubuntu/scripts/os/05-apt-full-upgrade-cron.sh
# Ejecuta update + upgrade completo (todos los orígenes apt, no solo security).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
LOG_DIR="/var/log/platform-apt"
mkdir -p "$LOG_DIR"
LOG="${LOG_DIR}/full-upgrade-$(date +%Y%m%d).log"
exec >>"$LOG" 2>&1
echo "==== $(date -Is) inicio apt full upgrade ===="
apt-get update -y
apt-get upgrade -y
apt-get autoremove -y
apt-get autoclean -y
echo "==== $(date -Is) fin apt full upgrade ===="
# Rotación simple: borrar logs > 30 días
find "$LOG_DIR" -type f -name 'full-upgrade-*.log' -mtime +30 -delete 2>/dev/null || true
EOF
chmod 750 "$SCRIPT_PATH"

# cron.d: minuto hora * * * user command
cat >"$CRON_FILE" <<EOF
# Full apt upgrade diario — kit ubuntu/platform
# Generado por scripts/os/05-apt-full-upgrade-cron.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${MIN} ${HOUR} * * * root ${SCRIPT_PATH}
EOF
chmod 644 "$CRON_FILE"

info "Script: ${SCRIPT_PATH}"
info "Cron:   ${CRON_FILE} → cada día a las $(printf '%02d:%02d' "$HOUR" "$MIN")"
info "Logs:   ${LOG_DIR}/full-upgrade-YYYYMMDD.log"
warn "Esto hace upgrade COMPLETO (no solo seguridad). Puede actualizar Docker, kernels, etc."
warn "Reinicio automático NO se fuerza aquí. Revisa logs tras cambios de kernel."
echo
echo "Probar ahora (opcional):"
echo "  sudo ${SCRIPT_PATH}"
echo "Quitar cron:"
echo "  sudo rm -f ${CRON_FILE}"
