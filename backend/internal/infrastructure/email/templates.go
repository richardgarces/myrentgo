package email

import (
	"fmt"
	"html"
	"strings"

	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
)

func typeLabel(t string) string {
	switch t {
	case string(domainnotif.TypePaymentDue):
		return "Aviso de pago"
	case string(domainnotif.TypePaymentOverdue):
		return "Pago atrasado"
	case string(domainnotif.TypeLateInterest):
		return "Intereses por mora"
	case "dividend_due":
		return "Dividendo por vencer"
	case "lease_expiring":
		return "Arriendo por vencer"
	default:
		return t
	}
}

func RenderNotification(subject, title, message, notifType string) (string, string, string) {
	if subject == "" {
		subject = fmt.Sprintf("MyRent Go — %s", typeLabel(notifType))
	}
	escapedTitle := html.EscapeString(title)
	escapedMessage := html.EscapeString(message)
	escapedType := html.EscapeString(typeLabel(notifType))

	text := fmt.Sprintf("%s\n\n%s\n\nTipo: %s\n\n— MyRent Go", title, message, typeLabel(notifType))
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px;">
    <strong style="font-size:18px;">MyRent Go</strong>
  </div>
  <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">%s</p>
  <h1 style="font-size:20px;margin:8px 0 16px;">%s</h1>
  <p style="white-space:pre-wrap;">%s</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
  <p style="font-size:12px;color:#888;">Notificación automática de administración de propiedades.</p>
</body>
</html>`, escapedType, escapedTitle, escapedMessage)

	return subject, htmlBody, text
}

func RenderTestEmail(recipientName string) (string, string, string) {
	name := strings.TrimSpace(recipientName)
	greeting := "Hola"
	if name != "" {
		greeting = "Hola, " + name
	}
	subject := "MyRent Go — Correo de prueba"
	text := greeting + "\n\nEste es un correo de prueba de MyRent Go. Si lo recibiste, la configuración SMTP es correcta.\n\n— MyRent Go"
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px;">
    <strong style="font-size:18px;">MyRent Go</strong>
  </div>
  <p>%s,</p>
  <p>Este es un <strong>correo de prueba</strong>. Si lo recibiste, la configuración SMTP es correcta.</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
  <p style="font-size:12px;color:#888;">Notificación automática de administración de propiedades.</p>
</body>
</html>`, html.EscapeString(greeting))
	return subject, htmlBody, text
}
