# Día 1 — Producción `rent.meincart.com` (1 host en casa + SMTP gratuito)

Checklist paso a paso para publicar **MyRent Go** bajo `rent.meincart.com` en **Cloudflare Free**, con:

- **Un solo host** (tu PC/NAS en casa o un VPS) con Docker.
- **Acceso público por Cloudflare** (recomendado: **Cloudflare Tunnel** o, si no, DNS + “port-forward”/IP pública).
- Correo **entrante** (reenvío) por **Cloudflare Email Routing**.
- Correo **saliente** (notificaciones desde la app) por **SMTP gratuito** (**Brevo / SendGrid / Gmail**) configurado en `.env`.
- **Sin Mailcow** en el día 1 (opcional/futuro).

> Guías largas: [DESPLIEGUE_PRODUCCION_SUBDOMINIO.md](./DESPLIEGUE_PRODUCCION_SUBDOMINIO.md) · [Cloudflare](./Cloudflare/README.md) · [CHECKLIST_PRODUCCION.md](./CHECKLIST_PRODUCCION.md) · [Kit Ubuntu genérico](../ubuntu/README.md)

## Paso −1 / 0 — Preparar el host Ubuntu (recomendado)

Antes de clonar la app, deja el servidor listo con el kit genérico en [`ubuntu/`](../ubuntu/README.md) (SO, SSH, UFW, Docker, software de apoyo opcional).

**Desde tu Mac/PC** (un comando; empaqueta ZIP, SCP y descomprime en el remoto):

```bash
./ubuntu/push-to-server.sh
# o: ./ubuntu/push-to-server.sh usuario@IP_DEL_SERVIDOR
```

**En el servidor:**

```bash
cd ~/platform-kit/ubuntu   # o el --dir que elegiste
sudo ./bootstrap.sh
# Orden: 1 SO → 2 seguridad → 3 firewall → 4 Docker → (5 plataforma si aplica) → 6 backups
```

El kit `ubuntu/` es **genérico** (no acoplado a MyRent Go). Sirve para cualquier app. MyRent Go se despliega después con `deploy-prod.sh`.

Detalle: [ubuntu/README.md](../ubuntu/README.md) · catálogo: [ubuntu/docs/CATALOGO.md](../ubuntu/docs/CATALOGO.md)

## Conceptos (para entender “DNS → WAF → VPS → .env → deploy-prod → SMTP → backup”)

### VPS / Host
**VPS** (Virtual Private Server) o “host en casa” es el equipo donde corre Docker y donde vive tu app:

- Contiene **MongoDB (dentro de Docker)**, **API Go**, **frontend** y **Caddy**.
- En producción se expone **solo** lo necesario (típicamente 80/443 hacia Cloudflare; MongoDB y la API interna no se publican a Internet).

### DNS
**DNS** (Domain Name System) traduce un nombre (ej. `rent.meincart.com`) a una IP o un “túnel”:

- Cloudflare usa DNS para decirle a los navegadores a dónde ir.
- En Cloudflare verás registros **Proxied** (nube naranja) para web/API.

### WAF (Web Application Firewall)
**WAF** inspecciona el tráfico HTTP y bloquea patrones de ataques comunes definidos por reglas OWASP: inyección SQL, cross-site scripting (XSS), path traversal, ejecución remota de código y solicitudes malformadas. También filtra tráfico de bots maliciosos, escaneos automatizados y peticiones que violan políticas de seguridad HTTP.

- En este proyecto WAF va en **Cloudflare**, no en el contenedor.
- Ayuda a reducir intentos de explotación y brute force antes de que lleguen a tu API.

### SMTP
**SMTP** es el protocolo que usa la app para enviar correos **salientes**:

- Tu backend llama a `SMTP_HOST/SMTP_PORT` y envía notificaciones.
- Cloudflare **Email Routing** es el “otro lado”: reenvía correos **entrantes** a tu Gmail.

### Backup
**Backup** es una copia de seguridad:

- `scripts/backup-prod.sh` hace:
  1) dump de MongoDB vía el contenedor,
  2) copia documentos desde el volumen `/app/storage/documents` si está montado,
  3) empaqueta todo en un `.tar.gz` y rota por días.
