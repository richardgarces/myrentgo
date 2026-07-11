#!/usr/bin/env bash
# Atajo local: empaquetar + SSH/SCP + descomprimir en el servidor Ubuntu.
# Un solo comando desde la raíz del repo o desde ubuntu/:
#   ./ubuntu/push-to-server.sh
#   ./ubuntu/push-to-server.sh user@IP
# NO requiere root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$ROOT/push-to-server.sh" \
  "$ROOT/bootstrap.sh" \
  "$ROOT/init.bash" \
  "$ROOT/scripts/remote/"*.sh 2>/dev/null || true
exec bash "${ROOT}/scripts/remote/00-pack-and-push.sh" "$@"
