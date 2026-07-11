# Caddy — reverse proxy de borde

**Qué es:** proxy HTTP(S) con TLS automático (Let's Encrypt).  
**Para qué:** un solo punto `:80/:443` (o destino del Tunnel) hacia N apps en `platform-net`.

| Variable | Para qué sirve |
|----------|----------------|
| `SITE_ADDRESS` | Hostname público |
| `UPSTREAM` | Contenedor:puerto de la app |
| `ACME_EMAIL` | Contacto Let's Encrypt |
| `CADDY_*_PORT` | Publicación en el host |

Con **Cloudflare Tunnel**, apunta el ingress a `http://platform-caddy:80` y puedes no exponer 443 al WAN.

**Acceso público (DNS / router / ACME):** ver `docs/help/public-access.txt` y
`bash scripts/edge/check-public-access.sh` (bootstrap → 7 → 1).

Edita `Caddyfile` para varias rutas/hosts (`handle /api/*`, varios bloques de sitio).
