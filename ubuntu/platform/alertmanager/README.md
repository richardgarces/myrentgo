# Alertmanager — enruta alertas de Prometheus

**Qué es:** recibe alertas y las envía por correo / Telegram.  
**Para qué:** un canal de ops centralizado con silences y agrupación.

1. Copia `.env.example` → `.env` y completa SMTP o Telegram.
2. Ejecuta `./render-config.sh` para generar `alertmanager.yml`.
3. Levanta con el menú de plataforma.

| Variable | Para qué sirve |
|----------|----------------|
| `ALERTMANAGER_SMTP_*` | Salida por Brevo/SendGrid/Gmail |
| `ALERTMANAGER_EMAIL_TO` | Quién recibe las alertas |
| `ALERTMANAGER_TELEGRAM_*` | Bot + chat destino |
| `REPEAT_INTERVAL_*` | Cada cuánto reenvía si sigue firing |

UI: http://127.0.0.1:9093  
Prometheus debe tener `targets: ["platform-alertmanager:9093"]`.