- El objetivo es que si falla un disco o borra algo, puedas **restaurar**.

### UFW/SSH (endurecimiento del host)
**UFW** es un firewall simple en Linux (por ejemplo Ubuntu) para permitir solo 22/80/443 (y bloquear el resto).

**SSH** debe limitarse para que nadie intente entrar por fuerza bruta:
- idealmente login solo con clave,
- y restringir el puerto 22 por IP si es posible.

Puedes aplicar UFW, fail2ban, unattended-upgrades y Docker con el menú del kit [`ubuntu/`](../ubuntu/README.md) en lugar de copiar comandos a mano.

## Datos que debes completar (placeholders)

Completa estos valores en tu entorno (no subas secretos al repo):

- **IP pública del VPS/host (si usas IP/port-forward):** `<TU_IP_PUBLICA_VPS>`
- **Brevo/SendGrid API key / SMTP password:** `<TU_SMTP_PASSWORD>`
- **Dominio/subdominio:** `rent.meincart.com`

## Arquitectura (día 1)

```mermaid
flowchart TB
  User[Usuario] --> CF[Cloudflare Free]
  CF -->|"rent.meincart.com"| Edge[Cloudflare Edge/TLS/WAF]
  Edge --> Host[Caddy + Docker (API + Frontend)]
  Host --> Mongo[(MongoDB interno Docker)]
  Host --> SMTP[SMTP (Brevo/SendGrid/Gmail)]
  MailInbound[Correo a contacto@/dmarc@] --> CFRoute[CF Email Routing]
  CFRoute --> Gmail[Tu Gmail]
```

## Paso 0 — Elegir host/subdominio y preparar DNS

### 0.1 Registros DNS (mínimos)
En Cloudflare → **DNS → Records**:

1) **A record**
- **Name:** `rent`
- **Content:** `<TU_IP_PUBLICA_VPS>` (o destino del Tunnel)
- **Proxy:** **Proxied (nube naranja)**

2) **(Opcional) www**
- si usas `www`, hazlo apuntar a `rent` (CNAME) con Proxied.

### 0.2 TLS en Cloudflare (Full strict)
En Cloudflare → **SSL/TLS**:

- **SSL mode:** **Full (strict)**
- **Always Use HTTPS:** ON
- **Minimum TLS:** 1.2

> Justificación: Caddy en el host usa un certificado válido (Let's Encrypt), y Cloudflare “confía” en el origen con Full strict.

## Paso 1 — Cloudflare: WAF + cache seguro (y Email Routing)

### 1.1 WAF (Cloudflare Free)
En Cloudflare → **Security → WAF**:

- Activa el conjunto **Cloudflare Managed Ruleset** y **OWASP Core Ruleset** (reglas gestionadas del plan Free).
- Activa **Bot Fight Mode** para reducir spam y bots automatizados. Si bloquea usuarios legítimos, desactívalo o crea una excepción en reglas WAF personalizadas (hasta 5 en Free).

### 1.2 Rate limiting
Si en tu plan lo tienes disponible para Cloudflare:

- aplica rate limit en `/api/v1/auth/login`
- y deja el resto a la protección de la API (el backend ya tiene `LOGIN_RATE_LIMIT`).

### 1.3 Cache (no cachear API ni WebSocket)
En reglas de Cloudflare:

- **Bypass cache:** `/api/*`, `/ws`
- (Opcional) cache static assets `/assets/*`

> Esto evita problemas con datos/estado y WebSocket.

### 1.4 Email Routing (entrante, gratis)
En Cloudflare → **Email Routing**:

1) Actívalo
2) Crea alias de entrada:
   - `contacto@meincart.com` → reenvío a tu Gmail
   - `dmarc@meincart.com` → reenvío para informes (DMARC)
3) Verifica que los **MX** y **TXT** del servicio queden en **DNS only** (gris).

Guía: [docs/Cloudflare/correo.md](./Cloudflare/correo.md)

## Paso 2 — Endurecer el host (VPS/PC en casa) con UFW + SSH

**Opción A (recomendada):** kit genérico ya transferido en el paso 0:

```bash
cd ~/platform-kit/ubuntu
sudo ./bootstrap.sh
# Menús 1 (SO) → 2 (SSH/fail2ban) → 3 (UFW) → 4 (Docker)
```

