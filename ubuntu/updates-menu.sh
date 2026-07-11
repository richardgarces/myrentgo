#!/usr/bin/env bash
# Atajo: menú de actualizaciones automáticas (seguridad / ESM)
#   sudo ./updates-menu.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${ROOT}/scripts/os/updates-menu.sh" "$@"
