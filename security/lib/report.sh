#!/usr/bin/env bash
# Report generation — JSON aggregate + Spanish executive INFORME.md

generate_reports() {
  log_step "Generando informes"

  local findings_json="${REPORT_DIR}/findings.json"
  local summary_json="${REPORT_DIR}/summary.json"

  if [[ -f "${FINDINGS_FILE}" ]]; then
    if have_cmd jq; then
      jq -s '.' "${FINDINGS_FILE}" >"$findings_json"
    else
      cp "${FINDINGS_FILE}" "$findings_json"
    fi
  else
    echo '[]' >"$findings_json"
  fi

  local crit high med low info total
  crit=$(count_findings_by_severity "Critical")
  high=$(count_findings_by_severity "High")
  med=$(count_findings_by_severity "Medium")
  low=$(count_findings_by_severity "Low")
  info=$(count_findings_by_severity "Info")
  total=$((crit + high + med + low + info))

  local api_status="down"
  api_reachable && api_status="up"
  local fe_status="down"
  frontend_reachable && fe_status="up"

  local duration_sec=0
  if [[ -n "${START_TIME:-}" ]]; then
    duration_sec=$(($(date +%s) - START_TIME))
  fi

  if have_cmd jq; then
    jq -n \
      --arg ts "$(iso_now)" \
      --arg scanner "${SCANNER_NAME:-MyRent Go Security Toolkit}" \
      --arg version "${SCANNER_VERSION:-1.0.0}" \
      --arg api "$api_status" \
      --arg fe "$fe_status" \
      --arg api_url "${TARGET_API}" \
      --arg fe_url "${TARGET_FRONTEND}" \
      --argjson critical "$crit" \
      --argjson high "$high" \
      --argjson medium "$med" \
      --argjson low "$low" \
      --argjson info "$info" \
      --argjson total "$total" \
      --argjson duration_seconds "$duration_sec" \
      '{
        generated_at: $ts,
        scanner: $scanner,
        version: $version,
        scope: "localhost MyRent Go only",
        targets: { api: $api_url, frontend: $fe_url, api_status: $api, frontend_status: $fe },
        counts: { critical: $critical, high: $high, medium: $medium, low: $low, info: $info, total: $total },
        duration_seconds: $duration_seconds
      }' >"$summary_json"
  else
    printf '{"generated_at":"%s","total":%s,"duration_seconds":%s}\n' "$(iso_now)" "$total" "$duration_sec" >"$summary_json"
  fi

  generate_informe_md "$summary_json" "$findings_json"
  generate_informe_html "$summary_json" "$findings_json"
  sync_latest_report
}

