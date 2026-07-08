#!/usr/bin/env bash
# Docker Compose security basics.

run_docker() {
  log_step "Docker Compose — revisión de seguridad"

  local compose_file="${PROJECT_ROOT}/docker-compose.yml"
  mkdir -p "${REPORT_DIR}/raw"

  if [[ ! -f "$compose_file" ]]; then
    log_skip "docker-compose.yml no encontrado"
    write_module_result "docker" "skipped" "No compose file"
    return 0
  fi

  cp "$compose_file" "${REPORT_DIR}/raw/docker-compose.snapshot.yml"

  if have_cmd docker; then
    docker compose -f "$compose_file" config >"${REPORT_DIR}/raw/docker-compose.resolved.yml" 2>/dev/null || true
  fi

  # Check for hardcoded secrets in compose
  if grep -qiE 'JWT_SECRET:\s*dev-secret|password:\s*admin' "$compose_file"; then
    add_finding "Medium" "Docker" "Secretos por defecto en docker-compose.yml" \
      "JWT_SECRET o credenciales de desarrollo hardcodeadas en compose." \
      "Usar variables de entorno desde .env; valores fuertes en producción." \
      "OWASP A02" "$(grep -E 'JWT_SECRET|PASSWORD' "$compose_file" | head -3)"
  fi

  # MongoDB without auth on exposed port (dev compose only; prod uses docker-compose.prod.yml)
  if grep -q '27017:27017' "$compose_file" && ! grep -qi 'MONGO_INITDB_ROOT' "$compose_file"; then
    local mongo_sev="Medium"
    local mongo_desc="Puerto 27017 publicado sin credenciales en compose."
    if grep -qiE 'APP_ENV:\s*development|# Development stack|DEV_ONLY_MONGO' "$compose_file"; then
      mongo_sev="Info"
      mongo_desc="Puerto 27017 sin auth — intencional en compose de desarrollo (localhost). docker-compose.prod.yml no publica el puerto."
    else
      mongo_desc="${mongo_desc} — revisar si es entorno de desarrollo."
    fi
    add_finding "$mongo_sev" "Docker" "MongoDB expuesto sin autenticación (dev)" \
      "$mongo_desc" \
      "En producción: no exponer MongoDB; usar auth y red interna (ver docker-compose.prod.yml)." \
      "OWASP A05" "ports: 27017:27017"
  fi

  # Privileged / host network
  if grep -qiE 'privileged:\s*true|network_mode:\s*host' "$compose_file"; then
    add_finding "High" "Docker" "Contenedor privilegiado o host network" \
      "Configuración de alto riesgo detectada en compose." \
      "Evitar privileged y host network salvo necesidad extrema." \
      "OWASP A05" ""
  fi

  # Running as root check in Dockerfiles
  for df in "${PROJECT_ROOT}/backend/Dockerfile" "${PROJECT_ROOT}/frontend/Dockerfile"; do
    if [[ -f "$df" ]]; then
      if grep -qiE 'USER\s+[a-z0-9_-]+|nginxinc/nginx-unprivileged|nginx-unprivileged' "$df"; then
        continue
      fi
      add_finding "Low" "Docker" "Dockerfile sin usuario no-root ($(basename "$df"))" \
        "El contenedor podría ejecutarse como root." \
        "Añadir USER no privilegiado en etapa final o usar imagen nginx-unprivileged." \
        "OWASP A05" "$df"
    fi
  done

  add_finding "Info" "Docker" "Revisión docker-compose completada" \
    "Snapshot guardado en raw/docker-compose.snapshot.yml" \
    "Comparar con docker-compose.prod.yml en despliegues." \
    "OWASP A05" ""

  write_module_result "docker" "completed" "Docker review done"
}
