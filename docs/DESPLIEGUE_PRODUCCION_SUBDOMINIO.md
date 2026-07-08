# Despliegue en producción con subdominio — MyRent Go

Guía paso a paso para publicar **MyRent Go** en un VPS con Docker, dominio **meincart.com** en Cloudflare y subdominio dedicado (por ejemplo `app.meincart.com`).

> **Documentos relacionados:** [PRODUCTION.md](./PRODUCTION.md) · [Cloudflare](./Cloudflare/README.md) · [CHECKLIST_PRODUCCION.md](./CHECKLIST_PRODUCCION.md) · [.env.production.example](../.env.production.example)

## Tabla de contenidos

1. [Requisitos](#1-requisitos)
2. [Subdominio en Cloudflare](#2-subdominio-en-cloudflare)
3. [Preparar el servidor](#3-preparar-el-servidor)
4. [Generar secretos](#4-generar-secretos)
5. [Archivo `.env` de producción](#5-archivo-env-de-producción)
6. [Build y despliegue](#6-build-y-despliegue)
7. [Caddy / Nginx (reverse proxy)](#7-caddy--nginx-reverse-proxy)
8. [SMTP real (correo saliente)](#8-smtp-real-correo-saliente)
9. [Seed del usuario administrador](#9-seed-del-usuario-administrador)
10. [Verificación post-despliegue](#10-verificación-post-despliegue)
11. [Backups](#11-backups)
12. [Monitoreo](#12-monitoreo)
13. [Actualizaciones](#13-actualizaciones)
14. [Solución de problemas](#14-solución-de-problemas)

---

## Arquitectura

Escenario recomendado: **un subdominio** sirve la PWA y la API bajo el mismo host (`/api/v1`, `/ws`).

```mermaid
graph TB
    subgraph Internet
        U[Usuario / PWA]
    end

    subgraph Cloudflare["Cloudflare (meincart.com)"]
        DNS[DNS app.meincart.com]
        SSL[SSL edge + WAF]
    end

    subgraph VPS["VPS (Docker)"]
        Caddy[Caddy :80 / :443]
        FE[Frontend nginx :8080]
        API[API Go :7070]
        MONGO[(MongoDB :27017<br/>solo red interna)]
        VOL[(Volumen api_storage<br/>documentos)]
    end

    SMTP[Proveedor SMTP<br/>SendGrid / Gmail / Mailcow]

    U --> DNS --> SSL --> Caddy
    Caddy -->|"/"| FE
    Caddy -->|"/api/* /ws /health"| API
    API --> MONGO
    API --> VOL
    API --> SMTP
```

| Componente | Rol |
|------------|-----|
| **Cloudflare** | DNS, CDN, certificado en el edge, protección DDoS/WAF |
| **Caddy** | TLS en origen (Let's Encrypt), enrutamiento a frontend y API |
| **Frontend** | SPA React (assets estáticos) |
| **API** | REST `/api/v1`, WebSocket `/ws`, métricas `/metrics` |
| **MongoDB** | Base de datos (sin puerto publicado hacia Internet) |

---

## 1. Requisitos

### VPS

| Recurso | Mínimo recomendado | Notas |
|---------|-------------------|-------|
| CPU | 2 vCPU | Suficiente para uso personal / PYME pequeña |
| RAM | 4 GB | MongoDB (~1 GB) + API + frontend + Caddy |
| Disco | 40 GB SSD | Crecimiento de documentos y backups |
| SO | Ubuntu 22.04/24.04 LTS o Debian 12 | Cualquier Linux con Docker |

### Software en el servidor

- **Docker Engine** 24+ y **Docker Compose** v2 (`docker compose`)
- **Git** para clonar el repositorio
- **OpenSSL** (suele venir instalado) para generar secretos
- Acceso **SSH** con clave pública (deshabilitar login por contraseña en producción)

### Dominio y DNS

- Dominio **meincart.com** activo en [Cloudflare](https://dash.cloudflare.com) (estado **Active**)
- Acceso al panel DNS de Cloudflare
- Guía de referencia: [docs/Cloudflare/README.md](./Cloudflare/README.md)

### Puertos de firewall

Solo deben estar abiertos hacia Internet:

| Puerto | Uso |
|--------|-----|
| **22** | SSH (restringir por IP si es posible) |
| **80** | HTTP → redirección HTTPS (Caddy / Let's Encrypt) |
| **443** | HTTPS (Caddy) |

MongoDB (**27017**) y la API interna (**7070**) **no** se publican en `docker-compose.prod.yml`.

---

## 2. Subdominio en Cloudflare

Usaremos **`app.meincart.com`** como subdominio de la aplicación. Alternativas válidas: `myrent.meincart.com`, `renta.meincart.com`, etc.

### 2.1 Crear registro DNS

1. Entra en [dash.cloudflare.com](https://dash.cloudflare.com) → **meincart.com** → **DNS** → **Records**.
2. Añade un registro **A**:

| Campo | Valor |
|-------|-------|
| Tipo | `A` |
| Nombre | `app` |
| IPv4 | IP pública de tu VPS (ej. `203.0.113.10`) |
| Proxy | **Proxied** (nube **naranja**) |
| TTL | Auto |

3. (Opcional) Redirección `www`: registro `CNAME` `www` → `meincart.com` si usas el apex para otra cosa. Para solo subdominio de app, no es obligatorio.

Detalle de proxy naranja vs gris: [docs/Cloudflare/dns.md](./Cloudflare/dns.md#proxied-vs-dns-only).

### 2.2 SSL/TLS en Cloudflare

1. **SSL/TLS → Overview** → modo **Full (strict)**.
2. **SSL/TLS → Edge Certificates**:
   - **Always Use HTTPS**: On
   - **Minimum TLS Version**: 1.2

El origen (Caddy) obtendrá certificado válido con **Let's Encrypt** automáticamente.

### 2.3 Reglas de cache (importante)

No cachear API ni WebSocket. Ver [deploy/cloudflare/README.md](../deploy/cloudflare/README.md):

- **Bypass cache:** `/api/*`, `/ws`
- **Cache Everything** (opcional): `/assets/*`

### 2.4 Comprobar DNS

```bash
dig app.meincart.com +short
# Con proxy naranja verás IPs de Cloudflare (no la IP directa del VPS)
```

Más ejemplos de registros: [docs/Cloudflare/dns.md § Tabla de registros](./Cloudflare/dns.md#tabla-de-registros-dns-de-ejemplo).

---

## 3. Preparar el servidor

### 3.1 Conectar por SSH

```bash
ssh usuario@203.0.113.10
```

### 3.2 Instalar Docker

```bash
# Ubuntu / Debian (script oficial)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Cierra sesión y vuelve a entrar para aplicar el grupo docker
docker compose version
```

### 3.3 Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### 3.4 Clonar el repositorio

```bash
sudo mkdir -p /opt/myrent
sudo chown "$USER:$USER" /opt/myrent
cd /opt/myrent
git clone https://github.com/TU_USUARIO/my-rent-go.git .
# o: git pull si ya existe
```

### 3.5 Permisos del script de deploy

```bash
chmod +x scripts/deploy-prod.sh scripts/backup.sh
```

---

## 4. Generar secretos

**Nunca** uses valores de ejemplo en producción. Genera secretos únicos en el servidor:

```bash
# JWT (mínimo 32 caracteres)
openssl rand -base64 32

# Contraseña root de MongoDB
openssl rand -base64 24

# Otra contraseña (rotación, tokens internos, etc.)
openssl rand -hex 32
```

Guarda los valores en un gestor de contraseñas. **No los commitees** al repositorio.

| Variable | Comando sugerido |
|----------|------------------|
| `JWT_SECRET` | `openssl rand -base64 32` |
| `MONGO_ROOT_PASSWORD` | `openssl rand -base64 24` |
| `SMTP_PASSWORD` | La entrega tu proveedor SMTP (no openssl) |

---

## 5. Archivo `.env` de producción

### 5.1 Crear el archivo

En la raíz del proyecto en el VPS:

```bash
cp .env.production.example .env
chmod 600 .env
nano .env
```

### 5.2 Variables para subdominio `app.meincart.com`

Sustituye `CHANGE_ME...` y las contraseñas generadas en el paso anterior.

```env
# ── Entorno ───────────────────────────────────────────────────────────────────
APP_ENV=production
APP_PORT=7070
APP_NAME=MyRent Go

# Caddy obtiene el certificado para este host
DOMAIN=app.meincart.com
FRONTEND_URL=https://app.meincart.com
BASE_URL=https://app.meincart.com

# Solo el origen del frontend (sin espacios)
CORS_ORIGINS=https://app.meincart.com

# Email para Let's Encrypt (recomendado)
ACME_EMAIL=admin@meincart.com

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_SECRET=<pega-salida-de-openssl-rand-base64-32>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
JWT_ISSUER=my-rent-go

# ── MongoDB ───────────────────────────────────────────────────────────────────
MONGODB_DATABASE=myrent
MONGO_ROOT_USER=myrent_admin
MONGO_ROOT_PASSWORD=<pega-salida-de-openssl-rand-base64-24>
# Debe coincidir usuario/contraseña con MONGO_ROOT_*
MONGODB_URI=mongodb://myrent_admin:<MISMA_PASSWORD>@mongodb:27017/myrent?authSource=admin

# ── Seguridad ─────────────────────────────────────────────────────────────────
MFA_ENABLED=true
BCRYPT_COST=12
RATE_LIMIT_RPS=20
RATE_LIMIT_BURST=40
LOGIN_RATE_LIMIT=5
LOGIN_RATE_WINDOW=1m

# ── Documentos ──────────────────────────────────────────────────────────────
DOCUMENTS_PATH=/app/storage/documents
MAX_UPLOAD_MB=30

# ── SMTP (ver sección 8) ──────────────────────────────────────────────────────
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<api-key-de-sendgrid>
SMTP_FROM=noreply@meincart.com
SMTP_FROM_NAME=MyRent Go

EMAIL_SCHEDULER_ENABLED=true
EMAIL_SCHEDULER_INTERVAL=24h

# ── Monitoreo ─────────────────────────────────────────────────────────────────
SYSTEM_LOG_MAX_ENTRIES=5000
METRICS_ENABLED=true
METRICS_PROTECTED=true
METRICS_REFRESH_INTERVAL_SECS=60
```

### 5.3 Coherencia entre variables

| Variable | Debe coincidir con |
|----------|-------------------|
| `DOMAIN` | Registro DNS en Cloudflare (`app`) |
| `FRONTEND_URL` | `https://` + `DOMAIN` |
| `CORS_ORIGINS` | Exactamente la URL del navegador (con `https://`) |
| `MONGODB_URI` | `MONGO_ROOT_USER` y `MONGO_ROOT_PASSWORD` |
| `SMTP_FROM` | Dominio autorizado en SPF/DKIM del proveedor SMTP |

Plantilla completa: [.env.production.example](../.env.production.example).

---

## 6. Build y despliegue

### 6.1 Opción recomendada: script de deploy

```bash
./scripts/deploy-prod.sh
```

El script:

1. Verifica que `.env` existe y no contiene `CHANGE_ME`
2. Ejecuta `docker compose -f docker-compose.prod.yml build`
3. Levanta los servicios (`up -d`)
4. Comprueba `GET /health` en localhost

### 6.2 Alternativas

```bash
# Makefile
make docker-prod

# Menú interactivo
./myrent.sh docker-up-prod

# Manual
docker compose -f docker-compose.prod.yml up -d --build
```

### 6.3 Servicios levantados

| Servicio | Puerto host | Descripción |
|----------|-------------|-------------|
| `caddy` | 80, 443 | Reverse proxy + TLS |
| `frontend` | *(interno 8080)* | SPA |
| `api` | *(interno 7070)* | Backend Go |
| `mongodb` | *(solo red Docker)* | Base de datos |

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy api
```

---

## 7. Caddy / Nginx (reverse proxy)

### 7.1 Caddy (configuración por defecto en producción)

El proyecto usa **Caddy** en `docker-compose.prod.yml`. El archivo [`deploy/caddy/Caddyfile`](../deploy/caddy/Caddyfile) lee la variable `DOMAIN` del `.env`:

| Ruta | Destino |
|------|---------|
| `/` | `frontend:8080` (SPA React) |
| `/api/*` | `api:7070` (REST `/api/v1/...`) |
| `/ws` | `api:7070` (WebSocket) |
| `/health` | `api:7070` |

Caddy solicita certificado Let's Encrypt para `DOMAIN` y redirige `www.{DOMAIN}` al apex si configuraste ese bloque.

### 7.2 Cloudflare + Caddy

Con **Full (strict)** Cloudflare valida el certificado del origen. Caddy con Let's Encrypt cumple este requisito. Referencia: [docs/Cloudflare/dns.md § SSL/TLS](./Cloudflare/dns.md#ssltls--modos-de-cifrado).

### 7.3 Nginx como alternativa

Si prefieres Nginx en lugar de Caddy:

1. No levantes el servicio `caddy` en compose (o usa un `docker-compose` personalizado).
2. Publica el frontend en 80/443 con la config de [`deploy/nginx/nginx.conf`](../deploy/nginx/nginx.conf).
3. Termina TLS con certbot o certificado de origen Cloudflare.

La config de referencia enruta `/api/` y `/ws` al backend y sirve la SPA en `/`.

### 7.4 Escenario con API en subdominio separado (opcional)

Si quieres `api.meincart.com` además de `app.meincart.com`:

1. Añade registro **A** `api` → IP del VPS (proxied) en Cloudflare.
2. Extiende el `Caddyfile` con un bloque `api.meincart.com { reverse_proxy api:7070 }`.
3. Ajusta `CORS_ORIGINS=https://app.meincart.com` y `BASE_URL=https://api.meincart.com`.
4. El frontend en desarrollo usa rutas relativas `/api/` — con hosts separados puede requerir variable `VITE_API_URL` en build (no es el escenario por defecto del proyecto).

---

## 8. SMTP real (correo saliente)

En producción **no** uses Mailpit. Configura un proveedor SMTP real.

### 8.1 SendGrid (recomendado para volumen medio)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.xxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=noreply@meincart.com
SMTP_FROM_NAME=MyRent Go
```

Añade los registros SPF/DKIM que indique SendGrid en Cloudflare (**DNS only**).

### 8.2 Gmail (pruebas o bajo volumen)

1. Activa verificación en 2 pasos en Google.
2. Crea una [contraseña de aplicación](https://myaccount.google.com/apppasswords).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
SMTP_FROM=notificaciones@meincart.com
```

### 8.3 Microsoft 365

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notificaciones@meincart.com
SMTP_PASSWORD=<contraseña-o-app-password>
SMTP_FROM=notificaciones@meincart.com
```

### 8.4 Mailcow self-hosted

Si tienes servidor de correo propio: [docs/Cloudflare/mailcow.md](./Cloudflare/mailcow.md).

```env
SMTP_HOST=mail.meincart.com
SMTP_PORT=587
SMTP_USER=noreply@meincart.com
SMTP_PASSWORD=<contraseña-del-buzón>
SMTP_FROM=noreply@meincart.com
```

### 8.5 Verificar SMTP en la app

1. Reinicia la API: `docker compose -f docker-compose.prod.yml restart api`
2. Inicia sesión como admin → **Configuración → Notificaciones por correo**
3. Comprueba que el indicador muestre *SMTP configurado*
4. Envía un correo de prueba a un destinatario

Correo entrante (reenvío) es independiente: [docs/Cloudflare/correo.md](./Cloudflare/correo.md).

---

## 9. Seed del usuario administrador

Ejecutar **una sola vez** tras el primer despliegue. Credenciales por defecto del seed:

- **Usuario:** `admin`
- **Email interno:** `admin@myrent.local`
- **Contraseña inicial:** `admin123`

> Cambia la contraseña inmediatamente tras el primer login.

### 9.1 Seed con contenedor temporal (recomendado en VPS)

Con el stack ya levantado:

```bash
cd /opt/myrent
set -a && source .env && set +a

NETWORK=$(docker compose -f docker-compose.prod.yml ps -q api \
  | xargs docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' \
  | head -1)

docker run --rm --network "$NETWORK" \
  -v "$(pwd)/backend:/app" -w /app \
  -e MONGODB_URI="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@mongodb:27017/${MONGODB_DATABASE}?authSource=admin" \
  -e APP_ENV=production \
  golang:1.23-alpine \
  sh -c 'apk add --no-cache git ca-certificates && go mod download && go run ./cmd/seed'
```

Si el admin ya existe, el seed se omite. Para recrear (¡destructivo!):

```bash
# Añade -e SEED_FORCE=1 al docker run anterior
```

### 9.2 Cambiar contraseña del admin

1. Accede a `https://app.meincart.com`
2. Login: `admin` / `admin123`
3. **Configuración → Seguridad → Cambiar contraseña**
4. Activa **MFA** (recomendado para administradores)

---

## 10. Verificación post-despliegue

### 10.1 Health check

```bash
# Desde el servidor
curl -s https://app.meincart.com/health
# {"status":"ok","service":"MyRent Go"}

# Desde tu máquina
curl -sI https://app.meincart.com | head -5
```

### 10.2 HTTPS y certificado

- Abre `https://app.meincart.com` en el navegador: candado verde, sin advertencias.
- Cloudflare en **Full (strict)**.

### 10.3 Login y MFA

- Login con el usuario admin.
- Navega al dashboard, propiedades y arrendatarios.
- Configura MFA si está habilitado (`MFA_ENABLED=true`).

### 10.4 CORS

Si el frontend carga pero las peticiones API fallan con error CORS:

- Verifica `CORS_ORIGINS=https://app.meincart.com` (sin barra final, con `https://`).
- Reinicia la API tras cambiar `.env`.

### 10.5 Subida de documentos

1. Sube un PDF en **Documentos**.
2. Comprueba que se guarda en el volumen `api_storage`:

```bash
docker compose -f docker-compose.prod.yml exec api ls -la /app/storage/documents
```

### 10.6 Correo

- Envía notificación de prueba desde **Notificaciones por correo**.
- Revisa bandeja del destinatario y logs: `docker compose -f docker-compose.prod.yml logs api | grep -i smtp`

### 10.7 WebSocket

- Abre la app y comprueba que los eventos en tiempo real funcionan (sin errores en consola del navegador en `/ws`).

### 10.8 Checklist extendido

[CHECKLIST_PRODUCCION.md](./CHECKLIST_PRODUCCION.md)

---

## 11. Backups

### 11.1 MongoDB (cron diario)

Script incluido: [`scripts/backup.sh`](../scripts/backup.sh). En producción usa `mongodump` dentro del contenedor:

```bash
#!/usr/bin/env bash
# /opt/myrent/scripts/backup-prod.sh
set -euo pipefail
cd /opt/myrent
set -a && source .env && set +a

BACKUP_DIR="/opt/myrent/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongodump \
    -u "$MONGO_ROOT_USER" \
    -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db "$MONGODB_DATABASE" \
    --archive \
  > "$BACKUP_DIR/mongo_${TIMESTAMP}.archive"

# Retener últimos 14 días
find "$BACKUP_DIR" -name 'mongo_*.archive' -mtime +14 -delete
echo "Backup: $BACKUP_DIR/mongo_${TIMESTAMP}.archive"
```

Cron (ejecutar a las 03:00):

```bash
chmod +x /opt/myrent/scripts/backup-prod.sh
crontab -e
# Añadir:
0 3 * * * /opt/myrent/scripts/backup-prod.sh >> /var/log/myrent-backup.log 2>&1
```

### 11.2 Restaurar MongoDB

```bash
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongorestore \
    -u "$MONGO_ROOT_USER" \
    -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --archive \
    --drop \
  < backups/mongo_YYYYMMDD_HHMMSS.archive
```

### 11.3 Volumen de documentos

```bash
VOLUME=$(docker volume ls -q | grep api_storage | head -1)
docker run --rm \
  -v "${VOLUME}:/data:ro" \
  -v /opt/myrent/backups:/backup \
  alpine tar czf "/backup/documents_$(date +%Y%m%d).tar.gz" -C /data .
```

Programa este backup semanalmente y copia los archivos a almacenamiento externo (S3, otro servidor, etc.).

---

## 12. Monitoreo

### 12.1 Endpoint `/metrics`

Con `METRICS_PROTECTED=true` (recomendado), `/metrics` requiere JWT de usuario **owner** o **admin**:

```bash
# Obtener token
TOKEN=$(curl -s -X POST https://app.meincart.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"TU_PASSWORD"}' | jq -r '.access_token')

curl -s -H "Authorization: Bearer $TOKEN" https://app.meincart.com/metrics | head
```

El panel **Configuración → Sistema** muestra estado de métricas y logs internos.

### 12.2 Logs de contenedores

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
docker compose -f docker-compose.prod.yml logs -f --tail=50 caddy
```

### 12.3 Prometheus (opcional)

1. Descomenta el servicio `prometheus` en `docker-compose.yml` (desarrollo) como referencia.
2. En producción, añade un scraper que apunte a `https://app.meincart.com/metrics` con autenticación Bearer, o scrapea `api:7070/metrics` desde la red Docker interna.

### 12.4 Uptime externo

Servicios gratuitos (UptimeRobot, Better Stack, etc.) pueden vigilar:

- `https://app.meincart.com/health` cada 5 minutos

---

## 13. Actualizaciones

### 13.1 Procedimiento estándar

```bash
cd /opt/myrent

# 1. Backup antes de actualizar
./scripts/backup-prod.sh   # o tu script de backup

# 2. Obtener código nuevo
git pull origin main

# 3. Rebuild y reinicio
./scripts/deploy-prod.sh

# 4. Verificar
curl -s https://app.meincart.com/health
```

### 13.2 Migraciones de base de datos

MyRent Go crea índices al arrancar (`EnsureIndexes`). No hay migraciones SQL. Tras actualizar:

```bash
docker compose -f docker-compose.prod.yml logs api | tail -20
```

Si una versión documenta pasos manuales, síguelos en el CHANGELOG o release notes.

### 13.3 Rollback

```bash
git checkout <tag-o-commit-anterior>
./scripts/deploy-prod.sh
# Restaurar MongoDB desde backup si la versión nueva alteró datos
```

---

## 14. Solución de problemas

### Error CORS en el navegador

| Síntoma | `Access-Control-Allow-Origin` ausente o incorrecto |
|---------|---------------------------------------------------|
| Causa habitual | `CORS_ORIGINS` no coincide con la URL del navegador |
| Solución | `CORS_ORIGINS=https://app.meincart.com`, reiniciar `api` |

### 502 Bad Gateway

| Causa | Qué revisar |
|-------|-------------|
| API no arrancó | `docker compose -f docker-compose.prod.yml logs api` |
| MongoDB no healthy | `docker compose -f docker-compose.prod.yml ps mongodb` |
| `JWT_SECRET` vacío | `.env` y mensaje al hacer `up` |
| Caddy no alcanza frontend | `docker compose -f docker-compose.prod.yml logs caddy` |

### Certificado SSL / error 525 Cloudflare

| Causa | Solución |
|-------|----------|
| Modo **Flexible** | Cambiar a **Full (strict)** en Cloudflare |
| Caddy sin certificado | Ver logs Caddy; puertos 80/443 abiertos; `DOMAIN` correcto |
| DNS no apunta al VPS | Verificar registro `app` en Cloudflare |

### WebSocket desconecta

- Cloudflare debe tener **bypass cache** en `/ws`.
- Caddy debe tener bloque `handle /ws` (ya incluido).
- No uses modo Flexible en SSL.

### SMTP / correos no llegan

- Verifica `SMTP_*` en `.env`.
- Revisa SPF/DKIM del dominio remitente: [correo.md](./Cloudflare/correo.md).
- Logs: `docker compose -f docker-compose.prod.yml logs api | grep -i mail`
- Prueba puerto 587 saliente desde el VPS: `nc -zv smtp.sendgrid.net 587`

### Login rate limit (429)

Demasiados intentos fallidos. Espera 1 minuto o ajusta `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW` en `.env`.

### Métricas 401

Esperado con `METRICS_PROTECTED=true`. Autentícate como admin antes de scrapear `/metrics`.

### Contenedores reiniciando en bucle

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50
```

Causas frecuentes: contraseña MongoDB incorrecta en `MONGODB_URI`, falta `JWT_SECRET`, healthcheck fallando.

---

## Referencias rápidas

| Recurso | Enlace |
|---------|--------|
| Índice producción | [PRODUCTION.md](./PRODUCTION.md) |
| Cloudflare meincart.com | [Cloudflare/README.md](./Cloudflare/README.md) |
| DNS y SSL | [Cloudflare/dns.md](./Cloudflare/dns.md) |
| Correo | [Cloudflare/correo.md](./Cloudflare/correo.md) |
| Reglas WAF/cache | [deploy/cloudflare/README.md](../deploy/cloudflare/README.md) |
| Plantilla `.env` | [.env.production.example](../.env.production.example) |
| Compose producción | [docker-compose.prod.yml](../docker-compose.prod.yml) |
| Deploy script | [scripts/deploy-prod.sh](../scripts/deploy-prod.sh) |

---

*Última actualización: documento alineado con `docker-compose.prod.yml`, Caddy y dominio meincart.com en Cloudflare.*
