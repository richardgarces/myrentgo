package broker

import "github.com/richard/my-rent-go/internal/domain/shared"

type Broker struct {
	shared.Entity    `bson:",inline"`
	OrganizationID   string            `json:"organization_id" bson:"organization_id"`
	CompanyID        string            `json:"company_id,omitempty" bson:"company_id,omitempty"`
	FirstName        string            `json:"first_name" bson:"first_name"`
	LastName         string            `json:"last_name" bson:"last_name"`
	Contact          shared.ContactInfo `json:"contact" bson:"contact"`
	CommissionRate   float64           `json:"commission_rate" bson:"commission_rate"`
	LicenseNumber    string            `json:"license_number,omitempty" bson:"license_number,omitempty"`
	Notes            string            `json:"notes,omitempty" bson:"notes,omitempty"`
	Active           bool              `json:"active" bson:"active"`
}

func NewBroker(orgID, firstName, lastName string, commission float64) *Broker {
	return &Broker{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		FirstName:      firstName,
		LastName:       lastName,
		CommissionRate: commission,
		Active:         true,
	}
}
