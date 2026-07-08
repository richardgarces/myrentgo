#!/usr/bin/env bash
# Static analysis — gosec, optional semgrep.

run_static() {
  log_step "Análisis estático (gosec, semgrep)"

  mkdir -p "${REPORT_DIR}/raw"

  local gosec_bin="${GOSEC_BIN:-}"
  [[ -z "$gosec_bin" ]] && have_cmd gosec && gosec_bin="gosec"

  if [[ -n "$gosec_bin" ]] && [[ -d "${PROJECT_ROOT}/backend" ]]; then
    log_info "Ejecutando gosec..."
    (cd "${PROJECT_ROOT}/backend" && \
      $gosec_bin -fmt json -out "${REPORT_DIR}/raw/gosec.json" -quiet ./... \
      2>"${REPORT_DIR}/raw/gosec.log") || true

    if [[ -f "${REPORT_DIR}/raw/gosec.json" ]] && have_cmd jq; then
      local issues high medium
      issues=$(jq '.Issues | length' "${REPORT_DIR}/raw/gosec.json" 2>/dev/null || echo 0)
      high=$(jq '[.Issues[] | select(.severity == "HIGH")] | length' "${REPORT_DIR}/raw/gosec.json" 2>/dev/null || echo 0)
      medium=$(jq '[.Issues[] | select(.severity == "MEDIUM")] | length' "${REPORT_DIR}/raw/gosec.json" 2>/dev/null || echo 0)

      if [[ "$high" -gt 0 ]]; then
        local sample
        sample=$(jq -r '.Issues[] | select(.severity=="HIGH") | "\(.file):\(.line) \(.rule_id) \(.details)"' \
          "${REPORT_DIR}/raw/gosec.json" 2>/dev/null | head -5)
        add_finding "High" "Static" "gosec: hallazgos HIGH" \
          "${high} HIGH, ${medium} MEDIUM de ${issues} total." \
          "Corregir issues HIGH; ver raw/gosec.json." \
          "OWASP A04" "$sample"
      elif [[ "$medium" -gt 0 ]]; then
        add_finding "Medium" "Static" "gosec: hallazgos MEDIUM" \
          "${medium} MEDIUM de ${issues} total." \
          "Revisar raw/gosec.json." \
          "OWASP A04" ""
      elif [[ "$issues" -gt 0 ]]; then
        add_finding "Low" "Static" "gosec: hallazgos menores" \
          "${issues} issues (LOW/INFO)." \
          "" "OWASP A04" ""
      else
        add_finding "Info" "Static" "gosec: sin hallazgos" \
          "Análisis gosec completado sin issues." \
          "" "OWASP A04" ""
      fi
    elif [[ -f "${REPORT_DIR}/raw/gosec.json" ]]; then
      add_finding "Info" "Static" "gosec completado" \
        "Ver raw/gosec.json (instalar jq para resumen)." \
        "" "OWASP A04" ""
    fi
  else
    log_warn "gosec no disponible"
    add_finding "Info" "Static" "gosec omitido" \
      "Instalar: go install github.com/securego/gosec/v2/cmd/gosec@latest" \
      "" "OWASP A04" ""
  fi

  local semgrep_bin="${SEMGREP_BIN:-}"
  [[ -z "$semgrep_bin" ]] && have_cmd semgrep && semgrep_bin="semgrep"

  if [[ -n "$semgrep_bin" ]]; then
    local semgrep_config="${PROJECT_ROOT}/security/semgrep.yml"
    local semgrep_args=(scan --json -o "${REPORT_DIR}/raw/semgrep.json")
    if [[ -f "$semgrep_config" ]]; then
      log_info "Ejecutando semgrep (security/semgrep.yml)..."
      semgrep_args+=(--config "$semgrep_config")
    else
      log_info "Ejecutando semgrep (auto)..."
      semgrep_args+=(--config auto)
    fi
    semgrep_args+=("${PROJECT_ROOT}/backend" "${PROJECT_ROOT}/frontend/src")
    $semgrep_bin "${semgrep_args[@]}" 2>"${REPORT_DIR}/raw/semgrep.log" || true

    if [[ -f "${REPORT_DIR}/raw/semgrep.json" ]] && have_cmd jq; then
      local semgrep_count
      semgrep_count=$(jq '.results | length' "${REPORT_DIR}/raw/semgrep.json" 2>/dev/null || echo 0)
      if [[ "$semgrep_count" -gt 0 ]]; then
        add_finding "Medium" "Static" "semgrep: hallazgos" \
          "${semgrep_count} reglas activadas. Ver raw/semgrep.json." \
          "Priorizar ERROR y WARNING." \
          "OWASP A04" ""
      else
        add_finding "Info" "Static" "semgrep: sin hallazgos" \
          "" "" "OWASP A04" ""
      fi
    fi
  else
    add_finding "Info" "Static" "semgrep omitido (opcional)" \
      "Instalar: pip install semgrep  o  brew install semgrep" \
      "" "OWASP A04" ""
  fi

  write_module_result "static" "completed" "Static analysis done"
}
