# Caddy (borde)

## Qué es
Reverse proxy con HTTPS automático (Let's Encrypt).

## Para qué sirve
Un solo punto de entrada HTTP(S) hacia varias apps en `platform-net`, o destino del Cloudflare Tunnel (`http://platform-caddy:80`).

## Parámetros clave
| Parámetro | Significado |
|-----------|-------------|
| `SITE_ADDRESS` | Dominio público |
| `UPSTREAM` | Contenedor:puerto de la app |
| `ACME_EMAIL` | Email real para ACME (no `@example.com`) |

Edita `Caddyfile` para múltiples hosts o rutas (`/api/*`).

## Certificado / acceso público
Paso a paso DNS + router + ACME: `docs/help/public-access.txt`  
Checklist: `bash scripts/edge/check-public-access.sh` (menú bootstrap → 7 → 1).

Si desde Internet `curl http://IP_PUBLICA/` muestra `micro_httpd`, el tráfico no llega a Caddy (arregla port-forward o usa Tunnel).
