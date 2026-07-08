#!/usr/bin/env bash
#
# MyRent Go — ejecutar tests unitarios (Go + Vitest) y E2E (Playwright)
# Uso: ./scripts/run-tests.sh [all|unit|e2e|backend|frontend-unit]
#      SKIP_PAUSE=1 ./scripts/run-tests.sh all
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

API_PORT="${MYRENT_API_PORT:-7070}"
FRONTEND_PORT="${MYRENT_FRONTEND_PORT:-4000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

# Per-suite results: name status detail
declare -a TEST_SUITE_NAMES=()
declare -a TEST_SUITE_STATUS=()
declare -a TEST_SUITE_DETAIL=()

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "Comando requerido no encontrado: $1"
    return 1
  fi
}

port_in_use() {
  lsof -i ":$1" -sTCP:LISTEN -t &>/dev/null
}

api_healthy() {
  curl -sf "http://localhost:${API_PORT}/health" &>/dev/null
}

frontend_healthy() {
  curl -sf "http://localhost:${FRONTEND_PORT}/" &>/dev/null
}

record_suite() {
  TEST_SUITE_NAMES+=("$1")
  TEST_SUITE_STATUS+=("$2")
  TEST_SUITE_DETAIL+=("$3")
}

tests_header() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║         MyRent Go — Test Runner          ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

run_backend_tests() {
  echo ""
  echo -e "${BOLD}── Backend (go test) ──${NC}"
  require_cmd go || {
    record_suite "Backend (go test)" "skip" "go no instalado"
    return 1
  }

  local log_file="${ROOT_DIR}/.myrent/logs/backend-test.log"
  mkdir -p "$(dirname "$log_file")"

  set +e
  (
    cd "${ROOT_DIR}/backend"
    go test ./... -count=1 -v 2>&1 | tee "$log_file"
  )
  local rc=${PIPESTATUS[0]}
  set -e

  local ok_count fail_count
  ok_count=$(grep -cE '^ok[[:space:]]' "$log_file" 2>/dev/null || true)
  fail_count=$(grep -cE '^(FAIL|--- FAIL:)' "$log_file" 2>/dev/null || true)
  ok_count="${ok_count:-0}"
  fail_count="${fail_count:-0}"

  if [[ "$rc" -eq 0 ]]; then
    info "Backend: PASS (${ok_count} paquetes OK)"
    record_suite "Backend (go test)" "pass" "${ok_count} paquetes OK — log: ${log_file}"
    return 0
  fi

  error "Backend: FAIL (${fail_count} fallos detectados)"
  record_suite "Backend (go test)" "fail" "${ok_count} OK, ${fail_count} fallos — log: ${log_file}"
  return 1
}

run_frontend_unit_tests() {
  echo ""
  echo -e "${BOLD}── Frontend unitarios (Vitest) ──${NC}"
  require_cmd npm || {
    record_suite "Frontend (Vitest)" "skip" "npm no instalado"
    return 1
  }

  if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
    warn "node_modules no encontrado — ejecuta: ./myrent.sh install"
    record_suite "Frontend (Vitest)" "skip" "sin node_modules"
    return 1
  fi

  local log_file="${ROOT_DIR}/.myrent/logs/frontend-unit-test.log"
  mkdir -p "$(dirname "$log_file")"

  set +e
  (
    cd "${ROOT_DIR}/frontend"
    npm run test:unit 2>&1 | tee "$log_file"
  )
  local rc=${PIPESTATUS[0]}
  set -e

  local files_line tests_line
  files_line=$(grep -E 'Test Files' "$log_file" 2>/dev/null | tail -1 || true)
  tests_line=$(grep -E '^\s+Tests' "$log_file" 2>/dev/null | tail -1 || true)
  local summary="${tests_line:-${files_line:-ver log}}"

  if [[ "$rc" -eq 0 ]]; then
    info "Frontend unitarios: PASS"
    [[ -n "$summary" ]] && echo "  ${summary}"
    record_suite "Frontend (Vitest)" "pass" "${summary} — log: ${log_file}"
    return 0
  fi

  error "Frontend unitarios: FAIL"
  [[ -n "$summary" ]] && echo "  ${summary}"
  record_suite "Frontend (Vitest)" "fail" "${summary} — log: ${log_file}"
  return 1
}

