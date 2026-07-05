# CI — Detalle del workflow

Referencia línea a línea de [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Metadatos del workflow

```yaml
name: CI
```

Nombre visible en la pestaña **Actions** de GitHub. Aparece como "CI" en la lista de ejecuciones.

## Bloque `on` — cuándo se ejecuta

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

| Clave | Significado |
|-------|-------------|
| `push` + `branches: [main, develop]` | Cada push a `main` o `develop` inicia el workflow |
| `pull_request` + `branches: [main]` | Cada PR cuyo **destino** es `main` inicia el workflow (open, sync, reopen) |

No hay filtros por paths (`paths:` / `paths-ignore:`): cualquier cambio en el repositorio dispara los tres jobs aplicables.

---

## Job `backend`

```yaml
backend:
  runs-on: ubuntu-latest
```

Máquina virtual Ubuntu reciente proporcionada por GitHub. Cada job obtiene un runner limpio.

### Servicio MongoDB

```yaml
services:
  mongodb:
    image: mongo:7
    ports:
      - 27017:27017
```

GitHub levanta un contenedor sidecar accesible desde el job en `localhost:27017`. Es la misma major version (`7`) que en `docker-compose.prod.yml` y `docker-compose.yml`.

Los tests pueden conectarse con `MONGODB_URI=mongodb://localhost:27017`. Hoy los tests en el repo son unitarios de dominio; el servicio queda listo para tests de integración futuros.

### Step 1 — Checkout

```yaml
- uses: actions/checkout@v4
```

Clona el repositorio en el directorio de trabajo del runner (`$GITHUB_WORKSPACE`). Versión v4 de la action oficial.

### Step 2 — Setup Go

```yaml
- uses: actions/setup-go@v5
  with:
    go-version: '1.23'
    cache-dependency-path: backend/go.sum
```

| Parámetro | Efecto |
|-----------|--------|
| `go-version: '1.23'` | Instala Go 1.23; debe coincidir con `go 1.23` en `backend/go.mod` |
| `cache-dependency-path` | Cache de módulos Go basada en `backend/go.sum` para acelerar runs siguientes |

### Step 3 — Build

```yaml
- name: Build
  working-directory: backend
  run: go build ./...
```

Compila **todos** los paquetes bajo `backend/`, incluido `./cmd/api`. Falla si hay errores de compilación en cualquier paquete. No genera un binario instalado en `$PATH`; solo verifica que compila.

Equivalente local:

```bash
cd backend && go build ./...
```

### Step 4 — Test

```yaml
- name: Test
  working-directory: backend
  env:
    MONGODB_URI: mongodb://localhost:27017
    MONGODB_DATABASE: myrent_test
  run: go test ./... -race -coverprofile=coverage.out
```

| Flag / env | Propósito |
|------------|-----------|
| `./...` | Todos los paquetes con tests |
| `-race` | Detector de condiciones de carrera (requiere más CPU/tiempo) |
| `-coverprofile=coverage.out` | Archivo de cobertura (no se sube en este workflow) |
| `MONGODB_URI` | URI del servicio MongoDB del job |
| `MONGODB_DATABASE` | Base `myrent_test`, distinta de producción (`myrent`) |

La configuración de la app lee estas variables en `backend/internal/config/config.go`.

### Step 5 — Vet

```yaml
- name: Vet
  working-directory: backend
  run: go vet ./...
```

Análisis estático oficial de Go: APIs sospechosas, locks, printf incorrectos, etc. Complementa el compilador; no sustituye linters externos.

---

## Job `frontend`

```yaml
frontend:
  runs-on: ubuntu-latest
```

Corre en paralelo con `backend`; no comparte runner ni dependencias.

### Step 1 — Checkout

Igual que en backend: `actions/checkout@v4`.

### Step 2 — Setup Node

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: npm
    cache-dependency-path: frontend/package-lock.json
```

| Parámetro | Efecto |
|-----------|--------|
| `node-version: '22'` | Node 22 LTS; alineado con `FROM node:22-alpine` en `frontend/Dockerfile` |
| `cache: npm` | Cache del store npm entre ejecuciones |
| `cache-dependency-path` | Hash basado en `frontend/package-lock.json` |

### Step 3 — Install

```yaml
- name: Install
  working-directory: frontend
  run: npm ci
```

Instalación **reproducible** desde `package-lock.json`. Falla si `package.json` y lock están desincronizados (a diferencia de `npm install`).

### Step 4 — Build

```yaml
- name: Build
  working-directory: frontend
  run: npm run build
```

Ejecuta el script definido en `frontend/package.json`:

```json
"build": "tsc -b && vite build"
```

1. **TypeScript** (`tsc -b`): verificación de tipos en modo proyecto.
2. **Vite build**: bundle de producción en `frontend/dist/`.

Si TypeScript o el bundler fallan, el job falla. No se ejecuta `npm run lint` en CI.

---

## Job `docker`

```yaml
docker:
  runs-on: ubuntu-latest
  needs: [backend, frontend]
  if: github.ref == 'refs/heads/main'
```

| Clave | Efecto |
|-------|--------|
| `needs: [backend, frontend]` | Solo arranca si ambos jobs terminaron **con éxito** |
| `if: github.ref == 'refs/heads/main'` | Se omite en push a `develop`, en PRs y en cualquier ref que no sea `main` |

En un PR hacia `main`, GitHub puede mostrar el job `docker` como *skipped* (omitido), no como fallo.

### Step 1 — Checkout

De nuevo `actions/checkout@v4` en un runner nuevo (el job docker no hereda el filesystem de backend/frontend).

### Step 2 — Build API image

```yaml
- name: Build API image
  run: docker build -t myrent-api:${{ github.sha }} ./backend
```

Construye usando `backend/Dockerfile`:

1. **Stage builder:** `golang:1.23-alpine`, `go mod download`, compila `./cmd/api` con `CGO_ENABLED=0`.
2. **Stage final:** `alpine:3.20`, usuario no root, puerto `7070`, healthcheck en `/health`.

El tag incluye el SHA del commit (`github.sha`), útil para trazabilidad local; en CI no se hace push.

### Step 3 — Build Frontend image

```yaml
- name: Build Frontend image
  run: docker build -t myrent-frontend:${{ github.sha }} ./frontend
```

Construye usando `frontend/Dockerfile`:

1. **Stage builder:** `npm ci`, `npm run build`.
2. **Stage final:** `nginx:1.27-alpine`, copia `dist/` y `nginx.conf` (SPA + proxy `/api/` y `/ws`).

Valida que el contexto de build (incluidos `package-lock.json` y assets) es correcto para producción.

Documentación ampliada de cada etapa, `nginx.conf` y `.dockerignore`: [dockerfiles.md](./dockerfiles.md).

---

## Matriz de ejecución por escenario

| Escenario | backend | frontend | docker |
|-----------|---------|----------|--------|
| Push a `main` | ✅ | ✅ | ✅ |
| Push a `develop` | ✅ | ✅ | ⏭ omitido |
| PR → `main` | ✅ | ✅ | ⏭ omitido |
| Push a `feature/x` (sin PR) | — | — | — |

## Versiones de actions

| Action | Versión | Uso |
|--------|---------|-----|
| `actions/checkout` | v4 | Los tres jobs |
| `actions/setup-go` | v5 | Job backend |
| `actions/setup-node` | v4 | Job frontend |

Actualizar estas versiones periódicamente reduce riesgo de deprecaciones en runners de GitHub.
