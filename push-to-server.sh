#!/usr/bin/env bash
# Atajo local: empaquetar MyRent Go + SSH/SCP + descomprimir en el servidor.
# Equivalente al paso 0 del kit ubuntu/ (./ubuntu/push-to-server.sh).
#
#   ./push-to-server.sh
#   ./push-to-server.sh user@IP
#   ./push-to-server.sh --port 2222
#
# Defaults: .push-defaults (ver .push-defaults.example) o ubuntu/.push-defaults
# NO requiere root. Preserva el .env remoto si ya existía.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$ROOT/push-to-server.sh" \
  "$ROOT/scripts/remote/"*.sh \
  "$ROOT/scripts/"*.sh 2>/dev/null || true
exec bash "${ROOT}/scripts/remote/00-pack-and-push-app.sh" "$@"
