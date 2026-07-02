# Cloudflare configuration reference for MyRent Go
# Apply via Cloudflare Dashboard or Terraform

# SSL/TLS: Full (strict) with origin certificate
# Minimum TLS: 1.2

# Page Rules / Rules:
# - Cache static assets: /assets/*, Cache Level: Cache Everything, Edge TTL: 1 month
# - Bypass cache: /api/*, /ws
# - Always Use HTTPS: On

# Security:
# - WAF: Managed ruleset + OWASP Core Ruleset
# - Bot Fight Mode: On
# - Rate limiting: 100 req/min per IP on /api/v1/auth/login
# - DDoS protection: Auto

# Headers (Transform Rules):
# - Add: X-Content-Type-Options: nosniff
# - Add: X-Frame-Options: DENY
# - Add: Referrer-Policy: strict-origin-when-cross-origin

# DNS:
# A     myrent.example.com     -> origin IP (proxied)
# CNAME api.myrent.example.com -> origin IP (proxied)

# Workers (optional): geo-blocking, maintenance mode
