# Scripts Bash — MyRent Go

Índice de scripts del repo: **qué hace cada uno**, **dónde se ejecuta** (Mac vs BMAX) y **pasos recomendados**.

Defaults SSH: `.push-defaults` (ver `.push-defaults.example`). En BMAX el puerto SSH suele ser **2222**.

Kit genérico del host (`ubuntu/bootstrap.sh`, UFW, Docker, Caddy, etc.): ver [ubuntu/README.md](../../ubuntu/README.md) y [ubuntu/docs/CATALOGO.md](../../ubuntu/docs/CATALOGO.md).

---

## Flujo típico día 1 (Mac → BMAX)

```text
Mac                              BMAX (~/my-rent-go)
─────────────────────────────    ────────────────────────────────
1. ./push-to-server.sh      →    código + scripts (preserva .env)
2. ./migrate-mongo.sh (opc.)→    dump Mongo + docs
                                 3. ./prod-menu.sh
                                    1→3→4→5  o  opción 10
                                 4. (si migraste) restore ya hecho
                                    desde Mac opción 4/9
5. Abrir https://rent.meincart.com
```

---

## Atajos en la raíz del repo

| Script | Dónde | Función |
|--------|-------|---------|
| [`myrent.sh`](../../myrent.sh) | Mac (dev) | Menú desarrollo local (API/Vite/Docker) |
| [`push-to-server.sh`](../../push-to-server.sh) | Mac | Empaqueta y sube la app al servidor |
| [`prod-remote.sh`](../../prod-remote.sh) | Mac | Menú local: transferir app (paso 0) |
| [`prod-menu.sh`](../../prod-menu.sh) | **BMAX** | Menú producción (env, deploy, logs) |
| [`migrate-mongo.sh`](../../migrate-mongo.sh) | Mac | Menú migrar MongoDB/documentos → BMAX |
| [`port-forward.sh`](../../port-forward.sh) | Mac | Túneles SSH a UIs (Prometheus, Grafana, …) |

---

## 1. Desarrollo local — `myrent.sh`

**Función:** arrancar/parar API y frontend en la Mac (nativo o Docker).

```bash
cd /ruta/al/repo
./myrent.sh                 # menú interactivo
./myrent.sh modes           # tabla de modos
./myrent.sh local-start     # API :7070 + Vite :4000
./myrent.sh docker-up       # stack docker-compose.yml
```

No mezclar API nativa y contenedor API a la vez (mismo puerto 7070).

---

## 2. Subir código al servidor — `push-to-server.sh`

**Función:** ZIP del proyecto → SCP → descomprimir en `REMOTE_DIR` (default `~/my-rent-go`). **No sobrescribe** el `.env` remoto si ya existe.

**Dónde:** Mac.

### Paso a paso

1. Copia defaults si no existen:
   ```bash
   cp .push-defaults.example .push-defaults
   # Edita REMOTE_USER, REMOTE_IP, REMOTE_DIR, SSH_PORT=2222
   ```
2. Ejecuta:
   ```bash
   ./push-to-server.sh
   # o: ./push-to-server.sh --port 2222
   # o: ./push-to-server.sh richard@192.168.1.198
   ```
3. En el BMAX, entra al directorio y usa `./prod-menu.sh`.

Implementación: [`scripts/remote/00-pack-and-push-app.sh`](../../scripts/remote/00-pack-and-push-app.sh).

Menú equivalente en Mac: `./prod-remote.sh` → opción de transferir.

---

## 3. Producción en el servidor — `prod-menu.sh`

**Función:** menú en el BMAX para `.env`, secretos, Caddy de plataforma, deploy, logs y estado.

**Dónde:** BMAX, dentro de `~/my-rent-go`.

```bash
cd ~/my-rent-go
./prod-menu.sh
```

