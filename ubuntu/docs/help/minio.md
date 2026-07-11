# MinIO

## Qué es
Servidor de objetos compatible con la API de Amazon S3 (buckets, keys, presigned URLs).

## Para qué sirve
- Guardar PDFs, imágenes, exports
- Destino de **Restic**
- CDN origen / adjuntos multi-app (bucket por app)

## Cuándo instalarlo
Cuando quieres salir del filesystem local del contenedor app, o centralizar backups/documentos entre productos.

## Parámetros clave
| Parámetro | Significado |
|-----------|-------------|
| `MINIO_ROOT_USER` / `PASSWORD` | Root del cluster (no usar desde apps) |
| `MINIO_API_PORT` | API S3 (9000) |
| `MINIO_CONSOLE_PORT` | UI web (9001) |
| `MINIO_BUCKET_DEFAULT` | Nombre sugerido `{app}-{env}-{uso}` |

## Seguridad
Solo localhost + túnel SSH. Crea access keys por app limitadas al bucket.
