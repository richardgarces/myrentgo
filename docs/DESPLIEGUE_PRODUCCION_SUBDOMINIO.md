# Despliegue en producción con subdominio — MyRent Go

Guía paso a paso para publicar **MyRent Go** en un VPS con Docker, dominio **meincart.com** en Cloudflare y subdominio dedicado (por ejemplo `rent.meincart.com`).

> **Documentos relacionados:** [DIA1_PRODUCCION_APP_MEINCART.md](./DIA1_PRODUCCION_APP_MEINCART.md) (checklist día 1) · [PRODUCTION.md](./PRODUCTION.md) · [Cloudflare](./Cloudflare/README.md) · [CHECKLIST_PRODUCCION.md](./CHECKLIST_PRODUCCION.md) · [Kit Ubuntu genérico](../ubuntu/README.md) · [.env.production.example](../.env.production.example)
>
> **Camino por defecto:** 1 VPS + Cloudflare Free + SMTP gratuito (**Brevo / SendGrid / Gmail**). **Mailcow** es opcional y queda fuera del día 1.
>
> **Preparación del host:** usa el kit [`ubuntu/`](../ubuntu/README.md) (paso 0 ZIP/SSH desde tu PC → menús SO/SSH/UFW/Docker en el servidor). Es genérico y reutilizable en otros productos.

## Tabla de contenidos

