# Redis — cache / colas

**Qué es:** almacén clave-valor en memoria.  
**Para qué:** cache de sesiones, rate-limit compartido, colas (Bull/Asynq), locks.

| Variable | Para qué sirve |
|----------|----------------|
| `REDIS_PASSWORD` | Auth obligatorio entre apps y Redis |
| `REDIS_MAXMEMORY` | Tope de RAM — evita que Redis coma el host |
| `REDIS_MAXMEMORY_POLICY` | Qué borrar cuando se llena (cache → LRU) |
| `REDIS_APPENDONLY` | Persistencia AOF en disco |

**Conexión desde otra app en `platform-net`:**

```
redis://:PASSWORD@platform-redis:6379/0
```

**Seguridad:** puerto solo en `127.0.0.1`. No exponer a Internet.
