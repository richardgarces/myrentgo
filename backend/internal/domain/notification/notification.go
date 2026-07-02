package notification

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Type string

const (
	TypePaymentDue     Type = "payment_due"
	TypePaymentOverdue Type = "payment_overdue"
	TypeLateInterest   Type = "late_interest"
)

type Channel string

const (
	ChannelEmail    Channel = "email"
	ChannelWhatsApp Channel = "whatsapp"
	ChannelSMS      Channel = "sms"
	ChannelManual   Channel = "manual"
)

type Status string

const (
	StatusPending   Status = "pending"
	StatusSent      Status = "sent"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
)

type Notification struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string            `json:"organization_id" bson:"organization_id"`
	TenantID       string            `json:"tenant_id" bson:"tenant_id"`
	LeaseID        string            `json:"lease_id,omitempty" bson:"lease_id,omitempty"`
	Type           Type              `json:"type" bson:"type"`
	Title          string            `json:"title" bson:"title"`
	Message        string            `json:"message" bson:"message"`
	Channel        Channel           `json:"channel" bson:"channel"`
	Status         Status            `json:"status" bson:"status"`
	ScheduledAt    time.Time         `json:"scheduled_at" bson:"scheduled_at"`
	SentAt         *time.Time        `json:"sent_at,omitempty" bson:"sent_at,omitempty"`
	Metadata       map[string]string `json:"metadata,omitempty" bson:"metadata,omitempty"`
}

func NewNotification(orgID, tenantID, title, message string, nType Type, channel Channel, scheduledAt time.Time) *Notification {
	return &Notification{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		TenantID:       tenantID,
		Type:           nType,
		Title:          title,
		Message:        message,
		Channel:        channel,
		Status:         StatusPending,
		ScheduledAt:    scheduledAt,
	}
}
