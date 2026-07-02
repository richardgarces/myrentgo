package tenant

import "github.com/richard/my-rent-go/internal/domain/shared"

type Tenant struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string            `json:"organization_id" bson:"organization_id"`
	FirstName      string            `json:"first_name" bson:"first_name"`
	LastName       string            `json:"last_name" bson:"last_name"`
	TaxID          string            `json:"tax_id,omitempty" bson:"tax_id,omitempty"`
	Contact        shared.ContactInfo `json:"contact" bson:"contact"`
	Address        shared.Address    `json:"address,omitempty" bson:"address,omitempty"`
	Guarantor      *Guarantor        `json:"guarantor,omitempty" bson:"guarantor,omitempty"`
	Notes          string            `json:"notes,omitempty" bson:"notes,omitempty"`
	Active         bool              `json:"active" bson:"active"`
}

type Guarantor struct {
	Name    string            `json:"name" bson:"name"`
	TaxID   string            `json:"tax_id,omitempty" bson:"tax_id,omitempty"`
	Contact shared.ContactInfo `json:"contact" bson:"contact"`
}

func NewTenant(orgID, firstName, lastName string) *Tenant {
	return &Tenant{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		FirstName:      firstName,
		LastName:       lastName,
		Active:         true,
	}
}

func (t *Tenant) FullName() string {
	return t.FirstName + " " + t.LastName
}
