# Acceso público (DNS + router + Caddy / Tunnel)

Guía para publicar un host en casa detrás de Cloudflare (`rent.meincart.com` u otro).

## Dos caminos

| Camino | Cuándo | Abrir 80/443 en router |
|--------|--------|-------------------------|
| **A) DNS + port-forward** | ISP permite y controlas el router | Sí |
| **B) Cloudflare Tunnel** | Casa/NAT, ISP bloquea 80, o `micro_httpd` en WAN | No (recomendado) |

Menú: `bootstrap` → **7) Borde** → checklist, o:

```bash
bash scripts/edge/check-public-access.sh
```

---

## Camino A — Paso a paso (IP pública + Caddy)

### 1) IP pública del host (BMAX)

```bash
curl -4 -s ifconfig.me; echo
# ejemplo: 190.22.89.221
```

Autoriza esa IP en Brevo (SMTP) si usas Alertmanager por correo.

### 2) Cloudflare DNS

Dominio → **DNS → Records**:

| Tipo | Name | Content | Proxy |
|------|------|---------|--------|
| A | `rent` | `TU_IP_PUBLICA` | **DNS only (gris)** mientras sacas el cert ACME |
| A | `api` | misma IP | opcional, Proxied después |

Tras el certificado: puedes poner **Proxied (naranja)**.

### 3) SSL en Cloudflare

- **SSL/TLS:** Full (strict) si el origen tiene cert válido; **Full** temporalmente si aún no.
- Always Use HTTPS ON, TLS mínimo 1.2.

### 4) UFW en el host

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

### 5) Caddy `.env`

```bash
cd platform/caddy
# ACME_EMAIL=correo-real@gmail.com   # NO @example.com
# SITE_ADDRESS=rent.meincart.com
```

### 6) Router — port-forward

| Externo | Destino LAN |
|---------|-------------|
| TCP 80 | `192.168.x.x:80` (IP LAN del host) |
| TCP 443 | `192.168.x.x:443` |

Desactiva **administración remota / WAN management** en el puerto 80 si el router la tiene.

### 7) Comprobar desde fuera (Mac, no LAN)

```bash
curl -sI --connect-timeout 5 http://TU_IP_PUBLICA/ | head -8
```

| Respuesta | Significado |
|-----------|-------------|
| `308` + Caddy / Location https | OK → llega al host |
| `Server: micro_httpd` + `501` | El **router/ISP** responde; el forward no llega a Caddy |
| timeout | Sin forward o ISP bloquea 80 |

### 8) Certificado ACME

Con DNS gris + puerto 80 llegando a Caddy:

```bash
cd platform/caddy
docker compose -p platform-caddy up -d --force-recreate
docker compose -p platform-caddy logs -f --tail=50
```

Busca `certificate obtained successfully`. Luego vuelve el proxy naranja en Cloudflare.

### Errores típicos ACME

| Error | Causa |
|-------|--------|
| `forbidden domain "example.com"` | `ACME_EMAIL` de ejemplo |
| `520` en challenge | Cloudflare no alcanza el origen (80 cerrado / mal forward) |
| `micro_httpd` | Forward mal o router se queda con el 80 |

---

## Camino B — Cloudflare Tunnel (sin abrir router)

1. Menú **7** → instalar `cloudflared`.
2. `cloudflared tunnel login` / `create` / `route dns`.
3. Ingress → `http://platform-caddy:80` (o la app).
4. No hace falta port-forward ni ACME público en el origen (puedes usar HTTP interno + TLS en el edge de Cloudflare).

Detalle: `docs/help/cloudflared.txt` · `platform/cloudflared/README.md`.