| Opción | Qué hace |
|--------|----------|
| 1 | Preparar `.env` (copia desde `.env.production.example` si falta) |
| 2 | Editar `.env` (nano) |
| 3 | Generar secretos (JWT / Mongo / metrics) → `scripts/prod-prepare-env.sh` |
| 4 | Enlazar `platform-caddy` → `scripts/link-platform-caddy.sh` |
| 5 | Deploy `EDGE=platform` → `scripts/deploy-prod.sh` |
| 6 | Logs (`tail -f`) |
| 7 | Estado (ps + health) |
| 8 | Reiniciar |
| 9 | Ver `.env.production.example` |
| 10 | Todo en un paso (1→3→4→5→7) |
| 0 | Salir |

Atajos sin menú:

```bash
./prod-menu.sh 10          # oneshot
./prod-menu.sh 5           # solo deploy
./prod-menu.sh 7           # estado
```

### Paso a paso (primera vez en BMAX)

1. `./push-to-server.sh` desde la Mac.
2. SSH al BMAX (`ssh -p 2222 richard@IP`).
3. `cd ~/my-rent-go && ./prod-menu.sh`
4. Opción **1** (si no hay `.env`) → **2** (SMTP, dominio, etc.) → **3** (secretos).
5. Opción **4** (platform-caddy debe existir en `~/platform-kit`).
6. Opción **5** (build + up). Si usas `docker-compose` v1, el script aplica workaround `down`+`rm`+`up`.
7. Opción **7** y abrir `https://rent.meincart.com`.

---

## 4. Migrar datos Mac → BMAX — `migrate-mongo.sh`

**Función:** dump de Mongo local + (opcional) `storage/documents`, SCP al BMAX y `mongorestore --drop`.

**Dónde:** Mac (el restore se hace por SSH en el servidor).

```bash
./migrate-mongo.sh
# o: ./migrate-mongo.sh 9
```

| Opción | Qué hace |
|--------|----------|
| 1 | Dump Mongo local → `backups/migrate/myrent-mongo.archive` |
| 2 | Empaquetar `storage/documents` → `.tar.gz` |
| 3 | Subir archive(s) por SCP |
| 4 | Restaurar Mongo en BMAX (`--drop`; pide confirmar con `SI`) |
| 5 | Restaurar documentos en el volumen del API |
| 6 | Probar SSH / listar remoto |
| 7 | Listar dumps locales |
| 8 | Configurar destino SSH |
| 9 | Todo en un paso (dump → subir → restore) |
| 0 | Salir |

### Paso a paso

1. En Mac: `docker compose up -d mongodb` (Mongo local arriba).
2. En BMAX: stack prod ya levantado (`./prod-menu.sh` 5) con `.env` y credenciales Mongo.
3. `./migrate-mongo.sh` → opción **9** (o 1→2→3→4→5).
4. En restore, escribe `SI` para confirmar `--drop`.
5. Cierra sesión en el navegador y entra con un usuario de los datos migrados.

Implementación: [`scripts/migrate-mongo-menu.sh`](../../scripts/migrate-mongo-menu.sh).

---

## 5. Acceder a UIs del BMAX desde la Mac — `port-forward.sh`

**Función:** Prometheus, Grafana, Alertmanager, etc. escuchan solo en `127.0.0.1` del servidor. Este menú abre túneles SSH (`-L`) para usarlos en el navegador de la Mac.

```bash
./port-forward.sh
# o: ./port-forward.sh monitoring
```

| Opción | Qué hace |
|--------|----------|
| 1 | Monitoring (Prometheus :9090 + Grafana :3001 + Alertmanager :9093) |
| 2–7 | Un servicio concreto |
| 8 | Puerto personalizado |
| 9 | Listar túneles |
| 10 | Cerrar todos |
| 11–12 | Probar / configurar SSH |
| 14 | Ayuda alternativa con `socat` en LAN |

### Paso a paso