1. [Requisitos](#1-requisitos)
2. [Subdominio en Cloudflare](#2-subdominio-en-cloudflare)
3. [Preparar el servidor](#3-preparar-el-servidor)
4. [Generar secretos](#4-generar-secretos)
5. [Archivo `.env` de producción](#5-archivo-env-de-producción)
6. [Build y despliegue](#6-build-y-despliegue)
7. [Caddy / Nginx (reverse proxy)](#7-caddy--nginx-reverse-proxy)
8. [SMTP gratuito (correo saliente)](#8-smtp-gratuito-correo-saliente--camino-por-defecto)
9. [Seed del usuario administrador](#9-seed-del-usuario-administrador)
10. [Verificación post-despliegue](#10-verificación-post-despliegue)
11. [Backups](#11-backups)
12. [Monitoreo](#12-monitoreo)
13. [Actualizaciones](#13-actualizaciones)
14. [Solución de problemas](#14-solución-de-problemas)

> Checklist condensada del día 1: **[DIA1_PRODUCCION_APP_MEINCART.md](./DIA1_PRODUCCION_APP_MEINCART.md)**

---

## Arquitectura

Escenario recomendado: **un subdominio** sirve la PWA y la API bajo el mismo host (`/api/v1`, `/ws`).

```mermaid
graph TB
    subgraph Internet
        U[Usuario / PWA]
    end

    subgraph Cloudflare["Cloudflare (meincart.com)"]
        DNS[DNS rent.meincart.com]
        SSL[SSL edge + WAF]
    end

    subgraph VPS["VPS (Docker)"]
        Caddy[Caddy :80 / :443]
        FE[Frontend nginx :8080]
        API[API Go :7070]
        MONGO[(MongoDB :27017<br/>solo red interna)]
        VOL[(Volumen api_storage<br/>documentos)]
    end

    SMTP[Proveedor SMTP gratuito<br/>Brevo / SendGrid / Gmail]

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

Instalación guiada (recomendado): kit [`ubuntu/`](../ubuntu/README.md) — desde tu PC `./ubuntu/push-to-server.sh`, en el servidor `sudo ./bootstrap.sh` (menús 1–4).

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

Usaremos **`rent.meincart.com`** como subdominio de la aplicación. Alternativas válidas: `myrent.meincart.com`, `renta.meincart.com`, `arriendos.meincart.com`.

### 2.1 Crear registro DNS

1. Entra en [dash.cloudflare.com](https://dash.cloudflare.com) → **meincart.com** → **DNS** → **Records**.
2. Añade un registro **A**:

| Campo | Valor |
|-------|-------|
| Tipo | `A` |
| Nombre | `rent` |
| IPv4 | IP pública de tu VPS (ej. `203.0.113.10`) |
| Proxy | **Proxied** (nube **naranja**) |
| TTL | Auto |

3. (Opcional) Redirección `www`: registro `CNAME` `www` → `meincart.com` si usas el apex para otra cosa. Para solo el subdominio `rent`, no es obligatorio.

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
dig rent.meincart.com +short
# Con proxy naranja verás IPs de Cloudflare (no la IP directa del VPS)
```

Más ejemplos de registros: [docs/Cloudflare/dns.md § Tabla de registros](./Cloudflare/dns.md#tabla-de-registros-dns-de-ejemplo).

### 2.5 Endurecimiento Cloudflare Free

1. **Security → WAF**: activa el conjunto managed / OWASP disponible en Free.
2. **Bot Fight Mode**: On (si bloquea clientes legítimos, desactívalo).
3. Rate limiting en `/api/v1/auth/login` si el plan lo permite; si no, confía en `LOGIN_RATE_LIMIT` de la API.
4. **Email → Email Routing**: alias `contacto@` / `dmarc@` → tu Gmail (MX **DNS only**).

Referencia de reglas: [deploy/cloudflare/README.md](../deploy/cloudflare/README.md). Checklist corta: [DIA1_PRODUCCION_APP_MEINCART.md](./DIA1_PRODUCCION_APP_MEINCART.md).

---

## 3. Preparar el servidor

### 3.0 Kit genérico `ubuntu/` (recomendado)

Desde tu máquina local (empaqueta, transfiere y descomprime):

```bash
./ubuntu/push-to-server.sh --host usuario@203.0.113.10
```

En el servidor:

```bash
cd ~/platform-kit/ubuntu
sudo ./bootstrap.sh
# 1 SO → 2 seguridad → 3 UFW → 4 Docker (+ red platform-net)
```

Guía: [ubuntu/README.md](../ubuntu/README.md). Si ya usaste el kit, puedes saltar 3.2 y 3.3.

### 3.1 Conectar por SSH

```bash
ssh usuario@203.0.113.10
```

### 3.2 Instalar Docker (manual, si no usaste el kit)

```bash
# Ubuntu / Debian (script oficial)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Cierra sesión y vuelve a entrar para aplicar el grupo docker
docker compose version
```

### 3.3 Firewall (UFW) (manual, si no usaste el kit)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### 3.4 Clonar el repositorio de MyRent Go

```bash
sudo mkdir -p /opt/myrent
sudo chown "$USER:$USER" /opt/myrent
cd /opt/myrent
git clone https://github.com/TU_USUARIO/my-rent-go.git .
# o: git pull si ya existe
```

### 3.5 Permisos del script de deploy

```bash
chmod +x scripts/deploy-prod.sh scripts/backup-prod.sh scripts/backup-restic.sh scripts/deploy-monitoring.sh
```

---

## 4. Generar secretos

**Nunca** uses valores de ejemplo en producción. Genera secretos únicos en el servidor:

```bash
# JWT (mínimo 32 caracteres)
openssl rand -base64 32

# Contraseña root de MongoDB
openssl rand -base64 24

# Otra contraseña (rotación de credenciales, tokens de API internos, claves de cifrado)
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

### 5.2 Variables para subdominio `rent.meincart.com`

Sustituye `CHANGE_ME...` y las contraseñas generadas en el paso anterior.

```env
# ── Entorno ───────────────────────────────────────────────────────────────────
APP_ENV=production
APP_PORT=7070
APP_NAME=MyRent Go

# Caddy obtiene el certificado para este host
DOMAIN=rent.meincart.com
FRONTEND_URL=https://rent.meincart.com
BASE_URL=https://rent.meincart.com

# Solo el origen del frontend (sin espacios)
CORS_ORIGINS=https://rent.meincart.com

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

# ── SMTP gratuito (ver sección 8 — Brevo recomendado día 1) ───────────────────
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<login-brevo>
SMTP_PASSWORD=<smtp-key-brevo>
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
| `DOMAIN` | Registro DNS en Cloudflare (`rent`) |
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

Si quieres `api.meincart.com` además de `rent.meincart.com`:

1. Añade registro **A** `api` → IP del VPS (proxied) en Cloudflare.
2. Extiende el `Caddyfile` con un bloque `api.meincart.com { reverse_proxy api:7070 }`.
3. Ajusta `CORS_ORIGINS=https://rent.meincart.com` y `BASE_URL=https://api.meincart.com`.
4. El frontend en desarrollo usa rutas relativas `/api/` — con hosts separados puede requerir variable `VITE_API_URL` en build (no es el escenario por defecto del proyecto).

---

## 8. SMTP gratuito (correo saliente) — camino por defecto

En producción **no** uses Mailpit. El día 1 usa un proveedor SMTP **gratuito con límites** (suficiente para recordatorios de arriendo). **Mailcow es opcional** y no forma parte del camino por defecto.

Detalle y SPF/DKIM: [docs/Cloudflare/correo.md](./Cloudflare/correo.md).

### 8.1 Brevo (recomendado día 1)

Cuenta free (~300 correos/día típico). Verifica el dominio en el panel y copia SPF/DKIM a Cloudflare (**DNS only**).

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<login-o-email-brevo>
SMTP_PASSWORD=<smtp-key>
SMTP_FROM=noreply@meincart.com
SMTP_FROM_NAME=MyRent Go
```

SPF (unifica un solo TXT `@`):

```text
v=spf1 include:spf.brevo.com include:_spf.mx.cloudflare.net ~all
```

### 8.2 SendGrid (alternativa free)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.xxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=noreply@meincart.com
SMTP_FROM_NAME=MyRent Go
```

SPF: `include:sendgrid.net` junto al de Email Routing si aplica.

### 8.3 Gmail (más simple; FROM = tu Gmail)

1. Activa verificación en 2 pasos.
2. Crea una [contraseña de aplicación](https://myaccount.google.com/apppasswords).

Sin Google Workspace **no** uses `noreply@meincart.com` como FROM (Gmail lo reescribirá o rechazará).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
SMTP_FROM=tu-correo@gmail.com
SMTP_FROM_NAME=MyRent Go
```

### 8.4 Microsoft 365 (si ya tienes buzón en el dominio)

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notificaciones@meincart.com
SMTP_PASSWORD=<contraseña-o-app-password>
SMTP_FROM=notificaciones@meincart.com
```

### 8.5 Mailcow (opcional, futuro)

Solo si más adelante quieres correo self-hosted: [docs/Cloudflare/mailcow.md](./Cloudflare/mailcow.md). Requiere otro host o pelear puertos 80/443. **No** lo uses el día 1.

### 8.6 Verificar SMTP en la app

1. Reinicia la API: `docker compose -f docker-compose.prod.yml restart api`
2. Inicia sesión como admin → **Notificaciones**
3. Comprueba *SMTP configurado* (`GET /api/v1/email-recipients/smtp-status`)
4. Destinatarios → **Probar formatos** (o correo de prueba)
5. Revisa bandeja y carpeta spam

Correo **entrante** (reenvío) es independiente: Cloudflare Email Routing → [correo.md](./Cloudflare/correo.md).

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

1. Accede a `https://rent.meincart.com`
2. Login: `admin` / `admin123`
3. **Configuración → Seguridad → Cambiar contraseña**
4. Activa **MFA** (recomendado para administradores)

---

## 10. Verificación post-despliegue

### 10.1 Health check

```bash
# Desde el servidor
curl -s https://rent.meincart.com/health
# {"status":"ok","service":"MyRent Go"}

# Desde tu máquina
curl -sI https://rent.meincart.com | head -5
```

### 10.2 HTTPS y certificado

- Abre `https://rent.meincart.com` en el navegador: candado verde, sin advertencias.
- Cloudflare en **Full (strict)**.

### 10.3 Login y MFA

- Login con el usuario admin.
- Navega al dashboard, propiedades y arrendatarios.
- Configura MFA si está habilitado (`MFA_ENABLED=true`).

### 10.4 CORS

Si el frontend carga pero las peticiones API fallan con error CORS:

- Verifica `CORS_ORIGINS=https://rent.meincart.com` (sin barra final, con `https://`).
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

### 11.1 Script de producción (recomendado)

Usa [`scripts/backup-prod.sh`](../scripts/backup-prod.sh): dump Mongo vía contenedor + documentos del API, empaqueta `.tar.gz` y rota por días.

```bash
cd /opt/myrent
chmod +x scripts/backup-prod.sh
./scripts/backup-prod.sh
# Archivo en ./backups/myrent_prod_YYYYMMDD_HHMMSS.tar.gz — cópialo fuera del VPS
```

Cron diario 03:15:

```bash
crontab -e
# 15 3 * * * cd /opt/myrent && ./scripts/backup-prod.sh >> /var/log/myrent-backup.log 2>&1
```

Variables opcionales: `BACKUP_DIR`, `KEEP_DAYS` (default 14), `COMPOSE_FILE`.

### 11.2 Restaurar MongoDB

Desde un archive generado por `mongodump --archive` (contenido dentro del `.tar.gz` → `mongo.archive`):

```bash
# Extraer primero el work_* / mongo.archive del tar.gz
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongorestore \
    -u "$MONGO_ROOT_USER" \
    -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --archive \
    --drop < mongo.archive
```

Ver también el script genérico de desarrollo [`scripts/backup.sh`](../scripts/backup.sh) (espera `mongodump` en el host).

### 11.3 Volumen de documentos

```bash
VOLUME=$(docker volume ls -q | grep api_storage | head -1)
docker run --rm \
  -v "${VOLUME}:/data:ro" \
  -v /opt/myrent/backups:/backup \
  alpine tar czf "/backup/documents_$(date +%Y%m%d).tar.gz" -C /data .
```

Programa este backup semanalmente y copia los archivos a almacenamiento externo (Amazon S3, Backblaze B2, Google Cloud Storage, un NAS remoto o un disco externo).

---

## 12. Monitoreo

### 12.1 Endpoint `/metrics`

Con `METRICS_PROTECTED=true` (recomendado), `/metrics` requiere JWT de usuario **owner** o **admin**:

```bash
# Obtener token
TOKEN=$(curl -s -X POST https://rent.meincart.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"TU_PASSWORD"}' | jq -r '.access_token')

curl -s -H "Authorization: Bearer $TOKEN" https://rent.meincart.com/metrics | head
```

El panel **Configuración → Sistema** muestra estado de métricas y logs internos.

### 12.2 Logs de contenedores

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
docker compose -f docker-compose.prod.yml logs -f --tail=50 caddy
```

### 12.3 Prometheus (opcional)

1. Descomenta el servicio `prometheus` en `docker-compose.yml` (desarrollo) como referencia.
2. En producción, añade un scraper que apunte a `https://rent.meincart.com/metrics` con autenticación Bearer, o scrapea `api:7070/metrics` desde la red Docker interna.

### 12.4 Uptime externo

Servicios gratuitos (UptimeRobot, Better Stack, Hetrixtools, Pingdom) pueden vigilar:

- `https://rent.meincart.com/health` cada 5 minutos

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
curl -s https://rent.meincart.com/health
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
| Solución | `CORS_ORIGINS=https://rent.meincart.com`, reiniciar `api` |

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
| DNS no apunta al VPS | Verificar registro `rent` en Cloudflare |

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
| Día 1 checklist | [DIA1_PRODUCCION_APP_MEINCART.md](./DIA1_PRODUCCION_APP_MEINCART.md) |
| Kit Ubuntu genérico | [ubuntu/README.md](../ubuntu/README.md) |
| Observabilidad MyRent | [OBSERVABILIDAD_RESTIC.md](./OBSERVABILIDAD_RESTIC.md) |
| Cloudflare meincart.com | [Cloudflare/README.md](./Cloudflare/README.md) |
| DNS y SSL | [Cloudflare/dns.md](./Cloudflare/dns.md) |
| Correo | [Cloudflare/correo.md](./Cloudflare/correo.md) |
| Reglas WAF/cache | [deploy/cloudflare/README.md](../deploy/cloudflare/README.md) |
| Plantilla `.env` | [.env.production.example](../.env.production.example) |
| Compose producción | [docker-compose.prod.yml](../docker-compose.prod.yml) |
| Deploy script | [scripts/deploy-prod.sh](../scripts/deploy-prod.sh) |

---

*Última actualización: alineado con `docker-compose.prod.yml`, Caddy, kit `ubuntu/` (paso 0) y dominio meincart.com en Cloudflare.*