run_e2e_tests() {
  echo ""
  echo -e "${BOLD}── E2E (Playwright) ──${NC}"
  require_cmd npm || {
    record_suite "E2E (Playwright)" "skip" "npm no instalado"
    return 1
  }

  if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
    warn "node_modules no encontrado — ejecuta: ./myrent.sh install"
    record_suite "E2E (Playwright)" "skip" "sin node_modules"
    return 1
  fi

  local api_up=false frontend_up=false
  api_healthy && api_up=true
  frontend_healthy && frontend_up=true

  if $api_up; then
    info "API detectada en http://localhost:${API_PORT}/health"
  else
    warn "API no responde en puerto ${API_PORT} — E2E puede fallar o Playwright intentará iniciarla"
    echo "  Levanta con: ./myrent.sh api  o  menú «Base de datos y servicios» → Solo API"
  fi

  if $frontend_up; then
    info "Frontend detectado en http://localhost:${FRONTEND_PORT}"
  else
    warn "Frontend no responde en puerto ${FRONTEND_PORT} — E2E puede fallar o Playwright intentará iniciarlo"
    echo "  Levanta con: ./myrent.sh frontend  o  ./myrent.sh start"
  fi

  if ! port_in_use 27017; then
    warn "MongoDB no detectado en puerto 27017 — E2E requiere base de datos"
    echo "  Levanta con: docker compose up -d mongodb  o  menú «Base de datos y servicios» → Solo MongoDB"
  fi

  local e2e_env=()
  if $api_up && $frontend_up; then
    e2e_env+=(E2E_SKIP_WEBSERVER=1)
    info "Reutilizando servidores en ejecución (E2E_SKIP_WEBSERVER=1)"
  fi

  local log_file="${ROOT_DIR}/.myrent/logs/e2e-test.log"
  local results_dir="${ROOT_DIR}/frontend/test-results"
  mkdir -p "$(dirname "$log_file")"

  set +e
  (
    cd "${ROOT_DIR}/frontend"
    export E2E_BASE_URL="http://localhost:${FRONTEND_PORT}"
    export E2E_API_URL="http://localhost:${API_PORT}"
    if [[ ${#e2e_env[@]} -gt 0 ]]; then
      env "${e2e_env[@]}" npm run test:e2e 2>&1 | tee "$log_file"
    else
      npm run test:e2e 2>&1 | tee "$log_file"
    fi
  )
  local rc=${PIPESTATUS[0]}
  set -e

  local summary
  summary=$(grep -E '[0-9]+ passed' "$log_file" 2>/dev/null | tail -1 || true)
  if [[ -z "$summary" ]]; then
    summary=$(grep -E 'failed|passed' "$log_file" 2>/dev/null | tail -3 | tr '\n' ' ' || true)
  fi
  summary="${summary:-ver log}"

  local report_hint="resultados: ${results_dir}/"
  if [[ -d "${ROOT_DIR}/frontend/playwright-report" ]]; then
    report_hint="informe: frontend/playwright-report/  |  ${report_hint}"
  fi

  if [[ "$rc" -eq 0 ]]; then
    info "E2E: PASS"
    echo "  ${summary}"
    record_suite "E2E (Playwright)" "pass" "${summary} — ${report_hint}"
    return 0
  fi

  error "E2E: FAIL"
  echo "  ${summary}"
  record_suite "E2E (Playwright)" "fail" "${summary} — ${report_hint}"
  return 1
}

print_test_summary() {
  echo ""
  echo -e "${CYAN}${BOLD}  ══════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}    Resumen de tests${NC}"
  echo -e "${CYAN}${BOLD}  ══════════════════════════════════════════${NC}"
  echo ""

  local any_fail=false any_skip=false
  local i name status detail color icon

  for i in "${!TEST_SUITE_NAMES[@]}"; do
    name="${TEST_SUITE_NAMES[$i]}"
    status="${TEST_SUITE_STATUS[$i]}"
    detail="${TEST_SUITE_DETAIL[$i]}"

    case "$status" in
      pass)
        color="$GREEN"
        icon="✓"
        ;;
      fail)
        color="$RED"
        icon="✗"
        any_fail=true
        ;;
      skip)
        color="$YELLOW"
        icon="○"
        any_skip=true
        ;;
      *)
        color="$NC"
        icon="?"
        ;;
    esac

    printf "  ${color}${icon}${NC} %-22s %s\n" "$name" "$detail"
  done

  echo ""
  echo -e "${CYAN}${BOLD}  ──────────────────────────────────────────${NC}"

  if [[ ${#TEST_SUITE_NAMES[@]} -eq 0 ]]; then
    warn "No se ejecutó ninguna suite"
  elif $any_fail; then
    error "Resultado global: ALGUNOS TESTS FALLARON"
  elif $any_skip; then
    warn "Resultado global: COMPLETADO CON ADVERTENCIAS (suites omitidas)"
  else
    info "Resultado global: TODOS LOS TESTS PASARON"
  fi

  echo ""
  echo "  Documentación: docs/TESTING.md"
  echo ""
}

run_unit_tests() {
  local rc=0
  run_backend_tests || rc=1
  run_frontend_unit_tests || rc=1
  print_test_summary
  return "$rc"
}

run_all_tests() {
  local rc=0
  run_backend_tests || rc=1
  run_frontend_unit_tests || rc=1
  run_e2e_tests || rc=1
  print_test_summary
  return "$rc"
}

run_tests_mode() {
  local mode="${1:-all}"
  TEST_SUITE_NAMES=()
  TEST_SUITE_STATUS=()
  TEST_SUITE_DETAIL=()

  tests_header
  echo -e "  Modo: ${BOLD}${mode}${NC}"
  echo -e "  API: http://localhost:${API_PORT}  |  Frontend: http://localhost:${FRONTEND_PORT}"

  local rc=0
  case "$mode" in
    all)
      run_all_tests || rc=1
      ;;
    unit)
      run_unit_tests || rc=1
      ;;
    e2e)
      run_e2e_tests || rc=1
      print_test_summary
      ;;
    backend)
      run_backend_tests || rc=1
      print_test_summary
      ;;
    frontend-unit|frontend)
      run_frontend_unit_tests || rc=1
      print_test_summary
      ;;
    *)
      error "Modo desconocido: $mode"
      echo ""
      echo "  Uso: $0 [all|unit|e2e|backend|frontend-unit]"
      return 1
      ;;
  esac

  return "$rc"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set +e
  run_tests_mode "${1:-all}"
  exit $?
fi
