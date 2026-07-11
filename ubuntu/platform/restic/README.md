# Restic — backups cifrados

**Qué es:** herramienta de backup incremental cifrado hacia S3/B2/MinIO/local.  
**Para qué:** copiar dumps de Mongo/Postgres y volúmenes fuera del host.

No hay `docker-compose.yml` permanente: instala CLI (menú Backups), configura `.env` y cron.

| Variable | Para qué sirve |
|----------|----------------|
| `RESTIC_REPOSITORY` | Dónde vive el repo (URL S3) |
| `RESTIC_PASSWORD` | Cifrado del repo — **irrecuperable si se pierde** |
| `AWS_ACCESS_KEY_*` | Credenciales del object store |
| `RESTIC_KEEP_*` | Retención al hacer `forget --prune` |

**Init una vez:**

```bash
set -a; source .env; set +a
restic init
```

Ver también: menú 6 del `bootstrap.sh` y `docs/help/restic.md`.
