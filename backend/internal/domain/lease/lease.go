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
	PaymentDay          int          `json:"payment_day" bson:"payment_day"`
	AutoRenew           *bool        `json:"auto_renew,omitempty" bson:"auto_renew,omitempty"`
	RenewalPeriodMonths int          `json:"renewal_period_months" bson:"renewal_period_months"`
	RenewalCount        int          `json:"renewal_count" bson:"renewal_count"`
	LastRenewedAt       *time.Time   `json:"last_renewed_at,omitempty" bson:"last_renewed_at,omitempty"`
	ContractDocID       string       `json:"contract_doc_id,omitempty" bson:"contract_doc_id,omitempty"`
	RenewalHistory      []Renewal    `json:"renewal_history" bson:"renewal_history"`
	Notes               string       `json:"notes,omitempty" bson:"notes,omitempty"`
}

type Renewal struct {
	Date         time.Time    `json:"date" bson:"date"`
	NewEndDate   time.Time    `json:"new_end_date" bson:"new_end_date"`
	NewRent      shared.Money `json:"new_rent" bson:"new_rent"`
	DocumentID   string       `json:"document_id,omitempty" bson:"document_id,omitempty"`
}

func NewLease(orgID, propertyID, tenantID string, start, end *time.Time, rent shared.Money) *Lease {
	autoRenew := true
	return &Lease{
		Entity:              shared.NewEntity(),
		OrganizationID:      orgID,
		PropertyID:          propertyID,
		TenantID:            tenantID,
		Status:              StatusDraft,
		StartDate:           start,
		EndDate:             end,
		MonthlyRent:         rent,
		PaymentDay:          5,
		AutoRenew:           &autoRenew,
		RenewalPeriodMonths: 12,
		RenewalHistory:      []Renewal{},
	}
}

func (l *Lease) AutoRenewEnabled() bool {
	if l.AutoRenew == nil {
		return true
	}
	return *l.AutoRenew
}

func (l *Lease) renewalPeriodMonths() int {
	if l.RenewalPeriodMonths > 0 {
		return l.RenewalPeriodMonths
	}
	return 12
}

// CurrentPeriodStart returns the start of the active contract period.
func (l *Lease) CurrentPeriodStart() *time.Time {
	if l.StartDate == nil {
		return nil
	}
	if l.RenewalCount == 0 || l.EndDate == nil {
		return l.StartDate
	}
	start := l.EndDate.AddDate(0, -l.renewalPeriodMonths(), 0)
	return &start
}

func truncateDate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// ApplyAutoRenewal extends end_date when the contract has expired and auto_renew is enabled.
func (l *Lease) ApplyAutoRenewal(now time.Time) bool {
	if !l.AutoRenewEnabled() || l.Status != StatusActive || l.EndDate == nil {
		return false
	}
	today := truncateDate(now.UTC())
	end := truncateDate(l.EndDate.UTC())
	if !end.Before(today) {
		return false
	}
	months := l.renewalPeriodMonths()
	newEnd := end
	for newEnd.Before(today) {
		newEnd = newEnd.AddDate(0, months, 0)
		l.RenewalCount++
		l.RenewalHistory = append(l.RenewalHistory, Renewal{
			Date:       now.UTC(),
			NewEndDate: newEnd,
			NewRent:    l.MonthlyRent,
		})
	}
	l.EndDate = &newEnd
	renewedAt := now.UTC()
	l.LastRenewedAt = &renewedAt
	return true
}

// IsPastEnd reports whether the contract end date is before today.
func (l *Lease) IsPastEnd(now time.Time) bool {
	if l.EndDate == nil {
		return false
	}
	return truncateDate(l.EndDate.UTC()).Before(truncateDate(now.UTC()))
}
