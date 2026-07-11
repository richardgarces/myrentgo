#!/usr/bin/env bash
# =============================================================================
# Paso 0 — Empaquetar el kit ubuntu/, transferirlo por SSH y descomprimirlo
# =============================================================================
# Se ejecuta desde TU máquina local (Mac/Linux), NO necesita root.
# Si el kit ya existe en el remoto, se REEMPLAZA por completo.
# Tras descomprimir: borra el ZIP remoto y ejecuta init.bash (README).
#
# Uso:
#   ./scripts/remote/00-pack-and-push.sh
#   ./scripts/remote/00-pack-and-push.sh --user deploy --ip 192.168.1.10 --port 2222
#   ./scripts/remote/00-pack-and-push.sh --zip .build/platform-kit.zip   # reutilizar ZIP
# =============================================================================
set -euo pipefail

UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

# Defaults locales (no versionados): ubuntu/.push-defaults
if [[ -f "${UBUNTU_ROOT}/.push-defaults" ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "${UBUNTU_ROOT}/.push-defaults"
  set +a
fi

REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-richard}"
REMOTE_IP="${REMOTE_IP:-192.168.1.198}"
REMOTE_DIR="${REMOTE_DIR:-~/platform-kit}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
RUN_BOOTSTRAP_HINT=true
REUSE_ZIP="${REUSE_ZIP:-}"   # ruta a ZIP existente, o "auto" = último/estable en .build
OPEN_SHELL=true              # al final: ssh interactivo dentro de ubuntu/

usage() {
  cat <<'EOF'
Empaqueta ubuntu/ → ZIP → SCP → descomprime en el servidor Ubuntu
Si ~/platform-kit/ubuntu ya existe en el remoto, se borra y se reemplaza.

USO
  ./scripts/remote/00-pack-and-push.sh
  ./scripts/remote/00-pack-and-push.sh --user deploy --ip 203.0.113.10 --port 2222
  ./scripts/remote/00-pack-and-push.sh --zip auto
  ./scripts/remote/00-pack-and-push.sh --zip ubuntu/.build/platform-kit.zip
  ./scripts/remote/00-pack-and-push.sh --help

OPCIONES
  --user NAME        Usuario SSH (ej. root, deploy, ubuntu)
  --ip HOST          IP o hostname del servidor
  --host USER@HOST   Destino completo (alternativa a --user + --ip)
  --dir PATH         Directorio remoto (default: ~/platform-kit o .push-defaults)
  --port N           Puerto SSH (default: 22 o .push-defaults)
  --identity FILE    Clave privada SSH (-i)
  --zip PATH|auto    Reutilizar ZIP local (no re-empaquetar).
                     auto = platform-kit.zip o el más reciente en .build/
  --no-shell         No abrir SSH interactivo al final
  --no-hint          No mostrar comandos siguientes tras la transferencia
  --help             Esta ayuda

Sin argumentos, pregunta con valores por omisión (usuario/IP/puerto/dir).
Puedes fijarlos en ubuntu/.push-defaults (ver .push-defaults.example).

Requisitos locales: ssh, scp, zip (o python3)
Requisitos remotos: unzip (o python3), bash, sudo (para init.bash / glow)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) REMOTE_USER="${2:-}"; shift 2 ;;
    --ip|--hostname) REMOTE_IP="${2:-}"; shift 2 ;;
    --host) REMOTE_HOST="${2:-}"; shift 2 ;;
    --dir) REMOTE_DIR="${2:-}"; shift 2 ;;
    --port) SSH_PORT="${2:-}"; shift 2 ;;
    --identity|-i) SSH_IDENTITY="${2:-}"; shift 2 ;;
    --zip) REUSE_ZIP="${2:-}"; shift 2 ;;
    --no-shell) OPEN_SHELL=false; shift ;;
    --no-hint) RUN_BOOTSTRAP_HINT=false; shift ;;
    --help|-h) usage; exit 0 ;;
    -*)
      error "Opción desconocida: $1"
      usage
      exit 1
      ;;
    *)
      REMOTE_HOST="$1"
      shift
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Falta el comando '${1}' en esta máquina."
    exit 1
  fi
}

