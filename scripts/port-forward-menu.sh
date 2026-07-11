#!/usr/bin/env bash
# =============================================================================
# Menú: túneles / port-forward a UIs locales del BMAX (Prometheus, Grafana, …)
#
# Los servicios escuchan solo en 127.0.0.1 del servidor. Desde la Mac abres
# un túnel SSH y entras por http://127.0.0.1:<puerto> en tu navegador.
#
# Uso (en la Mac):
#   ./port-forward.sh
#   ./port-forward.sh monitoring
#   ./scripts/port-forward-menu.sh
#
# Defaults SSH: .push-defaults / ubuntu/.push-defaults (SSH_PORT suele ser 2222)
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/myrent-port-forward"
mkdir -p "$STATE_DIR"
PID_FILE="${STATE_DIR}/tunnels.pids"
LOG_FILE="${STATE_DIR}/tunnels.log"

REMOTE_USER="${REMOTE_USER:-richard}"
REMOTE_IP="${REMOTE_IP:-192.168.1.198}"
SSH_PORT="${SSH_PORT:-2222}"
SSH_IDENTITY="${SSH_IDENTITY:-}"

info() { echo "[✓] $*"; }
warn() { echo "[!] $*"; }
error() { echo "[✗] $*" >&2; }
pause() { read -r -p "Pulsa Enter..." _; }

load_push_defaults() {
  if [[ -f "${ROOT_DIR}/ubuntu/.push-defaults" ]]; then
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/ubuntu/.push-defaults"
  fi
  if [[ -f "${ROOT_DIR}/.push-defaults" ]]; then
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.push-defaults"
  fi
  if [[ "${SSH_PORT}" == "22" ]]; then
    SSH_PORT=2222
  fi
}

remote_host() { echo "${REMOTE_USER}@${REMOTE_IP}"; }

ssh_base() {
  local opts=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new -o ExitOnForwardFailure=yes -o ServerAliveInterval=30)
  if [[ -n "$SSH_IDENTITY" ]]; then
    opts+=(-i "$SSH_IDENTITY")
  fi
  printf '%s\n' "${opts[@]}"
}

# name|local_port|remote_port|url_hint
SERVICES=(
  "prometheus|9090|9090|http://127.0.0.1:9090"
  "grafana|3001|3001|http://127.0.0.1:3001"
  "alertmanager|9093|9093|http://127.0.0.1:9093"
  "cadvisor|8088|8088|http://127.0.0.1:8088"
  "node-exporter|9100|9100|http://127.0.0.1:9100/metrics"
  "minio-console|9001|9001|http://127.0.0.1:9001"
  "vault|8200|8200|http://127.0.0.1:8200"
  "mailcow-ui|8080|8080|http://127.0.0.1:8080"
)

service_line() {
  local name="$1" line
  for line in "${SERVICES[@]}"; do
    if [[ "${line%%|*}" == "$name" ]]; then
      echo "$line"
      return 0
    fi
  done
  return 1
}

cmd_configure() {
  load_push_defaults
  echo "Destino: $(remote_host)  puerto SSH ${SSH_PORT}"
  read -r -p "Usuario [${REMOTE_USER}]: " u
  REMOTE_USER="${u:-$REMOTE_USER}"
  read -r -p "IP/hostname [${REMOTE_IP}]: " ip
  REMOTE_IP="${ip:-$REMOTE_IP}"
  read -r -p "Puerto SSH [${SSH_PORT}]: " p
  SSH_PORT="${p:-$SSH_PORT}"
  info "OK → $(remote_host):${SSH_PORT}"
}

cmd_test_ssh() {
  load_push_defaults
  echo "==> Probando SSH $(remote_host):${SSH_PORT}"
  # shellcheck disable=SC2046
  ssh $(ssh_base) "$(remote_host)" bash -s <<'REMOTE'
set -euo pipefail
echo "OK host=$(hostname)"
echo "=== AllowTcpForwarding ==="
grep -RIn AllowTcpForwarding /etc/ssh/sshd_config /etc/ssh/sshd_config.d 2>/dev/null || true
echo "=== UIs en 127.0.0.1 ==="
(ss -lntp 2>/dev/null || true) | grep -E '9090|3001|9093|8088|9100|9001|8200' || true
curl -sf --connect-timeout 2 http://127.0.0.1:9090/-/healthy && echo " Prometheus OK" || echo " Prometheus DOWN"
curl -sf --connect-timeout 2 http://127.0.0.1:3001/api/health >/dev/null && echo " Grafana OK" || echo " Grafana DOWN (¿no desplegado?)"
REMOTE
}

