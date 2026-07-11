# Cloudflare configuration reference for MyRent Go (meincart.com)
# Apply via Cloudflare Dashboard. Plan Free is enough for day-1 production.
# Full day-1 checklist: docs/DIA1_PRODUCCION_APP_MEINCART.md

# DNS:
# A     rent.meincart.com     -> origin IP (Proxied / orange)
# MX/TXT Email Routing + SPF/DKIM → DNS only (grey)

# SSL/TLS:
# Mode: Full (strict) with origin cert (Caddy Let's Encrypt)
# Minimum TLS: 1.2
# Always Use HTTPS: On
# Never use Flexible

# Page Rules / Cache Rules:
# - Bypass cache: /api/*, /ws
# - Cache Everything (optional): /assets/* , Edge TTL: 1 month

# Security (Free):
# - WAF: Managed ruleset + OWASP Core Ruleset (as available)
# - Bot Fight Mode: On
# - Rate limiting (if available): 100 req/min per IP on /api/v1/auth/login
# - DDoS protection: Auto

# Headers (Transform Rules, optional):
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - Referrer-Policy: strict-origin-when-cross-origin

# SMTP outbound is NOT Cloudflare: use Brevo / SendGrid / Gmail
# Email inbound: Cloudflare Email Routing → your Gmail
