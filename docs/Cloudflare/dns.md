# DNS y SSL — meincart.com

Configuración de registros DNS y modos TLS en Cloudflare para servir MyRent Go de forma segura.

## Verificar dominio activo

1. Abre [dash.cloudflare.com](https://dash.cloudflare.com) y selecciona **meincart.com**.
2. En la página **Overview**, el estado debe ser **Active**.
3. Si aparece *Pending Nameserver Update*, copia los nameservers que muestra Cloudflare y configúralos en el registrador del dominio (donde compraste meincart.com).
4. La propagación puede tardar desde minutos hasta 48 horas.

## Proxied vs DNS only

Cloudflare muestra cada registro con un icono de nube:

| Modo | Icono | Comportamiento |
|------|-------|----------------|
| **Proxied** | Nube naranja | El tráfico pasa por Cloudflare: CDN, SSL en el edge, ocultación de IP de origen, reglas de firewall |
| **DNS only** | Nube gris | Solo resolución DNS; el cliente conecta directo al valor del registro (IP o host destino) |

### Cuándo usar cada modo

| Tipo de registro | Proxy recomendado | Motivo |
|------------------|-------------------|--------|
| A / AAAA / CNAME (web, API) | **Proxied** | HTTPS, cache, protección |
| MX | **DNS only** | El correo no debe pasar por el proxy HTTP de Cloudflare |
| TXT (SPF, DKIM, DMARC, verificación) | **DNS only** | Evita interferencias con validación de correo y terceros |
| SRV (si aplica) | **DNS only** | Servicios no HTTP |

> **Regla crítica:** los registros **MX** de meincart.com deben estar siempre en **DNS only**. Si el MX está proxied, Email Routing y otros servicios de correo fallan.

## Tabla de registros DNS de ejemplo

Sustituye `203.0.113.10` por la IP real de tu VPS. Los valores MX de Email Routing los genera Cloudflare al activar el producto.

| Tipo | Nombre | Contenido | TTL | Proxy |
|------|--------|-----------|-----|-------|
| A | `@` | `203.0.113.10` | Auto | Proxied |
| A | `app` | `203.0.113.10` | Auto | Proxied |
| A | `api` | `203.0.113.10` | Auto | Proxied |
| CNAME | `www` | `meincart.com` | Auto | Proxied |
| MX | `@` | `route1.mx.cloudflare.net` (prioridad 62) | Auto | DNS only |
| MX | `@` | `route2.mx.cloudflare.net` (prioridad 41) | Auto | DNS only |
| MX | `@` | `route3.mx.cloudflare.net` (prioridad 12) | Auto | DNS only |
| TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | Auto | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@meincart.com` | Auto | DNS only |
| TXT | `cf2024._domainkey` | *(valor DKIM de Email Routing)* | Auto | DNS only |

Si usas **solo** SMTP externo (SendGrid) sin Email Routing, los MX y TXT de Cloudflare Email Routing no aplican; en su lugar añade los registros que indique tu proveedor SMTP (ver [correo.md](./correo.md)).

## Subdominios para MyRent Go

| Host | Destino | Uso |
|------|---------|-----|
| `app.meincart.com` | Misma IP del VPS (A proxied) | Frontend PWA |
| `api.meincart.com` | Misma IP del VPS (A proxied) | API REST y WebSocket |

Alternativa con un solo host: `meincart.com` sirve frontend y el reverse proxy enruta `/api` y `/ws` al backend (configuración Caddy/Nginx en el servidor).

## SSL/TLS — modos de cifrado

En **SSL/TLS → Overview** elige el modo entre origen (tu VPS) y visitante:

| Modo | Visitante ↔ Cloudflare | Cloudflare ↔ Origen | Recomendación |
|------|------------------------|---------------------|---------------|
| **Off** | HTTP | — | No usar en producción |
| **Flexible** | HTTPS | HTTP sin cifrar | **Evitar** — expone tráfico sin cifrar al VPS |
| **Full** | HTTPS | HTTPS (certificado puede ser autofirmado) | Aceptable si el origen aún no tiene LE válido |
| **Full (strict)** | HTTPS | HTTPS con certificado válido y confiable | **Recomendado** para producción |

### Recomendación para MyRent Go en VPS

1. Instala certificado en Caddy/Nginx (Let's Encrypt o [certificado de origen Cloudflare](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)).
2. En Cloudflare, selecciona **Full (strict)**.
3. En **SSL/TLS → Edge Certificates**, activa **Always Use HTTPS** y **Minimum TLS Version 1.2**.

### WebSocket detrás de Cloudflare

MyRent Go usa WebSocket en `/ws`. Con proxy naranja:

- Cloudflare reenvía el upgrade si el origen (Caddy) está bien configurado.
- No caches rutas `/ws` ni `/api/*` (reglas en [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)).

## Comprobaciones rápidas

```bash
# Resolución DNS (debe mostrar IPs de Cloudflare si está proxied)
dig app.meincart.com +short

# Certificado visto por el navegador
curl -sI https://app.meincart.com | head -5
```

## Volver al índice

[README.md](./README.md)
