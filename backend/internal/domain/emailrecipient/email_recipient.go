package emailrecipient

import (
	"github.com/richard/my-rent-go/internal/domain/shared"
)

// NotificationType identifies which alert categories a recipient may receive.
type NotificationType string

const (
	TypePaymentDue     NotificationType = "payment_due"
	TypePaymentOverdue NotificationType = "payment_overdue"
	TypeLateInterest   NotificationType = "late_interest"
	TypeDividendDue    NotificationType = "dividend_due"
	TypeLeaseExpiring  NotificationType = "lease_expiring"
)

var AllNotificationTypes = []NotificationType{
	TypePaymentDue,
	TypePaymentOverdue,
	TypeLateInterest,
	TypeDividendDue,
	TypeLeaseExpiring,
}

func IsValidNotificationType(v string) bool {
	for _, t := range AllNotificationTypes {
		if string(t) == v {
			return true
		}
	}
	return false
}

type EmailRecipient struct {
	shared.Entity      `bson:",inline"`
	OrganizationID     string             `json:"organization_id" bson:"organization_id"`
	Email              string             `json:"email" bson:"email"`
	Name               string             `json:"name" bson:"name"`
	Label              string             `json:"label,omitempty" bson:"label,omitempty"`
	Enabled            bool               `json:"enabled" bson:"enabled"`
	NotificationTypes  []NotificationType `json:"notification_types" bson:"notification_types"`
}

func NewEmailRecipient(orgID, email, name, label string, types []NotificationType) *EmailRecipient {
	if types == nil {
		types = []NotificationType{}
	}
	return &EmailRecipient{
		Entity:            shared.NewEntity(),
		OrganizationID:    orgID,
		Email:             email,
		Name:              name,
		Label:             label,
		Enabled:           true,
		NotificationTypes: types,
	}
}

func (r *EmailRecipient) WantsType(t NotificationType) bool {
	if !r.Enabled {
		return false
	}
	for _, nt := range r.NotificationTypes {
		if nt == t {
			return true
		}
	}
	return false
}
