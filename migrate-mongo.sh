#!/usr/bin/env bash
# Atajo local: migrar MongoDB / documentos Mac → BMAX
#   ./migrate-mongo.sh
#   ./migrate-mongo.sh 9
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$ROOT/scripts/migrate-mongo-menu.sh" 2>/dev/null || true
exec bash "${ROOT}/scripts/migrate-mongo-menu.sh" "$@"
