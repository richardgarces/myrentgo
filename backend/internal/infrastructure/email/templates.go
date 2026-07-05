package email

import (
	"fmt"
	"html"
	"strings"

	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
)

// RentPaymentContext carries payment details for rent notification templates.
type RentPaymentContext struct {
	TenantName   string
	PropertyName string
	Amount       string
	DueDate      string
}

// MaintenanceContext carries maintenance details for notification templates.
type MaintenanceContext struct {
	PropertyName  string
	Title         string
	TypeLabel     string
	ScheduledDate string
	Cost          string
}

func MaintenanceTypeLabel(t string) string {
	switch t {
	case "preventive":
		return "Preventiva"
	case "corrective":
		return "Correctiva"
	case "emergency":
		return "Emergencia"
	default:
		return t
	}
}
	switch t {
	case string(domainnotif.TypePaymentDue):
		return "Recordatorio de pago"
	case string(domainnotif.TypePaymentOverdue):
		return "Pago vencido"
	case string(domainnotif.TypeLateInterest):
		return "Multas por mora"
	case string(domainnotif.TypeMaintenanceDue):
		return "Recordatorio de mantención"
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

func RenderRentPaymentNotification(notifType, title, message string, ctx RentPaymentContext) (string, string, string) {
	subject := title
	if subject == "" {
		subject = fmt.Sprintf("MyRent Go — %s", typeLabel(notifType))
	}

	escapedTitle := html.EscapeString(title)
	escapedMessage := html.EscapeString(message)
	escapedType := html.EscapeString(typeLabel(notifType))
	escapedTenant := html.EscapeString(ctx.TenantName)
	escapedProperty := html.EscapeString(ctx.PropertyName)
	escapedAmount := html.EscapeString(ctx.Amount)
	escapedDue := html.EscapeString(ctx.DueDate)

	text := fmt.Sprintf("%s\n\n%s\n\nArrendatario: %s\nPropiedad: %s\nMonto: %s\nVencimiento: %s\n\n— MyRent Go",
		title, message, ctx.TenantName, ctx.PropertyName, ctx.Amount, ctx.DueDate)

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
  <table style="width:100%%;border-collapse:collapse;margin:20px 0;font-size:14px;">
    <tr><td style="padding:8px 0;color:#666;">Arrendatario</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666;">Propiedad</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
    <tr><td style="padding:8px 0;color:#666;">Monto</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666;">Vencimiento</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
  <p style="font-size:12px;color:#888;">Notificación automática de administración de propiedades.</p>
</body>
</html>`, escapedType, escapedTitle, escapedMessage, escapedTenant, escapedProperty, escapedAmount, escapedDue)

	return subject, htmlBody, text
}

func RenderMaintenanceNotification(title, message string, ctx MaintenanceContext) (string, string, string) {
	subject := title
	if subject == "" {
		subject = "MyRent Go — Recordatorio de mantención"
	}

	escapedTitle := html.EscapeString(title)
	escapedMessage := html.EscapeString(message)
	escapedProperty := html.EscapeString(ctx.PropertyName)
	escapedMaintTitle := html.EscapeString(ctx.Title)
	escapedType := html.EscapeString(ctx.TypeLabel)
	escapedDate := html.EscapeString(ctx.ScheduledDate)
	escapedCost := html.EscapeString(ctx.Cost)

	text := fmt.Sprintf("%s\n\n%s\n\nPropiedad: %s\nMantención: %s\nTipo: %s\nFecha programada: %s\nCosto estimado: %s\n\n— MyRent Go",
		title, message, ctx.PropertyName, ctx.Title, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px;">
    <strong style="font-size:18px;">MyRent Go</strong>
  </div>
  <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Recordatorio de mantención</p>
  <h1 style="font-size:20px;margin:8px 0 16px;">%s</h1>
  <p style="white-space:pre-wrap;">%s</p>
  <table style="width:100%%;border-collapse:collapse;margin:20px 0;font-size:14px;">
    <tr><td style="padding:8px 0;color:#666;">Propiedad</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666;">Mantención</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
    <tr><td style="padding:8px 0;color:#666;">Tipo</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
    <tr><td style="padding:8px 0;color:#666;">Fecha programada</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
    <tr><td style="padding:8px 0;color:#666;">Costo estimado</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
  <p style="font-size:12px;color:#888;">Notificación automática de administración de propiedades.</p>
</body>
</html>`, escapedTitle, escapedMessage, escapedProperty, escapedMaintTitle, escapedType, escapedDate, escapedCost)

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
