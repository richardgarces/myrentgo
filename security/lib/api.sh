#!/usr/bin/env bash
# OWASP API Top 10 spot checks.

run_api_checks() {
  log_step "OWASP API Top 10 (spot checks)"

  if ! api_reachable; then
    log_skip "API no disponible"
    write_module_result "api" "skipped" "API unreachable"
    return 0
  fi

  # BOLA/IDOR — access property with fake ObjectId without auth vs with auth
  local fake_id="507f1f77bcf86cd799439011"
  local idor_code
  idor_code=$(http_code GET "${TARGET_API}/api/v1/properties/${fake_id}")
  if [[ "$idor_code" == "200" ]]; then
    add_finding "Critical" "API" "IDOR: propiedad accesible sin autenticación" \
      "GET /properties/${fake_id} devolvió 200 sin token." \
      "Exigir auth y validar organization_id en cada recurso." \
      "OWASP API1 BOLA" "HTTP 200"
  fi

  local token
  obtain_auth_token
  token="${AUTH_TOKEN_RESULT:-}"
  if [[ "${MFA_LOGIN_REQUIRED:-false}" == "true" ]]; then
    add_finding "Info" "API" "Pruebas autenticadas omitidas (MFA)" \
      "IDOR autenticado y mass assignment requieren token; MFA activo en ${TEST_USER}." \
      "Ver docs/SECURITY_TESTING.md — usar gestor@test.local (seed) o desactivar MFA en admin." \
      "OWASP API1" ""
    write_module_result "api" "partial" "MFA blocks token"
    return 0
  fi
  if [[ -n "$token" ]]; then
    local auth_idor_code body
    auth_idor_code=$(http_code GET "${TARGET_API}/api/v1/properties/${fake_id}" \
      -H "Authorization: Bearer ${token}")
    body=$(http_body GET "${TARGET_API}/api/v1/properties/${fake_id}" \
      -H "Authorization: Bearer ${token}")

    if [[ "$auth_idor_code" == "200" ]]; then
      add_finding "High" "API" "Posible IDOR con ID arbitrario" \
        "Propiedad con ID inexistente/ajeno devolvió 200 con token válido." \
        "Devolver 404 si el recurso no pertenece a la org del usuario." \
        "OWASP API1" "$body"
    elif [[ "$auth_idor_code" == "404" || "$auth_idor_code" == "403" ]]; then
      add_finding "Info" "API" "IDOR: ID ajeno rechazado" \
        "GET /properties/${fake_id} → HTTP ${auth_idor_code} (esperado)." \
        "" "OWASP API1" ""
    fi

    # List users — should require admin role
    local users_code
    users_code=$(http_code GET "${TARGET_API}/api/v1/users" -H "Authorization: Bearer ${token}")
    if [[ "$users_code" == "200" ]]; then
      add_finding "Info" "API" "/users accesible con admin seed" \
        "Usuario admin puede listar usuarios (esperado para owner/admin)." \
        "Verificar que roles no privilegiados reciban 403." \
        "OWASP API5" "HTTP 200"
    elif [[ "$users_code" == "403" ]]; then
      add_finding "Info" "API" "/users restringido por rol" \
        "HTTP 403 — control de acceso por rol activo." \
        "" "OWASP API5" ""
    fi
  fi

  # Mass assignment — try to set role/is_admin on profile update
  if [[ -n "${token:-}" ]]; then
    local mass_resp mass_code
    mass_code=$(curl -s -o "${REPORT_DIR}/raw/mass_assignment.json" -w "%{http_code}" \
      --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
      -X PATCH "${TARGET_API}/api/v1/settings/preferences" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      -d '{"role":"owner","is_admin":true,"organizations":[{"organization_id":"evil","role":"owner"}]}' 2>/dev/null || echo "000")

    local mass_body=""
    [[ -f "${REPORT_DIR}/raw/mass_assignment.json" ]] && mass_body=$(cat "${REPORT_DIR}/raw/mass_assignment.json")

    if echo "$mass_body" | grep -qi 'owner\|is_admin'; then
      add_finding "High" "API" "Posible mass assignment en preferences" \
        "La respuesta podría reflejar campos privilegiados enviados." \
        "Usar DTOs estrictos; ignorar campos no permitidos en bind JSON." \
        "OWASP API3" "$mass_body"
    else
      add_finding "Info" "API" "Mass assignment (preferences) — sin elevación evidente" \
        "PATCH /settings/preferences no mostró elevación de privilegios en respuesta." \
        "" "OWASP API3" "HTTP ${mass_code}"
    fi
  fi

  # Verbose errors
  local err_body err_code
  err_code=$(curl -s -o "${REPORT_DIR}/raw/verbose_error.json" -w "%{http_code}" \
    --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
    -X POST "${TARGET_API}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":12345,"password":null}' 2>/dev/null || echo "000")
  err_body=$(cat "${REPORT_DIR}/raw/verbose_error.json" 2>/dev/null || true)

  if echo "$err_body" | grep -qiE 'stack|trace|panic|runtime|\.go:[0-9]+|mongodb'; then
    add_finding "Medium" "API" "Errores verbosos en API" \
      "La respuesta de error puede filtrar detalles internos." \
      "Usar mensajes genéricos en producción; log interno detallado." \
      "OWASP API8" "$err_body"
  else
    add_finding "Info" "API" "Errores sin stack trace evidente" \
      "Login con payload inválido no expuso stack trace (HTTP ${err_code})." \
      "" "OWASP API8" "$err_body"
  fi

  # Unauthenticated access to metrics
  local metrics_code
  metrics_code=$(http_code GET "${TARGET_API}/metrics")
  if [[ "$metrics_code" == "200" ]]; then
    local metrics_sev="Medium"
    local metrics_desc="/metrics accesible sin autenticación."
    if [[ "$TARGET_API" =~ ^https?://(localhost|127\.0\.0\.1)([:/]|$) ]]; then
      metrics_sev="Info"
      metrics_desc="En desarrollo local METRICS_PROTECTED suele ser false (.env.example); HTTP 200 esperado."
    fi
    add_finding "$metrics_sev" "API" "Endpoint /metrics público" \
      "$metrics_desc" \
      "En producción proteger con auth o red interna (METRICS_PROTECTED=true)." \
      "OWASP API8" "HTTP 200"
  elif [[ "$metrics_code" == "401" || "$metrics_code" == "403" ]]; then
    add_finding "Info" "API" "Endpoint /metrics protegido" \
      "/metrics devolvió HTTP ${metrics_code} sin token (METRICS_PROTECTED activo)." \
      "" "OWASP API8" "HTTP ${metrics_code}"
  fi

  write_module_result "api" "completed" "API spot checks done"
}
