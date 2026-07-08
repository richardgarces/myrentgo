package crm

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type ContactType string

const (
	TypeRealEstate ContactType = "real_estate"
	TypeBank       ContactType = "bank"
	TypeTechnician ContactType = "technician"
	TypeSupplier   ContactType = "supplier"
	TypeBuilding   ContactType = "building"
	TypeOther      ContactType = "other"
)

var AllContactTypes = []ContactType{
	TypeRealEstate,
	TypeBank,
	TypeTechnician,
	TypeSupplier,
	TypeBuilding,
	TypeOther,
}

func IsValidContactType(v string) bool {
	for _, t := range AllContactTypes {
		if string(t) == v {
			return true
		}
	}
	return false
}

type Contact struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string            `json:"organization_id" bson:"organization_id"`
	Type           ContactType       `json:"type" bson:"type"`
	Name           string            `json:"name" bson:"name"`
	Contact        shared.ContactInfo `json:"contact" bson:"contact"`
	Address        shared.Address    `json:"address,omitempty" bson:"address,omitempty"`
	Notes          []Note            `json:"notes" bson:"notes"`
	Tags           []string          `json:"tags,omitempty" bson:"tags,omitempty"`
	Active         bool              `json:"active" bson:"active"`
}

type Note struct {
	ID        string    `json:"id" bson:"id"`
	Content   string    `json:"content" bson:"content"`
	CreatedBy string    `json:"created_by" bson:"created_by"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
}

func NewContact(orgID string, cType ContactType, name string) *Contact {
	return &Contact{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		Type:           cType,
		Name:           name,
		Notes:          []Note{},
		Active:         true,
	}
}
