# Restic

## Qué es
Backup incremental, cifrado, deduplicado hacia local o S3/B2/MinIO.

## Para qué sirve
Copiar dumps de BD y archivos **fuera** del disco del servidor (disaster recovery).

## Flujo típico
1. Dump local → `/opt/platform/backups/local`
2. `restic backup` con tags `app` / `env`
3. `restic forget --prune` según retención

## Parámetros críticos
| Parámetro | Significado |
|-----------|-------------|
| `RESTIC_REPOSITORY` | URL del repo |
| `RESTIC_PASSWORD` | Cifrado — **si se pierde, no hay restore** |
| `AWS_ACCESS_KEY_*` | Credenciales object store |
| `RESTIC_KEEP_*` | Política de retención |

Probar un **restore** al menos una vez en un lab.