need_cmd ssh
need_cmd scp

header "Paso 0 — Empaquetar y transferir kit a Ubuntu remoto"

if [[ -n "$REMOTE_HOST" && "$REMOTE_HOST" == *@* ]]; then
  REMOTE_USER="${REMOTE_HOST%%@*}"
  REMOTE_IP="${REMOTE_HOST#*@}"
fi

# Enter acepta el valor entre corchetes (defaults: .push-defaults o richard@192.168.1.198:2222)
read -r -p "Usuario SSH [${REMOTE_USER}]: " user_in
REMOTE_USER="${user_in:-$REMOTE_USER}"
if [[ -z "$REMOTE_USER" ]]; then
  error "Usuario vacío."
  exit 1
fi

read -r -p "IP o hostname del servidor [${REMOTE_IP}]: " ip_in
REMOTE_IP="${ip_in:-$REMOTE_IP}"
if [[ -z "$REMOTE_IP" ]]; then
  error "IP/hostname vacío."
  exit 1
fi

REMOTE_HOST="${REMOTE_USER}@${REMOTE_IP}"

read -r -p "Directorio remoto [${REMOTE_DIR}]: " dir_in
REMOTE_DIR="${dir_in:-$REMOTE_DIR}"

read -r -p "Puerto SSH [${SSH_PORT}]: " port_in
SSH_PORT="${port_in:-$SSH_PORT}"
if ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
  error "Puerto SSH inválido: ${SSH_PORT}"
  exit 1
fi

ssh_opts=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
scp_opts=(-P "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" ]]; then
  ssh_opts+=(-i "$SSH_IDENTITY")
  scp_opts+=(-i "$SSH_IDENTITY")
else
  read -r -p "Ruta a clave SSH (Enter = default del agente/ssh): " id_in
  if [[ -n "$id_in" ]]; then
    SSH_IDENTITY="$id_in"
    ssh_opts+=(-i "$SSH_IDENTITY")
    scp_opts+=(-i "$SSH_IDENTITY")
  fi
fi

info "Destino: ${REMOTE_HOST}  puerto ${SSH_PORT}"
info "Si el kit ya existe en el remoto, se reemplazará por completo."

BUILD_DIR="${UBUNTU_ROOT}/.build"
mkdir -p "$BUILD_DIR"
# Nombre estable: cada push reemplaza el ZIP local anterior
ZIP_NAME="platform-kit.zip"
ZIP_PATH="${BUILD_DIR}/${ZIP_NAME}"

resolve_reuse_zip() {
  local candidate="$1"
  if [[ "$candidate" == "auto" ]]; then
    if [[ -f "${BUILD_DIR}/platform-kit.zip" ]]; then
      echo "${BUILD_DIR}/platform-kit.zip"
      return 0
    fi
    # Más reciente platform-kit-*.zip (intentos previos con stamp)
    local latest
    latest="$(ls -t "${BUILD_DIR}"/platform-kit*.zip 2>/dev/null | head -1 || true)"
    if [[ -n "$latest" && -f "$latest" ]]; then
      echo "$latest"
      return 0
    fi
    error "No hay ZIP en ${BUILD_DIR} para --zip auto"
    exit 1
  fi
  if [[ ! -f "$candidate" ]]; then
    error "ZIP no encontrado: ${candidate}"
    exit 1
  fi
  # Resolver a ruta absoluta
  (cd "$(dirname "$candidate")" && echo "$(pwd)/$(basename "$candidate")")
}

