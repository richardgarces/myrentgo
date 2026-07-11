#!/usr/bin/env bash
# Atajo local: túneles SSH a UIs del BMAX (Prometheus, Grafana, …)
#   ./port-forward.sh
#   ./port-forward.sh monitoring
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$ROOT/scripts/port-forward-menu.sh" 2>/dev/null || true
exec bash "${ROOT}/scripts/port-forward-menu.sh" "$@"