1. En Mac: `./port-forward.sh` → opción **1** (o `./port-forward.sh monitoring`).
2. Abre `http://127.0.0.1:9090` y `http://127.0.0.1:3001` en el navegador.
3. Al terminar: opción **10** (cerrar túneles).

Implementación: [`scripts/port-forward-menu.sh`](../../scripts/port-forward-menu.sh).

---

## 6. Scripts en `scripts/` (detalle)

### Despliegue y borde

| Script | Dónde | Función | Cómo ejecutarlo |
|--------|-------|---------|-----------------|
| [`deploy-prod.sh`](../../scripts/deploy-prod.sh) | BMAX | Build + `up` de `docker-compose.prod.yml` (+ override platform) | `EDGE=platform ./scripts/deploy-prod.sh` |
| [`deploy.sh`](../../scripts/deploy.sh) | BMAX | Alias legacy → `deploy-prod.sh` | `./scripts/deploy.sh` |
| [`link-platform-caddy.sh`](../../scripts/link-platform-caddy.sh) | BMAX | Instala Caddyfile que apunta a `myrent-api` / `myrent-frontend` | `./scripts/link-platform-caddy.sh` |
| [`prod-prepare-env.sh`](../../scripts/prod-prepare-env.sh) | BMAX | Rellena secretos `CHANGE_ME` en `.env` | `./scripts/prod-prepare-env.sh` |

Variables útiles de deploy:

```bash
EDGE=platform   # sin Caddy de la app; usa platform-caddy
EDGE=builtin    # Caddy del compose de MyRent en :80/:443
EDGE=auto       # platform si existe contenedor platform-caddy
```

### Backups

| Script | Dónde | Función | Cómo ejecutarlo |
|--------|-------|---------|-----------------|
| [`backup-prod.sh`](../../scripts/backup-prod.sh) | BMAX | `mongodump` + documentos → `backups/myrent_prod_*.tar.gz` | `./scripts/backup-prod.sh` |
| [`backup-restic.sh`](../../scripts/backup-restic.sh) | BMAX | Backup local + off-site Restic | `./scripts/backup-restic.sh` |
| [`backup-to-archive.sh`](../../scripts/backup-to-archive.sh) | Mac/BMAX | Archive para Drive (Mongo + docs) | `./scripts/backup-to-archive.sh` |
| [`backup.sh`](../../scripts/backup.sh) | Mac | Dump simple (requiere `mongodump` en host) | `./scripts/backup.sh` |

Restaurar Mongo desde archive de prod (en BMAX):

```bash
# Extraer mongo.archive del tar.gz y luego:
docker compose -f docker-compose.prod.yml -f docker-compose.prod.platform.yml exec -T mongodb \
  mongorestore -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --archive --drop < mongo.archive
```

### Observabilidad

| Script | Dónde | Función | Cómo ejecutarlo |
|--------|-------|---------|-----------------|
| [`deploy-monitoring.sh`](../../scripts/deploy-monitoring.sh) | BMAX | Prometheus + Grafana (`deploy/platform`) | `./scripts/deploy-monitoring.sh` |
| [`render-alertmanager-config.sh`](../../scripts/render-alertmanager-config.sh) | BMAX | Genera `alertmanager.yml` desde `.env.monitoring` | `./scripts/render-alertmanager-config.sh` |

Ver también [OBSERVABILIDAD_RESTIC.md](../OBSERVABILIDAD_RESTIC.md).

### Utilidades

