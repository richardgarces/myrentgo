# Node Exporter — métricas del sistema operativo

**Qué es:** exporter oficial de Prometheus para CPU, RAM, disco, red, load.  
**Para qué:** dashboards de salud del host (no de la app).

Añade en `platform/prometheus/prometheus.yml`:

```yaml
  - job_name: platform-node
    static_configs:
      - targets: ["platform-node-exporter:9100"]
        labels:
          component: node
```

Puerto solo `127.0.0.1:9100`.
