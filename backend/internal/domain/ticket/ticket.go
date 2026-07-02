package ticket

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Priority string

const (
	PriorityLow      Priority = "low"
	PriorityMedium   Priority = "medium"
	PriorityHigh     Priority = "high"
	PriorityCritical Priority = "critical"
)

type Status string

const (
	StatusOpen       Status = "open"
	StatusInProgress Status = "in_progress"
	StatusResolved   Status = "resolved"
	StatusClosed     Status = "closed"
)

type Ticket struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string     `json:"organization_id" bson:"organization_id"`
	PropertyID     string     `json:"property_id" bson:"property_id"`
	LeaseID        string     `json:"lease_id,omitempty" bson:"lease_id,omitempty"`
	Title          string     `json:"title" bson:"title"`
	Description    string     `json:"description" bson:"description"`
	Priority       Priority   `json:"priority" bson:"priority"`
	Status         Status     `json:"status" bson:"status"`
	ReportedBy     string     `json:"reported_by" bson:"reported_by"`
	AssignedTo     string     `json:"assigned_to,omitempty" bson:"assigned_to,omitempty"`
	Comments       []Comment  `json:"comments" bson:"comments"`
	ResolvedAt     *time.Time `json:"resolved_at,omitempty" bson:"resolved_at,omitempty"`
}

type Comment struct {
	ID        string    `json:"id" bson:"id"`
	UserID    string    `json:"user_id" bson:"user_id"`
	Content   string    `json:"content" bson:"content"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
}

func NewTicket(orgID, propertyID, title, description string, priority Priority) *Ticket {
	return &Ticket{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		PropertyID:     propertyID,
		Title:          title,
		Description:    description,
		Priority:       priority,
		Status:         StatusOpen,
		Comments:       []Comment{},
	}
}
