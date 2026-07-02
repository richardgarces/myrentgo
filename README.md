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
# Menú interactivo (recomendado)
chmod +x myrent.sh
./myrent.sh

# Inicio rápido sin menú
./myrent.sh quickstart
```

Credenciales por defecto: **admin** / **admin123**  
App: http://localhost:4000 | API: http://localhost:7070

### Desarrollo manual

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
