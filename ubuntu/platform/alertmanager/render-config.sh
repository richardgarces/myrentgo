#!/usr/bin/env bash
# Genera alertmanager.yml desde .env del servicio alertmanager
set -euo pipefail
SVC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SVC_DIR}/.env"
OUT="${SVC_DIR}/alertmanager.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta .env — cp .env.example .env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SMTP_HOST="${ALERTMANAGER_SMTP_HOST:-}"
SMTP_PORT="${ALERTMANAGER_SMTP_PORT:-587}"
SMTP_USER="${ALERTMANAGER_SMTP_USER:-}"
SMTP_PASSWORD="${ALERTMANAGER_SMTP_PASSWORD:-}"
SMTP_FROM="${ALERTMANAGER_SMTP_FROM:-}"
EMAIL_TO="${ALERTMANAGER_EMAIL_TO:-}"
TG_TOKEN="${ALERTMANAGER_TELEGRAM_BOT_TOKEN:-}"
TG_CHAT="${ALERTMANAGER_TELEGRAM_CHAT_ID:-}"
REP_W="${REPEAT_INTERVAL_WARNING:-4h}"
REP_C="${REPEAT_INTERVAL_CRITICAL:-1h}"

has_email=false
has_tg=false
[[ -n "$SMTP_HOST" && -n "$SMTP_FROM" && -n "$EMAIL_TO" && -n "$SMTP_PASSWORD" && "$SMTP_PASSWORD" != CHANGE_ME* ]] && has_email=true
[[ -n "$TG_TOKEN" && -n "$TG_CHAT" ]] && has_tg=true

umask 022
{
  echo "global:"
  echo "  resolve_timeout: 5m"
  if [[ "$has_email" == true ]]; then
    echo "  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'"
    echo "  smtp_from: '${SMTP_FROM}'"
    echo "  smtp_auth_username: '${SMTP_USER}'"
    echo "  smtp_auth_password: '${SMTP_PASSWORD}'"
    echo "  smtp_require_tls: true"
  fi
  cat <<YAML

route:
  receiver: default
  group_by: ['alertname', 'app', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: ${REP_W}
  routes:
    - match:
        severity: critical
      receiver: critical
      repeat_interval: ${REP_C}

receivers:
YAML
  if [[ "$has_email" == true || "$has_tg" == true ]]; then
    for r in default critical; do
      echo "  - name: ${r}"
      if [[ "$has_email" == true ]]; then
        cat <<YAML
    email_configs:
      - to: '${EMAIL_TO}'
        send_resolved: true
YAML
      fi
      if [[ "$has_tg" == true ]]; then
        cat <<YAML
    telegram_configs:
      - bot_token: '${TG_TOKEN}'
        chat_id: ${TG_CHAT}
        send_resolved: true
        parse_mode: HTML
        message: |
          <b>{{ .Status | toUpper }}</b> {{ .CommonLabels.alertname }}
          {{ range .Alerts }}• {{ .Annotations.summary }}
          {{ end }}
YAML
      fi
    done
  else
    echo "  - name: default"
    echo "  - name: critical"
  fi
  cat <<'YAML'

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'app']
YAML
} >"$OUT"
# El contenedor prom/alertmanager corre como nobody: debe poder leer el YAML.
# El directorio del servicio conviene 750; el .env sigue en 600.
chmod 644 "$OUT"
chmod 750 "$SVC_DIR" 2>/dev/null || true
echo "Generado: $OUT (email=${has_email} telegram=${has_tg})"
