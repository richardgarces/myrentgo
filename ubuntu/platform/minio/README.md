# MinIO — almacenamiento de objetos (S3)

**Qué es:** servidor compatible con la API de Amazon S3.  
**Para qué:** documentos, PDFs, backups Restic, assets; un endpoint para N apps con **bucket por app**.

| Variable | Para qué sirve |
|----------|----------------|
| `MINIO_ROOT_USER` / `PASSWORD` | Credenciales root del cluster |
| `MINIO_API_PORT` | Puerto S3 (9000) — solo localhost |
| `MINIO_CONSOLE_PORT` | UI web (9001) — solo localhost / túnel SSH |
| `MINIO_BUCKET_DEFAULT` | Nombre sugerido; créalo con `mc` o la consola |

**Endpoint interno:** `http://platform-minio:9000`  
**Consola:** http://127.0.0.1:9001 (SSH tunnel)

**Buenas prácticas:** un access key IAM por app, limitado a su bucket. No uses root desde las apps.
