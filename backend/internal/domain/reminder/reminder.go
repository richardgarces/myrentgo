package reminder

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Channel string

const (
	ChannelEmail    Channel = "email"
	ChannelWhatsApp Channel = "whatsapp"
	ChannelTelegram Channel = "telegram"
)

type Status string

const (
	StatusPending Status = "pending"
	StatusSent    Status = "sent"
	StatusFailed  Status = "failed"
)

type Reminder struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string    `json:"organization_id" bson:"organization_id"`
	EntityType     string    `json:"entity_type" bson:"entity_type"`
	EntityID       string    `json:"entity_id" bson:"entity_id"`
	Title          string    `json:"title" bson:"title"`
	Message        string    `json:"message" bson:"message"`
	Channel        Channel   `json:"channel" bson:"channel"`
	Recipient      string    `json:"recipient" bson:"recipient"`
	ScheduledAt    time.Time `json:"scheduled_at" bson:"scheduled_at"`
	Status         Status    `json:"status" bson:"status"`
	SentAt         *time.Time `json:"sent_at,omitempty" bson:"sent_at,omitempty"`
}

func NewReminder(orgID, entityType, entityID, title, message string, channel Channel, recipient string, scheduled time.Time) *Reminder {
	return &Reminder{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		EntityType:     entityType,
		EntityID:       entityID,
		Title:          title,
		Message:        message,
		Channel:        channel,
		Recipient:      recipient,
		ScheduledAt:    scheduled,
		Status:         StatusPending,
	}
}
