#!/usr/bin/env bash
# =============================================================================
# Menú de red — ver estado y ejecutar acciones (Wi‑Fi / cable / SSH / rfkill)
# =============================================================================
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    error "Se necesita root/sudo para: $*"
    return 1
  fi
}

detect_wifi_if() {
  ip -br link 2>/dev/null | awk '/^(wlan|wlp)/{print $1; exit}'
}

detect_eth_if() {
  ip -br link 2>/dev/null | awk '/^(en|eth)/{print $1; exit}'
}

cmd_status() {
  bash "${UBUNTU_ROOT}/scripts/utils/network-info.sh"
}

cmd_interfaces() {
  header "Interfaces (ip -br addr / link)"
  ip -br link || true
  echo
  ip -br addr || true
}

cmd_rfkill() {
  header "rfkill — desbloquear Wi‑Fi / Bluetooth"
  if ! command -v rfkill >/dev/null 2>&1; then
    warn "rfkill no instalado. Instala: sudo apt install rfkill"
    return 1
  fi
  rfkill list || true
  echo
  if ask_yes_no "¿Desbloquear wifi (rfkill unblock wifi)?"; then
    run_as_root rfkill unblock wifi
    run_as_root rfkill unblock all || true
    info "Hecho. Estado:"
    rfkill list || true
  fi
}

cmd_wifi_on() {
  header "Activar radio Wi‑Fi (nmcli radio wifi on)"
  if ! command -v nmcli >/dev/null 2>&1; then
    error "nmcli no disponible (instala NetworkManager)"
    return 1
  fi
  nmcli radio wifi on
  nmcli radio || true
  info "Radio Wi‑Fi activada."
}

cmd_wifi_list() {
  header "Redes Wi‑Fi visibles"
  if ! command -v nmcli >/dev/null 2>&1; then
    error "nmcli no disponible"
    return 1
  fi
  nmcli radio wifi on 2>/dev/null || true
  nmcli device wifi list || true
}

cmd_wifi_connect() {
  header "Conectar a Wi‑Fi"
  if ! command -v nmcli >/dev/null 2>&1; then
    error "nmcli no disponible"
    return 1
  fi
  local ifc ssid pass
  ifc="$(detect_wifi_if)"
  ifc="${ifc:-wlp2s0}"
  read -r -p "Interfaz Wi‑Fi [${ifc}]: " in_if
  ifc="${in_if:-$ifc}"
  echo
  nmcli radio wifi on 2>/dev/null || true
  nmcli device wifi list || true
  echo
  read -r -p "SSID (nombre de la red): " ssid
  if [[ -z "$ssid" ]]; then
    error "SSID vacío."
    return 1
  fi
  read -r -s -p "Contraseña Wi‑Fi: " pass
  echo
  info "Conectando ${ifc} → ${ssid} ..."
  if run_as_root nmcli device wifi connect "$ssid" password "$pass" ifname "$ifc"; then
    info "Conectado."
    ip -4 -br addr show "$ifc" || true
    hostname -I || true
  else
    error "Falló la conexión. Prueba opción 3 (rfkill) o 4 (radio on) y vuelve a listar."
    return 1
  fi
}

cmd_wifi_up_saved() {
  header "Levantar conexión Wi‑Fi guardada"
  if ! command -v nmcli >/dev/null 2>&1; then
    error "nmcli no disponible"
    return 1
  fi
  echo "Conexiones guardadas:"
  nmcli -f NAME,UUID,TYPE,DEVICE connection show || true
  echo
  local name
  read -r -p "Nombre de la conexión a activar: " name
  if [[ -z "$name" ]]; then
    error "Nombre vacío."
    return 1
  fi
  run_as_root nmcli connection up "$name"
  hostname -I || true
  ip -br addr || true
}

cmd_eth_up() {
  header "Levantar Ethernet (cable)"
  local ifc
  ifc="$(detect_eth_if)"
  ifc="${ifc:-enp1s0}"
  read -r -p "Interfaz ethernet [${ifc}]: " in_if
  ifc="${in_if:-$ifc}"
  info "ip link set ${ifc} up"
  run_as_root ip link set "$ifc" up
  if command -v nmcli >/dev/null 2>&1; then
    run_as_root nmcli device connect "$ifc" 2>/dev/null \
      || run_as_root nmcli device set "$ifc" managed yes || true
  fi
  if command -v dhclient >/dev/null 2>&1; then
    if ask_yes_no "¿Pedir IP por DHCP (dhclient ${ifc})?"; then
      run_as_root dhclient "$ifc" || true
    fi
  elif command -v nmcli >/dev/null 2>&1; then
    info "Esperando IP vía NetworkManager..."
    sleep 2
  fi
  ip -4 -br addr show "$ifc" || true
  hostname -I || true
}

