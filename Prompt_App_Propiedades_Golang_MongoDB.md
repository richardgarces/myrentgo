# Prompt maestro: Plataforma SaaS de Administración de Propiedades

## Rol
Actúa como arquitecto senior de software y generador de código de producción.

## Objetivo
Genera una aplicación completa de producción para administrar propiedades y arriendos con arquitectura escalable.

### Stack obligatorio
- Backend: Go 1.23+ / Framework Gin
- MongoDB con índices optimizados
- Frontend: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- JWT + Refresh Tokens + MFA opcional
- Docker + Docker Compose (dev y prod)
- Nginx/Caddy reverse proxy + HTTPS
- OpenAPI/Swagger + Colección Postman
- CI/CD GitHub Actions
- Tests unitarios, integración y E2E
- PWA + i18n (es/en) + tema claro/oscuro

### Arquitectura
- **Clean Architecture** (domain → application → infrastructure → interfaces)
- **DDD** con bounded contexts: Identity, Property, Leasing, Finance, Operations, CRM, Documents
- **CQRS ligero** (commands/queries separados)
- **Event Bus** para eventos de dominio asíncronos
- Preparado para **Kubernetes** (opcional)
- API REST versionada + **WebSocket** para tiempo real
- Preparación para **aplicación móvil** (API estándar)

### Modelo MongoDB — Colecciones
users, organizations, properties, tenants, leases, payments, mortgages, buildings, brokers, crm_contacts, documents, maintenance, tickets, appraisals, reminders, audit_logs, refresh_tokens

Cada colección con índices compuestos para multi-tenant (organization_id).

### Funcionalidades

#### Propiedades
Tipos: casa, departamento, terreno, bodega, oficina, estacionamiento.
Estado: disponible, arrendada, mantención, venta.
Dirección, rol, comuna, coordenadas, fotos, documentos.

#### Finanzas
Valor compra/comercial, crédito hipotecario, dividendos, gastos comunes, contribuciones.
**Dashboard financiero**, **flujo de caja**, **rentabilidad por propiedad**, **valor presente hipotecario**.

#### Arriendos
Historial, renovaciones, reajuste IPC, pagos, morosidad, alertas.

#### Arrendatarios
Datos completos, aval, documentos, historial.

#### Contratos y documentos
PDF, versionado, vencimientos. Gestión: contratos, escrituras, garantías.

#### CRM
Corredores, inmobiliarias, bancos, técnicos, proveedores, notas.

#### Operaciones
**Calendario de vencimientos**, **recordatorios** (email, WhatsApp, Telegram).
**Mantenciones preventivas**, **tickets e incidencias**.
**Historial de tasaciones**.

#### Reportes
Exportación PDF y Excel.

#### Multiusuario y multiempresa
RBAC: owner, admin, manager, accountant, viewer.
Multiempresa para administrar propiedades de familiares o terceros.

### Seguridad (OWASP Top 10)
RBAC, MFA, bcrypt/argon2id, auditoría, CSP, CSRF, rate limiting, validación, sanitización, logs, backup/restore, cifrado en tránsito (HTTPS).

### UI/UX
Inspiración: Linear, Notion, Vercel.
Responsive: desktop, tablet, móvil.
Wireframes de todas las pantallas.
Tema claro/oscuro.

### Entregables automáticos
1. Proyecto Go completo (backend/)
2. Frontend React + TypeScript + Vite + Tailwind + shadcn/ui (frontend/)
3. Docker + Docker Compose (dev + prod)
4. Makefile
5. Swagger/OpenAPI (docs/openapi.yaml)
6. Colección Postman
7. Seeds + datos de ejemplo (cmd/seed)
8. README
9. Manual técnico
10. Manual de usuario
11. Diagramas Mermaid
12. Scripts de despliegue y backup
13. Configuración Cloudflare
14. Configuración Caddy y Nginx
15. Pipeline GitHub Actions
16. Checklist de producción
17. Kubernetes opcional (deploy/kubernetes/)
18. Wireframes (docs/WIREFRAMES.md)

El código debe quedar listo para desplegar en producción.
