# MongoDB — base documental

**Qué es:** base NoSQL orientada a documentos (BSON).  
**Para qué:** apps documentales; **una instancia (o una BD) por app** en plataforma compartida.

| Variable | Para qué sirve |
|----------|----------------|
| `MONGO_ROOT_USER` / `PASSWORD` | Auth obligatoria en producción |
| `MONGO_INITDB_DATABASE` | BD inicial (ej. `appdb`) |
| `MONGO_PORT` | Solo `127.0.0.1` en el host |

**Backup:** `mongodump` vía contenedor o tu script de aplicación.  
**No mezclar** colecciones de dos productos en la misma BD sin diseño.
