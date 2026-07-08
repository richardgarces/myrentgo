#!/usr/bin/env bash
# CORS misconfiguration tests.

run_cors() {
  log_step "CORS misconfiguration"

  if ! api_reachable; then
    log_skip "API no disponible"
    write_module_result "cors" "skipped" "API unreachable"
    return 0
  fi

  local evil_origins=(
    "https://evil.example.com"
    "http://attacker.local"
    "null"
  )

  local misconfig=false
  for origin in "${evil_origins[@]}"; do
    local headers acao acac
    headers=$(curl -sI --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
      -H "Origin: ${origin}" \
      -H "Access-Control-Request-Method: GET" \
      -X OPTIONS \
      "${TARGET_API}/api/v1/auth/me" 2>/dev/null || true)

    acao=$(echo "$headers" | grep -i '^Access-Control-Allow-Origin:' | head -1 | tr -d '\r' || true)
    acac=$(echo "$headers" | grep -i '^Access-Control-Allow-Credentials:' | head -1 | tr -d '\r' || true)

    echo "$headers" >>"${REPORT_DIR}/raw/cors_${origin//[^a-zA-Z0-9]/_}.txt"

    if echo "$acao" | grep -qi "evil.example.com\|attacker.local"; then
      misconfig=true
      add_finding "High" "CORS" "Origen malicioso reflejado en ACAO" \
        "Origin ${origin} fue reflejado: ${acao}" \
        "Lista blanca estricta en CORS_ORIGINS; no reflejar orígenes arbitrarios." \
        "OWASP API8" "${acao} ${acac}"
    fi

    if echo "$acao" | grep -qi '\*' && echo "$acac" | grep -qi 'true'; then
      misconfig=true
      add_finding "Critical" "CORS" "CORS wildcard con credenciales" \
        "Access-Control-Allow-Origin: * con Allow-Credentials: true." \
        "Nunca combinar * con credentials." \
        "OWASP API8" "${acao} ${acac}"
    fi
  done

  # Preflight from allowed localhost origin (sanity)
  local good_headers good_acao
  good_headers=$(curl -sI --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
    -H "Origin: http://localhost:4000" \
    -H "Access-Control-Request-Method: GET" \
    -X OPTIONS \
    "${TARGET_API}/health" 2>/dev/null || true)
  good_acao=$(echo "$good_headers" | grep -i '^Access-Control-Allow-Origin:' | head -1 | tr -d '\r' || true)

  if [[ -n "$good_acao" ]]; then
    add_finding "Info" "CORS" "CORS para localhost configurado" \
      "Origen localhost:4000 → ${good_acao}" \
      "" "OWASP API8" ""
  fi

  if ! $misconfig; then
    add_finding "Info" "CORS" "Sin reflexión de orígenes maliciosos" \
      "Orígenes evil.example.com / attacker.local no fueron aceptados en preflight." \
      "" "OWASP API8" ""
  fi

  write_module_result "cors" "completed" "CORS checks done"
}
