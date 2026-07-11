# MongoDB

## Qué es
Base de datos NoSQL documental.

## Para qué sirve
Datos de negocio de aplicaciones documentales (documentos BSON, agregaciones, índices flexibles).

## Cuándo instalarlo en plataforma
- Si separas la BD del compose de la app, o
- Varios productos Mongo en el mismo host (BD distinta por app).

También puedes mantener Mongo **dentro** del compose de cada app; esta unidad es para un Mongo de plataforma compartido.

## Parámetros clave
| Parámetro | Significado |
|-----------|-------------|
| `MONGO_ROOT_*` | Auth obligatoria |
| `MONGO_INITDB_DATABASE` | BD inicial (ej. `appdb`) |
| `MONGO_PORT` | Solo localhost |

**Nunca** publiques 27017 a Internet.
