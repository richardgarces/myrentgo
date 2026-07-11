#!/usr/bin/env bash
# Atajo en el servidor: menú de producción MyRent Go
#   ./prod-menu.sh
#   ./prod-menu.sh 1    # todo en un paso
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${ROOT}/scripts/prod-menu.sh" "$@"
