#!/usr/bin/env bash
# Authentication & JWT security checks.

run_auth() {
  log_step "Autenticación y JWT"

  if ! api_reachable; then
    log_skip "API no disponible"
    write_module_result "auth" "skipped" "API unreachable"
    return 0
  fi

  # Protected routes without auth
  local protected_routes=(
    "/api/v1/properties"
    "/api/v1/users"
    "/api/v1/dashboard"
    "/api/v1/documents"
    "/api/v1/system/health"
  )

  local exposed=""
  for route in "${protected_routes[@]}"; do
    local code
    code=$(http_code GET "${TARGET_API}${route}")
    if [[ "$code" == "200" ]]; then
      exposed+="${route} → 200 (sin auth)\n"
    elif [[ "$code" != "401" && "$code" != "403" ]]; then
      exposed+="${route} → ${code} (revisar)\n"
    fi
  done

  if [[ -n "$exposed" ]]; then
    add_finding "Critical" "Auth" "Rutas protegidas accesibles sin token" \
      "Algunas rutas no devolvieron 401/403 sin autenticación." \
      "Asegurar middleware RequireAuth en todas las rutas /api/v1 excepto auth público." \
      "OWASP API1 / API5" "$(echo -e "$exposed")"
  else
    add_finding "Info" "Auth" "Rutas protegidas rechazan peticiones anónimas" \
      "Las rutas probadas devolvieron 401/403 sin Authorization." \
      "" "OWASP API1" ""
  fi

  # Probe login before brute-force (same IP shares login rate limit bucket).
  MFA_LOGIN_REQUIRED=false
  obtain_auth_token
  token="${AUTH_TOKEN_RESULT:-}"
  if [[ "${MFA_LOGIN_REQUIRED:-false}" == "true" ]]; then
    add_finding "Info" "Auth" "MFA activo en cuenta de prueba" \
      "Login con ${TEST_USER} requiere segundo factor (mfa_required). Pruebas autenticadas (upload, IDOR autenticado) omitidas." \
      "Para pentest completo: usar gestor@test.local (sin MFA, seed) o desactivar MFA en admin; ver security/config.env.example." \
      "OWASP API2" "mfa_required=true"
  elif [[ -z "$token" ]]; then
    add_finding "Medium" "Auth" "No se obtuvo JWT de prueba" \
      "Login con ${TEST_USER} falló. Verifica seed (./myrent.sh bootstrap)." \
      "Ejecutar ./myrent.sh bootstrap con MongoDB activo." \
      "OWASP API2" ""
    write_module_result "auth" "partial" "No test token"
    _auth_rate_limit_probe
    return 0
  else
    echo "$token" >"${REPORT_DIR}/raw/test_token.jwt"
    export AUTH_TOKEN_RESULT="$token"
    local header payload
    header=$(jwt_decode_header "$token")
    payload=$(jwt_decode_payload "$token")

    add_finding "Info" "Auth" "JWT obtenido (análisis)" \
      "Token de prueba capturado para análisis estático." \
      "No compartir tokens en informes públicos." \
      "OWASP API2" "header: ${header}"

    # Algorithm check
    if echo "$header" | grep -qi '"alg"\s*:\s*"none"'; then
      add_finding "Critical" "Auth" "JWT con algoritmo none" \
        "El token emitido usa alg:none." \
        "Rechazar alg:none en validación JWT." \
        "OWASP API2" "$header"
    fi

    local alg
    alg=$(echo "$header" | grep -oE '"alg"\s*:\s*"[^"]+"' | head -1 || true)
    if echo "$alg" | grep -qi 'HS256'; then
      add_finding "Info" "Auth" "JWT usa HS256" \
        "Algoritmo simétrico HS256 (esperado para esta app)." \
        "Usar JWT_SECRET fuerte (≥32 chars) en producción." \
        "OWASP API2" "$alg"
    fi

    # alg=none attack probe (safe — expect rejection)
    local parts
    parts=(${token//./ })
    if [[ ${#parts[@]} -ge 2 ]]; then
      local none_token="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${parts[1]}."
      local none_code
      none_code=$(http_code GET "${TARGET_API}/api/v1/auth/me" -H "Authorization: Bearer ${none_token}")
      if [[ "$none_code" == "200" ]]; then
        add_finding "Critical" "Auth" "JWT alg:none aceptado" \
          "El servidor aceptó un token manipulado con alg:none." \
          "Validar algoritmo en jwt.Parse y rechazar none." \
          "OWASP API2" "HTTP ${none_code}"
      else
        add_finding "Info" "Auth" "JWT alg:none rechazado" \
          "Token manipulado correctamente rechazado (HTTP ${none_code})." \
          "" "OWASP API2" ""
      fi
    fi

    # Expired token test
    local exp
    exp=$(echo "$payload" | grep -oE '"exp"\s*:\s*[0-9]+' | grep -oE '[0-9]+' || true)
    if [[ -n "$exp" ]]; then
      add_finding "Info" "Auth" "JWT contiene exp" \
        "Claim exp presente (unix: ${exp})." \
        "Verificar rechazo de tokens expirados en middleware." \
        "OWASP API2" "$payload"
    fi

    local tampered="${token}x"
    local tampered_code
    tampered_code=$(http_code GET "${TARGET_API}/api/v1/auth/me" -H "Authorization: Bearer ${tampered}")
    if [[ "$tampered_code" == "200" ]]; then
      add_finding "Critical" "Auth" "Token con firma inválida aceptado" \
        "Token alterado fue aceptado." \
        "Revisar validación de firma JWT." \
        "OWASP API2" "HTTP ${tampered_code}"
    else
      add_finding "Info" "Auth" "Token inválido rechazado" \
        "Token con firma corrupta devolvió HTTP ${tampered_code}." \
        "" "OWASP API2" ""
    fi
  fi

  _auth_rate_limit_probe

  if [[ "${MFA_LOGIN_REQUIRED:-false}" == "true" ]]; then
    write_module_result "auth" "partial" "MFA required"
    return 0
  fi

  write_module_result "auth" "completed" "Auth and JWT checks done"
}

_auth_rate_limit_probe() {
  # Light brute-force rate limit test (runs last — consumes IP login quota).
  local attempts="${BRUTE_FORCE_ATTEMPTS:-8}"
  local rate_limited=false
  local i
  for ((i = 1; i <= attempts; i++)); do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
      -H "Content-Type: application/json" \
      -d '{"email":"pentest-brute@test.local","password":"wrong'${i}'"}' \
      "${TARGET_API}/api/v1/auth/login" 2>/dev/null || echo "000")
    if [[ "$code" == "429" ]]; then
      rate_limited=true
      break
    fi
  done

  if $rate_limited; then
    add_finding "Info" "Auth" "Rate limiting activo en login" \
      "Se recibió HTTP 429 tras ${i} intentos fallidos de login." \
      "" "OWASP API4" "HTTP 429"
  elif [[ $attempts -ge 5 ]]; then
    add_finding "Medium" "Auth" "Sin rate limit evidente en login (prueba ligera)" \
      "No se detectó HTTP 429 tras ${attempts} intentos con credenciales inválidas." \
      "Verificar RateLimiter global y límites específicos en /auth/login." \
      "OWASP API4" "${attempts} intentos sin 429"
  fi
}
