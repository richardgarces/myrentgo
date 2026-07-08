#!/usr/bin/env bash
# Secrets scanning — gitleaks, trufflehog, or safe grep fallback.

run_secrets() {
  log_step "Escaneo de secretos en repositorio"

  mkdir -p "${REPORT_DIR}/raw"
  local found=false

  local gitleaks_bin="${GITLEAKS_BIN:-}"
  [[ -z "$gitleaks_bin" ]] && have_cmd gitleaks && gitleaks_bin="gitleaks"

  if [[ -n "$gitleaks_bin" ]]; then
    log_info "Ejecutando gitleaks..."
    if $gitleaks_bin detect --source "${PROJECT_ROOT}" --no-git -r "${REPORT_DIR}/raw/gitleaks.json" 2>"${REPORT_DIR}/raw/gitleaks.log"; then
      add_finding "Info" "Secrets" "gitleaks: sin secretos detectados" \
        "Escaneo gitleaks completado sin hallazgos." \
        "" "OWASP A02" ""
    else
      found=true
      local count=0
      have_cmd jq && count=$(jq 'length' "${REPORT_DIR}/raw/gitleaks.json" 2>/dev/null || echo 0)
      add_finding "High" "Secrets" "gitleaks: posibles secretos en repo" \
        "gitleaks reportó ${count} hallazgo(s). Revisar raw/gitleaks.json." \
        "Rotar credenciales expuestas; usar .env y .gitignore; nunca commitear secretos." \
        "OWASP A02" "Ver ${REPORT_DIR}/raw/gitleaks.json"
    fi
  fi

  local trufflehog_bin="${TRUFFLEHOG_BIN:-}"
  [[ -z "$trufflehog_bin" ]] && have_cmd trufflehog && trufflehog_bin="trufflehog"

  if [[ -n "$trufflehog_bin" ]] && ! $found; then
    log_info "Ejecutando trufflehog (filesystem)..."
    if $trufflehog_bin filesystem "${PROJECT_ROOT}" --json --no-update >"${REPORT_DIR}/raw/trufflehog.json" 2>"${REPORT_DIR}/raw/trufflehog.log"; then
      if [[ -s "${REPORT_DIR}/raw/trufflehog.json" ]]; then
        found=true
        add_finding "High" "Secrets" "trufflehog: posibles secretos" \
          "Revisar raw/trufflehog.json." \
          "Eliminar secretos del historial si fueron commiteados." \
          "OWASP A02" ""
      else
        add_finding "Info" "Secrets" "trufflehog: sin hallazgos" \
          "" "" "OWASP A02" ""
      fi
    fi
  fi

  # Safe grep fallback (excludes .env from committed files check via git)
  if [[ -z "$gitleaks_bin" && -z "$trufflehog_bin" ]]; then
    log_warn "gitleaks/trufflehog no instalados — usando grep seguro"
  fi

  local patterns=(
    'JWT_SECRET\s*=\s*[^C][^H][^A]'
    'sk_live_[0-9a-zA-Z]{20,}'
    'AKIA[0-9A-Z]{16}'
  )

  local grep_hits=""
  for pat in "${patterns[@]}"; do
    local hits
    hits=$(grep -rniE "$pat" "${PROJECT_ROOT}" \
      --exclude-dir=node_modules \
      --exclude-dir=.git \
      --exclude-dir=mailcow \
      --exclude-dir=security/reports \
      --exclude='*.lock' \
      --exclude='*.md' \
      --exclude='config.env' \
      --exclude='.env' \
      --exclude='config.env.example' \
      --exclude='.env.example' \
      2>/dev/null | grep -vE 'CHANGE-ME|dev-secret-change-in-production|example|TEST_PASSWORD|admin123' | head -20 || true)
    if [[ -n "$hits" ]]; then
      grep_hits+="${hits}"$'\n'
    fi
  done

  echo "$grep_hits" >"${REPORT_DIR}/raw/grep_secrets.txt"

  if [[ -n "$grep_hits" ]]; then
    found=true
    add_finding "Medium" "Secrets" "Patrones sensibles en código (grep)" \
      "Se encontraron coincidencias con patrones de secretos. Pueden ser falsos positivos (ej. .env.example)." \
      "Revisar raw/grep_secrets.txt; instalar gitleaks para análisis preciso." \
      "OWASP A02" "$(echo "$grep_hits" | head -5)"
  elif [[ -z "$gitleaks_bin" ]]; then
    add_finding "Info" "Secrets" "Grep: sin patrones obvios" \
      "Escaneo básico sin hallazgos críticos. Instalar gitleaks recomendado." \
      "brew install gitleaks  o  go install github.com/gitleaks/gitleaks/v8@latest" \
      "OWASP A02" ""
  fi

  # Check .env not tracked
  if git -C "${PROJECT_ROOT}" ls-files --error-unmatch .env &>/dev/null; then
    add_finding "Critical" "Secrets" ".env trackeado en Git" \
      "El archivo .env está versionado — riesgo de filtración de credenciales." \
      "Añadir .env a .gitignore y rotar secretos." \
      "OWASP A02" "git ls-files .env"
  else
    add_finding "Info" "Secrets" ".env no versionado" \
      ".env no está en el índice de Git (correcto)." \
      "" "OWASP A02" ""
  fi

  write_module_result "secrets" "completed" "Secrets scan done"
}
