package audit

import (
	"time"

	"github.com/google/uuid"
)

type Action string

const (
	ActionCreate Action = "create"
	ActionUpdate Action = "update"
	ActionDelete Action = "delete"
	ActionLogin  Action = "login"
	ActionExport Action = "export"
)

type AuditLog struct {
	ID             string    `json:"id" bson:"_id"`
	OrganizationID string    `json:"organization_id" bson:"organization_id"`
	UserID         string    `json:"user_id" bson:"user_id"`
	Action         Action    `json:"action" bson:"action"`
	Resource       string    `json:"resource" bson:"resource"`
	ResourceID     string    `json:"resource_id,omitempty" bson:"resource_id,omitempty"`
	Details        any       `json:"details,omitempty" bson:"details,omitempty"`
	IPAddress      string    `json:"ip_address" bson:"ip_address"`
	UserAgent      string    `json:"user_agent" bson:"user_agent"`
	CreatedAt      time.Time `json:"created_at" bson:"created_at"`
}

func NewAuditLog(orgID, userID string, action Action, resource string) *AuditLog {
	return &AuditLog{
		ID:             uuid.New().String(),
		OrganizationID: orgID,
		UserID:         userID,
		Action:         action,
		Resource:       resource,
		CreatedAt:      time.Now().UTC(),
	}
}
