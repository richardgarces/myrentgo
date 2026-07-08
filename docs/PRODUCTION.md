# Guía de producción — MyRent Go

Documentación para desplegar MyRent Go en un VPS con dominio **meincart.com** (Cloudflare), Docker Compose y TLS automático (Caddy).

## Arquitectura

```
Internet → Cloudflare (proxied) → VPS :443/:80
                                      └── Caddy (TLS)
                                            ├── /api/*, /ws, /health → API Go :7070
                                            └── /* → Frontend Nginx :8080
MongoDB :27017 (solo red interna Docker, con autenticación)
Volumen api_storage → documentos en filesystem
```

## Pre-despliegue (checklist)

### Servidor

- [ ] VPS con Docker y Docker Compose v2
- [ ] Puertos **80** y **443** abiertos en firewall
- [ ] Dominio **meincart.com** activo en Cloudflare (estado *Active*)
- [ ] Registro **A** `@` → IP del VPS (**Proxied** / nube naranja)
- [ ] SSL/TLS en Cloudflare: **Full (strict)** ([docs/Cloudflare/dns.md](./Cloudflare/dns.md))
- [ ] **Always Use HTTPS** activado en Cloudflare

### Secretos y configuración

- [ ] Copiar plantilla: `cp .env.production.example .env`
- [ ] Generar `JWT_SECRET`: `openssl rand -base64 32`
- [ ] Generar `MONGO_ROOT_PASSWORD`: `openssl rand -base64 24`
- [ ] Reemplazar **todos** los `CHANGE_ME` en `.env`
- [ ] `APP_ENV=production`
- [ ] `FRONTEND_URL=https://meincart.com`
- [ ] `CORS_ORIGINS` solo con dominios de producción
- [ ] `METRICS_PROTECTED=true`
- [ ] `LOGIN_RATE_LIMIT=5` (o más estricto si lo necesitas)
- [ ] SMTP real configurado (no Mailpit)
- [ ] **No** commitear `.env` al repositorio

### Seguridad

- [ ] MFA habilitado (`MFA_ENABLED=true`)
- [ ] MongoDB **con** autenticación (usuario root en compose prod)
- [ ] Puerto MongoDB **no** publicado hacia internet
- [ ] Pentest local ejecutado (`./security/run-pentest.sh`) antes del go-live
- [ ] WAF / reglas Cloudflare revisadas ([deploy/cloudflare/README.md](../deploy/cloudflare/README.md))

### Datos y persistencia

- [ ] Volumen `api_storage` para documentos (`DOCUMENTS_PATH=/app/storage/documents`)
- [ ] Volumen `mongodb_data` para base de datos
- [ ] Estrategia de backup definida (ver abajo)
- [ ] `MAX_UPLOAD_MB` acorde al uso (default 30)

### Aplicación

- [ ] Builds verificados: `./scripts/deploy-prod.sh --check`
- [ ] Seed de admin **solo una vez** (ver abajo)
- [ ] Health checks respondiendo (`/health`)
- [ ] Correo de verificación y reset de contraseña probados con SMTP real

---

## Generar secretos

```bash
# JWT (mínimo 32 caracteres)
openssl rand -base64 32

# Contraseña root de MongoDB
openssl rand -base64 24
```

Pega los valores en `.env`. Si la contraseña de MongoDB contiene caracteres especiales (`@`, `:`, `/`), codifícalos en la URI o usa solo caracteres alfanuméricos en la contraseña generada.

---

## Cloudflare DNS + SSL

