#!/usr/bin/env bash
#
# Regenera INFORME.html desde findings.json y summary.json existentes.
#
# Uso:
#   ./security/regenerate-report-html.sh
#   ./security/regenerate-report-html.sh security/reports/2026-07-05_22-02-11

set -euo pipefail

SECURITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${1:-${SECURITY_DIR}/reports/latest}"

if [[ ! -f "${REPORT_DIR}/findings.json" ]]; then
  echo "Error: no se encontró ${REPORT_DIR}/findings.json" >&2
  exit 1
fi

# shellcheck source=lib/common.sh
source "${SECURITY_DIR}/lib/common.sh"
# shellcheck source=lib/report.sh
source "${SECURITY_DIR}/lib/report.sh"

export REPORT_DIR
export SECURITY_DIR

summary_file="${REPORT_DIR}/summary.json"
findings_file="${REPORT_DIR}/findings.json"

if [[ ! -f "$summary_file" ]] && have_cmd jq; then
  log_warn "summary.json no encontrado — generando desde findings.json"
  crit=$(jq '[.[] | select(.severity == "Critical")] | length' "$findings_file")
  high=$(jq '[.[] | select(.severity == "High")] | length' "$findings_file")
  med=$(jq '[.[] | select(.severity == "Medium")] | length' "$findings_file")
  low=$(jq '[.[] | select(.severity == "Low")] | length' "$findings_file")
  info=$(jq '[.[] | select(.severity == "Info")] | length' "$findings_file")
  total=$(jq 'length' "$findings_file")
  jq -n \
    --arg ts "$(iso_now)" \
    --argjson critical "$crit" \
    --argjson high "$high" \
    --argjson medium "$med" \
    --argjson low "$low" \
    --argjson info "$info" \
    --argjson total "$total" \
    '{
      generated_at: $ts,
      scanner: "MyRent Go Security Toolkit",
      version: "1.0.0",
      scope: "localhost MyRent Go only",
      targets: { api: "—", frontend: "—", api_status: "—", frontend_status: "—" },
      counts: { critical: $critical, high: $high, medium: $medium, low: $low, info: $info, total: $total },
      duration_seconds: 0
    }' >"$summary_file"
fi

generate_informe_html "$summary_file" "$findings_file"

# Actualizar enlace en INFORME.md si existe
informe_md="${REPORT_DIR}/INFORME.md"
if [[ -f "$informe_md" ]] && ! grep -q 'INFORME.html' "$informe_md"; then
  tmp="${informe_md}.tmp"
  {
    head -n 1 "$informe_md"
    echo ""
    echo "> **Versión HTML:** [INFORME.html](INFORME.html) — informe interactivo con gráficos y tabla de hallazgos."
    echo ""
    tail -n +2 "$informe_md"
  } >"$tmp"
  mv "$tmp" "$informe_md"
fi

echo ""
log_info "Listo: ${REPORT_DIR}/INFORME.html"
