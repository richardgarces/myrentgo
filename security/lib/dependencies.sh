#!/usr/bin/env bash
# Dependency vulnerability scanning.

run_dependencies() {
  log_step "Dependencias (govulncheck, npm audit)"

  mkdir -p "${REPORT_DIR}/raw"

  # Go — govulncheck
  local govuln_bin="${GOVULNCHECK_BIN:-}"
  [[ -z "$govuln_bin" ]] && have_cmd govulncheck && govuln_bin="govulncheck"

  if [[ -n "$govuln_bin" ]] && [[ -d "${PROJECT_ROOT}/backend" ]]; then
    log_info "Ejecutando govulncheck..."
    if (cd "${PROJECT_ROOT}/backend" && $govuln_bin ./... >"${REPORT_DIR}/raw/govulncheck.txt" 2>&1); then
      add_finding "Info" "Dependencies" "govulncheck: sin vulnerabilidades conocidas" \
        "No se reportaron CVEs en dependencias Go." \
        "Ejecutar govulncheck en CI periódicamente." \
        "OWASP A06" ""
    else
      local vuln_summary
      vuln_summary=$(grep -E 'Vulnerability|GO-' "${REPORT_DIR}/raw/govulncheck.txt" | head -10 || true)
      add_finding "High" "Dependencies" "govulncheck: vulnerabilidades en Go" \
        "Se encontraron vulnerabilidades en módulos Go." \
        "Actualizar dependencias afectadas; ver raw/govulncheck.txt." \
        "OWASP A06" "$vuln_summary"
    fi
  else
    log_warn "govulncheck no disponible"
    add_finding "Info" "Dependencies" "govulncheck omitido" \
      "Instalar: go install golang.org/x/vuln/cmd/govulncheck@latest" \
      "" "OWASP A06" ""
  fi

  # npm audit
  if [[ -d "${PROJECT_ROOT}/frontend/package.json" || -f "${PROJECT_ROOT}/frontend/package.json" ]]; then
    if have_cmd npm; then
      log_info "Ejecutando npm audit..."
      (cd "${PROJECT_ROOT}/frontend" && npm audit --json >"${REPORT_DIR}/raw/npm_audit.json" 2>/dev/null) || true

      if [[ -f "${REPORT_DIR}/raw/npm_audit.json" ]] && have_cmd jq; then
        local critical high moderate
        critical=$(jq '.metadata.vulnerabilities.critical // 0' "${REPORT_DIR}/raw/npm_audit.json" 2>/dev/null || echo 0)
        high=$(jq '.metadata.vulnerabilities.high // 0' "${REPORT_DIR}/raw/npm_audit.json" 2>/dev/null || echo 0)
        moderate=$(jq '.metadata.vulnerabilities.moderate // 0' "${REPORT_DIR}/raw/npm_audit.json" 2>/dev/null || echo 0)

        if [[ "$critical" -gt 0 || "$high" -gt 0 ]]; then
          add_finding "High" "Dependencies" "npm audit: vulnerabilidades críticas/altas" \
            "critical=${critical}, high=${high}, moderate=${moderate}" \
            "npm audit fix; revisar advisories antes de actualizar major versions." \
            "OWASP A06" "Ver raw/npm_audit.json"
        elif [[ "$moderate" -gt 0 ]]; then
          add_finding "Medium" "Dependencies" "npm audit: vulnerabilidades moderadas" \
            "moderate=${moderate}" \
            "Planificar actualización de dependencias." \
            "OWASP A06" ""
        else
          add_finding "Info" "Dependencies" "npm audit: sin vulnerabilidades altas" \
            "npm audit no reportó critical/high." \
            "" "OWASP A06" ""
        fi
      else
        (cd "${PROJECT_ROOT}/frontend" && npm audit >"${REPORT_DIR}/raw/npm_audit.txt" 2>&1) || true
        if grep -qiE 'critical|high' "${REPORT_DIR}/raw/npm_audit.txt" 2>/dev/null; then
          add_finding "Medium" "Dependencies" "npm audit: revisar hallazgos" \
            "Ver raw/npm_audit.txt" \
            "npm audit fix" \
            "OWASP A06" ""
        else
          add_finding "Info" "Dependencies" "npm audit completado" \
            "Ver raw/npm_audit.txt para detalle." \
            "" "OWASP A06" ""
        fi
      fi
    else
      add_finding "Info" "Dependencies" "npm no disponible" \
        "No se pudo ejecutar npm audit." \
        "" "OWASP A06" ""
    fi
  fi

  write_module_result "dependencies" "completed" "Dependency scan done"
}
