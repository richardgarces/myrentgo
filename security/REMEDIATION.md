# Remediation log — ethical hacking findings

Last updated: 2026-07-06 (post-fix pentest `2026-07-06_19-56-46`)

## Score progression

| Report | Critical | High | Medium | Low | Info |
|--------|----------|------|--------|-----|------|
| `2026-07-05_22-02-11` (pre-fix) | 0 | 0 | 3 | 4 | 8 |
| `2026-07-05_22-15-03` (headers/JWT) | 0 | 0 | 1 | 2 | 9 |
| `2026-07-05_22-22-15` (final) | 0 | 0 | 0 | 0 | 23 |
| `2026-07-05_22-29-50` (Info improvements) | 0 | 1* | 0 | 0 | 26 |
| `2026-07-06_16-37-24` (pre Go upgrade) | 0 | 1 | 1 | 0 | 28 |
| `2026-07-06_16-44-19` (post Go/doc fix) | 0 | **0** | **0** | 1 | 8† |
| `2026-07-06_19-56-46` (post G104 fix) | 0 | **0** | **0** | **0** | 8‡ |

\* **govulncheck** High from Go stdlib 1.25.x CVEs — fixed by upgrading to **Go 1.25.11**.

† Dynamic tests omitted (API/frontend down during scan).

‡ `--static-only` run (Docker daemon down); gosec clean. Re-run full pentest with `./myrent.sh quickstart` + `./security/run-pentest.sh` for dynamic checks.

## Fixed in this pass (2026-07-06, G104)

| Finding | Severity | Action |
|---------|----------|--------|
| gosec G104: `Conn.Close()` unhandled | **Low** | `hub.go`: log close errors in `readPump` / `writePump` defer |
| gosec G104: `os.Setenv` unhandled | **Low** | `seed/main.go`: check `Setenv` error; also handle `Disconnect`, `Drop`, `bcrypt.GenerateFromPassword` |

## Fixed earlier (2026-07-06)

| Finding | Severity | Action |
|---------|----------|--------|
| govulncheck: 23 Go stdlib/module CVEs | **High** | `go 1.25.11` in `backend/go.mod`; `golang:1.25.11-alpine` in `backend/Dockerfile`; CI `go-version: '1.25.11'`; `golang.org/x/net@v0.53.0`; `github.com/golang-jwt/jwt/v5@v5.2.2` |
| gosec G304 path traversal in document read | **Medium** | `documents.go`: `fs.ReadFile(os.DirFS(basePath), rel)` after `resolve()` + `filepath.Rel` guard |
| gosec G306 file permissions | **Medium** | `documents.go`: `WriteFile` mode `0o640` → `0o600` |

## Verified (previous dynamic run `2026-07-06_16-37-24`)

| Check | Result |
|-------|--------|
| Login rate limit | HTTP 429 after 5 failed attempts |
| Security headers (API) | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| JWT hardening | alg:none rejected, invalid sig → 401, `exp` present |
| CORS | localhost allowed; evil origins rejected |
| Upload | oversized file → 400; path traversal no leak |
| IDOR / role checks | 404 / 403 as expected |

## Info items unchanged (expected / N/A)

| Finding | Reason |
|---------|--------|
| `.env` no versionado | Correcto (`.gitignore` incluye `.env`, `.env.local`, `.env.production`) |
| govulncheck OK | Sin CVEs conocidos (Go 1.25.11) |
| npm audit OK | Sin critical/high |
| MongoDB 27017 dev | Intencional (`127.0.0.1`, `docker-compose.prod.yml` sin puerto) |
| docker-compose revisado | Snapshot informativo |
| TLS/HSTS N/A localhost | HTTP local; prod en nginx/Caddy |
| `/metrics` HTTP 200 en dev | `METRICS_PROTECTED=false` por diseño en desarrollo (verificar con pentest dinámico) |
| semgrep omitido | Herramienta no instalada en el host (`brew install semgrep`) |
| Modo static-only / API down | Docker daemon no disponible; re-ejecutar pentest completo con stack levantado |

## Fixed in code (cumulative)

| Finding | Severity | Action |
|---------|----------|--------|
| Frontend security headers missing | Medium | CSP, Permissions-Policy, COOP, CORP in `frontend/vite.config.ts` (dev) and `frontend/nginx.conf` / `deploy/nginx/nginx.conf` (prod) |
| JWT_SECRET hardcoded in docker-compose | Medium | `JWT_SECRET: ${JWT_SECRET}` + `env_file: .env`; secrets only in `.env` |
| Login brute-force (no dedicated limit) | — | `POST /auth/login` capped at 5 req/min per IP |
| `/metrics` public in production | — | `METRICS_PROTECTED` defaults to `true` when `APP_ENV=production` |
| Verbose 500 errors (documents) | — | Generic messages in `gin.ReleaseMode` via `respondInternalError` |
| API security headers | — | COOP/CORP added to `SecurityHeaders` middleware |
| Frontend Dockerfile runs as root | Low | `nginxinc/nginx-unprivileged` on port 8080 |
| MongoDB bound to all interfaces (dev) | Medium→Info | `127.0.0.1:27017:27017` in `docker-compose.yml` |
| Pentest MFA blocks JWT | Info→fixed | Seed user `gestor@test.local`; token cache in `security/lib/common.sh` |
| Go stdlib CVEs (govulncheck) | High | Go **1.25.11** + jwt/x/net bumps (2026-07-06) |
| Document storage gosec G304/G306 | Medium | `fs.ReadFile` + `0o600` permissions (2026-07-06) |
| gosec G104 unhandled errors | Low | `hub.go` Close + `seed/main.go` Setenv/Disconnect/Drop/bcrypt (2026-07-06) |

## New files / config

- `security/lib/tools.sh` — auto-install gosec/govulncheck (`AUTO_INSTALL_TOOLS=1`)
- `security/semgrep.yml` — reglas SAST Go/React locales
- Pentest user: `backend/cmd/seed` → `gestor@test.local` / `pentest123` (manager, sin MFA)

## Verify after changes

```bash
# Toolchain (local dev)
go install golang.org/dl/go1.25.11@latest && go1.25.11 download

./myrent.sh bootstrap      # crea gestor@test.local si falta
./myrent.sh quickstart     # API + frontend para pentest dinámico
./security/run-pentest.sh
cd backend && go build ./... && go test ./...
cd frontend && npm run build
```

Expected: **0 High, 0 Medium, 0 Low**; resto Info en localhost.

## Latest report

- Path: `security/reports/2026-07-06_19-56-46/`
- Symlink: `security/reports/latest/`
- gosec: **0 issues**
- govulncheck: **No vulnerabilities found** (Go 1.25.11)
