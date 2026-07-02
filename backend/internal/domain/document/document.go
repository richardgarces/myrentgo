package document

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Category string

const (
	CategoryContract   Category = "contract"
	CategoryDeed       Category = "deed"
	CategoryCertificate Category = "certificate"
	CategoryWarranty   Category = "warranty"
	CategoryID         Category = "id"
	CategoryInvoice    Category = "invoice"
	CategoryAppraisal  Category = "appraisal"
	CategoryOther      Category = "other"
)

type Document struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string    `json:"organization_id" bson:"organization_id"`
	EntityType     string    `json:"entity_type" bson:"entity_type"`
	EntityID       string    `json:"entity_id" bson:"entity_id"`
	Category       Category  `json:"category" bson:"category"`
	Title          string    `json:"title" bson:"title"`
	FileName       string    `json:"file_name" bson:"file_name"`
	FileData       string    `json:"file_data,omitempty" bson:"file_data,omitempty"`
	MimeType       string    `json:"mime_type" bson:"mime_type"`
	SizeBytes      int64     `json:"size_bytes" bson:"size_bytes"`
	StoragePath    string    `json:"storage_path" bson:"storage_path"`
	Version        int       `json:"version" bson:"version"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty" bson:"expires_at,omitempty"`
	UploadedBy     string    `json:"uploaded_by" bson:"uploaded_by"`
	Tags           []string  `json:"tags,omitempty" bson:"tags,omitempty"`
	Active         bool      `json:"active" bson:"active"`
}

func NewDocument(orgID, entityType, entityID string, cat Category, title string) *Document {
	return &Document{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		EntityType:     entityType,
		EntityID:       entityID,
		Category:       cat,
		Title:          title,
		Version:        1,
		Active:         true,
	}
}
