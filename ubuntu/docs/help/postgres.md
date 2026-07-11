# PostgreSQL

## Qué es
Base de datos relacional SQL.

## Para qué sirve
Apps que no usan Mongo (inventario, facturación SQL, SaaS con RLS).

## Parámetros clave
| Parámetro | Significado |
|-----------|-------------|
| `POSTGRES_USER` / `PASSWORD` | Credenciales |
| `POSTGRES_DB` | BD lógica por app (`{app}_{env}`) |
| `POSTGRES_PORT` | Solo localhost |

Una BD (o instancia) por producto. No mezclar tablas de apps distintas sin diseño.
