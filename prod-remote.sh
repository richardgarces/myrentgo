#!/usr/bin/env bash
# Menú local (Mac/PC) — paso 0 transferir app
# En el SERVIDOR, tras el push: ./prod-menu.sh  (opción 1 = deploy completo)
#
#   ./prod-remote.sh
#   ./prod-remote.sh 0
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

run_push() {
  chmod +x "${ROOT}/push-to-server.sh" "${ROOT}/scripts/remote/"*.sh 2>/dev/null || true
  bash "${ROOT}/scripts/remote/00-pack-and-push-app.sh" "$@"
}

show_menu() {
  clear 2>/dev/null || true
  cat <<'EOF'
════════════════════════════════════════
 MyRent Go — remoto (desde tu Mac)
════════════════════════════════════════
  0) Transferir app al servidor (ZIP + SCP)
  1) Ver qué hacer en el servidor (prod-menu)
  h) Help push-to-server
  q) Salir

  En el BMAX, después del push:
    cd ~/my-rent-go && ./prod-menu.sh
    → 1) Preparar .env
    → 2) Editar .env (nano)
    → 10) TODO EN UN PASO   (o 3→4→5)
EOF
  read -r -p "Opción: " o
  case "$o" in
    0) run_push ;;
    1)
      cat <<'EOF'

1) Desde el Mac:  ./prod-remote.sh  →  0   (o ./push-to-server.sh)

2) En el servidor:
     cd ~/my-rent-go
     ./prod-menu.sh
     → 1) Preparar .env
     → 2) Editar .env (nano)
     → 10) TODO EN UN PASO

   Atajo: ./prod-menu.sh 10

EOF
      read -r -p "Pulsa Enter..." _
      ;;
    h|H) bash "${ROOT}/scripts/remote/00-pack-and-push-app.sh" --help; read -r -p "Pulsa Enter..." _ ;;
    q|Q) exit 0 ;;
    *) echo "Opción inválida"; sleep 1 ;;
  esac
}

if [[ "${1:-}" == "0" ]]; then
  shift
  run_push "$@"
  exit $?
fi
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  bash "${ROOT}/scripts/remote/00-pack-and-push-app.sh" --help
  exit 0
fi

while true; do
  show_menu
done
