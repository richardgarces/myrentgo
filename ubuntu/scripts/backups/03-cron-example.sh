#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Cron de ejemplo — Restic"
CRON_LINE="30 3 * * * ${PLATFORM_ROOT}/backups/scripts/run-restic-backup.sh >> ${PLATFORM_ROOT}/logs/restic.log 2>&1"

ensure_platform_dirs
mkdir -p "${PLATFORM_ROOT}/logs"

echo "Línea de cron sugerida:"
echo "  ${CRON_LINE}"
echo
if ask_yes_no "¿Añadir esta línea al crontab de root?"; then
  (crontab -l 2>/dev/null | grep -v 'run-restic-backup.sh' || true; echo "${CRON_LINE}") | crontab -
  crontab -l
  info "Cron instalado."
else
  info "No se modificó crontab. Añádelo manualmente con: crontab -e"
fi
