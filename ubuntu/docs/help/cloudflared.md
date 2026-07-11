# Cloudflare Tunnel (cloudflared)

## Qué es
Cliente que abre un túnel **saliente** hacia Cloudflare. El tráfico público llega por Cloudflare y baja al host sin port-forward.

## Para qué sirve
- Servidor en casa detrás de NAT/CGNAT
- No abrir 80/443 en el router
- TLS y protección en el edge

## Cuándo instalarlo
Si el host no tiene IP pública limpia o no quieres exponer puertos.

## Instalación
Menú **7** del bootstrap, o `scripts/edge/01-install-cloudflared.sh`.

## Parámetros (`config.example.yml`)
| Campo | Significado |
|-------|-------------|
| `tunnel` | ID/nombre del túnel |
| `credentials-file` | JSON de auth del túnel |
| `ingress` | hostname público → servicio interno |
