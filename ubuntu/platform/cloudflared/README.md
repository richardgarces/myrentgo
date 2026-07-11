# Cloudflare Tunnel (cloudflared)

**Qué es:** túnel saliente hacia la red de Cloudflare. El host **no** necesita puertos 80/443 abiertos en el router.

**Para qué sirve:**
- Hosting en casa / NAT sin port-forward
- TLS y DDoS en el edge de Cloudflare
- Varias apps con hostnames distintos en el mismo túnel

## Instalación

Menú **7 → Cloudflare Tunnel**, o:

```bash
sudo ./scripts/edge/01-install-cloudflared.sh
```

## Flujo

1. `cloudflared tunnel login`
2. `cloudflared tunnel create platform`
3. Editar `config.yml` (ver `config.example.yml`)
4. `cloudflared tunnel route dns platform app.example.com`
5. Instalar servicio: `cloudflared service install`

## Parámetros del ejemplo

| Campo | Para qué sirve |
|-------|----------------|
| `tunnel` | ID/nombre del túnel |
| `credentials-file` | JSON de autenticación del túnel |
| `ingress[].hostname` | Dominio público en Cloudflare |
| `ingress[].service` | Destino interno (`http://platform-caddy:80`) |

**Seguridad:** el túnel sale del host; UFW puede dejar 80/443 cerrados al WAN si solo usas Tunnel.
