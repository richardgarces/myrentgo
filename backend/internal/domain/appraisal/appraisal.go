package appraisal

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Appraisal struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string       `json:"organization_id" bson:"organization_id"`
	PropertyID     string       `json:"property_id" bson:"property_id"`
	Value          shared.Money `json:"value" bson:"value"`
	Appraiser      string       `json:"appraiser" bson:"appraiser"`
	AppraisalDate  time.Time    `json:"appraisal_date" bson:"appraisal_date"`
	DocumentID     string       `json:"document_id,omitempty" bson:"document_id,omitempty"`
	Notes          string       `json:"notes,omitempty" bson:"notes,omitempty"`
	Method         string       `json:"method,omitempty" bson:"method,omitempty"`
}

func NewAppraisal(orgID, propertyID string, value shared.Money, date time.Time) *Appraisal {
	return &Appraisal{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		PropertyID:     propertyID,
		Value:          value,
		AppraisalDate:  date,
	}
}
