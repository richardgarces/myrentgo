#!/usr/bin/env bash
# =============================================================================
# Estado de unattended-upgrades — resumen legible (sin volcado DEBUG)
# =============================================================================
set -uo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Estado unattended-upgrades"

# --- Servicio ---
svc_active="no"
svc_enabled="no"
if systemctl is-active --quiet unattended-upgrades 2>/dev/null; then
  svc_active="sí"
fi
if systemctl is-enabled --quiet unattended-upgrades 2>/dev/null; then
  svc_enabled="sí"
fi

# Extrae el primer número entre comillas de una línea apt.conf (seguro si no hay match)
apt_periodic_val() {
  local key="$1" file="/etc/apt/apt.conf.d/20auto-upgrades"
  local val=""
  if [[ -f "$file" ]]; then
    val="$(grep -E "$key" "$file" 2>/dev/null | grep -oE '"[0-9]+"' | head -1 | tr -d '"' || true)"
  fi
  echo "${val:-?}"
}

auto_update="$(apt_periodic_val 'Update-Package-Lists')"
auto_upgrade="$(apt_periodic_val 'Unattended-Upgrade')"
auto_download="$(apt_periodic_val 'Download-Upgradeable')"
auto_clean="$(apt_periodic_val 'AutocleanInterval')"

on_off() {
  case "${1:-}" in
    1) echo "activado (diario)" ;;
    0) echo "desactivado" ;;
    *) echo "desconocido (${1:-})" ;;
  esac
}

# --- Política ---
reboot_auto="false"
allowed_origins=""
if [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]]; then
  if grep -qE 'Automatic-Reboot[[:space:]]+"true"' /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null; then
    reboot_auto="true"
  fi
  allowed_origins="$(grep -E '^\s+"\$\{distro' /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null \
    | sed 's/[";]//g' | sed 's/^[[:space:]]*/  - /' || true)"
fi

# --- Dry-run silencioso (sin --debug) ---
dry_summary="(no se pudo comprobar)"
pending_sec="desconocido"
if command -v unattended-upgrade >/dev/null 2>&1; then
  dry_out="$(unattended-upgrade --dry-run 2>&1 || true)"
  if echo "$dry_out" | grep -qiE 'No packages found|No se encontraron paquetes|0 packages'; then
    dry_summary="Ningún parche de seguridad pendiente ahora"
    pending_sec="0"
  elif echo "$dry_out" | grep -qiE 'packages will be (upgraded|installed)|paquetes.*actualiz'; then
    dry_summary="Hay paquetes que unattended instalaría"
    pending_sec="sí (hay candidatos)"
  else
    last_info="$(echo "$dry_out" | grep -iE 'INFO|Packages|paquetes' | tail -3 | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' || true)"
    dry_summary="${last_info:-Comprobación hecha (sin mensaje claro)}"
  fi
fi

# --- Última actividad en log ---
last_log_line="(sin log)"
last_log_time="—"
log_file="/var/log/unattended-upgrades/unattended-upgrades.log"
if [[ -f "$log_file" ]]; then
  last_log_line="$(grep -E 'INFO|ERROR|WARNING' "$log_file" 2>/dev/null | tail -1 || true)"
  if [[ -z "$last_log_line" ]]; then
    last_log_line="$(tail -1 "$log_file" 2>/dev/null || echo "(log vacío)")"
  fi
  last_log_time="$(stat -c '%y' "$log_file" 2>/dev/null | cut -d. -f1 || echo "—")"
fi

# --- Reinicio pendiente del sistema ---
reboot_needed="no"
if [[ -f /var/run/reboot-required ]]; then
  reboot_needed="sí — conviene reiniciar cuando puedas"
fi

cat <<EOF

┌─────────────────────────────────────────────────────────────┐
│  ¿Qué es unattended-upgrades?                               │
│  Instala SOLO parches de seguridad de Ubuntu, solos,        │
│  cada día. No es un fallo: es el "antivirus de paquetes".   │
└─────────────────────────────────────────────────────────────┘

  Servicio systemd
    Activo ahora ........ ${svc_active}
    Arranca al boot ..... ${svc_enabled}

  Programación (/etc/apt/apt.conf.d/20auto-upgrades)
    Actualizar índices .. $(on_off "$auto_update")
    Descargar paquetes .. $(on_off "$auto_download")
    Instalar seguridad .. $(on_off "$auto_upgrade")
    Limpieza apt ........ cada ${auto_clean} día(s)

  Política
    Orígenes permitidos:
${allowed_origins:-  - (ver 50unattended-upgrades)}
    Reinicio automático . ${reboot_auto}  (false = tú reinicias a mano)

  Comprobación ahora (dry-run, sin instalar nada)
    ${dry_summary}
    Pendientes seguridad  ${pending_sec}

  Sistema
    Reinicio pendiente .. ${reboot_needed}

  Último log (${last_log_time})
    ${last_log_line}

┌─────────────────────────────────────────────────────────────┐
│  Cómo leerlo                                                │
│  • Servicio activo + "ningún parche pendiente" = OK         │
│  • Solo importa este resumen (ya no se vuelca DEBUG)        │
│  • Si reboot-required = sí: reinicia en mantenimiento       │
└─────────────────────────────────────────────────────────────┘

EOF

if [[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]]; then
  echo
  info "Detalle dry-run (sin debug):"
  unattended-upgrade --dry-run 2>&1 \
    | grep -vE '^$|DEBUG|Checking:|adjusting candidate|Origin component' \
    | tail -30 || true
  echo
  info "Últimas líneas del log:"
  if [[ -f "$log_file" ]]; then
    grep -E 'INFO|ERROR|WARNING' "$log_file" 2>/dev/null | tail -15 || true
  fi
fi

info "Para más detalle: sudo ./scripts/os/04-unattended-status.sh --verbose"