1. En [dash.cloudflare.com](https://dash.cloudflare.com) → **meincart.com** → **DNS**:
   - `A` `@` → IP del VPS → **Proxied**
   - Opcional: `CNAME` `www` → `meincart.com` → **Proxied**
2. **SSL/TLS → Overview** → **Full (strict)**
3. **SSL/TLS → Edge Certificates** → Always Use HTTPS, TLS 1.2+
4. Caddy en el VPS obtiene certificado Let's Encrypt para `meincart.com` (puertos 80/443 accesibles).

Detalle: [docs/Cloudflare/dns.md](./Cloudflare/dns.md)

---

## Despliegue

```bash
# 1. Configurar entorno
cp .env.production.example .env
nano .env   # completar secretos

# 2. Validar y desplegar
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh

# O sin menú interactivo:
./scripts/deploy-prod.sh --yes

# Solo validar (sin levantar contenedores):
./scripts/deploy-prod.sh --check
```

Alternativa desde el menú de desarrollo:

```bash
./myrent.sh docker-up-prod
```

El script valida variables obligatorias, ejecuta `go build` y `npm run build`, construye imágenes Docker y levanta `docker-compose.prod.yml`.

---

## Usuario administrador inicial (seed)

El seed crea `admin` / `admin123` **solo si no existe** un admin previo.

**Ejecutar una sola vez** tras el primer despliegue, con MongoDB accesible:

```bash
# Desde el host (con Go instalado), apuntando a MongoDB del contenedor:
export $(grep -v '^#' .env | xargs)
cd backend && go run ./cmd/seed
```

O dentro del contenedor API (si incluyes el binario seed en la imagen — por defecto solo está `./api`):

```bash
# Recomendado: ejecutar desde el host con MONGODB_URI del .env
# (el contenedor API no incluye cmd/seed por defecto)
```

**No** uses `SEED_FORCE=1` en producción salvo recuperación controlada (borra usuarios).

Tras el primer login:

1. Cambia la contraseña de `admin`
2. Configura MFA
3. Crea usuarios del equipo con contraseñas fuertes

---

## SMTP (producción)

Mailpit es **solo desarrollo**. En producción configura un proveedor real en `.env`:

| Proveedor | SMTP_HOST | Notas |
|-----------|-----------|-------|
| Mailcow (self-hosted) | `mail.meincart.com` | [docs/Cloudflare/mailcow.md](./Cloudflare/mailcow.md) |
| SendGrid | `smtp.sendgrid.net` | Usuario `apikey`, password = API key |
| Gmail | `smtp.gmail.com` | Contraseña de aplicación (2FA) |

Variables requeridas: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.

Prueba enviando verificación de correo o reset de contraseña desde la app.

---

## MongoDB — backup y restore

### Backup manual

```bash
# Con .env cargado (MONGODB_URI con credenciales)
source .env
./scripts/backup.sh
```

Los archivos se guardan en `./backups/` (ignorado por git).

### Backup automático (cron)

```bash
# Ejemplo: backup diario a las 03:00
0 3 * * * cd /ruta/my-rent-go && set -a && source .env && set +a && ./scripts/backup.sh >> /var/log/myrent-backup.log 2>&1
```

### Restore

```bash
tar -xzf backups/myrent_YYYYMMDD_HHMMSS.tar.gz -C /tmp
mongorestore --uri="$MONGODB_URI" --db=myrent /tmp/dump_YYYYMMDD_HHMMSS/myrent
```

### Buenas prácticas

- Retener al menos 7 días de backups off-site (S3, otro servidor)
- Probar restore en entorno de staging antes de depender del backup
- Antes de actualizaciones mayores, backup manual

---

## Métricas y monitoreo

| Variable | Producción | Descripción |
|----------|------------|-------------|
| `METRICS_ENABLED` | `true` | Expone `GET /metrics` (Prometheus) |
| `METRICS_PROTECTED` | `true` | Requiere JWT admin/owner para `/metrics` |
| `LOGIN_RATE_LIMIT` | `5` | Intentos de login por IP por ventana |
| `LOGIN_RATE_WINDOW` | `1m` | Ventana del rate limit de login |

El panel **Configuración → Sistema** muestra advertencias si MongoDB no tiene auth o si `/metrics` es público.

Health checks:

- `GET https://meincart.com/health` → API
- Docker healthchecks en `api`, `frontend`, `mongodb`

---

## Almacenamiento de documentos

- Ruta en contenedor: `DOCUMENTS_PATH=/app/storage/documents`
- Volumen Docker: `api_storage` montado en `/app/storage`
- Los metadatos están en MongoDB; los archivos en disco
- Al migrar servidor: copiar volumen `api_storage` **y** backup de MongoDB

---

## Diferencias desarrollo vs producción

| Aspecto | Desarrollo | Producción |
|---------|------------|------------|
| Compose | `docker-compose.yml` | `docker-compose.prod.yml` |
| Env | `.env` (desde `.env.example`) | `.env` (desde `.env.production.example`) |
| `APP_ENV` | `development` | `production` |
| MongoDB | Puerto `127.0.0.1:27017`, sin auth | Sin puerto publicado, con auth |
| SMTP | Mailpit (`localhost:1025`) | Proveedor real (Mailcow, SendGrid, etc.) |
| CORS | `localhost:4000`, `5173` | `https://meincart.com` |
| `FRONTEND_URL` | `http://localhost:4000` | `https://meincart.com` |
| Edge / TLS | Sin proxy o puertos directos | Caddy :80/:443 + Let's Encrypt |
| `METRICS_PROTECTED` | `false` (Prometheus local) | `true` |
| Frontend expuesto | `:3000` o Vite `:4000` | Solo vía Caddy (443) |
| API expuesta | `:7070` | Solo vía Caddy (`/api`) |
| Seed admin | `./myrent.sh bootstrap` frecuente | **Una vez**, luego cambiar password |
| Secretos | Placeholder aceptable en dev | Obligatorios, fuertes, sin `CHANGE_ME` |

---

## Post-despliegue

- [ ] Smoke test: login, dashboard, propiedades, subida de documento
- [ ] WebSocket (`/ws`) detrás de Cloudflare
- [ ] Verificación de email y reset de contraseña
- [ ] MFA en cuenta admin
- [ ] Backup inicial ejecutado y verificado
- [ ] Documentar credenciales en gestor de secretos (no en git)

## Rollback

1. `docker compose -f docker-compose.prod.yml down`
2. Restaurar imagen/tag anterior o `git checkout` + rebuild
3. Restaurar MongoDB desde backup si hubo migración fallida
4. `docker compose -f docker-compose.prod.yml up -d`

---

## Variables críticas (resumen)

| Variable | Obligatoria | Notas |
|----------|-------------|-------|
| `JWT_SECRET` | Sí | ≥32 chars, `openssl rand -base64 32` |
| `MONGO_ROOT_USER` | Sí | Usuario admin MongoDB |
| `MONGO_ROOT_PASSWORD` | Sí | `openssl rand -base64 24` |
| `MONGODB_URI` | Sí | Debe coincidir con user/pass y `authSource=admin` |
| `CORS_ORIGINS` | Sí | Dominios HTTPS de producción |
| `FRONTEND_URL` | Sí | `https://meincart.com` |
| `DOMAIN` | Sí | Para Caddy (`meincart.com`) |
| `SMTP_*` | Sí | Host, user, password, from |
| `METRICS_PROTECTED` | Recomendado `true` | Protege `/metrics` |
| `LOGIN_RATE_LIMIT` | Recomendado `5` | Anti fuerza bruta |
| `MFA_ENABLED` | Recomendado `true` | 2FA TOTP |
| `DOCUMENTS_PATH` | Sí | `/app/storage/documents` en Docker |
| `MAX_UPLOAD_MB` | Opcional | Default 30 |

---

## Referencias

- [CHECKLIST_PRODUCCION.md](./CHECKLIST_PRODUCCION.md) — checklist de seguridad ampliado
- [docs/Cloudflare/](./Cloudflare/) — DNS, correo, Mailcow
- [docs/SECURITY_TESTING.md](./SECURITY_TESTING.md) — pentest local
- [docs/MFA.md](./MFA.md) — autenticación de dos factores
