# Pruebas de seguridad — MyRent Go

Kit de **ethical hacking local** para evaluar MyRent Go en tu máquina. Solo debe ejecutarse contra **tu propia instancia** (`localhost:7070` API, `localhost:4000` frontend).

## Inicio rápido

```bash
# 1. (Opcional) Copiar y ajustar configuración
cp security/config.env.example security/config.env

# 2. Levantar la app (recomendado para pruebas dinámicas)
./myrent.sh quickstart

# 3. Ejecutar pentest
./security/run-pentest.sh

# O desde el menú
./myrent.sh pentest
```

El informe ejecutivo en español queda en:

- `security/reports/latest/INFORME.html` — **informe visual** (tema oscuro, gráficos, tabla)
- `security/reports/latest/INFORME.md` — versión Markdown
- `security/reports/YYYY-MM-DD_HH-MM-SS/INFORME.html`
- `security/reports/YYYY-MM-DD_HH-MM-SS/INFORME.md`

Para regenerar solo el HTML desde un informe existente:

```bash
./security/regenerate-report-html.sh
./security/regenerate-report-html.sh security/reports/2026-07-05_22-02-11
```

Abrir en el navegador: `open security/reports/latest/INFORME.html` (macOS).

## Alcance y límites éticos

| Incluido | Excluido |
|----------|----------|
| Recon, headers, auth/JWT, OWASP API, NoSQL probes, CORS, uploads | Ataques a terceros |
| Secretos en repo, gosec, govulncheck, npm audit, Docker review | DoS / floods |
| Informe JSON + Markdown | DROP DB, destructivo |

## Prerrequisitos

### Obligatorios

- `bash`, `curl`
- Recomendado: `jq` (`brew install jq`)

### Opcionales (el script usa lo disponible)

| Herramienta | Instalación | Uso |
|-------------|-------------|-----|
| **gosec** | `go install github.com/securego/gosec/v2/cmd/gosec@latest` | Análisis estático Go |
| **govulncheck** | `go install golang.org/x/vuln/cmd/govulncheck@latest` | CVEs en módulos Go |
| **gitleaks** | `brew install gitleaks` | Secretos en Git |
| **trufflehog** | `brew install trufflehog` | Secretos (alternativa) |
| **semgrep** | `brew install semgrep` | Reglas SAST (`security/semgrep.yml`) |
| **nuclei** | `brew install nuclei` | Plantillas DAST (manual, ver abajo) |
| **ZAP** | [OWASP ZAP](https://www.zaproxy.org/) | Proxy/DAST interactivo |

## Configuración

Archivo: `security/config.env` (copiar desde `config.env.example`):

```bash
TARGET_API=http://localhost:7070
TARGET_FRONTEND=http://localhost:4000
TEST_USER=gestor@test.local   # sin MFA (creada por seed/bootstrap)
TEST_PASSWORD=pentest123
BRUTE_FORCE_ATTEMPTS=8   # prueba ligera de rate limit
AUTO_INSTALL_TOOLS=1     # go install gosec/govulncheck si faltan
```

Si `gestor@test.local` no existe, ejecutar `./myrent.sh bootstrap`. Para probar con admin (MFA), desactivar MFA temporalmente o usar otra cuenta en `config.env`.

## Modos de ejecución

```bash
# Completo (estático + dinámico si API/frontend están arriba)
./security/run-pentest.sh

# Solo análisis estático (sin HTTP)
./security/run-pentest.sh --static-only
```

Si la API no está levantada, el script **sigue** con secretos, dependencias, gosec y Docker; las pruebas HTTP se omiten o registran hallazgos informativos.

## Módulos incluidos

1. **Recon** — `/health`, banners, rutas públicas
2. **Headers** — CSP, HSTS, X-Frame-Options, etc.
3. **Auth** — rutas sin token, rate limit login, JWT (alg:none, firma)
4. **API** — IDOR, mass assignment, errores verbosos, `/metrics`
5. **Injection** — operadores MongoDB en login (seguro)
6. **CORS** — orígenes maliciosos
7. **Upload** — archivo oversized, path traversal en nombre
8. **Secrets** — gitleaks / grep
9. **Dependencies** — govulncheck, npm audit
10. **Static** — gosec, semgrep
11. **Docker** — compose, secretos por defecto, Mongo expuesto
12. **TLS** — N/A en localhost (nota para producción)

## Herramientas externas (manual)

### Nuclei (plantillas 2024+)

Con la API en marcha:

```bash
nuclei -u http://localhost:7070 -tags exposure,misconfig,token -severity medium,high,critical
```

### OWASP ZAP (zap-cli / Docker)

```bash
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:4000
```

Integrar ZAP/nuclei en CI es opcional; el kit `run-pentest.sh` no los invoca por defecto para mantener tiempos cortos.

## Estructura de salida

```
security/reports/YYYY-MM-DD_HH-MM-SS/
├── INFORME.html        # Informe visual (tema oscuro, ES)
├── INFORME.md          # Informe ejecutivo Markdown (ES)
├── findings.json       # Array JSON de hallazgos
├── findings.jsonl      # Una línea por hallazgo
├── summary.json        # Metadatos, conteos y duración
├── modules/            # Estado por módulo
└── raw/                # Evidencia (headers, respuestas, gosec, etc.)

security/reports/latest/   # Copia del último escaneo (INFORME.html + INFORME.md)
```

Los informes **no se versionan** (pueden contener fragmentos de tokens). Ver `security/reports/.gitignore`.

## Integración con myrent.sh

- Menú **Utilidades → Pentest de seguridad**
- CLI: `./myrent.sh pentest`
- Solo estático: `./myrent.sh pentest-static`

## Interpretación de severidades

| Severidad | Acción |
|-----------|--------|
| **Critical** | Corregir antes de producción |
| **High** | Prioridad alta |
| **Medium** | Planificar en hardening |
| **Low** | Mejora recomendada |
| **Info** | Contexto / OK / N/A |

## Producción

Antes de desplegar:

- `JWT_SECRET` fuerte (≥32 caracteres), único por entorno
- `CORS_ORIGINS` restrictivo
- `METRICS_PROTECTED=true`
- TLS + HSTS en reverse proxy
- MongoDB sin puerto público; autenticación habilitada
- Ejecutar este kit en staging con URLs de staging en `config.env`
