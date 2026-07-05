# Plan Free de Cloudflare ($0)

Resumen de lo que ofrece el plan gratuito para **meincart.com** y cómo encaja con MyRent Go.

## Qué incluye

| Categoría | Detalle en plan Free |
|-----------|----------------------|
| **DNS** | Gestión autoritativa del dominio, sin límite práctico de registros |
| **SSL universal** | Certificado TLS en el edge para visitantes (`https://`) |
| **CDN** | Cache y red global; reduce latencia al frontend y assets estáticos |
| **Reglas** | Hasta **10** reglas de transformación / redirección / Page Rules (según producto activo en la cuenta) |
| **WAF** | Conjunto limitado; hasta **5** reglas WAF personalizadas en Free |
| **Workers** | **100 000** solicitudes por día |
| **D1** | Base SQL serverless; **5 GB** de almacenamiento |
| **R2** | Almacenamiento de objetos; **10 GB** |
| **Pages** | Hosting estático / JAMstack con despliegues desde Git |
| **DDoS** | Mitigación básica incluida |
| **Soporte** | Solo comunidad (foros, documentación); sin ticket prioritario |

Para MyRent Go, lo más relevante del plan Free suele ser: **DNS**, **SSL en el edge**, **CDN**, **protección DDoS básica** y, opcionalmente, **Email Routing** (correo entrante gratuito).

## D1 y R2: qué son y si los necesitas

El plan Free incluye **D1** y **R2** en la cuenta de Cloudflare, pero son productos distintos con usos distintos. Aparecen en el dashboard junto a Workers y Pages; **no sustituyen** la base de datos ni el almacenamiento que ya usa MyRent Go en el VPS.

### Cloudflare D1

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Base de datos **SQL serverless** (SQLite) gestionada por Cloudflare |
| **Límite Free** | **5 GB** de almacenamiento |
| **Dónde corre** | En el edge, integrada con **Workers** y **Pages** |
| **Para qué sirve** | Datos relacionales pequeños cerca del usuario: sesiones, configuración, catálogos, métricas ligeras, prototipos JAMstack |

D1 es útil si despliegas lógica en Workers/Pages y necesitas SQL sin montar un servidor. **No es MongoDB** ni un reemplazo directo de la base principal de MyRent Go.

### Cloudflare R2

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | **Almacenamiento de objetos** (similar a Amazon S3) |
| **Límite Free** | **10 GB** |
| **Para qué sirve** | Archivos estáticos o binarios: PDFs, imágenes, adjuntos, copias de seguridad, assets de la PWA servidos desde el edge |
| **Ventaja típica** | Sin cargos de **egress** (salida de datos) frente a muchos object stores tradicionales |

R2 guarda **archivos**, no filas de una aplicación. Un bucket R2 podría alojar contratos escaneados o recibos exportados, pero hoy MyRent Go no lo usa de forma nativa.

### Comparación: D1 vs R2 vs MongoDB (MyRent Go)

| Criterio | Cloudflare D1 | Cloudflare R2 | MongoDB (MyRent Go) |
|----------|---------------|---------------|---------------------|
| **Tipo** | SQL (SQLite) | Objetos / archivos | NoSQL (documentos) |
| **Uso principal** | Datos tabulares en Workers/Pages | PDFs, imágenes, backups | Propiedades, inquilinos, pagos, usuarios |
| **Dónde vive** | Edge Cloudflare | Edge Cloudflare | VPS / contenedor (`mongo` en Docker) |
| **MyRent Go hoy** | No integrado | No integrado | **Sí — base de datos principal** |
| **¿Necesario para meincart.com?** | No | No | Sí (ya lo tienes en el stack) |

### ¿Los necesitas para meincart.com / MyRent Go?

**No son obligatorios** para el despliegue actual de MyRent Go en un VPS con MongoDB:

| Producto | ¿Requerido? | Comentario |
|----------|-------------|------------|
| **D1** | No | MyRent Go persiste todo en MongoDB; no hay Workers/Pages que consuman D1 en el proyecto |
| **R2** | No (opcional a futuro) | Podría servir para almacenar documentos o exports fuera del disco del VPS; requeriría desarrollo adicional |
| **MongoDB** | Sí | Ya forma parte de la arquitectura documentada del backend |

Puedes ignorar D1 y R2 en el dashboard mientras uses **DNS + SSL + CDN + SMTP externo**. Si más adelante quieres servir adjuntos desde el edge o un microservicio en Workers, R2 sería el candidato natural; D1 solo tendría sentido para apps nuevas en el ecosistema Cloudflare, no para reemplazar MongoDB.

## Qué no incluye (o no aplica a MyRent Go)

| Limitación | Implicación |
|------------|-------------|
| **Sin servidor SMTP saliente** | Cloudflare **no** envía correos de la aplicación. MyRent Go necesita SMTP real (Gmail, SendGrid, M365, etc.). |
| **Sin buzón IMAP/POP** | No hay bandeja de correo alojada; solo reenvío con Email Routing. |
| **WAF avanzado limitado** | Reglas gestionadas ampliadas y más reglas custom requieren planes de pago. |
| **Soporte telefónico / prioritario** | No disponible en Free. |

## Email Routing vs SMTP de aplicación

| Función | Cloudflare Free | MyRent Go |
|---------|-----------------|-----------|
| Recibir `algo@meincart.com` y reenviar a Gmail | Sí (Email Routing) | No gestiona buzones |
| Enviar alertas, recordatorios, pruebas desde la API | No | Sí, vía variables `SMTP_*` en `.env` |

No confundas **Email Routing** (entrante, gratuito) con el **SMTP** que configura el backend para notificaciones salientes. Ambos pueden coexistir; ver [correo.md](./correo.md).

## Cuándo considerar un plan de pago

El plan Free suele bastar para un despliegue personal o PYME con tráfico moderado. Valora un plan superior si necesitas:

- Más reglas WAF o rate limiting avanzado
- Soporte comercial
- Workers o tráfico por encima de los límites gratuitos
- Funciones Zero Trust o Access para equipos grandes

Para la mayoría de instalaciones de MyRent Go en un VPS propio, **Free + SMTP externo** es suficiente.

## Volver al índice

[README.md](./README.md)
