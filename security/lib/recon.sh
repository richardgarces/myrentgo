#!/usr/bin/env bash
# Reconnaissance — service discovery, banners, health endpoints.

run_recon() {
  log_step "Reconocimiento (service discovery)"

  if ! api_reachable; then
    log_skip "API no alcanzable en ${TARGET_API}"
    add_finding "Info" "Recon" "API no disponible" \
      "No se pudo conectar a ${TARGET_API}/health. Pruebas dinámicas de API omitidas." \
      "Levanta el stack con ./myrent.sh start o ./myrent.sh quickstart." \
      "" "curl ${TARGET_API}/health → timeout"
    write_module_result "recon" "skipped" "API unreachable"
    return 0
  fi

  local health_body headers server_banner
  health_body=$(http_body GET "${TARGET_API}/health")
  headers=$(http_headers "${TARGET_API}/health")
  server_banner=$(echo "$headers" | grep -i '^Server:' | head -1 | tr -d '\r' || true)

  mkdir -p "${REPORT_DIR}/raw"
  echo "$health_body" >"${REPORT_DIR}/raw/health.json"
  echo "$headers" >"${REPORT_DIR}/raw/api_headers.txt"

  add_finding "Info" "Recon" "API health endpoint accesible" \
    "El endpoint /health responde correctamente." \
    "Mantener sin datos sensibles en /health." \
    "OWASP API9" "$health_body"

  if [[ -n "$server_banner" ]]; then
    if echo "$server_banner" | grep -qiE 'gin|go|express|nginx|apache'; then
      add_finding "Low" "Recon" "Banner de servidor expuesto" \
        "El header Server revela información del stack: ${server_banner}" \
        "Ocultar o genericar el header Server en producción (reverse proxy)." \
        "OWASP API8" "$server_banner"
    else
      add_finding "Info" "Recon" "Header Server" \
        "Server: ${server_banner}" "" "OWASP API8" "$server_banner"
    fi
  fi

  # Discover common paths (non-destructive)
  local paths=("/metrics" "/ws" "/api/v1/auth/login" "/api/v1/properties")
  local path_results=""
  for p in "${paths[@]}"; do
    local code
    code=$(http_code GET "${TARGET_API}${p}")
    path_results+="${p} → HTTP ${code}\n"
  done

  add_finding "Info" "Recon" "Mapa de rutas públicas (muestra)" \
    "Códigos HTTP en rutas comunes sin autenticación." \
    "Verificar que rutas sensibles requieran auth." \
    "OWASP API1" "$(echo -e "$path_results")"

  if frontend_reachable; then
    local fe_headers
    fe_headers=$(http_headers "${TARGET_FRONTEND}/")
    echo "$fe_headers" >"${REPORT_DIR}/raw/frontend_headers.txt"
    add_finding "Info" "Recon" "Frontend accesible" \
      "Frontend responde en ${TARGET_FRONTEND}" "" "" "HTTP OK"
  else
    log_skip "Frontend no alcanzable en ${TARGET_FRONTEND}"
    add_finding "Info" "Recon" "Frontend no disponible" \
      "No se pudo conectar al frontend. Revisar headers del frontend omitido." \
      "Levantar frontend con ./myrent.sh start." "" ""
  fi

  write_module_result "recon" "completed" "API and path discovery"
}