**Opción B (manual):**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Luego revisa:

- SSH con clave (desactivar password si puedes).
- No publiques (o no abras) **27017**, **7070** ni **25** al WAN.

## Paso 0 — Transferir la app al BMAX (desde el Mac)

Igual que el kit `ubuntu/push-to-server.sh`, pero con el código de MyRent Go:

```bash
# Defaults SSH: cp .push-defaults.example .push-defaults  (o reutiliza ubuntu/.push-defaults)
./push-to-server.sh
# o menú: ./prod-remote.sh  → opción 0
```

Preserva el `.env` del servidor. Por defecto no empaqueta `ubuntu/` (el kit se sube aparte).

## Paso 3 — Clonar repo y preparar `.env`


1) Clona el repo de **MyRent Go** en el host (el kit `ubuntu/` puede vivir aparte en `~/platform-kit`):

```bash
mkdir -p /opt/myrent
cd /opt/myrent
git clone <URL_DEL_REPO> .
chmod +x scripts/deploy-prod.sh scripts/backup-prod.sh scripts/backup-restic.sh scripts/deploy-monitoring.sh
```

2) Copia plantilla y permisos:

```bash
cp .env.production.example .env
chmod 600 .env
```

3) Genera secretos (en el host):

```bash
openssl rand -base64 32  # JWT_SECRET
openssl rand -base64 24  # MONGO_ROOT_PASSWORD
```

4) Ajusta variables clave:

```env
DOMAIN=rent.meincart.com
FRONTEND_URL=https://rent.meincart.com
BASE_URL=https://rent.meincart.com
CORS_ORIGINS=https://rent.meincart.com
ACME_EMAIL=admin@meincart.com
MFA_ENABLED=true
METRICS_PROTECTED=true
```

## Paso 4 — SMTP gratuito (saliente desde la app)

### 4.1 SMTP por defecto = gratuito
Usa **Brevo** (recomendado día 1), o SendGrid, o Gmail:

Brevo (ejemplo):

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=90a030001@smtp-brevo.com
SMTP_PASSWORD=<TU_SMTP_PASSWORD>
SMTP_FROM=noreply@meincart.com
SMTP_FROM_NAME=MyRent Go
```

SendGrid (alternativa):

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<TU_SMTP_PASSWORD>
SMTP_FROM=noreply@meincart.com
SMTP_FROM_NAME=MyRent Go
```

### 4.2 SPF/DKIM (obligatorio para buena entrega)
En el panel del proveedor SMTP:

- verifica dominio `meincart.com`,
- copia SPF/DKIM en Cloudflare como **DNS only**.

> Referencia: [docs/Cloudflare/correo.md](./Cloudflare/correo.md)

## Paso 5 — Deploy (BMAX con platform-caddy, o Caddy builtin)

### 5.A Host con kit ubuntu (BMAX — tu caso)

Ya tienes `platform-caddy` en 80/443 con cert de `rent.meincart.com`. **No** levantes el Caddy de `docker-compose.prod.yml` (chocaría de puertos).

```bash
# En el BMAX, repo MyRent Go (ej. /opt/myrent o ~/my-rent-go)
chmod +x scripts/*.sh

# 1) Enlazar borde del kit → myrent-api / myrent-frontend
./scripts/link-platform-caddy.sh

# 2) Desplegar app sin Caddy propio (menú one-shot recomendado)
./prod-menu.sh
# → 1) Preparar .env  2) Editar .env (nano)  10) TODO EN UN PASO
# Atajo: ./prod-menu.sh 10

# Manual equivalente:
# ./scripts/link-platform-caddy.sh
# EDGE=platform ./scripts/deploy-prod.sh

docker compose -f docker-compose.prod.yml -f docker-compose.prod.platform.yml ps
curl -sf http://127.0.0.1/health && echo OK
```

### 5.B Host solo MyRent (Caddy del compose)

```bash
./scripts/deploy-prod.sh
docker compose -f docker-compose.prod.yml ps
```

Qué hace `deploy-prod.sh`:
- carga `.env`,
- verifica que `JWT_SECRET`, `MONGO_ROOT_*`, `CORS_ORIGINS`, `FRONTEND_URL` y `DOMAIN` estén definidos,
- con `EDGE=platform` usa `docker-compose.prod.platform.yml` (sin Caddy MyRent; red `platform-net`),
- hace build/up,
- espera salud en `/health`.

