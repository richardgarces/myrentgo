# Prometheus — serie temporal de métricas

**Qué es:** scrapea HTTP `/metrics` y evalúa reglas de alerta.  
**Para qué:** un Prometheus por host con label `app=` por producto.

| Variable | Para qué sirve |
|----------|----------------|
| `PROMETHEUS_RETENTION` | Disco: cuántos días de historia |
| `SCRAPE_TARGET` | Dónde está tu API (edita también `prometheus.yml`) |
| `METRICS_SCRAPE_TOKEN` | Bearer si `/metrics` protegido |

## MyRent Go (BMAX / platform-net)

1. En `~/my-rent-go/.env`:
   ```env
   METRICS_ENABLED=true
   METRICS_PROTECTED=true
   METRICS_SCRAPE_TOKEN=<openssl rand -base64 32>
   ```
2. Reinicia la API: `docker restart myrent-api`
3. En `platform/prometheus/`:
   ```bash
   # mismo token que en el .env de la app (sin salto de línea)
   printf '%s' 'PEGAR_TOKEN' > metrics_token
   chmod 600 metrics_token
   # prometheus.yml ya incluye job myrentgo-api → myrent-api:7070
   docker compose up -d
   ```
4. UI: http://127.0.0.1:9090/targets → `myrentgo-api` debe estar **UP**  
   (desde la Mac: `./port-forward.sh` opción Prometheus)

Edita `prometheus.yml` → `targets` para cada app adicional.