# Arranca un túnel en background: local_port -> remote 127.0.0.1:remote_port
start_tunnel() {
  local name="$1" local_port="$2" remote_port="$3" url="$4"
  load_push_defaults

  if lsof -iTCP:"$local_port" -sTCP:LISTEN >/dev/null 2>&1; then
    warn "Puerto local ${local_port} ya en uso (${name}). Omite o cierra el proceso."
    return 0
  fi

  # shellcheck disable=SC2046
  if ! ssh $(ssh_base) -fN \
    -L "${local_port}:127.0.0.1:${remote_port}" \
    "$(remote_host)"; then
    error "No se pudo abrir el túnel SSH (${name})"
    return 1
  fi

  # Registrar PID del ssh recién lanzado (mejor esfuerzo)
  local pid
  pid="$(lsof -tiTCP:"$local_port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    echo "${pid}|${name}|${local_port}|${remote_port}|$(date +%Y%m%d_%H%M%S)" >>"$PID_FILE"
  fi
  echo "$(date -Iseconds) start ${name} :${local_port} -> 127.0.0.1:${remote_port} @ $(remote_host)" >>"$LOG_FILE"

  # Verificar que el reenvío funciona (AllowTcpForwarding no → reset)
  sleep 0.3
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 3 \
    "http://127.0.0.1:${local_port}/" 2>/dev/null || echo "000")"
  if [[ "$code" == "000" ]]; then
    error "${name}: túnel abierto pero sin respuesta (Connection reset típico)."
    warn "En el BMAX suele estar AllowTcpForwarding no. Ejecuta ALLÍ:"
    echo "  sudo sed -i 's/^AllowTcpForwarding no/AllowTcpForwarding yes/' /etc/ssh/sshd_config.d/99-platform-hardening.conf"
    echo "  sudo sshd -t && sudo systemctl reload ssh"
    echo "Luego opción 10 (cerrar) y vuelve a abrir el túnel."
    return 1
  fi
  info "${name}: ${url}  (HTTP ${code})"
}

start_by_name() {
  local name="$1" line local_port remote_port url
  line="$(service_line "$name")" || {
    error "Servicio desconocido: $name"
    return 1
  }
  IFS='|' read -r _ local_port remote_port url <<<"$line"
  start_tunnel "$name" "$local_port" "$remote_port" "$url"
}

cmd_prometheus() { start_by_name prometheus; }
cmd_grafana() { start_by_name grafana; }
cmd_alertmanager() { start_by_name alertmanager; }
cmd_cadvisor() { start_by_name cadvisor; }
cmd_node_exporter() { start_by_name node-exporter; }
cmd_minio() { start_by_name minio-console; }
cmd_vault() { start_by_name vault; }

cmd_monitoring() {
  echo "==> Túneles monitoring (Prometheus + Grafana + Alertmanager)"
  start_by_name prometheus
  start_by_name grafana
  start_by_name alertmanager
  echo
  info "Abre en la Mac:"
  echo "  Prometheus:    http://127.0.0.1:9090"
  echo "  Grafana:       http://127.0.0.1:3001"
  echo "  Alertmanager:  http://127.0.0.1:9093"
}

cmd_observability() {
  echo "==> Túneles observabilidad (monitoring + cAdvisor + node-exporter)"
  cmd_monitoring
  start_by_name cadvisor
  start_by_name node-exporter
}

cmd_custom() {
  load_push_defaults
  local local_port remote_port name
  read -r -p "Puerto LOCAL en la Mac (ej. 9090): " local_port
  read -r -p "Puerto REMOTO en el BMAX 127.0.0.1 (ej. 9090): " remote_port
  read -r -p "Nombre etiqueta [custom]: " name
  name="${name:-custom}"
  [[ "$local_port" =~ ^[0-9]+$ && "$remote_port" =~ ^[0-9]+$ ]] || {
    error "Puertos inválidos"
    return 1
  }
  start_tunnel "$name" "$local_port" "$remote_port" "http://127.0.0.1:${local_port}"
}

cmd_list() {
  echo "=== Túneles registrados (${PID_FILE}) ==="
  if [[ -f "$PID_FILE" ]]; then
    while IFS='|' read -r pid name lp rp ts; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "  OK  pid=${pid}  ${name}  local:${lp} → remote:127.0.0.1:${rp}  (${ts})"
      else
        echo "  --  pid=${pid:-?}  ${name}  local:${lp}  (muerto)"
      fi
    done <"$PID_FILE"
  else
    echo "  (ninguno registrado)"
  fi
  echo
  echo "=== Escucha local (lsof ssh -L) ==="
  lsof -iTCP -sTCP:LISTEN 2>/dev/null | grep -E 'ssh|9090|3001|9093|8088|9100|9001|8200' || echo "  (nada relevante)"
}

cmd_stop_all() {
  echo "==> Cerrando túneles…"
  if [[ -f "$PID_FILE" ]]; then
    while IFS='|' read -r pid name lp _ _; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        info "Cerrado ${name} (pid ${pid}, :${lp})"
      fi
    done <"$PID_FILE"
    : >"$PID_FILE"
  fi
  # Por si quedaron ssh -L huérfanos en esos puertos
  local p
  for p in 9090 3001 9093 8088 9100 9001 8200 8080; do
    local pids
    pids="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
    fi
  done
  info "Listo"
}

