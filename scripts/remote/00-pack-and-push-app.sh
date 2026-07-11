#!/usr/bin/env bash
# =============================================================================
# Paso 0 (app) — Empaquetar MyRent Go, transferir por SSH y descomprimir
# =============================================================================
# Desde TU máquina local (Mac/Linux). NO necesita root.
# Si ~/my-rent-go ya existe en el remoto, se REEMPLAZA el código;
# el archivo .env remoto se PRESERVA (no se sobrescribe con el del Mac).
#
# Uso:
#   ./push-to-server.sh
#   ./scripts/remote/00-pack-and-push-app.sh --user richard --ip 192.168.1.198
#   ./push-to-server.sh --zip auto
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Colores mínimos (sin depender de ubuntu/lib)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }
header(){ echo -e "\n${BOLD}==> $*${NC}"; }

# ── Defaults: ubuntu/.push-defaults (SSH) + ./.push-defaults (app) ───────────
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-richard}"
REMOTE_IP="${REMOTE_IP:-192.168.1.198}"
REMOTE_DIR="${REMOTE_DIR:-}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
EXCLUDE_UBUNTU="${EXCLUDE_UBUNTU:-1}"
REUSE_ZIP="${REUSE_ZIP:-}"
OPEN_SHELL=true
RUN_HINT=true

