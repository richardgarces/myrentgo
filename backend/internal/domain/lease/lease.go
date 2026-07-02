package lease

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusActive    Status = "active"
	StatusExpired   Status = "expired"
	StatusTerminated Status = "terminated"
)

type Lease struct {
	shared.Entity    `bson:",inline"`
	OrganizationID   string       `json:"organization_id" bson:"organization_id"`
	PropertyID       string       `json:"property_id" bson:"property_id"`
	WarehousePropertyID string    `json:"warehouse_property_id,omitempty" bson:"warehouse_property_id,omitempty"`
	ParkingPropertyID   string    `json:"parking_property_id,omitempty" bson:"parking_property_id,omitempty"`
	TenantID         string       `json:"tenant_id" bson:"tenant_id"`
	BrokerID         string       `json:"broker_id,omitempty" bson:"broker_id,omitempty"`
	Status           Status       `json:"status" bson:"status"`
	StartDate        *time.Time   `json:"start_date,omitempty" bson:"start_date,omitempty"`
	EndDate          *time.Time   `json:"end_date,omitempty" bson:"end_date,omitempty"`
	MonthlyRent      shared.Money `json:"monthly_rent" bson:"monthly_rent"`
	Deposit          shared.Money `json:"deposit" bson:"deposit"`
	IPCAdjustment    bool         `json:"ipc_adjustment" bson:"ipc_adjustment"`
	AdjustmentMonth  int          `json:"adjustment_month,omitempty" bson:"adjustment_month,omitempty"`
	PaymentDay       int          `json:"payment_day" bson:"payment_day"`
	ContractDocID    string       `json:"contract_doc_id,omitempty" bson:"contract_doc_id,omitempty"`
	RenewalHistory   []Renewal    `json:"renewal_history" bson:"renewal_history"`
	Notes            string       `json:"notes,omitempty" bson:"notes,omitempty"`
}

type Renewal struct {
	Date         time.Time    `json:"date" bson:"date"`
	NewEndDate   time.Time    `json:"new_end_date" bson:"new_end_date"`
	NewRent      shared.Money `json:"new_rent" bson:"new_rent"`
	DocumentID   string       `json:"document_id,omitempty" bson:"document_id,omitempty"`
}

func NewLease(orgID, propertyID, tenantID string, start, end *time.Time, rent shared.Money) *Lease {
	return &Lease{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		PropertyID:     propertyID,
		TenantID:       tenantID,
		Status:         StatusDraft,
		StartDate:      start,
		EndDate:        end,
		MonthlyRent:    rent,
		PaymentDay:     5,
		RenewalHistory: []Renewal{},
	}
}
