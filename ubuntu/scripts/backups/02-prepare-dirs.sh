#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Preparar directorios de backup"
ensure_platform_dirs
mkdir -p "${PLATFORM_ROOT}/backups"/{local,scripts}
chmod 750 "${PLATFORM_ROOT}/backups"

WRAPPER="${PLATFORM_ROOT}/backups/scripts/run-restic-backup.sh"
cat >"${WRAPPER}" <<EOF
#!/usr/bin/env bash
# Wrapper genérico — carga .env de platform/restic y ejecuta backup
set -euo pipefail
ENV_FILE="${UBUNTU_ROOT}/platform/restic/.env"
if [[ ! -f "\${ENV_FILE}" ]]; then
  echo "Falta \${ENV_FILE} — copia desde .env.example"
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "\${ENV_FILE}"
set +a
mkdir -p "${PLATFORM_ROOT}/backups/local"
# Ejemplo: dump + restic (personaliza por app)
echo "[\$(date -Is)] Inicio backup local → restic"
# Aquí puedes llamar a mongodump / pg_dump / tar de volúmenes
restic backup "${PLATFORM_ROOT}/backups/local" \\
  --tag platform \\
  --host "\$(hostname)"
restic forget --prune --keep-daily "\${RESTIC_KEEP_DAILY:-14}" --keep-weekly "\${RESTIC_KEEP_WEEKLY:-8}" --keep-monthly "\${RESTIC_KEEP_MONTHLY:-6}"
echo "[\$(date -Is)] Fin backup"
EOF
chmod 750 "${WRAPPER}"
info "Wrapper: ${WRAPPER}"
info "Datos locales: ${PLATFORM_ROOT}/backups/local"