# Excluir secretos, caches, build y defaults locales del ZIP
pack_with_zip() {
  (
    cd "$(dirname "$UBUNTU_ROOT")"
    BASE="$(basename "$UBUNTU_ROOT")"
    zip -r "$ZIP_PATH" "$BASE" \
      -x "$BASE/.build/*" \
      -x "$BASE/.push-defaults" \
      -x "$BASE/**/.env" \
      -x "$BASE/.env" \
      -x "$BASE/**/metrics_token" \
      -x "$BASE/**/.DS_Store" \
      -x "$BASE/.DS_Store"
  )
}

pack_with_python() {
  python3 - <<PY
import os, zipfile
root = r"""${UBUNTU_ROOT}"""
out = r"""${ZIP_PATH}"""
parent = os.path.dirname(root)
skip_names = {".env", "metrics_token", ".DS_Store", ".push-defaults"}
skip_dirs = {".build", ".git"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for fn in filenames:
            if fn in skip_names or fn.endswith("~"):
                continue
            if fn.startswith(".env.") and not fn.endswith(".example"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, parent)
            zf.write(full, rel)
print("zip ok", out)
PY
}

if [[ -n "$REUSE_ZIP" ]]; then
  ZIP_PATH="$(resolve_reuse_zip "$REUSE_ZIP")"
  ZIP_NAME="$(basename "$ZIP_PATH")"
  ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"
  info "Reutilizando ZIP existente (${ZIP_SIZE}): ${ZIP_PATH}"
else
  info "Empaquetando ${UBUNTU_ROOT} → ${ZIP_PATH} (reemplaza si ya existía)"
  rm -f "$ZIP_PATH"
  if command -v zip >/dev/null 2>&1; then
    pack_with_zip
  elif command -v python3 >/dev/null 2>&1; then
    warn "zip no encontrado — usando python3"
    pack_with_python
  else
    error "Necesitas 'zip' o 'python3' para empaquetar."
    exit 1
  fi
  ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"
  info "ZIP creado/reemplazado (${ZIP_SIZE}): ${ZIP_PATH}"
fi

info "Probando SSH → ${REMOTE_HOST} (puerto ${SSH_PORT})..."
ssh_opts+=(-o ConnectTimeout=10 -o ConnectionAttempts=1)
scp_opts+=(-o ConnectTimeout=10 -o ConnectionAttempts=1)

ssh_ok=false
for attempt in 1 2 3 4 5; do
  if ssh "${ssh_opts[@]}" "$REMOTE_HOST" "echo ok && uname -a && . /etc/os-release 2>/dev/null && echo \$PRETTY_NAME"; then
    ssh_ok=true
    break
  fi
  warn "Intento ${attempt}/5 falló (red ocupada o host apagado/dormido). Reintento en 3s..."
  sleep 3
done

if [[ "$ssh_ok" != true ]]; then
  error "No se pudo conectar por SSH tras varios intentos."
  echo
  echo "Causas típicas de 'Host is down' / 'Operation timed out':"
  echo "  • El Ubuntu está apagado, en suspensión o sin red"
  echo "  • IP cambiada o Mac en otra Wi‑Fi/VLAN"
  echo
  echo "El ZIP ya está listo en local (no hace falta re-empaquetar):"
  echo "  ${ZIP_PATH}"
  echo
  echo "Cuando el host responda:"
  echo "  ssh -p ${SSH_PORT} ${SSH_IDENTITY:+-i $SSH_IDENTITY} ${REMOTE_HOST}"
  echo "  ./ubuntu/push-to-server.sh --user ${REMOTE_USER} --ip ${REMOTE_IP} --port ${SSH_PORT} --zip auto"
  echo
  echo "Eso reutilizará el ZIP y REEMPLAZARÁ el kit remoto si ya existía."
  exit 1
fi

info "Preparando directorio remoto ${REMOTE_DIR} (reemplazo limpio del kit)..."
ssh "${ssh_opts[@]}" "$REMOTE_HOST" "mkdir -p ${REMOTE_DIR}"

# Nombre estable en remoto para sobrescribir siempre el mismo fichero
REMOTE_ZIP_NAME="platform-kit.zip"
REMOTE_ZIP="${REMOTE_DIR}/${REMOTE_ZIP_NAME}"
info "Transfiriendo ZIP (scp, sobrescribe si ya existe)..."
scp "${scp_opts[@]}" "$ZIP_PATH" "${REMOTE_HOST}:${REMOTE_ZIP}"

info "Reemplazando kit remoto y eliminando ZIP..."
ssh "${ssh_opts[@]}" "$REMOTE_HOST" bash -s <<REMOTE
set -euo pipefail
DIR=\$(eval echo ${REMOTE_DIR})
cd "\$DIR"

# Si ya existe ubuntu/, reemplazar por completo (no fusionar)
if [[ -d ubuntu ]]; then
  echo "==> Reemplazando carpeta ubuntu/ existente"
  rm -rf ubuntu
fi
# Limpiar ZIPs con stamp de intentos anteriores (no tocar platform-kit.zip recién subido)
rm -f platform-kit-*.zip 2>/dev/null || true

if [[ ! -f platform-kit.zip ]]; then
  echo "ERROR: no está platform-kit.zip en \$DIR (falló el scp?)" >&2
  ls -la "\$DIR" >&2 || true
  exit 1
fi

if command -v unzip >/dev/null 2>&1; then
  unzip -oq platform-kit.zip
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "import zipfile; zipfile.ZipFile('platform-kit.zip').extractall()"
else
  echo "ERROR: instala unzip en el servidor: sudo apt-get install -y unzip" >&2
  if command -v sudo >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y unzip
    unzip -oq platform-kit.zip
  else
    exit 1
  fi
fi

echo "==> Eliminando ZIP remoto ya descomprimido"
rm -f platform-kit.zip

if [[ ! -d ubuntu ]]; then
  echo "ERROR: tras descomprimir no existe \$DIR/ubuntu" >&2
  exit 1
fi

chmod +x ubuntu/bootstrap.sh ubuntu/init.bash ubuntu/push-to-server.sh 2>/dev/null || true
find ubuntu -type f \( -name '*.sh' -o -name '*.bash' \) -exec chmod +x {} \;
echo "==> Kit reemplazado/listo en: \$DIR/ubuntu"
REMOTE

info "Ejecutando init.bash en el remoto (instala visor Markdown + abre README)..."
if ! ssh -t "${ssh_opts[@]}" "$REMOTE_HOST" \
  "DIR=\$(eval echo ${REMOTE_DIR}); cd \"\$DIR/ubuntu\" && bash ./init.bash"; then
  warn "init.bash no pudo mostrar el README (el kit ya está transferido)."
  warn "En el servidor: cd ${REMOTE_DIR}/ubuntu && ./init.bash"
fi

info "Transferencia completada (kit remoto reemplazado; ZIP remoto eliminado)."

if [[ "$RUN_BOOTSTRAP_HINT" == true ]]; then
  echo
  header "Siguiente paso en el servidor"
  cat <<EOF
Ya estás (o vas a estar) en: ${REMOTE_DIR}/ubuntu

  sudo ./bootstrap.sh

Para releer la guía:

  ./init.bash
  less README.txt

Orden recomendado: 1 (SO) → 2 (seguridad) → 3 (firewall) → 4 (Docker) → 5 (plataforma) → 6 (backups)

ZIP local:
  ${ZIP_PATH}
EOF
fi

if [[ "$OPEN_SHELL" == true ]]; then
  echo
  header "Conectando por SSH → ${REMOTE_HOST}:${REMOTE_DIR}/ubuntu"
  info "Sesión interactiva. Al salir (exit / Ctrl+D) vuelves a tu máquina local."
  info "En el servidor puedes ejecutar: sudo ./bootstrap.sh"
  # -t: TTY; cd al kit y shell de login del usuario remoto
  exec ssh -t "${ssh_opts[@]}" "$REMOTE_HOST" \
    "DIR=\$(eval echo ${REMOTE_DIR}); cd \"\$DIR/ubuntu\" && exec \"\${SHELL:-bash}\" -l"
fi
