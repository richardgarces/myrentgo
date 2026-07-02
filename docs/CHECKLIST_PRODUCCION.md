# Checklist de Producción — MyRent Go

## Seguridad

- [ ] `JWT_SECRET` generado con `openssl rand -base64 32`
- [ ] HTTPS habilitado (Caddy/Nginx + certificado)
- [ ] CORS restringido a dominios de producción
- [ ] MFA habilitado para administradores
- [ ] Rate limiting configurado
- [ ] Headers de seguridad (CSP, HSTS, X-Frame-Options)
- [ ] Bcrypt cost >= 12
- [ ] Secrets en variables de entorno, no en código
- [ ] Cloudflare WAF activo

## Base de datos

- [ ] MongoDB con autenticación
- [ ] Índices creados (`EnsureIndexes`)
- [ ] Backup automático (`scripts/backup.sh` en cron)
- [ ] Plan de restore probado
- [ ] Réplicas en producción (recomendado)

## Infraestructura

- [ ] Docker images escaneadas
- [ ] Health checks configurados
- [ ] Logs centralizados (JSON)
- [ ] Monitoreo (uptime, latencia, errores)
- [ ] Alertas configuradas
- [ ] Límites de recursos (CPU/memoria)

## Aplicación

- [ ] `APP_ENV=production`
- [ ] Seed NO ejecutado en producción
- [ ] Storage de documentos persistente
- [ ] Límite de upload configurado
- [ ] SMTP/notificaciones configuradas
- [ ] WebSocket detrás de proxy con upgrade

## CI/CD

- [ ] GitHub Actions passing
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
- [ ] Documentar credenciales admin

## Rollback

- [ ] Imagen anterior disponible
- [ ] Backup DB reciente
- [ ] Procedimiento de rollback documentado