cmd_show_help_urls() {
  load_push_defaults
  cat <<EOF
Servicios típicos (solo 127.0.0.1 en el BMAX):

  Prometheus      :9090   http://127.0.0.1:9090
  Grafana         :3001   http://127.0.0.1:3001
  Alertmanager    :9093   http://127.0.0.1:9093
  cAdvisor        :8088   http://127.0.0.1:8088
  node-exporter   :9100   http://127.0.0.1:9100/metrics
  MinIO console   :9001   http://127.0.0.1:9001
  Vault           :8200   http://127.0.0.1:8200

Destino SSH: $(remote_host)  -p ${SSH_PORT}

Equivalente manual:
  ssh -p ${SSH_PORT} -L 9090:127.0.0.1:9090 -L 3001:127.0.0.1:3001 -L 9093:127.0.0.1:9093 $(remote_host) -N

EOF
}

# ── Modo BMAX: proxy LAN con socat (opcional) ────────────────────────────────
cmd_lan_proxy_help() {
  cat <<'EOF'
Si estás EN el BMAX y quieres que la Mac abra http://192.168.1.198:19090
sin túnel SSH, usa socat (escucha en la LAN → reenvía a 127.0.0.1):

  # En el BMAX (ejemplo Prometheus):
  sudo apt install -y socat
  socat TCP-LISTEN:19090,bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:9090 &

  # UFW solo LAN:
  sudo ufw allow from 192.168.1.0/24 to any port 19090 proto tcp comment 'prom-lan'
  sudo ufw reload

  # En la Mac: http://192.168.1.198:19090

No abras estos puertos a Internet (router/Cloudflare). Prefiere túnel SSH.
EOF
}

show_menu() {
  load_push_defaults
  clear 2>/dev/null || true
  cat <<EOF
════════════════════════════════════════
 Port-forward UIs → Mac (túnel SSH)
════════════════════════════════════════
  Destino: $(remote_host)  SSH :${SSH_PORT}
  Estado:  ${STATE_DIR}

  1) Monitoring (Prometheus + Grafana + Alertmanager)
  2) Solo Prometheus          :9090
  3) Solo Grafana             :3001
  4) Solo Alertmanager        :9093
  5) Observabilidad (+ cAdvisor + node-exporter)
  6) MinIO console            :9001
  7) Vault                    :8200
  8) Puerto personalizado
  9) Listar túneles activos
 10) Cerrar todos los túneles
 11) Probar SSH
 12) Configurar destino SSH
 13) Ayuda / URLs / comando manual
 14) Ayuda proxy LAN (socat en BMAX)
  0) Salir
EOF
  read -r -p "Opción: " o
  case "$o" in
    1) cmd_monitoring; pause ;;
    2) cmd_prometheus; pause ;;
    3) cmd_grafana; pause ;;
    4) cmd_alertmanager; pause ;;
    5) cmd_observability; pause ;;
    6) cmd_minio; pause ;;
    7) cmd_vault; pause ;;
    8) cmd_custom; pause ;;
    9) cmd_list; pause ;;
    10) cmd_stop_all; pause ;;
    11) cmd_test_ssh; pause ;;
    12) cmd_configure; pause ;;
    13) cmd_show_help_urls; pause ;;
    14) cmd_lan_proxy_help; pause ;;
    0|q|Q) exit 0 ;;
    *) warn "Opción inválida"; sleep 1 ;;
  esac
}

load_push_defaults

case "${1:-}" in
  1|monitoring) cmd_monitoring ;;
  2|prometheus) cmd_prometheus ;;
  3|grafana) cmd_grafana ;;
  4|alertmanager) cmd_alertmanager ;;
  5|observability) cmd_observability ;;
  6|minio) cmd_minio ;;
  7|vault) cmd_vault ;;
  8|custom) cmd_custom ;;
  9|list) cmd_list ;;
  10|stop|stop-all) cmd_stop_all ;;
  11|test|ssh) cmd_test_ssh ;;
  12|config) cmd_configure ;;
  13|help-urls) cmd_show_help_urls ;;
  14|lan-help) cmd_lan_proxy_help ;;
  --help|-h)
    cat <<'EOF'
Uso: ./port-forward.sh [opción]

  1 / monitoring      Prometheus+Grafana+Alertmanager
  2 / prometheus
  3 / grafana
  4 / alertmanager
  5 / observability   + cAdvisor + node-exporter
  6 / minio
  7 / vault
  8 / custom
  9 / list
 10 / stop
 11 / test
 12 / config

Sin argumentos: menú interactivo.

Tras abrir túneles, en la Mac:
  open http://127.0.0.1:9090
  open http://127.0.0.1:3001
EOF
    ;;
  "")
    while true; do show_menu; done
    ;;
  *)
    error "Opción desconocida: $1 (usa --help)"
    exit 1
    ;;
esac
