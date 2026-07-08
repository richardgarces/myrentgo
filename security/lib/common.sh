#!/usr/bin/env bash
# shellcheck disable=SC2034
# Common utilities for MyRent Go security toolkit.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[+]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*" >&2; }
log_step()  { echo -e "${CYAN}${BOLD}▶${NC} ${BOLD}$*${NC}"; }
log_skip()  { echo -e "${DIM}[~] Omitido: $*${NC}"; }

timestamp_now() {
  date +"%Y-%m-%d_%H-%M-%S"
}

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S"
}

have_cmd() {
  command -v "$1" &>/dev/null
}

require_cmd() {
  local cmd="$1"
  if ! have_cmd "$cmd"; then
    log_error "Comando requerido no encontrado: $cmd"
    return 1
  fi
}

# Append finding as JSON line to findings.jsonl
add_finding() {
  local severity="$1"
  local category="$2"
  local title="$3"
  local description="$4"
  local remediation="${5:-}"
  local owasp="${6:-}"
  local evidence="${7:-}"

  if [[ -z "${FINDINGS_FILE:-}" ]]; then
    log_warn "FINDINGS_FILE no definido; finding omitido: $title"
    return 0
  fi

  local json
  if have_cmd jq; then
    json=$(jq -n \
      --arg ts "$(iso_now)" \
      --arg sev "$severity" \
      --arg cat "$category" \
      --arg title "$title" \
      --arg desc "$description" \
      --arg rem "$remediation" \
      --arg owasp "$owasp" \
      --arg evidence "$evidence" \
      '{timestamp:$ts,severity:$sev,category:$cat,title:$title,description:$desc,remediation:$rem,owasp:$owasp,evidence:$evidence}')
  else
    # Minimal fallback without jq
    json=$(printf '{"timestamp":"%s","severity":"%s","category":"%s","title":"%s","description":"%s","remediation":"%s","owasp":"%s","evidence":"%s"}' \
      "$(iso_now)" "$severity" "$category" "$title" "$description" "$remediation" "$owasp" "$evidence")
  fi
  echo "$json" >>"$FINDINGS_FILE"
}

count_findings_by_severity() {
  local sev="$1"
  if [[ ! -f "${FINDINGS_FILE:-}" ]] || ! have_cmd jq; then
    echo 0
    return
  fi
  jq -s --arg s "$sev" '[.[] | select(.severity == $s)] | length' "$FINDINGS_FILE" 2>/dev/null || echo 0
}

service_up() {
  local url="$1"
  curl -sf --max-time "${REQUEST_TIMEOUT_SEC:-10}" "$url" &>/dev/null
}

http_code() {
  local method="${1:-GET}"
  local url="$2"
  shift 2
  curl -s -o /dev/null -w "%{http_code}" --max-time "${REQUEST_TIMEOUT_SEC:-10}" -X "$method" "$@" "$url" 2>/dev/null || echo "000"
}

http_headers() {
  local url="$1"
  curl -sI --max-time "${REQUEST_TIMEOUT_SEC:-10}" "$url" 2>/dev/null || true
}

http_body() {
  local method="${1:-GET}"
  local url="$2"
  shift 2
  curl -s --max-time "${REQUEST_TIMEOUT_SEC:-10}" -X "$method" "$@" "$url" 2>/dev/null || true
}

api_reachable() {
  service_up "${TARGET_API}/health"
}

frontend_reachable() {
  service_up "${TARGET_FRONTEND}/"
}

base64url_decode() {
  local input="$1"
  local pad=$((4 - ${#input} % 4))
  [[ $pad -eq 4 ]] && pad=0
  local padded="$input"
  while [[ $pad -gt 0 ]]; do padded="${padded}="; pad=$((pad - 1)); done
  echo "$padded" | tr '_-' '/+' | base64 -d 2>/dev/null || true
}

jwt_decode_header() {
  local token="$1"
  local header_b64
  header_b64=$(echo "$token" | cut -d. -f1)
  base64url_decode "$header_b64"
}

jwt_decode_payload() {
  local token="$1"
  local payload_b64
  payload_b64=$(echo "$token" | cut -d. -f2)
  base64url_decode "$payload_b64"
}

obtain_auth_token() {
  # Reuse token from an earlier module (evita re-login tras rate limit en /auth/login).
  if [[ -n "${AUTH_TOKEN_RESULT:-}" && "${MFA_LOGIN_REQUIRED:-false}" != "true" ]]; then
    return 0
  fi

  AUTH_TOKEN_RESULT=""
  MFA_LOGIN_REQUIRED=false

  local resp mfa_required
  resp=$(curl -s --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_USER}\",\"password\":\"${TEST_PASSWORD}\"}" \
    "${TARGET_API}/api/v1/auth/login" 2>/dev/null || true)

  if have_cmd jq; then
    mfa_required=$(echo "$resp" | jq -r '.mfa_required // false' 2>/dev/null)
    if [[ "$mfa_required" == "true" ]]; then
      MFA_LOGIN_REQUIRED=true
      return 0
    fi
    AUTH_TOKEN_RESULT=$(echo "$resp" | jq -r '.access_token // .token // empty' 2>/dev/null)
  else
    if echo "$resp" | grep -q '"mfa_required"\s*:\s*true'; then
      MFA_LOGIN_REQUIRED=true
      return 0
    fi
    AUTH_TOKEN_RESULT=$(echo "$resp" | grep -oE '"access_token"\s*:\s*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
  fi
}

auth_token_available() {
  [[ -n "${AUTH_TOKEN:-}" ]]
}

write_module_result() {
  local module="$1"
  local status="$2"
  local detail="${3:-}"
  local file="${REPORT_DIR}/modules/${module}.json"
  mkdir -p "${REPORT_DIR}/modules"
  if have_cmd jq; then
    jq -n --arg m "$module" --arg s "$status" --arg d "$detail" --arg ts "$(iso_now)" \
      '{module:$m,status:$s,detail:$d,timestamp:$ts}' >"$file"
  else
    printf '{"module":"%s","status":"%s","detail":"%s","timestamp":"%s"}\n' \
      "$module" "$status" "$detail" "$(iso_now)" >"$file"
  fi
}
