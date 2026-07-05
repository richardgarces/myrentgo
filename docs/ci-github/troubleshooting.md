# CI — Problemas frecuentes y soluciones

Guía de diagnóstico cuando falla el workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Para el detalle de cada step, ver [workflow.md](./workflow.md).

## Cómo leer un fallo en GitHub Actions

1. Repositorio → **Actions** → ejecución fallida.
2. Abre el job en rojo (`backend`, `frontend` o `docker`).
3. Expande el step fallido; el log suele mostrar la primera línea de error real (Go compiler, npm, Docker).

Los tres jobs son independientes en logs: un fallo en `frontend` no impide ver el log de `backend`.

---

## Job `backend`

### `go build ./...` — error de compilación

**Síntoma:** mensajes `undefined`, tipos incompatibles, imports no usados que impiden compilar.

**Causa:** código Go inválido en algún paquete bajo `backend/`.

**Solución local:**

```bash
cd backend && go build ./...
```

Corrige todos los paquetes antes de push. El CI compila `./...`, no solo `./cmd/api`.

### `go test ./... -race` — test fallido o timeout

**Síntoma:** `FAIL`, `panic`, o `WARNING: DATA RACE`.

**Causas habituales:**

- Aserción incorrecta en tests unitarios.
- Condición de carrera real detectada por `-race`.
- Test que asume MongoDB pero el servicio no está listo (poco probable hoy).

**Solución local:**

```bash
docker run -d --name mongo-ci -p 27017:27017 mongo:7
cd backend
MONGODB_URI=mongodb://localhost:27017 MONGODB_DATABASE=myrent_test \
  go test ./... -race -v
```

Para un paquete concreto:

```bash
go test ./internal/domain/property/... -race -v
```

### `go vet ./...` — reporte de vet

**Síntoma:** `vet: ...` con archivo y línea.

**Causa:** patrón de código que `go vet` marca (p. ej. `Printf` con verbos incorrectos, `json` tags, locks).

**Solución:**

```bash
cd backend && go vet ./...
```

### Versión de Go distinta en local vs CI

**Síntoma:** compila en local pero falla en CI (o al revés) por sintaxis o stdlib.

**Solución:** usar Go **1.23** como en `backend/go.mod` y en el workflow:

```bash
go version   # debe ser 1.23.x
```

### Cache de módulos corrupta (raro)

**Síntoma:** fallos intermitentes en `setup-go` o `go mod download`.

**Solución en GitHub:** re-run job; si persiste, en Settings → Actions → Caches, borrar caches del repo.

---

## Job `frontend`

### `npm ci` — lockfile desincronizado

**Síntoma:**

```text
npm ERR! `npm ci` can only install packages when your package.json and package-lock.json are in sync
```

**Causa:** cambiaste `package.json` sin regenerar `package-lock.json`.

**Solución:**

```bash
cd frontend
npm install    # actualiza package-lock.json
git add package-lock.json
```

Siempre commitea el lock junto con cambios de dependencias.

### `npm run build` — error de TypeScript

**Síntoma:** `error TSxxxx` en el log.

**Causa:** tipos incorrectos; el CI ejecuta `tsc -b` antes de Vite.

**Solución:**

```bash
cd frontend && npm ci && npm run build
```

Corrige erro TS localmente. El dev server (`npm run dev`) a veces es más permisivo; el build de producción no.

### `npm run build` — error de Vite (bundle)

**Síntoma:** fallo en `vite build`, imports missing, límite de chunk.

**Solución:** reproducir con `npm run build` local. Revisar imports dinámicos y assets referenciados.

### Versión de Node incorrecta

**Síntoma:** engines incompatible o APIs de Node no disponibles.

**Solución:** Node **22** (como CI y Dockerfile):

```bash
node -v   # v22.x
nvm use 22   # si usas nvm
```

### ESLint falla en local pero no en CI

**Comportamiento esperado:** `npm run lint` **no** forma parte del CI. Solo `build` se ejecuta.

Para alinear calidad antes del push:

```bash
cd frontend && npm run lint
# o desde raíz:
make lint
```

---

## Job `docker`

### Job omitido (*skipped*)

**Síntoma:** `docker` aparece gris / skipped.

**Causa:** condición `if: github.ref == 'refs/heads/main'`. Es normal en PRs y push a `develop`.

**Acción:** si necesitas validar Docker antes de merge, ejecuta localmente:

```bash
docker build -t myrent-api:local ./backend
docker build -t myrent-frontend:local ./frontend
```

### `docker build ./backend` — fallo en `go mod download` o build

**Síntoma:** error en stage `builder` del Dockerfile.

**Causas:** `go.sum` incompleto, código que no compila en Linux, archivos faltantes en contexto.

**Solución:**

```bash
docker build --no-cache -t myrent-api:local ./backend
```

Verifica que `go.sum` está commiteado:

```bash
cd backend && go mod tidy && git status
```

### `docker build ./frontend` — fallo en `npm ci` dentro del Dockerfile

**Síntoma:** mismo error de lockfile que en el job `frontend`, pero dentro de Docker.

**Solución:** igual que arriba — sincronizar `package-lock.json`.

### `COPY` failed / file not found

**Síntoma:** `COPY nginx.conf` o similar no encontrado.

**Causa:** archivo no trackeado en git o `.dockerignore` excluye algo necesario.

**Solución:** revisar `frontend/.dockerignore` y `backend/.dockerignore`; asegurar que `nginx.conf`, `go.mod`, `go.sum` están en el repo.

### Imagen grande o timeout en runner

**Síntoma:** job docker muy lento o cancelado por timeout (límite del plan de GitHub).

**Solución:** optimizar capas Dockerfile (ya usa multi-stage). Re-run; en repos privados verificar minutos de Actions disponibles.

---

## El CI no se ejecuta

| Situación | Explicación |
|-----------|-------------|
| Push solo a `feature/xyz` | No hay trigger hasta PR a `main` o push a `develop`/`main` |
| Fork sin Actions habilitadas | Activar Actions en el fork |
| `[skip ci]` en mensaje de commit | GitHub omite workflows si el mensaje lo indica (convención opcional) |
| Workflow deshabilitado | Settings → Actions → General |

---

## Diferencias CI vs Makefile

| Aspecto | CI | `make test` / `make build` |
|---------|-----|----------------------------|
| Backend cover profile | `-coverprofile=coverage.out` | `-cover` sin archivo |
| MongoDB en tests | Servicio explícito + env | No levanta Mongo por defecto |
| Frontend | `npm ci` + `build` | `make build-frontend` equivalente |
| Docker | Solo en push `main` | `make docker-up` / `make docker-prod` |
| ESLint | No | `make lint` |

Para máxima paridad antes de merge a `main`:

```bash
cd backend && go build ./... && \
  MONGODB_URI=mongodb://localhost:27017 MONGODB_DATABASE=myrent_test \
  go test ./... -race -coverprofile=coverage.out && go vet ./...
cd ../frontend && npm ci && npm run build
docker build -t myrent-api:local ./backend
docker build -t myrent-frontend:local ./frontend
```

---

## Obtener ayuda

- Log completo del step fallido en Actions (copiar las últimas ~50 líneas).
- Reproducir el mismo comando en local con las mismas versiones (Go 1.23, Node 22).
- Documentación relacionada: [README.md](./README.md), [workflow.md](./workflow.md), [dockerfiles.md](./dockerfiles.md).
