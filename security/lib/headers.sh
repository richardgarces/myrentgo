#!/usr/bin/env bash
# Security headers analysis for API and frontend.

check_headers_on_target() {
  local name="$1"
  local url="$2"
  local headers_file="$3"

  if [[ ! -f "$headers_file" ]]; then
    add_finding "Info" "Headers" "${name}: sin headers" \
      "No se obtuvieron headers para ${url}." "" "OWASP ASVS V14" ""
    return
  fi

  local required=(
    "Content-Security-Policy"
    "X-Content-Type-Options"
    "X-Frame-Options"
    "Referrer-Policy"
    "Permissions-Policy"
  )
  local recommended=(
    "Strict-Transport-Security"
    "Cross-Origin-Opener-Policy"
    "Cross-Origin-Resource-Policy"
  )

  local missing=()
  for h in "${required[@]}"; do
    if ! grep -qi "^${h}:" "$headers_file"; then
      missing+=("$h")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    local sev="Medium"
    [[ "$name" == "Frontend" ]] && sev="Medium"
    add_finding "$sev" "Headers" "${name}: headers de seguridad faltantes" \
      "Faltan: $(IFS=', '; echo "${missing[*]}")" \
      "Configurar headers en middleware (API) o nginx (frontend). Ver SecurityHeaders middleware." \
      "OWASP ASVS V14" "$(cat "$headers_file" | head -20)"
  else
    add_finding "Info" "Headers" "${name}: headers básicos presentes" \
      "CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy y Permissions-Policy detectados." \
      "" "OWASP ASVS V14" ""
  fi

  local is_local_http=false
  if [[ "$url" =~ ^http://(localhost|127\.0\.0\.1)([:/]|$) ]]; then
    is_local_http=true
  fi

  # Skip COOP/CORP on plain HTTP localhost (API sets them; Vite dev may not).
  for h in "${recommended[@]}"; do
    if [[ "$h" == "Strict-Transport-Security" || "$h" == "Cross-Origin-Opener-Policy" || "$h" == "Cross-Origin-Resource-Policy" ]] && [[ "$is_local_http" == "true" ]]; then
      if ! grep -qi "^${h}:" "$headers_file"; then
        add_finding "Info" "Headers" "${name}: ${h} omitido en HTTP local (esperado)" \
          "${h} no aplica o se configura en producción HTTPS (nginx/Caddy)." \
          "" "OWASP ASVS V14" ""
      fi
      continue
    fi
    if ! grep -qi "^${h}:" "$headers_file"; then
      add_finding "Low" "Headers" "${name}: header recomendado ausente (${h})" \
        "En localhost HSTS puede ser N/A; en producción con HTTPS es obligatorio." \
        "Añadir ${h} en reverse proxy o middleware." \
        "OWASP ASVS V14" ""
    fi
  done

  # Check for dangerous headers
  if grep -qi '^Access-Control-Allow-Origin: \*$' "$headers_file"; then
    add_finding "High" "Headers" "${name}: CORS wildcard (*)" \
      "Access-Control-Allow-Origin: * detectado." \
      "Restringir orígenes permitidos." \
      "OWASP API8" "$(grep -i 'Access-Control' "$headers_file" || true)"
  fi
}

run_headers() {
  log_step "Análisis de security headers"

  mkdir -p "${REPORT_DIR}/raw"

  if api_reachable; then
    http_headers "${TARGET_API}/health" >"${REPORT_DIR}/raw/api_security_headers.txt"
    check_headers_on_target "API" "${TARGET_API}" "${REPORT_DIR}/raw/api_security_headers.txt"
  else
    log_skip "API no disponible para headers"
  fi

  if frontend_reachable; then
    http_headers "${TARGET_FRONTEND}/" >"${REPORT_DIR}/raw/frontend_security_headers.txt"
    check_headers_on_target "Frontend" "${TARGET_FRONTEND}" "${REPORT_DIR}/raw/frontend_security_headers.txt"
  else
    log_skip "Frontend no disponible para headers"
  fi

  write_module_result "headers" "completed" "Security headers checked"
}
