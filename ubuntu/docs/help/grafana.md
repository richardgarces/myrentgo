# Grafana

## Qué es
Plataforma de dashboards (Prometheus, Loki, etc.).

## Para qué sirve
Ver gráficas de HTTP, Mongo, schedulers sin escribir PromQL a mano cada vez.

## Parámetros clave
| Parámetro | Significado |
|-----------|-------------|
| `GRAFANA_ADMIN_PASSWORD` | Debe ser fuerte |
| `PROMETHEUS_URL` | `http://platform-prometheus:9090` |
| `GF_USERS_ALLOW_SIGN_UP` | `false` en producción |

Acceso: http://127.0.0.1:3001 (o túnel SSH).
