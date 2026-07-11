#!/usr/bin/env bash
# =============================================================================
# Comandos útiles — red: IP Wi‑Fi / LAN y puerto SSH
# =============================================================================
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

header "Red — IP y puerto SSH"

echo
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  Resumen rápido                                             │"
echo "└─────────────────────────────────────────────────────────────┘"
echo

# IP(s) globales IPv4
echo "  IPs del host (hostname -I):"
echo "  (ninguna de estas suele ser la IP pública — ver bloque más abajo)"
hostname -I 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | while read -r ip; do
  kind="privada"
  case "$ip" in
    10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) kind="privada (LAN/Docker/VPN)" ;;
    127.*) kind="loopback" ;;
    *) kind="¿pública o inusual? (revisar)" ;;
  esac
  printf '    %-16s  %s\n' "$ip" "$kind"
done || echo "    (sin IP)"

echo
echo "  IP hacia Internet (ruta por defecto — suele ser LAN, NO pública):"
def_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
if [[ -n "${def_ip:-}" ]]; then
  echo "    ${def_ip}"
else
  echo "    (no disponible)"
fi

echo
echo "  IP pública (lo que ve Internet / Cloudflare):"
pub=""
if command -v curl >/dev/null 2>&1; then
  pub="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
    || curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null \
    || true)"
elif command -v wget >/dev/null 2>&1; then
  pub="$(wget -qO- --timeout=5 https://api.ipify.org 2>/dev/null || true)"
fi
if [[ -n "${pub:-}" ]]; then
  echo "    ${pub}"
else
  echo "    (no se pudo consultar — sin Internet o falta curl)"
  echo "    Comandos:  curl -4 -s ifconfig.me; echo"
  echo "               curl -4 -s https://api.ipify.org; echo"
fi

echo
echo "  Interfaces (ip -br addr):"
ip -br addr 2>/dev/null | sed 's/^/    /' || echo "    (ip no disponible)"

echo
echo "  Posibles interfaces Wi‑Fi (wlan*/wlp*):"
wifi_found=false
while read -r line; do
  wifi_found=true
  echo "    ${line}"
done < <(ip -4 -br addr 2>/dev/null | grep -E '^(wlan|wlp)' || true)
if [[ "$wifi_found" != true ]]; then
  echo "    (ninguna wlan*/wlp* con IPv4 — puede ser ethernet o el nombre es otro)"
  echo "    Revisa la lista de interfaces arriba."
fi

if command -v nmcli >/dev/null 2>&1; then
  echo
  echo "  NetworkManager (nmcli):"
  nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status 2>/dev/null | sed 's/^/    /' || true
  echo
  echo "  IPv4 por dispositivo Wi‑Fi:"
  nmcli -t -f DEVICE,TYPE,IP4.ADDRESS device show 2>/dev/null \
    | awk -F: '
        $2=="wifi" || $0 ~ /wifi/ {wifi=1}
        /^DEVICE:/ {dev=$2}
        /IP4.ADDRESS/ && wifi {print "    " dev " → " $2; wifi=0}
      ' || nmcli -f DEVICE,TYPE,IP4.ADDRESS device show 2>/dev/null | grep -A2 -i wifi | sed 's/^/    /' || echo "    (sin datos wifi)"
fi

echo
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  Puerto SSH                                                 │"
echo "└─────────────────────────────────────────────────────────────┘"
echo

ssh_port_cfg=""
if [[ -f /etc/ssh/sshd_config ]]; then
  ssh_port_cfg="$(grep -E '^[[:space:]]*Port[[:space:]]+[0-9]+' /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' | tail -1 || true)"
fi
if [[ -z "$ssh_port_cfg" ]]; then
  ssh_port_cfg="22 (default — no hay 'Port' explícito en sshd_config)"
else
  ssh_port_cfg="${ssh_port_cfg} (sshd_config)"
fi
echo "  Configurado:  ${ssh_port_cfg}"

echo
echo "  Escuchando ahora (ss):"
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | grep -E 'ssh|sshd|:22|:2222' | sed 's/^/    /' \
    || ss -tln 2>/dev/null | grep -E ':22 |:2222 ' | sed 's/^/    /' \
    || echo "    (no se vio sshd en ss — ¿servicio parado?)"
else
  echo "    (comando ss no disponible)"
fi

if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  echo
  echo "  Servicio SSH: activo"
else
  echo
  warn "Servicio SSH no aparece activo (ssh/sshd)"
fi

echo
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  Comandos equivalentes (copiar/pegar)                       │"
echo "└─────────────────────────────────────────────────────────────┘"
cat <<'EOF'

  # IPs privadas (LAN / Docker) — NO son la pública
  hostname -I
  ip -br addr
  ip -4 -br addr show wlp2s0         # ajusta el nombre (wlan0 / wlp…)
  ip route get 1.1.1.1 | awk '{print $7; exit}'

  # IP pública (lo que ve Internet)
  curl -4 -s ifconfig.me; echo
  curl -4 -s https://api.ipify.org; echo

  # Puerto SSH
  grep -E '^Port|^#Port' /etc/ssh/sshd_config
  ss -tlnp | grep ssh
  sudo ss -tlnp | grep sshd

EOF

info "SSH desde el Mac usa la IP LAN (ej. 192.168.x.x), no la pública."
info "Desde tu Mac: ssh -p <puerto> <usuario>@<ip-lan-wifi>"
