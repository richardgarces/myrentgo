# Grafana — visualización

**Qué es:** UI de dashboards sobre Prometheus (u otras fuentes).  
**Para qué:** carpetas por app; datasource único Prometheus de plataforma.

| Variable | Para qué sirve |
|----------|----------------|
| `GRAFANA_ADMIN_PASSWORD` | Acceso admin — cambiar siempre |
| `PROMETHEUS_URL` | Debe apuntar a `http://platform-prometheus:9090` |
| `GF_USERS_ALLOW_SIGN_UP` | Mantener `false` en prod |

UI: http://127.0.0.1:3001