if [[ -f "${ROOT_DIR}/ubuntu/.push-defaults" ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/ubuntu/.push-defaults"
  set +a
fi
if [[ -f "${ROOT_DIR}/.push-defaults" ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.push-defaults"
  set +a
fi

# Directorio de la app (no uses platform-kit del kit ubuntu)
if [[ -z "${REMOTE_DIR}" || "${REMOTE_DIR}" == *platform-kit* ]]; then
  if [[ ! -f "${ROOT_DIR}/.push-defaults" ]]; then
    REMOTE_DIR='~/my-rent-go'
  fi
fi
REMOTE_DIR="${REMOTE_DIR:-~/my-rent-go}"

usage() {
  cat <<'EOF'
Empaqueta MyRent Go → ZIP → SCP → descomprime en el servidor Ubuntu.
Si el directorio remoto ya existe, se reemplaza el código; .env remoto se conserva.

USO
  ./push-to-server.sh
  ./push-to-server.sh --user richard --ip 192.168.1.198 --port 22
  ./push-to-server.sh --zip auto
  ./push-to-server.sh --help

OPCIONES
  --user NAME        Usuario SSH
  --ip HOST          IP o hostname
  --host USER@HOST   Destino completo
  --dir PATH         Directorio remoto (default: ~/my-rent-go)
  --port N           Puerto SSH
  --identity FILE    Clave privada SSH (-i)
  --zip PATH|auto    Reutilizar ZIP local (no re-empaquetar)
  --include-ubuntu   Incluir carpeta ubuntu/ en el ZIP (por defecto se excluye)
  --no-shell         No abrir SSH interactivo al final
  --no-hint          No mostrar comandos siguientes
  --help             Esta ayuda

Defaults: .push-defaults  (ver .push-defaults.example)
También lee ubuntu/.push-defaults para usuario/IP/puerto si existe.

Requisitos locales: ssh, scp, zip (o python3)
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
    --include-ubuntu) EXCLUDE_UBUNTU=0; shift ;;
    --no-shell) OPEN_SHELL=false; shift ;;
    --no-hint) RUN_HINT=false; shift ;;
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

header "Paso 0 — Empaquetar y transferir MyRent Go al servidor"

if [[ -n "$REMOTE_HOST" && "$REMOTE_HOST" == *@* ]]; then
  REMOTE_USER="${REMOTE_HOST%%@*}"
  REMOTE_IP="${REMOTE_HOST#*@}"
fi

read -r -p "Usuario SSH [${REMOTE_USER}]: " user_in
REMOTE_USER="${user_in:-$REMOTE_USER}"
[[ -n "$REMOTE_USER" ]] || { error "Usuario vacío."; exit 1; }

read -r -p "IP o hostname del servidor [${REMOTE_IP}]: " ip_in
REMOTE_IP="${ip_in:-$REMOTE_IP}"
[[ -n "$REMOTE_IP" ]] || { error "IP/hostname vacío."; exit 1; }

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
info "Directorio remoto: ${REMOTE_DIR} (código se reemplaza; .env remoto se conserva)"

BUILD_DIR="${ROOT_DIR}/.build"
mkdir -p "$BUILD_DIR"
ZIP_NAME="myrentgo-app.zip"
ZIP_PATH="${BUILD_DIR}/${ZIP_NAME}"
APP_FOLDER="$(basename "$ROOT_DIR")"

resolve_reuse_zip() {
  local candidate="$1"
  if [[ "$candidate" == "auto" ]]; then
    if [[ -f "${BUILD_DIR}/myrentgo-app.zip" ]]; then
      echo "${BUILD_DIR}/myrentgo-app.zip"
      return 0
    fi
    local latest
    latest="$(ls -t "${BUILD_DIR}"/myrentgo-app*.zip 2>/dev/null | head -1 || true)"
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
  (cd "$(dirname "$candidate")" && echo "$(pwd)/$(basename "$candidate")")
}

pack_with_zip() {
  # Importante: NO excluir rutas que sean prefijo de *.example
  # (zip -x '…/.env.production' también saca .env.production.example).
  local exclude=(
    "${APP_FOLDER}/.git/*"
    "${APP_FOLDER}/.build/*"
    "${APP_FOLDER}/.push-defaults"
    "${APP_FOLDER}/node_modules/*"
    "${APP_FOLDER}/frontend/node_modules/*"
    "${APP_FOLDER}/frontend/dist/*"
    "${APP_FOLDER}/backend/tmp/*"
    "${APP_FOLDER}/backups/*"
    "${APP_FOLDER}/storage/*"
    "${APP_FOLDER}/exports/*"
    "${APP_FOLDER}/logs/*"
    "${APP_FOLDER}/.myrent/*"
    "${APP_FOLDER}/.run/*"
    "${APP_FOLDER}/run/*"
    "${APP_FOLDER}/mailcow/*"
    "${APP_FOLDER}/**/.DS_Store"
    "${APP_FOLDER}/.DS_Store"
    "${APP_FOLDER}/ubuntu/.build/*"
    "${APP_FOLDER}/ubuntu/.push-defaults"
    "${APP_FOLDER}/deploy/platform/.env.monitoring"
    "${APP_FOLDER}/deploy/platform/restic.env"
    "${APP_FOLDER}/deploy/platform/alertmanager/alertmanager.yml"
  )
  if [[ "${EXCLUDE_UBUNTU}" == "1" || "${EXCLUDE_UBUNTU}" == "true" ]]; then
    exclude+=("${APP_FOLDER}/ubuntu/*")
  fi
  (
    cd "$(dirname "$ROOT_DIR")"
    local args=(-r "$ZIP_PATH" "$APP_FOLDER")
    local x
    for x in "${exclude[@]}"; do
      args+=(-x "$x")
    done
    # Excluir solo el archivo exacto .env (no .env.*)
    args+=(-x "${APP_FOLDER}/.env" -x "${APP_FOLDER}/.env.local")
    zip "${args[@]}"
  )
}

# Garantiza plantillas críticas dentro del ZIP (por si zip -x las omitió)
force_add_examples() {
  local parent
  parent="$(dirname "$ROOT_DIR")"
  local must=(
    "${APP_FOLDER}/.env.production.example"
    "${APP_FOLDER}/.env.example"
    "${APP_FOLDER}/docker-compose.prod.yml"
    "${APP_FOLDER}/docker-compose.prod.platform.yml"
    "${APP_FOLDER}/scripts/prod-menu.sh"
    "${APP_FOLDER}/backend/.dockerignore"
    "${APP_FOLDER}/backend/internal/infrastructure/storage/documents.go"
    "${APP_FOLDER}/backend/internal/infrastructure/storage/errors.go"
  )
  local f
  (
    cd "$parent"
    for f in "${must[@]}"; do
      if [[ -f "$f" ]]; then
        zip -u "$ZIP_PATH" "$f" >/dev/null || zip "$ZIP_PATH" "$f" >/dev/null
      else
        echo "WARN: falta archivo obligatorio para el ZIP: $f" >&2
      fi
    done
    # Quitar secretos si entraron
    zip -d "$ZIP_PATH" "${APP_FOLDER}/.env" 2>/dev/null || true
    zip -d "$ZIP_PATH" "${APP_FOLDER}/.env.local" 2>/dev/null || true
    zip -d "$ZIP_PATH" "${APP_FOLDER}/.env.production" 2>/dev/null || true
    zip -d "$ZIP_PATH" "${APP_FOLDER}/.env.development" 2>/dev/null || true
  )
}

zip_has_production_example() {
  python3 - "$ZIP_PATH" <<'PY' 2>/dev/null || unzip -l "$ZIP_PATH" 2>/dev/null | grep -F '.env.production.example' >/dev/null
import sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    ok = any(n.endswith(".env.production.example") for n in z.namelist())
sys.exit(0 if ok else 1)
PY
}

pack_with_python() {
  EXCLUDE_UBUNTU="$EXCLUDE_UBUNTU" APP_FOLDER="$APP_FOLDER" ROOT_DIR="$ROOT_DIR" ZIP_PATH="$ZIP_PATH" python3 - <<'PY'
import os, zipfile
root = os.environ["ROOT_DIR"]
out = os.environ["ZIP_PATH"]
parent = os.path.dirname(root)
app = os.environ["APP_FOLDER"]
exclude_ubuntu = os.environ.get("EXCLUDE_UBUNTU", "1") in ("1", "true", "yes")
skip_names = {".env", ".DS_Store", ".push-defaults"}
# Directorios a omitir en CUALQUIER nivel (no incluir "storage": el paquete Go
# vive en backend/internal/infrastructure/storage/)
skip_dirs = {".git", ".build", "node_modules", "dist", ".myrent", "backups", "vendor", ".vite", ".turbo", ".cache", "mailcow", ".run", "run"}
# Solo en la raíz del repo (datos locales, no código)
skip_dirs_root = {"storage", "exports", "logs", "uploads"}
skip_secret_env = {".env", ".env.local", ".env.production", ".env.development"}
skip_files_exact = {
    "deploy/platform/.env.monitoring",
    "deploy/platform/restic.env",
    "deploy/platform/alertmanager/alertmanager.yml",
}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        if exclude_ubuntu and (rel_dir == "ubuntu" or rel_dir.startswith("ubuntu" + os.sep)):
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        if rel_dir in (".", ""):
            dirnames[:] = [d for d in dirnames if d not in skip_dirs_root]
        for fn in filenames:
            if fn in skip_names or fn in skip_secret_env or fn.endswith("~"):
                continue
            # Incluir *.example; excluir otros .env.*
            if fn.startswith(".env.") and not fn.endswith(".example"):
                continue
            if fn.endswith(".env") and not fn.endswith(".example"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, parent)
            rel_in_app = os.path.relpath(full, root)
            if rel_in_app in skip_files_exact:
                continue
            if fn == ".push-defaults":
                continue
            zf.write(full, rel)
print("zip ok", out)
# Verificación crítica: paquete Go storage debe ir en el ZIP
must = f"{app}/backend/internal/infrastructure/storage/documents.go"
with zipfile.ZipFile(out) as z:
    names = z.namelist()
if must not in names and not any(n.endswith("infrastructure/storage/documents.go") for n in names):
    raise SystemExit(f"ERROR: falta {must} en el ZIP (¿excluido storage/ por error?)")
print("ok storage package in zip")
PY
}

if [[ -n "$REUSE_ZIP" ]]; then
  ZIP_PATH="$(resolve_reuse_zip "$REUSE_ZIP")"
  ZIP_NAME="$(basename "$ZIP_PATH")"
  ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"
  info "Reutilizando ZIP existente (${ZIP_SIZE}): ${ZIP_PATH}"
else
  info "Empaquetando ${ROOT_DIR} → ${ZIP_PATH}"
  [[ "${EXCLUDE_UBUNTU}" == "1" || "${EXCLUDE_UBUNTU}" == "true" ]] && info "Excluyendo ubuntu/ (usa ./ubuntu/push-to-server.sh para el kit)"
  rm -f "$ZIP_PATH"
  # Python es más fiable con archivos .env*; zip de macOS a veces omite plantillas
  if command -v python3 >/dev/null 2>&1; then
    pack_with_python
  elif command -v zip >/dev/null 2>&1; then
    warn "python3 no encontrado — usando zip"
    pack_with_zip
  else
    error "Necesitas 'python3' o 'zip' para empaquetar."
    exit 1
  fi
  force_add_examples
  ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"
  info "ZIP creado (${ZIP_SIZE}): ${ZIP_PATH}"
  if ! zip_has_production_example; then
    error "El ZIP no incluye .env.production.example — abortando."
    error "Comprueba que existe: ${ROOT_DIR}/.env.production.example"
    exit 1
  fi
  info "Plantilla .env.production.example incluida en el ZIP"
fi

info "Probando SSH → ${REMOTE_HOST} (puerto ${SSH_PORT})..."
ssh_opts+=(-o ConnectTimeout=10 -o ConnectionAttempts=1)
scp_opts+=(-o ConnectTimeout=10 -o ConnectionAttempts=1)

ssh_ok=false
for attempt in 1 2 3 4 5; do
  if ssh "${ssh_opts[@]}" "$REMOTE_HOST" "echo ok && uname -a"; then
    ssh_ok=true
    break
  fi
  warn "Intento ${attempt}/5 falló. Reintento en 3s..."
  sleep 3
done

if [[ "$ssh_ok" != true ]]; then
  error "No se pudo conectar por SSH."
  echo "ZIP local listo: ${ZIP_PATH}"
  echo "Cuando el host responda:"
  echo "  ./push-to-server.sh --user ${REMOTE_USER} --ip ${REMOTE_IP} --port ${SSH_PORT} --zip auto"
  exit 1
fi

REMOTE_ZIP_NAME="myrentgo-app.zip"
info "Transfiriendo ZIP → /tmp/${REMOTE_ZIP_NAME} ..."
scp "${scp_opts[@]}" "$ZIP_PATH" "${REMOTE_HOST}:/tmp/${REMOTE_ZIP_NAME}"

info "Reemplazando código remoto (preservando .env)..."
ssh "${ssh_opts[@]}" "$REMOTE_HOST" bash -s <<REMOTE
set -euo pipefail
DIR=\$(eval echo ${REMOTE_DIR})
PARENT=\$(dirname "\$DIR")
NAME=\$(basename "\$DIR")
mkdir -p "\$PARENT"
cd "\$PARENT"

ENV_BAK=""
if [[ -f "\$DIR/.env" ]]; then
  ENV_BAK=\$(mktemp)
  cp "\$DIR/.env" "\$ENV_BAK"
  echo "==> .env remoto respaldado (se restaurará)"
fi

# Conservar backups/ locales del servidor si existen
BACKUPS_BAK=""
if [[ -d "\$DIR/backups" ]]; then
  BACKUPS_BAK=\$(mktemp -d)
  cp -a "\$DIR/backups/." "\$BACKUPS_BAK/" || true
  echo "==> backups/ remoto respaldado"
fi

if [[ -d "\$DIR" ]]; then
  echo "==> Reemplazando \$DIR"
  rm -rf "\$DIR"
fi

if [[ ! -f /tmp/${REMOTE_ZIP_NAME} ]]; then
  echo "ERROR: falta /tmp/${REMOTE_ZIP_NAME}" >&2
  exit 1
fi

if command -v unzip >/dev/null 2>&1; then
  unzip -oq /tmp/${REMOTE_ZIP_NAME}
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "import zipfile; zipfile.ZipFile('/tmp/${REMOTE_ZIP_NAME}').extractall()"
else
  echo "ERROR: instala unzip: sudo apt-get install -y unzip" >&2
  exit 1
fi

rm -f /tmp/${REMOTE_ZIP_NAME}

# El ZIP trae carpeta ${APP_FOLDER}/; renombrar si el destino tiene otro nombre
if [[ -d "${APP_FOLDER}" && "${APP_FOLDER}" != "\$NAME" ]]; then
  mv "${APP_FOLDER}" "\$NAME"
elif [[ ! -d "\$DIR" && -d "${APP_FOLDER}" ]]; then
  mv "${APP_FOLDER}" "\$NAME"
fi

if [[ ! -d "\$DIR" ]]; then
  echo "ERROR: tras descomprimir no existe \$DIR" >&2
  ls -la "\$PARENT" >&2 || true
  exit 1
fi

if [[ -n "\$ENV_BAK" && -f "\$ENV_BAK" ]]; then
  cp "\$ENV_BAK" "\$DIR/.env"
  chmod 600 "\$DIR/.env"
  rm -f "\$ENV_BAK"
  echo "==> .env remoto restaurado"
elif [[ ! -f "\$DIR/.env" ]]; then
  if [[ -f "\$DIR/.env.production.example" ]]; then
    echo "==> No había .env remoto. Copia plantilla:"
    echo "    cd \$DIR && cp .env.production.example .env && chmod 600 .env && nano .env"
  fi
fi

if [[ -n "\$BACKUPS_BAK" && -d "\$BACKUPS_BAK" ]]; then
  mkdir -p "\$DIR/backups"
  cp -a "\$BACKUPS_BAK/." "\$DIR/backups/" || true
  rm -rf "\$BACKUPS_BAK"
  echo "==> backups/ remoto restaurado"
fi

chmod +x "\$DIR/push-to-server.sh" "\$DIR/scripts/"*.sh "\$DIR/scripts/remote/"*.sh 2>/dev/null || true
find "\$DIR/scripts" -type f -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true
echo "==> App lista en: \$DIR"
REMOTE

info "Transferencia completada."

if [[ "$RUN_HINT" == true ]]; then
  echo
  header "Siguiente paso en el servidor"
  cat <<EOF
  cd ${REMOTE_DIR}
  ./prod-menu.sh
  # → 1) Preparar .env   2) Editar .env (nano)   10) TODO EN UN PASO

  Atajo: ./prod-menu.sh 10

ZIP local: ${ZIP_PATH}
EOF
fi

if [[ "$OPEN_SHELL" == true ]]; then
  echo
  header "Conectando por SSH → ${REMOTE_HOST}:${REMOTE_DIR}"
  info "Sesión interactiva. Al salir (exit / Ctrl+D) vuelves a tu máquina local."
  exec ssh -t "${ssh_opts[@]}" "$REMOTE_HOST" \
    "DIR=\$(eval echo ${REMOTE_DIR}); cd \"\$DIR\" && exec \"\${SHELL:-bash}\" -l"
fi
