#!/usr/bin/env bash
#
# Instala Mailcow (mailcow-dockerized) en mailcow/ para meincart.com.
# Uso: ./scripts/setup-mailcow.sh
#      MAILCOW_HOSTNAME=mail.meincart.com ./scripts/setup-mailcow.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAILCOW_DIR="${ROOT_DIR}/mailcow"
MAILCOW_REPO="${MAILCOW_REPO:-https://github.com/mailcow/mailcow-dockerized.git}"
MAILCOW_BRANCH="${MAILCOW_BRANCH:-master}"
MAILCOW_HOSTNAME="${MAILCOW_HOSTNAME:-mail.meincart.com}"
MAILCOW_TZ="${MAILCOW_TZ:-America/Caracas}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

port_in_use() {
  local port="$1"
  if command -v lsof &>/dev/null; then
    lsof -i ":${port}" -sTCP:LISTEN &>/dev/null
  elif command -v ss &>/dev/null; then
    ss -ltn "( sport = :${port} )" 2>/dev/null | grep -q ":${port}"
  else
    return 1
  fi
}

check_port() {
  local port="$1" label="$2"
  if port_in_use "$port"; then
    warn "Puerto ${port} (${label}) ya en uso — puede conflictuar con Mailcow o MyRent Go"
  fi
}

echo "==> Mailcow setup — ${MAILCOW_HOSTNAME}"
echo ""

# ── Requisitos ────────────────────────────────────────────────────────────────

for cmd in git docker; do
  if ! command -v "$cmd" &>/dev/null; then
    error "Falta '${cmd}'. Instálalo antes de continuar."
    exit 1
  fi
done

if ! docker info &>/dev/null; then
  error "Docker no está corriendo. Inicia Docker y vuelve a intentar."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  error "Se requiere Docker Compose v2 (plugin 'docker compose')."
  exit 1
fi

# ── Advertencias de puertos (MyRent Go + Mailcow) ─────────────────────────────

warn "Mailcow requiere puertos 80, 443, 25, 587, 465 (y más para IMAP/POP)."
warn "MyRent Go usa 7070 (API), 3000/4000 (frontend), 27017 (MongoDB), 1025/8025 (Mailpit dev)."
echo ""
check_port 80   "HTTP / Let's Encrypt"
check_port 443  "HTTPS / panel Mailcow"
check_port 25   "SMTP entrante"
check_port 587  "SMTP submission"
check_port 7070 "MyRent API"
check_port 3000 "MyRent frontend (Docker)"
check_port 27017 "MongoDB"
echo ""
warn "Recomendado: instalar Mailcow en un VPS dedicado (mail.meincart.com), no en la misma máquina que el stack de desarrollo."
echo ""

read -r -p "¿Continuar con la instalación en ${MAILCOW_DIR}? [y/N] " confirm
if [[ ! "$confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
  echo "Cancelado."
  exit 0
fi

# ── Clonar mailcow-dockerized ─────────────────────────────────────────────────

if [[ -d "${MAILCOW_DIR}/.git" ]]; then
  info "Repositorio Mailcow ya existe en mailcow/"
  read -r -p "¿Actualizar con git pull? [y/N] " pull_confirm
  if [[ "$pull_confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    git -C "$MAILCOW_DIR" fetch origin
    git -C "$MAILCOW_DIR" checkout "$MAILCOW_BRANCH"
    git -C "$MAILCOW_DIR" pull origin "$MAILCOW_BRANCH"
    info "Repositorio actualizado"
  fi
else
  if [[ -d "$MAILCOW_DIR" ]]; then
    error "Existe ${MAILCOW_DIR} pero no es un clon git. Muévelo o bórralo manualmente."
    exit 1
  fi
  info "Clonando ${MAILCOW_REPO} → mailcow/"
  git clone --branch "$MAILCOW_BRANCH" --depth 1 "$MAILCOW_REPO" "$MAILCOW_DIR"
fi

# ── Generar mailcow.conf ──────────────────────────────────────────────────────

if [[ -f "${MAILCOW_DIR}/mailcow.conf" ]]; then
  info "mailcow.conf ya existe — no se sobrescribe"
  grep -E '^MAILCOW_HOSTNAME=' "${MAILCOW_DIR}/mailcow.conf" || true
else
  info "Generando mailcow.conf (hostname=${MAILCOW_HOSTNAME}, tz=${MAILCOW_TZ})"
  cd "$MAILCOW_DIR"
  # generate_config.sh exige .env → mailcow.conf (convención mailcow-dockerized)
  ln -sf mailcow.conf .env
  export MAILCOW_HOSTNAME MAILCOW_TZ
  ./generate_config.sh
  cd "$ROOT_DIR"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────

echo ""
info "Setup completado."
echo ""
echo "  Directorio:  ${MAILCOW_DIR}"
echo "  Hostname:    ${MAILCOW_HOSTNAME}"
echo "  Panel:       https://${MAILCOW_HOSTNAME}/admin"
echo "  Credenciales por defecto: admin / moohoo  (¡cámbialas al primer acceso!)"
echo ""
echo "  Siguiente paso — DNS en Cloudflare (DNS only / nube gris):"
echo "    A     mail          → IP del VPS"
echo "    MX    @             → mail.meincart.com (prioridad 10)"
echo "    TXT   @             → v=spf1 mx ~all  (ajustar según docs)"
echo "    DKIM  dkim._domainkey → (copiar desde panel Mailcow → Configuración → DKIM)"
echo ""
echo "  Arrancar Mailcow:"
echo "    cd mailcow && docker compose pull && docker compose up -d"
echo "    # o: ./myrent.sh mailcow-start"
echo ""
echo "  MyRent Go (.env en el servidor de la app):"
echo "    SMTP_HOST=${MAILCOW_HOSTNAME}"
echo "    SMTP_PORT=587"
echo "    SMTP_USER=noreply@meincart.com"
echo "    SMTP_PASSWORD=<contraseña del buzón>"
echo "    SMTP_FROM=noreply@meincart.com"
echo ""
echo "  Documentación: docs/Cloudflare/mailcow.md"
