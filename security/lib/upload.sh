#!/usr/bin/env bash
# File upload security checks.

run_upload() {
  log_step "Subida de archivos"

  if ! api_reachable; then
    log_skip "API no disponible"
    write_module_result "upload" "skipped" "API unreachable"
    return 0
  fi

  obtain_auth_token
  token="${AUTH_TOKEN_RESULT:-}"
  if [[ "${MFA_LOGIN_REQUIRED:-false}" == "true" || -z "$token" ]]; then
    log_skip "Sin token para pruebas de upload (MFA o login fallido)"
    write_module_result "upload" "skipped" "No auth token / MFA"
    return 0
  fi

  mkdir -p "${REPORT_DIR}/raw"

  # Oversized file test
  local max_mb="${MAX_UPLOAD_TEST_MB:-35}"
  local tmp_oversized="${REPORT_DIR}/raw/oversized.bin"
  # Create file slightly over typical 30MB limit
  dd if=/dev/zero of="$tmp_oversized" bs=1M count="$max_mb" status=none 2>/dev/null || \
    dd if=/dev/zero of="$tmp_oversized" bs=1048576 count="$max_mb" 2>/dev/null

  local oversize_code oversize_body
  oversize_code=$(curl -s -o "${REPORT_DIR}/raw/oversized_response.json" -w "%{http_code}" \
    --max-time 60 \
    -X POST "${TARGET_API}/api/v1/documents" \
    -H "Authorization: Bearer ${token}" \
    -F "file=@${tmp_oversized};filename=oversized_test.bin" \
    -F 'name=Oversized pentest file' \
    -F 'category=other' 2>/dev/null || echo "000")
  oversize_body=$(cat "${REPORT_DIR}/raw/oversized_response.json" 2>/dev/null || true)
  rm -f "$tmp_oversized"

  if [[ "$oversize_code" == "200" || "$oversize_code" == "201" ]]; then
    add_finding "High" "Upload" "Archivo oversized aceptado" \
      "Se aceptó un archivo de ~${max_mb}MB (límite esperado ~30MB)." \
      "Enforzar MAX_UPLOAD_MB en handler y reverse proxy (client_max_body_size)." \
      "OWASP API8 / A04" "HTTP ${oversize_code}"
  elif [[ "$oversize_code" == "413" || "$oversize_code" == "400" || "$oversize_code" == "422" ]]; then
    add_finding "Info" "Upload" "Archivo oversized rechazado" \
      "Archivo grande rechazado correctamente (HTTP ${oversize_code})." \
      "" "OWASP API8" "$oversize_body"
  else
    add_finding "Low" "Upload" "Respuesta inesperada en upload oversized" \
      "HTTP ${oversize_code} — revisar manualmente." \
      "" "OWASP API8" "$oversize_body"
  fi

  # Path traversal in filename
  local traversal_names=(
    "../../../etc/passwd"
    "..\\..\\windows\\system32\\config\\sam"
    "....//....//etc/passwd"
  )

  local tmp_small="${REPORT_DIR}/raw/small.txt"
  echo "pentest-safe-content" >"$tmp_small"

  for tname in "${traversal_names[@]}"; do
    local trav_code trav_body
    trav_code=$(curl -s -o "${REPORT_DIR}/raw/traversal_response.json" -w "%{http_code}" \
      --max-time "${REQUEST_TIMEOUT_SEC:-10}" \
      -X POST "${TARGET_API}/api/v1/documents" \
      -H "Authorization: Bearer ${token}" \
      -F "file=@${tmp_small};filename=${tname}" \
      -F 'name=Traversal test' \
      -F 'category=other' 2>/dev/null || echo "000")
    trav_body=$(cat "${REPORT_DIR}/raw/traversal_response.json" 2>/dev/null || true)

    if echo "$trav_body" | grep -qiE '/etc/passwd|system32'; then
      add_finding "Critical" "Upload" "Path traversal en nombre de archivo" \
        "Nombre malicioso '${tname}' pudo haber escrito fuera del directorio." \
        "Sanitizar filename con filepath.Base; almacenar con UUID." \
        "OWASP A01" "$trav_body"
    fi
  done

  rm -f "$tmp_small"
  add_finding "Info" "Upload" "Path traversal — sin evidencia de escritura externa" \
    "Nombres con ../ no mostraron rutas del sistema en respuesta." \
    "Revisar almacenamiento en disco manualmente si es crítico." \
    "OWASP A01" ""

  write_module_result "upload" "completed" "Upload checks done"
}
