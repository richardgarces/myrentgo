package building

import "github.com/richard/my-rent-go/internal/domain/shared"

type Building struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string         `json:"organization_id" bson:"organization_id"`
	Name           string         `json:"name" bson:"name"`
	Address        shared.Address `json:"address" bson:"address"`
	Floors         int            `json:"floors" bson:"floors"`
	Units          int            `json:"units" bson:"units"`
	AdminCompany   string         `json:"admin_company,omitempty" bson:"admin_company,omitempty"`
	ConciergePhone string         `json:"concierge_phone,omitempty" bson:"concierge_phone,omitempty"`
	Committee      []CommitteeMember `json:"committee" bson:"committee"`
	RegulationsDoc string         `json:"regulations_doc,omitempty" bson:"regulations_doc,omitempty"`
	WarrantyInfo   string         `json:"warranty_info,omitempty" bson:"warranty_info,omitempty"`
}

type CommitteeMember struct {
	Name  string `json:"name" bson:"name"`
	Role  string `json:"role" bson:"role"`
	Phone string `json:"phone,omitempty" bson:"phone,omitempty"`
	Email string `json:"email,omitempty" bson:"email,omitempty"`
}

func NewBuilding(orgID, name string) *Building {
	return &Building{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		Name:           name,
		Committee:      []CommitteeMember{},
	}
}
