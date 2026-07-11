#!/usr/bin/env bash
# Genera deploy/platform/alertmanager/alertmanager.yml desde .env.monitoring
set -euo pipefail

OUT="${1:-deploy/platform/alertmanager/alertmanager.yml}"
ENV_FILE="${2:-deploy/platform/.env.monitoring}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: falta ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
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

has_email=false
has_telegram=false
[[ -n "$SMTP_HOST" && -n "$SMTP_FROM" && -n "$EMAIL_TO" && -n "$SMTP_PASSWORD" ]] && has_email=true
[[ -n "$TG_TOKEN" && -n "$TG_CHAT" ]] && has_telegram=true

if [[ "$has_email" == false && "$has_telegram" == false ]]; then
  echo "WARN: sin correo ni Telegram — Alertmanager usará receiver blackhole (sin notificaciones)." >&2
fi

mkdir -p "$(dirname "$OUT")"
umask 077

{
  cat <<'YAML'
global:
  resolve_timeout: 5m
YAML

  if [[ "$has_email" == true ]]; then
    cat <<YAML
  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'
  smtp_from: '${SMTP_FROM}'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'
  smtp_require_tls: true
YAML
  fi

  cat <<'YAML'

route:
  receiver: default
  group_by: ['alertname', 'app', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: critical
      repeat_interval: 1h

receivers:
YAML

  if [[ "$has_email" == true || "$has_telegram" == true ]]; then
    for receiver in default critical; do
      echo "  - name: ${receiver}"
      if [[ "$has_email" == true ]]; then
        cat <<YAML
    email_configs:
      - to: '${EMAIL_TO}'
        send_resolved: true
        headers:
          Subject: '[MyRent Go {{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
YAML
      fi
      if [[ "$has_telegram" == true ]]; then
        cat <<YAML
    telegram_configs:
      - bot_token: '${TG_TOKEN}'
        chat_id: ${TG_CHAT}
        send_resolved: true
        parse_mode: HTML
        message: |
          <b>{{ .Status | toUpper }}</b> {{ .CommonLabels.alertname }}
          App: {{ .CommonLabels.app }}
          {{ range .Alerts }}
          • {{ .Annotations.summary }}
          {{ end }}
YAML
      fi
    done
  else
    cat <<'YAML'
  - name: default
  - name: critical
YAML
  fi

  cat <<'YAML'

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'app']
YAML

} > "$OUT"

chmod 600 "$OUT"
echo "==> Generado: ${OUT}"