| Script | Dónde | Función | Cómo ejecutarlo |
|--------|-------|---------|-----------------|
| [`run-tests.sh`](../../scripts/run-tests.sh) | Mac | Tests Go + Vitest + Playwright | `./scripts/run-tests.sh all` |
| [`cleanup-disk.sh`](../../scripts/cleanup-disk.sh) | Mac/BMAX | Liberar espacio (sin tocar Mongo ni docs) | `./scripts/cleanup-disk.sh --safe` |
| [`setup-mailcow.sh`](../../scripts/setup-mailcow.sh) | Servidor mail | Clona/configura Mailcow | `./scripts/setup-mailcow.sh` |
| [`migrate-mongo-menu.sh`](../../scripts/migrate-mongo-menu.sh) | Mac | Lógica del menú de migración | vía `./migrate-mongo.sh` |
| [`prod-menu.sh`](../../scripts/prod-menu.sh) | BMAX | Lógica del menú de producción | vía `./prod-menu.sh` |
| [`remote/00-pack-and-push-app.sh`](../../scripts/remote/00-pack-and-push-app.sh) | Mac | Lógica del push | vía `./push-to-server.sh` |

---

## 7. Seguridad / pentest (`security/`)

| Script | Función |
|--------|---------|
| [`security/run-pentest.sh`](../../security/run-pentest.sh) | Orquesta pruebas de seguridad |
| [`security/regenerate-report-html.sh`](../../security/regenerate-report-html.sh) | Regenera informe HTML |
| `security/lib/*.sh` | Módulos (auth, CORS, headers, etc.) |

Guía: [SECURITY_TESTING.md](../SECURITY_TESTING.md).

```bash
./security/run-pentest.sh
```

---

## 8. Kit Ubuntu (`ubuntu/`) — resumen

No se listan aquí todos los micro-scripts; el menú principal los agrupa.

| Script | Función |
|--------|---------|
| [`ubuntu/push-to-server.sh`](../../ubuntu/push-to-server.sh) | Subir el **kit** (no la app) al host |
| [`ubuntu/bootstrap.sh`](../../ubuntu/bootstrap.sh) | Menú SO / seguridad / UFW / Docker / borde / plataforma |
| [`ubuntu/scripts/platform/manage.sh`](../../ubuntu/scripts/platform/manage.sh) | Gestionar servicios de plataforma (Caddy, Redis, …) |
| [`ubuntu/updates-menu.sh`](../../ubuntu/updates-menu.sh) | Unattended-upgrades / ESM |
| [`ubuntu/scripts/edge/check-public-access.sh`](../../ubuntu/scripts/edge/check-public-access.sh) | Checklist acceso público (DNS, 80/443, ACME) |

```bash
# En el BMAX, tras subir el kit:
cd ~/platform-kit/ubuntu
sudo ./bootstrap.sh
```

Detalle: [ubuntu/README.md](../../ubuntu/README.md).

---

## 9. Recetas rápidas

### Solo actualizar código en prod

```bash
# Mac
./push-to-server.sh

# BMAX
cd ~/my-rent-go && ./prod-menu.sh 5
```

### Solo migrar BD (ya hay dump)

```bash
# Mac
./migrate-mongo.sh
# → 3 (subir) → 4 (restaurar) → 5 (docs si aplica)
```

### Backup diario en BMAX (cron)

```bash
crontab -e
# 15 3 * * * cd /home/richard/my-rent-go && ./scripts/backup-prod.sh >> /var/log/myrent-backup.log 2>&1
```

### Borrar usuario seed en prod

```bash
cd ~/my-rent-go
# cargar MONGO_ROOT_* desde .env
docker-compose -f docker-compose.prod.yml -f docker-compose.prod.platform.yml exec -T mongodb \
  mongosh -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin myrent --quiet --eval \
  'db.users.deleteOne({ email: "admin@myrent.local" })'
```

---

## Relacionado

- [INDICE_PRODUCCION.md](../INDICE_PRODUCCION.md) — mapa de docs de producción
- [DIA1_PRODUCCION_APP_MEINCART.md](../DIA1_PRODUCCION_APP_MEINCART.md) — checklist día 1
- [DESPLIEGUE_PRODUCCION_SUBDOMINIO.md](../DESPLIEGUE_PRODUCCION_SUBDOMINIO.md) — guía larga
- [PRODUCTION.md](../PRODUCTION.md) — variables y ops
