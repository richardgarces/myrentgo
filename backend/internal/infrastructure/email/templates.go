package email

import (
	"fmt"
	"html"
	"strings"
	"time"

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

// LeaseExpiringContext carries lease contract details for expiring notifications.
type LeaseExpiringContext struct {
	TenantName   string
	PropertyName string
	EndDate      string
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

func typeLabel(t string) string {
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

	text := fmt.Sprintf("%s\n\n%s\n\nTipo: %s\n\n— MyRent Go — Administración de propiedades", title, message, typeLabel(notifType))
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
  <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">%s</p>
  <h1 style="font-size:20px;margin:8px 0 16px;">%s</h1>
  <p style="white-space:pre-wrap;">%s</p>
  %s
</body>
</html>`, emailHeader(), escapedType, escapedTitle, escapedMessage, emailFooter)

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

	text := fmt.Sprintf("%s\n\n%s\n\nArrendatario: %s\nPropiedad: %s\nMonto: %s\nVencimiento: %s\n\n— MyRent Go — Administración de propiedades",
		title, message, ctx.TenantName, ctx.PropertyName, ctx.Amount, ctx.DueDate)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
  <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">%s</p>
  <h1 style="font-size:20px;margin:8px 0 16px;">%s</h1>
  <p style="white-space:pre-wrap;">%s</p>
  <table style="width:100%%;border-collapse:collapse;margin:20px 0;font-size:14px;">
    <tr><td style="padding:8px 0;color:#666;">Arrendatario</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666;">Propiedad</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
    <tr><td style="padding:8px 0;color:#666;">Monto</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666;">Vencimiento</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
  </table>
  %s
</body>
</html>`, emailHeader(), escapedType, escapedTitle, escapedMessage, escapedTenant, escapedProperty, escapedAmount, escapedDue, emailFooter)

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

	text := fmt.Sprintf("%s\n\n%s\n\nPropiedad: %s\nMantención: %s\nTipo: %s\nFecha programada: %s\nCosto estimado: %s\n\n— MyRent Go — Administración de propiedades",
		title, message, ctx.PropertyName, ctx.Title, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
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
  %s
</body>
</html>`, emailHeader(), escapedTitle, escapedMessage, escapedProperty, escapedMaintTitle, escapedType, escapedDate, escapedCost, emailFooter)

	return subject, htmlBody, text
}

func RenderLeaseExpiringNotification(title, message string, ctx LeaseExpiringContext) (string, string, string) {
	subject := title
	if subject == "" {
		subject = "MyRent Go — Contrato de arriendo por vencer"
	}

	escapedTitle := html.EscapeString(title)
	escapedMessage := html.EscapeString(message)
	escapedTenant := html.EscapeString(ctx.TenantName)
	escapedProperty := html.EscapeString(ctx.PropertyName)
	escapedEnd := html.EscapeString(ctx.EndDate)

	text := fmt.Sprintf("%s\n\n%s\n\nArrendatario: %s\nPropiedad: %s\nFin de contrato: %s\n\nPor favor responda a este correo indicando si desea continuar con el arriendo.\n\n— MyRent Go — Administración de propiedades",
		title, message, ctx.TenantName, ctx.PropertyName, ctx.EndDate)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
  <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Arriendo por vencer</p>
  <h1 style="font-size:20px;margin:8px 0 16px;">%s</h1>
  <p style="white-space:pre-wrap;">%s</p>
  <table style="width:100%%;border-collapse:collapse;margin:20px 0;font-size:14px;">
    <tr><td style="padding:8px 0;color:#666;">Arrendatario</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666;">Propiedad</td><td style="padding:8px 0;text-align:right;">%s</td></tr>
    <tr><td style="padding:8px 0;color:#666;">Fin de contrato</td><td style="padding:8px 0;text-align:right;"><strong>%s</strong></td></tr>
  </table>
  <p style="font-size:14px;color:#444;">Responda a este correo indicando si desea continuar con el arriendo.</p>
  %s
</body>
</html>`, emailHeader(), escapedTitle, escapedMessage, escapedTenant, escapedProperty, escapedEnd, emailFooter)

	return subject, htmlBody, text
}

func RenderPasswordResetPIN(firstName, pin string, expiresAt time.Time, adminInitiated bool) (string, string, string) {
	name := strings.TrimSpace(firstName)
	greeting := "Hola"
	if name != "" {
		greeting = "Hola, " + name
	}
	expiryText := expiresAt.Format("02/01/2006 15:04") + " (UTC)"
	subject := "MyRent Go — Código para restablecer contraseña"
	if adminInitiated {
		subject = "MyRent Go — Contraseña provisional"
	}

	intro := "Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código PIN:"
	action := "Ingresa este PIN en la pantalla de recuperación junto con tu nueva contraseña."
	if adminInitiated {
		intro = "Un administrador restableció tu contraseña. Tu contraseña provisional es:"
		action = "Inicia sesión con este PIN y cámbiala en Configuración → Perfil."
	}

	text := fmt.Sprintf("%s\n\n%s\n\nPIN: %s\n\nVálido hasta: %s\n\n%s\n\n— MyRent Go — Administración de propiedades",
		greeting, intro, pin, expiryText, action)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
  <p>%s,</p>
  <p>%s</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:0.25em;text-align:center;margin:24px 0;padding:16px;background:#f4f4f5;border-radius:8px;">%s</p>
  <p style="font-size:14px;color:#666;">Válido hasta: <strong>%s</strong></p>
  <p style="font-size:14px;color:#444;">%s</p>
  <p style="font-size:13px;color:#888;">Si no solicitaste este cambio, ignora este correo o contacta al administrador.</p>
  %s
</body>
</html>`, emailHeader(), html.EscapeString(greeting), html.EscapeString(intro), html.EscapeString(pin), html.EscapeString(expiryText), html.EscapeString(action), emailFooter)

	return subject, htmlBody, text
}

func RenderTeamInviteVerification(firstName, verifyURL string, expiresAt time.Time) (string, string, string) {
	name := strings.TrimSpace(firstName)
	greeting := "Hola"
	if name != "" {
		greeting = "Hola, " + name
	}
	expiryText := expiresAt.Format("02/01/2006 15:04") + " (UTC)"
	subject := "MyRent Go — Verifica tu correo y activa tu cuenta"
	intro := "Te han invitado a unirte a MyRent Go. Confirma que este es tu correo y elige tu contraseña haciendo clic en el botón:"
	action := "Si el botón no funciona, copia y pega este enlace en tu navegador:"
	escapedURL := html.EscapeString(verifyURL)

	text := fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s\n\nVálido hasta: %s\n\nSi no esperabas esta invitación, ignora este correo.\n\n— MyRent Go — Administración de propiedades",
		greeting, intro, verifyURL, action, expiryText)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
  <p>%s,</p>
  <p>%s</p>
  <p style="text-align:center;margin:28px 0;">
    <a href="%s" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Verificar correo y crear contraseña</a>
  </p>
  <p style="font-size:14px;color:#444;">%s</p>
  <p style="font-size:13px;word-break:break-all;color:#666;">%s</p>
  <p style="font-size:14px;color:#666;">Válido hasta: <strong>%s</strong></p>
  <p style="font-size:13px;color:#888;">Si no esperabas esta invitación, ignora este correo o contacta al administrador.</p>
  %s
</body>
</html>`, emailHeader(), html.EscapeString(greeting), html.EscapeString(intro), escapedURL, html.EscapeString(action), escapedURL, html.EscapeString(expiryText), emailFooter)

	return subject, htmlBody, text
}

func RenderTestEmail(recipientName string) (string, string, string) {
	name := strings.TrimSpace(recipientName)
	greeting := "Hola"
	if name != "" {
		greeting = "Hola, " + name
	}
	subject := "MyRent Go — Correo de prueba"
	text := greeting + "\n\nEste es un correo de prueba de MyRent Go. Si lo recibiste, la configuración SMTP es correcta.\n\n— MyRent Go — Administración de propiedades"
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  %s
  <p>%s,</p>
  <p>Este es un <strong>correo de prueba</strong>. Si lo recibiste, la configuración SMTP es correcta.</p>
  %s
</body>
</html>`, emailHeader(), html.EscapeString(greeting), emailFooter)
	return subject, htmlBody, text
}
