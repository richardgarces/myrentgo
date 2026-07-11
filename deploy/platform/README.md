# Plataforma — Prometheus, Grafana y Restic

Servicios transversales para **MyRent Go** en producción (`rent.meincart.com`). Comparten la red Docker `myrentgo-prod` con la app.

| Servicio | Puerto (localhost) | Función |
|----------|-------------------|---------|
| Prometheus | `9090` | Scrape métricas de `api:7070/metrics` |
| Alertmanager | `9093` | Notificaciones por correo y/o Telegram |
| Grafana | `3001` | Dashboards (`MyRent Go - prod`) |
| Restic | — | Backup off-site del `.tar.gz` local |

Guía completa: [docs/OBSERVABILIDAD_RESTIC.md](../../docs/OBSERVABILIDAD_RESTIC.md)

> **Alternativa genérica:** el kit [`ubuntu/platform/`](../../ubuntu/README.md) ofrece Prometheus, Grafana, Alertmanager, Redis, MinIO, Vault, MongoDB y Postgres como unidades independientes (multi-app). Usa **uno** de los dos enfoques de monitoring en el mismo host para no duplicar scrapers.

## Prometheus + Grafana

### 1. Generar token de scrape

```bash
openssl rand -base64 32
```

Mismo valor en:

- `.env` de la app → `METRICS_SCRAPE_TOKEN`
- `deploy/platform/.env.monitoring` → `METRICS_SCRAPE_TOKEN`

### 2. Configurar monitoring

```bash
cp deploy/platform/.env.monitoring.example deploy/platform/.env.monitoring
chmod 600 deploy/platform/.env.monitoring
# Editar METRICS_SCRAPE_TOKEN y GRAFANA_ADMIN_PASSWORD
```

### 3. Desplegar app y monitoring

```bash
./scripts/deploy-prod.sh
# Añadir METRICS_SCRAPE_TOKEN al .env y reiniciar api si hace falta:
# docker compose -f docker-compose.prod.yml up -d api

./scripts/deploy-monitoring.sh
```

### 4. Acceso

- Prometheus: http://127.0.0.1:9090
- Alertmanager: http://127.0.0.1:9093
- Grafana: http://127.0.0.1:3001 (usuario `admin`)

### 5. Notificaciones (Alertmanager)

En `deploy/platform/.env.monitoring` configura **correo** y/o **Telegram**:

```env
# Correo (Brevo, SendGrid, Gmail)
ALERTMANAGER_SMTP_HOST=smtp-relay.brevo.com
ALERTMANAGER_SMTP_PORT=587
ALERTMANAGER_SMTP_USER=<login-brevo>
ALERTMANAGER_SMTP_PASSWORD=<smtp-key>
ALERTMANAGER_SMTP_FROM=alerts@meincart.com
ALERTMANAGER_EMAIL_TO=admin@meincart.com

# Telegram (opcional)
ALERTMANAGER_TELEGRAM_BOT_TOKEN=<token-del-bot>
ALERTMANAGER_TELEGRAM_CHAT_ID=<chat-id-numerico>
```

Obtener `chat_id` de Telegram: envía un mensaje al bot y abre  
`https://api.telegram.org/bot<TOKEN>/getUpdates`

Regenerar config y reiniciar:

```bash
./scripts/deploy-monitoring.sh
```

Probar alerta manual en Alertmanager UI → **Silences** / **Status**, o forzar una alerta de prueba desde Prometheus → **Alerts**.

**No expongas** estos puertos a Internet. Usa SSH tunnel si accedes desde fuera del host.

## Restic (backup off-site)

### 1. Configurar destino S3

```bash
cp deploy/platform/restic.env.example deploy/platform/restic.env
chmod 600 deploy/platform/restic.env
```

Opciones de `RESTIC_REPOSITORY`:

| Proveedor | Ejemplo |
|-----------|---------|
| Backblaze B2 | `s3:https://s3.us-west-004.backblazeb2.com/mi-bucket/myrentgo-restic` |
| MinIO | `s3:http://minio:9000/myrentgo-restic` |
| Amazon S3 | `s3:s3.amazonaws.com/mi-bucket/myrentgo-restic` |

### 2. Inicializar repositorio (una vez)

```bash
RESTIC_INIT=1 ./scripts/backup-restic.sh
```

### 3. Backup manual

```bash
./scripts/backup-restic.sh
```

### 4. Cron diario (ejemplo 03:30)

```bash
30 3 * * * cd /opt/myrent && ./scripts/backup-restic.sh >> /var/log/myrent-restic.log 2>&1
```

## Convenciones (multi-app futura)

| Recurso | MyRent Go |
|---------|-----------|
| `app_id` | `myrentgo` |
| Red Docker | `myrentgo-prod` |
| Label Prometheus | `app=myrentgo,env=prod,component=api` |
| Tag Restic | `myrentgo`, `prod` |
| Prefijo lógico | `myrentgo/prod/` |

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `docker-compose.monitoring.yml` | Prometheus + Alertmanager + Grafana |
| `prometheus/prometheus.yml` | Scrape y reglas |
| `prometheus/alerts.yml` | Alertas API / MongoDB / 5xx |
| `alertmanager/alertmanager.yml` | Generado por `render-alertmanager-config.sh` |
| `grafana/dashboards/myrentgo-overview.json` | Dashboard base |
| `restic.env.example` | Plantilla Restic |
| `../../scripts/deploy-monitoring.sh` | Levantar stack |
| `../../scripts/render-alertmanager-config.sh` | Regenerar Alertmanager |
| `../../scripts/backup-restic.sh` | Backup local + Restic |
