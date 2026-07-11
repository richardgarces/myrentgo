# cAdvisor — métricas de contenedores

**Qué es:** exporter de uso de CPU/RAM/red/disco **por contenedor**.  
**Para qué:** ver qué contenedor satura el host.

Añade en `platform/prometheus/prometheus.yml`:

```yaml
  - job_name: platform-cadvisor
    static_configs:
      - targets: ["platform-cadvisor:8080"]
        labels:
          component: cadvisor
```

UI local: http://127.0.0.1:8088 (solo localhost).  
Requiere privilegios elevados (lee cgroup/docker).
