#!/usr/bin/env bash
# =============================================================================
# Menú — actualizaciones automáticas (seguridad + upgrade + ESM)
# Explica el mensaje del login sobre "ESM Apps" y configura unattended-upgrades.
#
#   sudo ./scripts/os/updates-menu.sh
#   sudo ~/platform-kit/ubuntu/bootstrap.sh  →  1 → 3
# =============================================================================
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

require_root
require_debian_family

cmd_explain_motd() {
  header "Qué significa el mensaje al hacer login (MOTD)"
  cat <<'EOF'

  El aviso típico de Ubuntu 24.04:

    «El mantenimiento de seguridad expandido para Applications está desactivado»
    «N actualizaciones de seguridad adicionales… con ESM Apps»

  ┌─ Dos capas distintas ─────────────────────────────────────────┐
  │                                                               │
  │  1) unattended-upgrades (GRATIS, recomendado en este kit)     │
  │     • Parches de seguridad del archivo Ubuntu (-security)     │
  │     • Se configura con la opción 2 de este menú               │
  │                                                               │
  │  2) ESM Apps / Ubuntu Pro (OPCIONAL, cuenta Canonical)        │
  │     • Parches extra para paquetes de “universe” / apps        │
  │     • Requiere: sudo pro attach <token>  (ubuntu.com/pro)     │
  │     • En casa/lab suele bastar con (1); el MOTD puede quedar  │
  │       aunque (1) esté perfecto                                │
  └───────────────────────────────────────────────────────────────┘

  Resumen: activa la opción 2 (seguridad automática). El aviso ESM
  no es un error; solo indica que no tienes Ubuntu Pro enlazado.

EOF
  if command -v pro >/dev/null 2>&1; then
    echo "  Estado Ubuntu Pro (pro status):"
    pro status 2>/dev/null | head -25 || true
  else
    echo "  (comando 'pro' no instalado — normal sin Ubuntu Pro)"
  fi
  echo
}

cmd_enable_security() {
  bash "${UBUNTU_ROOT}/scripts/os/03-unattended-upgrades.sh"
}

cmd_status() {
  bash "${UBUNTU_ROOT}/scripts/os/04-unattended-status.sh" "$@"
}

cmd_full_cron() {
  bash "${UBUNTU_ROOT}/scripts/os/05-apt-full-upgrade-cron.sh"
}

cmd_disable_security() {
  header "Desactivar unattended-upgrades"
  if ! ask_yes_no "¿Desactivar instalación automática de seguridad?"; then
    return 0
  fi
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::Unattended-Upgrade "0";
APT::Periodic::AutocleanInterval "0";
EOF
  systemctl disable --now unattended-upgrades 2>/dev/null || true
  info "Desactivado. Puedes reactivar con la opción 2."
}

cmd_toggle_reboot() {
  header "Reinicio automático tras parche de kernel"
  local f="/etc/apt/apt.conf.d/50unattended-upgrades"
  if [[ ! -f "$f" ]]; then
    warn "Falta $f — ejecuta antes la opción 2."
    return 1
  fi
  local cur="false"
  grep -qE 'Automatic-Reboot[[:space:]]+"true"' "$f" 2>/dev/null && cur="true"
  echo "  Ahora: Automatic-Reboot = ${cur}"
  if [[ "$cur" == "true" ]]; then
    if ask_yes_no "¿Desactivar reinicio automático?"; then
      sed -i 's/Automatic-Reboot "true"/Automatic-Reboot "false"/' "$f"
      info "Reinicio automático OFF (tú reinicias a mano si hace falta)."
    fi
  else
    if ask_yes_no "¿Activar reinicio automático a las 04:30 si el kernel lo pide?"; then
      sed -i 's/Automatic-Reboot "false"/Automatic-Reboot "true"/' "$f"
      info "Reinicio automático ON a las 04:30."
    fi
  fi
}

cmd_run_now() {
  header "Ejecutar unattended-upgrade ahora"
  if ! ask_yes_no "¿Instalar ahora los parches de seguridad pendientes?"; then
    return 0
  fi
  export DEBIAN_FRONTEND=noninteractive
  unattended-upgrade -v || true
  info "Hecho. Revisa: opción 3 (estado) o log /var/log/unattended-upgrades/"
}

cmd_remove_full_cron() {
  local cron="/etc/cron.d/platform-apt-full-upgrade"
  if [[ -f "$cron" ]]; then
    if ask_yes_no "¿Eliminar cron de upgrade COMPLETO (${cron})?"; then
      rm -f "$cron"
      info "Cron full-upgrade eliminado."
    fi
  else
    info "No hay cron full-upgrade instalado."
  fi
}

cmd_apt_update_now() {
  bash "${UBUNTU_ROOT}/scripts/os/01-apt-update.sh"
}

show_menu() {
  clear || true
  header "Actualizaciones automáticas (seguridad / upgrade / ESM)"
  cat <<'EOF'
  Este menú cubre el aviso del login sobre “ESM Apps” y la
  actualización automática de seguridad (gratis).

  1) Explicar mensaje MOTD / ESM Apps (Ubuntu Pro)
  2) Activar seguridad automática (unattended-upgrades diario)
  3) Ver estado (resumen legible)
  4) Ver estado detallado (--verbose)
  5) Ejecutar parches de seguridad AHORA
  6) Cron: upgrade COMPLETO diario (más agresivo; opcional)
  7) Quitar cron de upgrade completo
  8) Activar/desactivar reinicio automático (kernel)
  9) Desactivar unattended-upgrades
 10) apt update && upgrade ahora (una vez, manual)
 11) HELP texto (docs/help/updates.txt)
  0) Volver / salir

  Recomendado en BMAX: 2 → 3. ESM Pro solo si quieres el plan de Canonical.
EOF
  read -r -p "Opción: " o
  case "$o" in
    1) cmd_explain_motd; pause ;;
    2) cmd_enable_security; pause ;;
    3) cmd_status; pause ;;
    4) cmd_status --verbose; pause ;;
    5) cmd_run_now; pause ;;
    6) cmd_full_cron; pause ;;
    7) cmd_remove_full_cron; pause ;;
    8) cmd_toggle_reboot; pause ;;
    9) cmd_disable_security; pause ;;
    10) cmd_apt_update_now; pause ;;
    11)
      if [[ -f "${UBUNTU_ROOT}/docs/help/updates.txt" ]]; then
        less -F "${UBUNTU_ROOT}/docs/help/updates.txt" 2>/dev/null \
          || cat "${UBUNTU_ROOT}/docs/help/updates.txt"
      else
        warn "Falta docs/help/updates.txt"
      fi
      pause
      ;;
    0|q|Q) exit 0 ;;
    *) warn "Opción inválida"; sleep 1 ;;
  esac
}

case "${1:-}" in
  --help|-h)
    cat <<'EOF'
Uso: sudo ./scripts/os/updates-menu.sh

Menú interactivo para:
  • unattended-upgrades (seguridad diaria, gratis)
  • cron de apt full-upgrade (opcional)
  • explicar aviso ESM Apps del login
EOF
    ;;
  1) cmd_explain_motd ;;
  2) cmd_enable_security ;;
  3) cmd_status ;;
  "")
    while true; do show_menu; done
    ;;
  *)
    error "Opción desconocida: $1"
    exit 1
    ;;
esac
