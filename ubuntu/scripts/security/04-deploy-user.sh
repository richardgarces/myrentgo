#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Crear usuario deploy"
read -r -p "Nombre de usuario [deploy]: " UNAME
UNAME="${UNAME:-deploy}"

if id "$UNAME" >/dev/null 2>&1; then
  warn "El usuario ${UNAME} ya existe."
else
  adduser --disabled-password --gecos "Deploy" "$UNAME"
  info "Usuario ${UNAME} creado."
fi

usermod -aG sudo "$UNAME"
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$UNAME"
  info "Añadido a grupo docker."
fi

HOME_DIR="$(getent passwd "$UNAME" | cut -d: -f6)"
mkdir -p "${HOME_DIR}/.ssh"
chmod 700 "${HOME_DIR}/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  if ask_yes_no "¿Copiar authorized_keys de root a ${UNAME}?"; then
    cp /root/.ssh/authorized_keys "${HOME_DIR}/.ssh/authorized_keys"
    chmod 600 "${HOME_DIR}/.ssh/authorized_keys"
    chown -R "${UNAME}:${UNAME}" "${HOME_DIR}/.ssh"
    info "Claves SSH copiadas."
  fi
else
  warn "No hay /root/.ssh/authorized_keys — añade la clave pública de ${UNAME} manualmente."
fi

info "Usuario listo. Conéctate con: ssh ${UNAME}@$(hostname -I | awk '{print $1}')"
