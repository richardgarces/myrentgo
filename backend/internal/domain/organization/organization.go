package organization

import "github.com/richard/my-rent-go/internal/domain/shared"

type Organization struct {
	shared.Entity `bson:",inline"`
	Name          string `json:"name" bson:"name"`
	TaxID         string `json:"tax_id,omitempty" bson:"tax_id,omitempty"`
	Email         string `json:"email,omitempty" bson:"email,omitempty"`
	Phone         string `json:"phone,omitempty" bson:"phone,omitempty"`
	LogoURL       string `json:"logo_url,omitempty" bson:"logo_url,omitempty"`
	Active        bool   `json:"active" bson:"active"`
	Settings      OrgSettings `json:"settings" bson:"settings"`
}

type OrgSettings struct {
	Currency        string `json:"currency" bson:"currency"`
	Timezone        string `json:"timezone" bson:"timezone"`
	Locale          string `json:"locale" bson:"locale"`
	FiscalYearStart int    `json:"fiscal_year_start" bson:"fiscal_year_start"`
}

func NewOrganization(name, taxID string) *Organization {
	org := &Organization{
		Entity:  shared.NewEntity(),
		Name:    name,
		TaxID:   taxID,
		Active:  true,
		Settings: OrgSettings{
			Currency:        "CLP",
			Timezone:        "America/Santiago",
			Locale:          "es-CL",
			FiscalYearStart: 1,
		},
	}
	return org
}