## Paso 6 — Verificación post-despliegue (día 1)

En el navegador:

- `https://rent.meincart.com` carga bien.
- Login + MFA funciona.
- Dashboard y listados básicos.

En la app:

- Configuración → Notificaciones por correo:
  - debe indicar **SMTP configurado**
- Destinatarios → **Probar formatos** (o correo de prueba)
- Revisar bandeja y spam.

API para SMTP status:
`GET /api/v1/email-recipients/smtp-status`

## Paso 7 — Backup prod (local + Restic off-site)

### 7.1 Backup local

En el host:

```bash
chmod +x scripts/backup-prod.sh scripts/backup-restic.sh
./scripts/backup-prod.sh
```

Esto genera un archivo:

`./backups/myrent_prod_YYYYMMDD_HHMMSS.tar.gz`

Cron diario local (ejemplo 03:15):

```bash
crontab -e
# 15 3 * * * cd /opt/myrent && ./scripts/backup-prod.sh >> /var/log/myrent-backup.log 2>&1
```

Rotación local: el script elimina backups viejos según `KEEP_DAYS` (por defecto 14).

### 7.2 Backup off-site con Restic (recomendado)

```bash
cp deploy/platform/restic.env.example deploy/platform/restic.env
chmod 600 deploy/platform/restic.env
# Completar RESTIC_REPOSITORY, RESTIC_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

RESTIC_INIT=1 ./scripts/backup-restic.sh   # una vez
./scripts/backup-restic.sh                 # manual
```

Cron unificado (local + S3/B2/MinIO, ejemplo 03:30):

```bash
# 30 3 * * * cd /opt/myrent && ./scripts/backup-restic.sh >> /var/log/myrent-restic.log 2>&1
```

Guía: [OBSERVABILIDAD_RESTIC.md](./OBSERVABILIDAD_RESTIC.md)

## Paso 8 — Observabilidad (Prometheus + Grafana)

**Opción A — acoplada a MyRent Go** (red `myrentgo-prod`):

```bash
# Mismo METRICS_SCRAPE_TOKEN en .env y deploy/platform/.env.monitoring
openssl rand -base64 32

cp deploy/platform/.env.monitoring.example deploy/platform/.env.monitoring
chmod 600 deploy/platform/.env.monitoring

./scripts/deploy-monitoring.sh
```

- Prometheus: http://127.0.0.1:9090 (solo localhost)
- Alertmanager: http://127.0.0.1:9093 — alertas por correo y/o Telegram
- Grafana: http://127.0.0.1:3001 — dashboard **MyRent Go — Overview**

**Opción B — kit genérico** (`ubuntu/platform/`): menú 5 del `bootstrap.sh` tras el paso 0. Útil si varias apps comparten el mismo host. No combines A y B en el mismo host sin ajustar targets.

No expongas 9090/9093/3001 a Internet; usa túnel SSH si accedes de forma remota.

## Referencias rápidas

- [DESPLIEGUE_PRODUCCION_SUBDOMINIO.md](./DESPLIEGUE_PRODUCCION_SUBDOMINIO.md)
- [PRODUCTION.md](./PRODUCTION.md)
- [Cloudflare/dns.md](./Cloudflare/dns.md)
- [Cloudflare/correo.md](./Cloudflare/correo.md)
- [deploy/cloudflare/README.md](../deploy/cloudflare/README.md)
- [scripts/deploy-prod.sh](../scripts/deploy-prod.sh)
- [scripts/backup-prod.sh](../scripts/backup-prod.sh)
- [scripts/backup-restic.sh](../scripts/backup-restic.sh)
- [scripts/deploy-monitoring.sh](../scripts/deploy-monitoring.sh)
- [OBSERVABILIDAD_RESTIC.md](./OBSERVABILIDAD_RESTIC.md)
- [ubuntu/README.md](../ubuntu/README.md) — kit genérico (paso 0 ZIP/SSH + SO/Docker/plataforma)
- [ubuntu/docs/CATALOGO.md](../ubuntu/docs/CATALOGO.md)

