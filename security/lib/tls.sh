#!/usr/bin/env bash
# SSL/TLS — N/A for localhost HTTP.

run_tls() {
  log_step "SSL/TLS"

  add_finding "Info" "TLS" "N/A en entorno local HTTP" \
    "Los objetivos (${TARGET_API}, ${TARGET_FRONTEND}) usan HTTP en localhost." \
    "En producción: TLS 1.2+, HSTS, certificados válidos (Let's Encrypt / Cloudflare)." \
    "OWASP ASVS V9" "Skipped — localhost"

  write_module_result "tls" "completed" "TLS N/A for localhost"
}