cmd_ssh_port() {
  header "Puerto SSH"
  if [[ -f /etc/ssh/sshd_config ]]; then
    echo "=== sshd_config (Port) ==="
    grep -E '^Port|^#Port' /etc/ssh/sshd_config || echo "(sin líneas Port)"
  fi
  echo
  echo "=== Escuchando (ss) ==="
  ss -tlnp 2>/dev/null | grep -E 'ssh|sshd|:22|:2222' \
    || ss -tln 2>/dev/null | grep -E ':22 |:2222 ' \
    || echo "(no se detectó ssh escuchando)"
  echo
  systemctl is-active ssh 2>/dev/null && echo "servicio ssh: activo" || true
  systemctl is-active sshd 2>/dev/null && echo "servicio sshd: activo" || true
}

cmd_ping_gw() {
  header "Probar gateway / Internet"
  local gw
  gw="$(ip route 2>/dev/null | awk '/default/{print $3; exit}')"
  echo "Gateway: ${gw:-desconocido}"
  if [[ -n "${gw:-}" ]]; then
    ping -c 2 -W 2 "$gw" || warn "No responde el gateway"
  fi
  echo
  ping -c 2 -W 3 1.1.1.1 || warn "No hay salida a 1.1.1.1"
  echo
  getent hosts google.com >/dev/null 2>&1 && echo "DNS OK (google.com)" || warn "DNS falla"
}

cmd_public_ip() {
  header "IP pública vs IPs privadas"
  cat <<'EOF'

  hostname -I lista IPs del host. Casi siempre son PRIVADAS:
    192.168.x.x     LAN / Wi‑Fi (usar esta para SSH en casa)
    10.x.x.x        VPN u otra red privada
    172.16–31.x.x   Docker / redes privadas

  La IP PÚBLICA no aparece ahí: es la del router hacia Internet.
  Comandos:

    curl -4 -s ifconfig.me; echo
    curl -4 -s https://api.ipify.org; echo

EOF
  echo "  IPs locales (hostname -I):"
  hostname -I 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sed 's/^/    /' || echo "    (sin IP)"
  echo
  echo -n "  Consultando IP pública... "
  local pub=""
  if command -v curl >/dev/null 2>&1; then
    pub="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null \
      || curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null \
      || true)"
  fi
  if [[ -n "${pub:-}" ]]; then
    echo
    info "IP pública: ${pub}"
  else
    echo
    warn "No se pudo obtener (¿sin Internet o falta curl?)."
    echo "  Prueba: curl -4 -s ifconfig.me; echo"
  fi
  echo
  info "SSH en LAN: ssh usuario@192.168.x.x  (no uses la pública salvo port-forward)"
}

while true; do
  clear || true
  header "Comandos útiles — Red"
  wifi_if="$(detect_wifi_if)"
  eth_if="$(detect_eth_if)"
  cat <<EOF
  Estado breve:
$(ip -br addr 2>/dev/null | sed 's/^/    /' || echo "    (sin ip)")

  Detectado: Wi‑Fi=${wifi_if:-?}  Ethernet=${eth_if:-?}

  1) Ver IP / interfaces / puerto SSH (resumen)
  2) Listar interfaces (ip -br)
  3) rfkill — ver / desbloquear Wi‑Fi
  4) Activar radio Wi‑Fi (nmcli radio on)
  5) Listar redes Wi‑Fi
  6) Conectar a Wi‑Fi (SSID + password)
  7) Activar conexión Wi‑Fi ya guardada
  8) Levantar Ethernet (cable) + DHCP
  9) Ver solo puerto SSH
 10) Probar gateway / Internet (ping)
 11) IP pública (curl ifconfig.me / ipify) + explicación
 12) Acceso público — checklist (DNS / router / Caddy / Tunnel)
 13) Help texto (docs/help/network.txt)
  0) Volver
EOF
  read -r -p "Opción: " o
  case "$o" in
    1) cmd_status; pause ;;
    2) cmd_interfaces; pause ;;
    3) cmd_rfkill; pause ;;
    4) cmd_wifi_on; pause ;;
    5) cmd_wifi_list; pause ;;
    6) cmd_wifi_connect; pause ;;
    7) cmd_wifi_up_saved; pause ;;
    8) cmd_eth_up; pause ;;
    9) cmd_ssh_port; pause ;;
    10) cmd_ping_gw; pause ;;
    11) cmd_public_ip; pause ;;
    12) bash "${UBUNTU_ROOT}/scripts/edge/check-public-access.sh" ;;
    13)
      if [[ -f "${UBUNTU_ROOT}/docs/help/network.txt" ]]; then
        less -F "${UBUNTU_ROOT}/docs/help/network.txt" 2>/dev/null \
          || cat "${UBUNTU_ROOT}/docs/help/network.txt"
      else
        warn "Falta docs/help/network.txt"
      fi
      pause
      ;;
    0) exit 0 ;;
    *) warn "Opción inválida" ; sleep 1 ;;
  esac
done
