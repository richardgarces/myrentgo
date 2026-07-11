#!/usr/bin/env bash
# Healthcheck del host: disco, memoria, Docker, load → log (+ opcional webhook).
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root

header "Healthcheck del host"

ensure_platform_dirs
mkdir -p "${PLATFORM_ROOT}/logs" "${PLATFORM_ROOT}/bin"

SCRIPT_PATH="${PLATFORM_ROOT}/bin/host-healthcheck.sh"
CONF_PATH="${PLATFORM_ROOT}/bin/host-healthcheck.env"
CRON_FILE="/etc/cron.d/platform-host-healthcheck"

cat >"$CONF_PATH" <<'EOF'
# Umbrales del healthcheck (editar y guardar)
# DISK_MAX_PERCENT: alerta si el uso de / supera este %
DISK_MAX_PERCENT=85
# MEM_MAX_PERCENT: alerta si la RAM usada (sin buffers) supera este %
MEM_MAX_PERCENT=90
# LOAD_MAX_PER_CPU: alerta si load1 / nproc > este valor
LOAD_MAX_PER_CPU=2.0
# CHECK_DOCKER: 1 = fallar si el daemon Docker no responde
CHECK_DOCKER=1
# WEBHOOK_URL: opcional (Slack/Discord/Telegram bot HTTP). Vacío = solo log
WEBHOOK_URL=
EOF
chmod 600 "$CONF_PATH"

cat >"$SCRIPT_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
CONF="${CONF:-/opt/platform/bin/host-healthcheck.env}"
LOG_DIR="${LOG_DIR:-/opt/platform/logs}"
mkdir -p "$LOG_DIR"
LOG="${LOG_DIR}/healthcheck.log"
# shellcheck disable=SC1090
[[ -f "$CONF" ]] && source "$CONF"

DISK_MAX_PERCENT="${DISK_MAX_PERCENT:-85}"
MEM_MAX_PERCENT="${MEM_MAX_PERCENT:-90}"
LOAD_MAX_PER_CPU="${LOAD_MAX_PER_CPU:-2.0}"
CHECK_DOCKER="${CHECK_DOCKER:-1}"
WEBHOOK_URL="${WEBHOOK_URL:-}"

alerts=()
ts="$(date -Is)"

disk_pct="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [[ -n "$disk_pct" ]] && (( disk_pct >= DISK_MAX_PERCENT )); then
  alerts+=("disco /=${disk_pct}% (umbral ${DISK_MAX_PERCENT}%)")
fi

# Memoria: used% ≈ (total-available)/total
mem_pct="$(free | awk '/Mem:/ {printf "%d", ($2-$7)*100/$2}')"
if [[ -n "$mem_pct" ]] && (( mem_pct >= MEM_MAX_PERCENT )); then
  alerts+=("memoria=${mem_pct}% (umbral ${MEM_MAX_PERCENT}%)")
fi

nproc="$(nproc 2>/dev/null || echo 1)"
load1="$(awk '{print $1}' /proc/loadavg)"
# bc opcional; fallback awk
load_ok="$(awk -v l="$load1" -v n="$nproc" -v m="$LOAD_MAX_PER_CPU" 'BEGIN{ print (l <= n*m) ? 1 : 0 }')"
if [[ "$load_ok" != "1" ]]; then
  alerts+=("load1=${load1} cpus=${nproc} (umbral ${LOAD_MAX_PER_CPU}/cpu)")
fi

if [[ "$CHECK_DOCKER" == "1" ]]; then
  if command -v docker >/dev/null 2>&1; then
    if ! docker info >/dev/null 2>&1; then
      alerts+=("docker daemon no responde")
    fi
  fi
fi

if [[ ${#alerts[@]} -eq 0 ]]; then
  echo "${ts} OK disk=${disk_pct}% mem=${mem_pct}% load=${load1}" >>"$LOG"
  exit 0
fi

msg="${ts} ALERTA host=$(hostname): ${alerts[*]}"
echo "$msg" >>"$LOG"
echo "$msg" >&2

if [[ -n "$WEBHOOK_URL" ]]; then
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"${msg}\"}" \
    "$WEBHOOK_URL" >/dev/null 2>&1 || true
fi
exit 1
EOF
chmod 750 "$SCRIPT_PATH"

read -r -p "Intervalo cron en minutos [5]: " every_in
EVERY="${every_in:-5}"
if ! [[ "$EVERY" =~ ^[0-9]+$ ]] || (( EVERY < 1 || EVERY > 60 )); then
  error "Intervalo inválido."
  exit 1
fi

# */N * * * *  — cada N minutos
cat >"$CRON_FILE" <<EOF
# Healthcheck host — kit ubuntu/platform
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/${EVERY} * * * * root ${SCRIPT_PATH}
EOF
chmod 644 "$CRON_FILE"

info "Script: ${SCRIPT_PATH}"
info "Config: ${CONF_PATH} (umbrales + WEBHOOK_URL opcional)"
info "Cron: cada ${EVERY} min → ${CRON_FILE}"
info "Log:   ${PLATFORM_ROOT}/logs/healthcheck.log"
echo
info "Prueba ahora:"
echo "  sudo ${SCRIPT_PATH} || true"
"$SCRIPT_PATH" || true
