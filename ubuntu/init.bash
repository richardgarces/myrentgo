#!/usr/bin/env bash
# =============================================================================
# init.bash — Instalar visor Markdown en terminal y abrir ubuntu/README.md
# =============================================================================
# Ejecutar en el servidor (sin GUI), desde la raíz del kit:
#   ./init.bash
#   bash init.bash
#   ./init.bash --install-only
#   ./init.bash docs/CATALOGO.md
#
# Preferencia de herramientas: glow → mdcat → pandoc+less → less
# =============================================================================
set -uo pipefail

UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
README_DEFAULT="${UBUNTU_ROOT}/README.md"
INSTALL_ONLY=false
TARGET_MD=""

usage() {
  cat <<'EOF'
Instala un visor Markdown para terminal y abre un .md del kit.

USO
  ./init.bash                 # instala (si falta) y abre README.md
  ./init.bash --install-only  # solo instala glow o mdcat
  ./init.bash PATH.md         # abre otro archivo Markdown
  ./init.bash --help

Herramientas (en orden): glow, mdcat, pandoc|less, less/cat
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-only) INSTALL_ONLY=true; shift ;;
    --help|-h) usage; exit 0 ;;
    -*)
      echo "ERROR: opción desconocida: $1" >&2
      usage
      exit 1
      ;;
    *)
      TARGET_MD="$1"
      shift
      ;;
  esac
done

TARGET_MD="${TARGET_MD:-$README_DEFAULT}"

info()  { echo "==> $*"; }
warn()  { echo "WARN: $*" >&2; }
error() { echo "ERROR: $*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

run_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  elif have sudo; then
    sudo "$@"
  else
    return 1
  fi
}

detect_viewer() {
  if have glow; then
    echo glow
  elif have mdcat; then
    echo mdcat
  elif have pandoc && have less; then
    echo pandoc
  elif have less; then
    echo less
  else
    echo cat
  fi
}

install_glow_apt() {
  run_sudo DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null 2>&1 || true
  run_sudo DEBIAN_FRONTEND=noninteractive apt-get install -y glow
}

install_glow_charm_repo() {
  have curl || have wget || return 1
  have gpg || run_sudo DEBIAN_FRONTEND=noninteractive apt-get install -y gnupg >/dev/null 2>&1 || return 1

  run_sudo mkdir -p /etc/apt/keyrings
  if have curl; then
    curl -fsSL https://repo.charm.sh/apt/gpg.key \
      | run_sudo gpg --dearmor --yes -o /etc/apt/keyrings/charm.gpg
  else
    wget -qO- https://repo.charm.sh/apt/gpg.key \
      | run_sudo gpg --dearmor --yes -o /etc/apt/keyrings/charm.gpg
  fi
  echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
    | run_sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
  run_sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
  run_sudo DEBIAN_FRONTEND=noninteractive apt-get install -y glow
}

install_mdcat_cargo() {
  have cargo || return 1
  info "Instalando mdcat con cargo (puede tardar)..."
  cargo install mdcat
  # cargo suele instalar en ~/.cargo/bin
  export PATH="${HOME}/.cargo/bin:${PATH}"
  have mdcat
}

install_mdcat_snap() {
  have snap || return 1
  run_sudo snap install mdcat
}

ensure_viewer() {
  local current
  current="$(detect_viewer)"
  if [[ "$current" == "glow" || "$current" == "mdcat" ]]; then
    info "Visor Markdown listo: ${current} ($(command -v "$current"))"
    return 0
  fi

  info "No hay glow/mdcat — instalando..."

  if ! have sudo && [[ "${EUID}" -ne 0 ]]; then
    warn "Sin root/sudo: no se puede instalar automáticamente."
    warn "Instala a mano: sudo apt install glow   o   cargo install mdcat"
    return 1
  fi

  # 1) glow vía apt (si el distro lo trae)
  if install_glow_apt 2>/dev/null && have glow; then
    info "glow instalado (apt)"
    return 0
  fi

  # 2) glow vía repo Charm
  info "Intentando glow desde repo Charm..."
  if install_glow_charm_repo 2>/dev/null && have glow; then
    info "glow instalado (Charm)"
    return 0
  fi

  # 3) mdcat vía snap
  info "Intentando mdcat (snap)..."
  if install_mdcat_snap 2>/dev/null && have mdcat; then
    info "mdcat instalado (snap)"
    return 0
  fi

  # 4) mdcat vía cargo
  if install_mdcat_cargo 2>/dev/null && have mdcat; then
    info "mdcat instalado (cargo)"
    return 0
  fi

  warn "No se pudo instalar glow ni mdcat. Se usará un fallback (pandoc/less/cat)."
  return 1
}

open_markdown() {
  local file="$1"
  local viewer

  if [[ ! -f "$file" ]]; then
    error "No existe el archivo: ${file}"
    exit 1
  fi

  # PATH por si cargo acaba de instalar
  export PATH="${HOME}/.cargo/bin:/usr/local/bin:${PATH}"
  viewer="$(detect_viewer)"

  echo
  echo "════════════════════════════════════════"
  echo "  ${file}"
  echo "  (visor: ${viewer} — q / Ctrl+C para salir)"
  echo "════════════════════════════════════════"
  echo

  case "$viewer" in
    glow)
      # -p usa pager interactivo cuando hay TTY
      if [[ -t 1 ]]; then
        glow -p "$file"
      else
        glow "$file"
      fi
      ;;
    mdcat)
      if have less && [[ -t 1 ]]; then
        mdcat "$file" | less -R
      else
        mdcat "$file"
      fi
      ;;
    pandoc)
      pandoc "$file" -t plain | less -F
      ;;
    less)
      less -F "$file"
      ;;
    *)
      cat "$file"
      ;;
  esac
}

header() {
  echo
  echo "════════════════════════════════════════"
  echo "  init.bash — visor Markdown del kit"
  echo "════════════════════════════════════════"
}

header
ensure_viewer || true

if [[ "$INSTALL_ONLY" == true ]]; then
  info "Instalación terminada (--install-only)."
  detect_viewer | awk '{print "==> Visor activo: " $0}'
  exit 0
fi

open_markdown "$TARGET_MD"
