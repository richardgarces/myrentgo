# Checklist de Producción — MyRent Go

Guía corta día 1: [DIA1_PRODUCCION_APP_MEINCART.md](./DIA1_PRODUCCION_APP_MEINCART.md)  
Kit genérico de host: [ubuntu/README.md](../ubuntu/README.md)

## Host Ubuntu (antes o junto al deploy)

- [ ] Kit transferido con paso 0: `./ubuntu/push-to-server.sh user@IP`
- [ ] En el servidor: `sudo ./bootstrap.sh` — SO + unattended-upgrades
- [ ] SSH endurecido + fail2ban (menú 2 del kit)
- [ ] UFW: 22 / 80 / 443; cerrado 27017 / 7070 / 25 / 6379 / 9000 / 9090
- [ ] Docker Engine + Compose + red `platform-net` (menú 4)
- [ ] (Opcional) Software de apoyo del kit: Redis, MinIO, Vault, Prometheus, Postgres — solo si lo usas

## Seguridad

- [ ] `JWT_SECRET` generado con `openssl rand -base64 32`
- [ ] HTTPS habilitado (Caddy + certificado Let's Encrypt)
- [ ] Cloudflare SSL **Full (strict)** (nunca Flexible)
- [ ] CORS = `https://rent.meincart.com`
- [ ] MFA habilitado para administradores
- [ ] Rate limiting (`LOGIN_RATE_LIMIT`)
- [ ] Headers de seguridad (CSP, HSTS, X-Frame-Options)
- [ ] Bcrypt cost >= 12
- [ ] Secrets en `.env` (`chmod 600`), no en git
- [ ] Cloudflare WAF + Bot Fight Mode (Free)
- [ ] MongoDB **sin** puerto publicado a Internet
- [ ] Firewall: 22 (restringido), 80, 443; cerrado 27017 / 7070 / 25

## Base de datos

- [ ] MongoDB con autenticación
- [ ] Índices creados (`EnsureIndexes`)
- [ ] Backup automático local (`scripts/backup-prod.sh` en cron)
- [ ] Backup off-site Restic (`scripts/backup-restic.sh` + `deploy/platform/restic.env`)
- [ ] Copia off-site del `.tar.gz` verificada (Restic o manual)
- [ ] Plan de restore probado

## Infraestructura

- [ ] Docker Compose prod healthy
- [ ] Health checks OK tras `./scripts/deploy-prod.sh`
- [ ] Logs revisables (`docker compose -f docker-compose.prod.yml logs`)
- [ ] `METRICS_PROTECTED=true`
- [ ] `METRICS_SCRAPE_TOKEN` definido (Prometheus)
- [ ] Prometheus + Grafana + Alertmanager (`./scripts/deploy-monitoring.sh`) si usas observabilidad
- [ ] Alertmanager: correo (`ALERTMANAGER_EMAIL_TO`) y/o Telegram configurados
- [ ] Límites de recursos en compose

## Aplicación

- [ ] `APP_ENV=production`
- [ ] Admin real con password fuerte + MFA (no dejar seed de demo)
- [ ] Storage de documentos persistente
- [ ] Límite de upload configurado
- [ ] SMTP gratuito (Brevo/SendGrid/Gmail) + prueba de envío
- [ ] WebSocket `/ws` con bypass de cache en Cloudflare

## CI/CD

- [ ] GitHub Actions passing (si aplica)
- [ ] Tests en pipeline
- [ ] Build de imágenes en main
- [ ] Tags de versión en releases

## Legal y compliance

- [ ] Política de privacidad
- [ ] Términos de servicio
- [ ] Retención de audit logs definida
- [ ] GDPR/LOPD según jurisdicción

## Post-deploy

- [ ] Smoke test: login, dashboard, propiedades
- [ ] Verificar WebSocket
- [ ] Verificar PWA install
- [ ] Verificar tema claro/oscuro
- [ ] Verificar i18n
- [ ] Documentar credenciales admin (gestor de secretos)

## Rollback

- [ ] Imagen / commit anterior disponible
- [ ] Backup DB reciente
- [ ] Procedimiento de rollback documentado