generate_informe_md() {
  local summary_file="$1"
  local findings_file="$2"
  local informe="${REPORT_DIR}/INFORME.md"

  local crit high med low info total gen_ts
  if have_cmd jq; then
    crit=$(jq -r '.counts.critical' "$summary_file")
    high=$(jq -r '.counts.high' "$summary_file")
    med=$(jq -r '.counts.medium' "$summary_file")
    low=$(jq -r '.counts.low' "$summary_file")
    info=$(jq -r '.counts.info' "$summary_file")
    total=$(jq -r '.counts.total' "$summary_file")
    gen_ts=$(jq -r '.generated_at' "$summary_file")
  else
    crit=0; high=0; med=0; low=0; info=0; total=0
    gen_ts="$(iso_now)"
  fi

  local risk="BAJO"
  [[ "$crit" -gt 0 ]] && risk="CRÍTICO"
  [[ "$crit" -eq 0 && "$high" -gt 0 ]] && risk="ALTO"
  [[ "$crit" -eq 0 && "$high" -eq 0 && "$med" -gt 0 ]] && risk="MEDIO"

  cat >"$informe" <<EOF
# Informe Ejecutivo de Seguridad — MyRent Go

> **Versión HTML:** [INFORME.html](INFORME.html) — informe interactivo con gráficos y tabla de hallazgos.

| Campo | Valor |
|-------|-------|
| **Fecha** | ${gen_ts} |
| **Herramienta** | ${SCANNER_NAME:-MyRent Go Security Toolkit} v${SCANNER_VERSION:-1.0.0} |
| **Alcance** | Aplicación local propia (API: ${TARGET_API}, Frontend: ${TARGET_FRONTEND}) |
| **Nivel de riesgo global** | **${risk}** |

## Resumen ejecutivo

Se realizó una evaluación de seguridad **no destructiva** sobre el entorno de desarrollo local de MyRent Go, alineada con buenas prácticas de ethical hacking (2024–2026): reconocimiento, headers, autenticación/JWT, OWASP API Top 10, inyección NoSQL, CORS, subida de archivos, secretos, dependencias, análisis estático y Docker.

| Severidad | Cantidad |
|-----------|----------|
| Crítica | ${crit} |
| Alta | ${high} |
| Media | ${med} |
| Baja | ${low} |
| Informativa | ${info} |
| **Total** | **${total}** |

> **Nota:** Este informe es orientativo para desarrollo local. No sustituye una auditoría profesional ni pruebas en staging/producción con TLS y hardening completo.

## Hallazgos por severidad

EOF

  local severities=("Critical:Crítica" "High:Alta" "Medium:Media" "Low:Baja" "Info:Informativa")
  local pair sev label
  for pair in "${severities[@]}"; do
    sev="${pair%%:*}"
    label="${pair##*:}"
    echo "### ${label}" >>"$informe"
    echo "" >>"$informe"

    if have_cmd jq; then
      local count
      count=$(jq --arg s "$sev" '[.[] | select(.severity == $s)] | length' "$findings_file" 2>/dev/null || echo 0)
      if [[ "$count" -eq 0 ]]; then
        echo "_Sin hallazgos en esta categoría._" >>"$informe"
        echo "" >>"$informe"
        continue
      fi
      jq -r --arg s "$sev" '
        .[] | select(.severity == $s) |
        "#### \(.title)\n\n" +
        "- **Categoría:** \(.category)\n" +
        "- **OWASP:** \(.owasp // "—")\n" +
        "- **Descripción:** \(.description)\n" +
        "- **Remediación:** \(.remediation // "—")\n" +
        (if .evidence != "" then "- **Evidencia:** `\(.evidence | gsub("\n"; " "))`\n" else "" end) +
        "\n"
      ' "$findings_file" >>"$informe" 2>/dev/null || echo "_Error al formatear hallazgos._" >>"$informe"
    else
      echo "_Instalar jq para detalle por hallazgo._" >>"$informe"
    fi
    echo "" >>"$informe"
  done

  cat >>"$informe" <<EOF
## Mapeo OWASP

| Área probada | Referencia |
|--------------|------------|
| Autenticación / JWT | OWASP API2 — Broken Authentication |
| IDOR / BOLA | OWASP API1 — Broken Object Level Authorization |
| Mass assignment | OWASP API3 — Broken Object Property Level Authorization |
| Rate limiting | OWASP API4 — Unrestricted Resource Consumption |
| Control de acceso | OWASP API5 — Broken Function Level Authorization |
| Errores verbosos / config | OWASP API8 — Security Misconfiguration |
| Inyección NoSQL | OWASP A03 — Injection |
| Secretos | OWASP A02 — Cryptographic Failures / Sensitive Data |
| Dependencias | OWASP A06 — Vulnerable Components |
| Docker / infra | OWASP A05 — Security Misconfiguration |
| Headers | OWASP ASVS V14 — HTTP Security Headers |

## Recomendaciones prioritarias

1. **Críticas/Altas:** Atender de inmediato antes de exponer a internet.
2. **Medias:** Planificar en el próximo sprint de hardening.
3. **Producción:** Habilitar TLS, HSTS, JWT_SECRET fuerte, MongoDB con auth, CORS estricto, \`METRICS_PROTECTED=true\`.
4. **CI/CD:** Integrar \`gosec\`, \`govulncheck\`, \`gitleaks\` y \`npm audit\` en pipeline.

## Artefactos

- \`INFORME.html\` — Informe visual (tema oscuro, tabla y gráficos)
- \`findings.json\` — Hallazgos estructurados
- \`summary.json\` — Metadatos y conteos
- \`raw/\` — Evidencia (headers, respuestas, logs de herramientas)
- \`modules/\` — Estado por módulo

## Cómo reproducir

\`\`\`bash
./security/run-pentest.sh
# o
./myrent.sh pentest
\`\`\`

Documentación: [docs/SECURITY_TESTING.md](../../docs/SECURITY_TESTING.md)

---
*Generado automáticamente. Uso exclusivo en entorno autorizado (localhost).*
EOF

  log_info "Informe: ${informe}"
}

compute_risk_level() {
  local crit="$1" high="$2" med="$3"
  if [[ "$crit" -gt 0 ]]; then
    echo "CRÍTICO"
  elif [[ "$high" -gt 0 ]]; then
    echo "ALTO"
  elif [[ "$med" -gt 0 ]]; then
    echo "MEDIO"
  else
    echo "BAJO"
  fi
}

format_duration() {
  local sec="$1"
  if [[ "$sec" -ge 3600 ]]; then
    printf "%dh %dm %ds" $((sec / 3600)) $(((sec % 3600) / 60)) $((sec % 60))
  elif [[ "$sec" -ge 60 ]]; then
    printf "%dm %ds" $((sec / 60)) $((sec % 60))
  else
    printf "%ds" "$sec"
  fi
}

generate_informe_html() {
  local summary_file="$1"
  local findings_file="$2"
  local informe_html="${REPORT_DIR}/INFORME.html"

  if ! have_cmd jq; then
    log_warn "jq no disponible — INFORME.html no generado"
    return 0
  fi

  local crit high med low info total gen_ts scanner version scope
  local api_url fe_url api_status fe_status duration_sec risk duration_fmt
  crit=$(jq -r '.counts.critical // 0' "$summary_file")
  high=$(jq -r '.counts.high // 0' "$summary_file")
  med=$(jq -r '.counts.medium // 0' "$summary_file")
  low=$(jq -r '.counts.low // 0' "$summary_file")
  info=$(jq -r '.counts.info // 0' "$summary_file")
  total=$(jq -r '.counts.total // 0' "$summary_file")
  gen_ts=$(jq -r '.generated_at // "—"' "$summary_file")
  scanner=$(jq -r '.scanner // "MyRent Go Security Toolkit"' "$summary_file")
  version=$(jq -r '.version // "1.0.0"' "$summary_file")
  scope=$(jq -r '.scope // "localhost"' "$summary_file")
  api_url=$(jq -r '.targets.api // "—"' "$summary_file")
  fe_url=$(jq -r '.targets.frontend // "—"' "$summary_file")
  api_status=$(jq -r '.targets.api_status // "—"' "$summary_file")
  fe_status=$(jq -r '.targets.frontend_status // "—"' "$summary_file")
  duration_sec=$(jq -r '.duration_seconds // 0' "$summary_file")
  risk=$(compute_risk_level "$crit" "$high" "$med")
  duration_fmt=$(format_duration "$duration_sec")

  local risk_class="risk-low"
  case "$risk" in
    CRÍTICO) risk_class="risk-critical" ;;
    ALTO)    risk_class="risk-high" ;;
    MEDIO)   risk_class="risk-medium" ;;
  esac

  local max_count="$total"
  [[ "$max_count" -lt 1 ]] && max_count=1

  local table_rows detail_cards
  table_rows=$(jq -r '
    def severity_order: {"Critical":0,"High":1,"Medium":2,"Low":3,"Info":4};
    sort_by(.severity | severity_order[.] // 5) |
    .[] |
    "<tr class=\"row-" + (.severity | ascii_downcase) + "\">" +
    "<td><span class=\"badge badge-" + (.severity | ascii_downcase) + "\">" + .severity + "</span></td>" +
    "<td class=\"col-title\">" + (.title | @html) + "<div class=\"col-category\">" + (.category | @html) + "</div></td>" +
    "<td>" + ((.owasp // "—") | @html) + "</td>" +
    "<td class=\"col-remediation\">" + ((if .remediation != "" then .remediation else "—" end) | @html) + "</td>" +
    "</tr>"
  ' "$findings_file" 2>/dev/null || echo "")

  detail_cards=$(jq -r '
    def severity_order: {"Critical":0,"High":1,"Medium":2,"Low":3,"Info":4};
    def severity_label: {"Critical":"Crítica","High":"Alta","Medium":"Media","Low":"Baja","Info":"Informativa"};
    sort_by(.severity | severity_order[.] // 5) |
    .[] |
    "<article class=\"finding-card card-" + (.severity | ascii_downcase) + "\" id=\"finding-" + (.title | gsub("[^a-zA-Z0-9]+"; "-") | ascii_downcase) + "\">" +
    "<header><span class=\"badge badge-" + (.severity | ascii_downcase) + "\">" + (severity_label[.severity] // .severity) + "</span>" +
    "<h3>" + (.title | @html) + "</h3></header>" +
    "<dl>" +
    "<dt>Categoría</dt><dd>" + (.category | @html) + "</dd>" +
    "<dt>OWASP</dt><dd>" + ((.owasp // "—") | @html) + "</dd>" +
    "<dt>Descripción</dt><dd>" + (.description | @html) + "</dd>" +
  (if .remediation != "" then "<dt>Remediación</dt><dd>" + (.remediation | @html) + "</dd>" else "" end) +
  (if .evidence != "" then "<dt>Evidencia</dt><dd><code>" + (.evidence | gsub("\n"; " ") | @html) + "</code></dd>" else "" end) +
    "</dl></article>"
  ' "$findings_file" 2>/dev/null || echo "")

  cat >"$informe_html" <<HTMLEOF
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe de Seguridad — MyRent Go</title>
  <style>
    :root {
      --bg: hsl(222.2, 84%, 4.9%);
      --fg: hsl(210, 40%, 98%);
      --card: hsl(217.2, 32.6%, 12%);
      --card-border: hsl(217.2, 32.6%, 17.5%);
      --muted: hsl(215, 20.2%, 65.1%);
      --accent: hsl(217.2, 32.6%, 22%);
      --radius: 0.5rem;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #3b82f6;
      --info: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
      min-height: 100vh;
    }
    a { color: hsl(210, 40%, 80%); }
    .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    .header {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;
      margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--card-border);
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-icon {
      width: 40px; height: 40px; border-radius: var(--radius);
      background: linear-gradient(135deg, hsl(217.2, 32.6%, 25%), hsl(222.2, 47.4%, 20%));
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.85rem; color: var(--fg);
    }
    .brand h1 { font-size: 1.35rem; font-weight: 600; }
    .brand p { font-size: 0.85rem; color: var(--muted); }
    .risk-banner {
      padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; font-size: 0.9rem;
      border: 1px solid var(--card-border);
    }
    .risk-critical { background: rgba(239,68,68,0.15); color: var(--critical); border-color: var(--critical); }
    .risk-high { background: rgba(249,115,22,0.15); color: var(--high); border-color: var(--high); }
    .risk-medium { background: rgba(234,179,8,0.15); color: var(--medium); border-color: var(--medium); }
    .risk-low { background: rgba(59,130,246,0.15); color: var(--low); border-color: var(--low); }
    section { margin-bottom: 2.5rem; }
    section h2 {
      font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem;
      color: var(--fg); letter-spacing: -0.01em;
    }
    .meta-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;
    }
    .meta-item {
      background: var(--card); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 0.85rem 1rem;
    }
    .meta-item dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.25rem; }
    .meta-item dd { font-size: 0.9rem; font-weight: 500; word-break: break-all; }
    .status-up { color: #22c55e; }
    .status-down { color: #ef4444; }
    .summary-text {
      background: var(--card); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 1.25rem; font-size: 0.95rem; color: hsl(210, 30%, 85%);
    }
    .summary-text strong { color: var(--fg); }
    .severity-section { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 768px) { .severity-section { grid-template-columns: 1fr; } }
    .badges { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .badge-count {
      flex: 1; min-width: 90px; text-align: center;
      background: var(--card); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 1rem 0.5rem;
    }
    .badge-count .num { font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
    .badge-count .lbl { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .badge-count.critical .num { color: var(--critical); }
    .badge-count.high .num { color: var(--high); }
    .badge-count.medium .num { color: var(--medium); }
    .badge-count.low .num { color: var(--low); }
    .badge-count.info .num { color: var(--info); }
    .chart { background: var(--card); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 1.25rem; }
    .chart-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.65rem; }
    .chart-row:last-child { margin-bottom: 0; }
    .chart-label { width: 72px; font-size: 0.8rem; color: var(--muted); text-align: right; flex-shrink: 0; }
    .chart-bar-bg { flex: 1; height: 22px; background: var(--accent); border-radius: 4px; overflow: hidden; }
    .chart-bar { height: 100%; border-radius: 4px; min-width: 2px; transition: width 0.3s; }
    .chart-bar.critical { background: var(--critical); }
    .chart-bar.high { background: var(--high); }
    .chart-bar.medium { background: var(--medium); }
    .chart-bar.low { background: var(--low); }
    .chart-bar.info { background: var(--info); }
    .chart-val { width: 28px; font-size: 0.85rem; font-weight: 600; text-align: right; flex-shrink: 0; }
    .table-wrap {
      overflow-x: auto; background: var(--card); border: 1px solid var(--card-border);
      border-radius: var(--radius);
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th {
      text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--card-border);
      background: hsl(217.2, 32.6%, 10%);
    }
    td { padding: 0.85rem 1rem; border-bottom: 1px solid var(--card-border); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: hsl(217.2, 32.6%, 14%); }
    .badge {
      display: inline-block; padding: 0.2rem 0.55rem; border-radius: 4px;
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .badge-critical { background: rgba(239,68,68,0.2); color: var(--critical); }
    .badge-high { background: rgba(249,115,22,0.2); color: var(--high); }
    .badge-medium { background: rgba(234,179,8,0.2); color: var(--medium); }
    .badge-low { background: rgba(59,130,246,0.2); color: var(--low); }
    .badge-info { background: rgba(100,116,139,0.25); color: #94a3b8; }
    .col-title { font-weight: 500; }
    .col-category { font-size: 0.75rem; color: var(--muted); margin-top: 0.15rem; }
    .col-remediation { color: hsl(210, 25%, 78%); max-width: 320px; }
    .finding-card {
      background: var(--card); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1rem;
      border-left: 3px solid var(--info);
    }
    .finding-card.card-critical { border-left-color: var(--critical); }
    .finding-card.card-high { border-left-color: var(--high); }
    .finding-card.card-medium { border-left-color: var(--medium); }
    .finding-card.card-low { border-left-color: var(--low); }
    .finding-card header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.85rem; flex-wrap: wrap; }
    .finding-card h3 { font-size: 1rem; font-weight: 600; }
    .finding-card dl { display: grid; grid-template-columns: 120px 1fr; gap: 0.35rem 1rem; font-size: 0.875rem; }
    .finding-card dt { color: var(--muted); }
    .finding-card dd { color: hsl(210, 25%, 85%); }
    .finding-card code {
      display: block; margin-top: 0.25rem; padding: 0.5rem 0.75rem;
      background: hsl(222.2, 84%, 3%); border-radius: 4px; font-size: 0.78rem;
      word-break: break-all; white-space: pre-wrap;
    }
    .note {
      background: hsl(217.2, 32.6%, 10%); border-left: 3px solid var(--low);
      padding: 0.85rem 1rem; border-radius: 0 var(--radius) var(--radius) 0;
      font-size: 0.85rem; color: var(--muted);
    }
    footer {
      margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--card-border);
      font-size: 0.8rem; color: var(--muted); text-align: center;
    }
    .nav-top { margin-bottom: 1rem; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <p class="nav-top"><a href="INFORME.md">← Versión Markdown</a></p>
    <header class="header">
      <div class="brand">
        <div class="brand-icon">MR</div>
        <div>
          <h1>Informe de Seguridad</h1>
          <p>MyRent Go — ${scanner} v${version}</p>
        </div>
      </div>
      <div class="risk-banner ${risk_class}">Riesgo global: ${risk}</div>
    </header>

    <section id="metadata">
      <h2>Metadatos del escaneo</h2>
      <dl class="meta-grid">
        <div class="meta-item"><dt>Fecha</dt><dd>${gen_ts}</dd></div>
        <div class="meta-item"><dt>Duración</dt><dd>${duration_fmt}</dd></div>
        <div class="meta-item"><dt>Alcance</dt><dd>${scope}</dd></div>
        <div class="meta-item"><dt>API</dt><dd>${api_url} <span class="status-${api_status}">(${api_status})</span></dd></div>
        <div class="meta-item"><dt>Frontend</dt><dd>${fe_url} <span class="status-${fe_status}">(${fe_status})</span></dd></div>
        <div class="meta-item"><dt>Total hallazgos</dt><dd>${total}</dd></div>
      </dl>
    </section>

    <section id="summary">
      <h2>Resumen ejecutivo</h2>
      <div class="summary-text">
        <p>Se realizó una evaluación de seguridad <strong>no destructiva</strong> sobre el entorno de desarrollo local de MyRent Go, alineada con buenas prácticas de ethical hacking (2024–2026): reconocimiento, headers, autenticación/JWT, OWASP API Top 10, inyección NoSQL, CORS, subida de archivos, secretos, dependencias, análisis estático y Docker.</p>
      </div>
      <p class="note" style="margin-top:1rem;">Este informe es orientativo para desarrollo local. No sustituye una auditoría profesional ni pruebas en staging/producción con TLS y hardening completo.</p>
    </section>

    <section id="severity">
      <h2>Distribución por severidad</h2>
      <div class="severity-section">
        <div class="badges">
          <div class="badge-count critical"><div class="num">${crit}</div><div class="lbl">Crítica</div></div>
          <div class="badge-count high"><div class="num">${high}</div><div class="lbl">Alta</div></div>
          <div class="badge-count medium"><div class="num">${med}</div><div class="lbl">Media</div></div>
          <div class="badge-count low"><div class="num">${low}</div><div class="lbl">Baja</div></div>
          <div class="badge-count info"><div class="num">${info}</div><div class="lbl">Info</div></div>
        </div>
        <div class="chart">
          <div class="chart-row"><span class="chart-label">Crítica</span><div class="chart-bar-bg"><div class="chart-bar critical" style="width:$(( crit * 100 / max_count ))%"></div></div><span class="chart-val">${crit}</span></div>
          <div class="chart-row"><span class="chart-label">Alta</span><div class="chart-bar-bg"><div class="chart-bar high" style="width:$(( high * 100 / max_count ))%"></div></div><span class="chart-val">${high}</span></div>
          <div class="chart-row"><span class="chart-label">Media</span><div class="chart-bar-bg"><div class="chart-bar medium" style="width:$(( med * 100 / max_count ))%"></div></div><span class="chart-val">${med}</span></div>
          <div class="chart-row"><span class="chart-label">Baja</span><div class="chart-bar-bg"><div class="chart-bar low" style="width:$(( low * 100 / max_count ))%"></div></div><span class="chart-val">${low}</span></div>
          <div class="chart-row"><span class="chart-label">Info</span><div class="chart-bar-bg"><div class="chart-bar info" style="width:$(( info * 100 / max_count ))%"></div></div><span class="chart-val">${info}</span></div>
        </div>
      </div>
    </section>

    <section id="findings-table">
      <h2>Tabla de hallazgos</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Severidad</th>
              <th>Título</th>
              <th>OWASP</th>
              <th>Remediación</th>
            </tr>
          </thead>
          <tbody>
${table_rows}
          </tbody>
        </table>
      </div>
    </section>

    <section id="findings-detail">
      <h2>Detalle de hallazgos</h2>
${detail_cards}
    </section>

    <footer>
      <p>Generado automáticamente · Uso exclusivo en entorno autorizado (localhost)</p>
      <p style="margin-top:0.35rem;">Reproducir: <code>./security/run-pentest.sh</code> o <code>./myrent.sh pentest</code></p>
    </footer>
  </div>
</body>
</html>
HTMLEOF

  log_info "Informe HTML: ${informe_html}"
}

sync_latest_report() {
  local latest_dir="${SECURITY_DIR}/reports/latest"
  rm -rf "$latest_dir"
  mkdir -p "$latest_dir"
  cp -R "${REPORT_DIR}/." "$latest_dir/" 2>/dev/null || true
  log_info "Copia en: ${latest_dir}/INFORME.md y INFORME.html"
}
