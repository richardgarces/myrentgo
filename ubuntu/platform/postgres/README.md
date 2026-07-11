# PostgreSQL — base relacional

**Qué es:** motor SQL ACID.  
**Para qué:** apps que no usan Mongo; o segunda app en el mismo host con BD propia.

| Variable | Para qué sirve |
|----------|----------------|
| `POSTGRES_USER` / `PASSWORD` | Credenciales de la instancia |
| `POSTGRES_DB` | BD inicial — una por app (`inventory_prod`) |
| `POSTGRES_PORT` | Solo localhost en el host |

**Backup:** `pg_dump` / `pg_dumpall`. Prefijo Restic sugerido: `{app}/prod/pg/`.
