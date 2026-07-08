# MyRent Go

Plataforma SaaS de administración de propiedades y arriendos. Backend en Go (Clean Architecture + DDD + CQRS), frontend React + TypeScript, MongoDB.

## Características

- **Multiempresa y multiusuario** con RBAC (owner, admin, manager, accountant, viewer)
- **Dashboard financiero**: ocupación, flujo de caja, rentabilidad, morosidad
- **Propiedades, arriendos, arrendatarios, pagos, hipotecas**
- **CRM**: corredores, inmobiliarias, bancos, proveedores
- **Documentos**: contratos, escrituras, garantías (PDF)
- **Mantenciones preventivas y tickets**
- **Recordatorios** (email, WhatsApp, Telegram)
- **Seguridad**: JWT, MFA, CSP, rate limiting, auditoría
- **PWA**, tema claro/oscuro, i18n (es/en)
- **WebSocket** para eventos en tiempo real

## Inicio rápido

### Requisitos

- Go 1.23+
- Node.js 22+
- MongoDB 7+ (o Docker)

### Desarrollo local

```bash
chmod +x myrent.sh
./myrent.sh              # menú interactivo
./myrent.sh modes        # guía de puertos y cuándo reiniciar
./myrent.sh quickstart   # inicio rápido (modo nativo)
```

Credenciales por defecto: **admin** / **admin123**  
Cuenta pentest (sin MFA): **gestor@test.local** / **pentest123** — `./myrent.sh bootstrap`

| Modo | App | API | Tras cambios en código |
|------|-----|-----|------------------------|
| **Nativo** (`local-start`, `watch`) | :4000 (Vite) | :7070 | `watch` (auto) o `local-restart` |
| **Docker** (`docker-up`) | :3000 (nginx) | :7070 | `docker-restart` (rebuild) |

No ejecutar API nativa y contenedor Docker a la vez (ambos usan `:7070`).

**Nativo (recomendado para desarrollo):**

```bash
./myrent.sh local-start    # segundo plano — App :4000, API :7070
./myrent.sh watch          # recarga automática (air + Vite HMR)
./myrent.sh local-restart  # reiniciar tras cambios (sin watch)
./myrent.sh local-stop
```

**Docker (tipo producción):**

```bash
./myrent.sh docker-up       # App :3000, API :7070
./myrent.sh docker-restart  # rebuild + reinicio tras cambios
./myrent.sh docker-down
```

PIDs nativos en `.myrent/`; logs en `.myrent/logs/`.

**Liberar espacio en disco:** `./scripts/cleanup-disk.sh` o `./myrent.sh cleanup-disk` (menú Utilidades).

**MongoDB en desarrollo:** `docker-compose.yml` publica `127.0.0.1:27017` sin auth (solo localhost). En producción use `docker-compose.prod.yml` (sin puerto publicado, red interna).

### Docker Compose completo

```bash
make docker-up
```

- App: http://localhost:3000
- API: http://localhost:7070

## Estructura del proyecto

```
my-rent-go/
├── backend/           # Go API (Clean Architecture)
│   ├── cmd/api/       # Entry point
│   ├── cmd/seed/      # Bootstrap admin inicial
│   └── internal/
│       ├── domain/    # Entidades DDD
│       ├── application/ # CQRS, servicios
│       ├── infrastructure/ # MongoDB, JWT
│       └── interfaces/ # HTTP, WebSocket
├── frontend/          # React + Vite + Tailwind + shadcn/ui
├── docker/            # Dockerfiles
├── deploy/            # Caddy, Nginx, K8s, Cloudflare
├── docs/              # OpenAPI, Postman, manuales
└── scripts/           # Deploy, backup
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `make build` | Compilar backend y frontend |
| `make test` | Tests unitarios |
| `make seed` | Crear usuario admin inicial |
| `make docker-up` | Desarrollo con Docker |
| `make docker-prod` | Producción |
| `make swagger` | Generar OpenAPI |

## Documentación

- [Manual técnico](docs/MANUAL_TECNICO.md)
- [Manual de usuario](docs/MANUAL_USUARIO.md)
- [Wireframes](docs/WIREFRAMES.md)
- [Checklist de producción](docs/CHECKLIST_PRODUCCION.md)
- [OpenAPI](docs/openapi.yaml)
- [Colección Postman](docs/postman/MyRent-Go.postman_collection.json)

## Licencia

Privado — uso personal.
# myrentgo
