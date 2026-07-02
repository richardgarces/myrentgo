package maintenance

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Type string

const (
	TypePreventive Type = "preventive"
	TypeCorrective Type = "corrective"
	TypeEmergency  Type = "emergency"
)

type Status string

const (
	StatusScheduled Status = "scheduled"
	StatusInProgress Status = "in_progress"
	StatusCompleted Status = "completed"
	StatusCancelled Status = "cancelled"
)

type Maintenance struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string       `json:"organization_id" bson:"organization_id"`
	PropertyID     string       `json:"property_id" bson:"property_id"`
	Type           Type         `json:"type" bson:"type"`
	Status         Status       `json:"status" bson:"status"`
	Title          string       `json:"title" bson:"title"`
	Description    string       `json:"description,omitempty" bson:"description,omitempty"`
	ScheduledDate  time.Time    `json:"scheduled_date" bson:"scheduled_date"`
	CompletedDate  *time.Time   `json:"completed_date,omitempty" bson:"completed_date,omitempty"`
	TechnicianID   string       `json:"technician_id,omitempty" bson:"technician_id,omitempty"`
	Cost           shared.Money `json:"cost" bson:"cost"`
	RecurrenceDays int          `json:"recurrence_days,omitempty" bson:"recurrence_days,omitempty"`
	NextDueDate    *time.Time   `json:"next_due_date,omitempty" bson:"next_due_date,omitempty"`
}

func NewMaintenance(orgID, propertyID, title string, mType Type, scheduled time.Time) *Maintenance {
	return &Maintenance{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		PropertyID:     propertyID,
		Type:           mType,
		Status:         StatusScheduled,
		Title:          title,
		ScheduledDate:  scheduled,
	}
}
