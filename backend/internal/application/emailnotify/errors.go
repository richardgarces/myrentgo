package emailnotify

import (
	"fmt"
	"strings"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
)

// NotificationTypeLabel returns a user-facing Spanish label for a notification type.
func NotificationTypeLabel(t string) string {
	switch domainer.NotificationType(t) {
	case domainer.TypePaymentDue:
		return "Recordatorio de pago"
	case domainer.TypePaymentOverdue:
		return "Pago vencido"
	case domainer.TypeLateInterest:
		return "Multas por mora"
	case domainer.TypeDividendDue:
		return "Dividendo por vencer"
	case domainer.TypeLeaseExpiring:
		return "Arriendo por vencer"
	case domainer.TypeMaintenanceDue:
		return "Recordatorio de mantención"
	default:
		return t
	}
}

// ErrNoRecipients returns a Spanish message when no email recipients are enabled for a type.
func ErrNoRecipients(t domainnotif.Type) string {
	label := NotificationTypeLabel(string(t))
	return fmt.Sprintf(
		"No hay destinatarios habilitados para «%s». Configúralos en la pestaña Destinatarios.",
		label,
	)
}

// ErrNoRecipientsFor returns a Spanish message when no email recipients are enabled (domain recipient type).
func ErrNoRecipientsFor(t domainer.NotificationType) string {
	label := NotificationTypeLabel(string(t))
	return fmt.Sprintf(
		"No hay destinatarios habilitados para «%s». Configúralos en la pestaña Destinatarios.",
		label,
	)
}

// ErrNoPropertyRecipientsFor returns a Spanish message when recipients exist for the type but none match the property.
func ErrNoPropertyRecipientsFor(propertyName string, t domainer.NotificationType) string {
	if strings.TrimSpace(propertyName) == "" {
		propertyName = "este departamento"
	}
	label := NotificationTypeLabel(string(t))
	return fmt.Sprintf(
		"No hay destinatarios para «%s» con aviso «%s». Agrega un destinatario interno (global) o vincula este departamento en la pestaña Destinatarios.",
		propertyName,
		label,
	)
}

// ErrPropertyTenantNoEmail returns a Spanish message when a property-linked recipient matches but the tenant has no email.
func ErrPropertyTenantNoEmail(propertyName string) string {
	if strings.TrimSpace(propertyName) == "" {
		propertyName = "este departamento"
	}
	return fmt.Sprintf(
		"El arrendatario de «%s» no tiene correo configurado. Actualiza el contacto del arrendatario o agrega un destinatario interno.",
		propertyName,
	)
}

const errNoValidEmails = "No hay direcciones de correo válidas configuradas para los destinatarios habilitados."

const errNoTenantOrInternal = "El arrendatario no tiene correo configurado y no hay destinatarios internos."

// ErrNoValidEmails returns a Spanish message when recipients exist but have no valid email.
func ErrNoValidEmails() string {
	return errNoValidEmails
}

// ErrNoTenantOrInternalRecipients returns a Spanish message when neither tenant nor internal recipients are available.
func ErrNoTenantOrInternalRecipients() string {
	return errNoTenantOrInternal
}

// IsNoRecipientsError reports whether an error message indicates missing recipients.
func IsNoRecipientsError(msg string) bool {
	lower := strings.ToLower(msg)
	return strings.Contains(lower, "no enabled recipients") ||
		strings.Contains(lower, "no hay destinatarios habilitados") ||
		strings.Contains(lower, "no hay destinatarios para «") ||
		strings.Contains(lower, "no hay destinatarios internos") ||
		strings.Contains(msg, errNoTenantOrInternal)
}
