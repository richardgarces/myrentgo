package payment

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Status string

const (
	StatusPending   Status = "pending"
	StatusPaid      Status = "paid"
	StatusOverdue   Status = "overdue"
	StatusCancelled Status = "cancelled"
)

type Type string

const (
	TypeRent       Type = "rent"
	TypeDeposit    Type = "deposit"
	TypeExpense    Type = "expense"
	TypeDividend   Type = "dividend"
	TypeCommonFee  Type = "common_fee"
	TypeTax        Type = "tax"
)

type Payment struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string       `json:"organization_id" bson:"organization_id"`
	PropertyID     string       `json:"property_id,omitempty" bson:"property_id,omitempty"`
	LeaseID        string       `json:"lease_id,omitempty" bson:"lease_id,omitempty"`
	TenantID       string       `json:"tenant_id,omitempty" bson:"tenant_id,omitempty"`
	BankID         string       `json:"bank_id,omitempty" bson:"bank_id,omitempty"`
	BankName       string       `json:"bank_name,omitempty" bson:"bank_name,omitempty"`
	Type           Type         `json:"type" bson:"type"`
	Status         Status       `json:"status" bson:"status"`
	Amount         shared.Money `json:"amount" bson:"amount"`
	DueDate        time.Time    `json:"due_date" bson:"due_date"`
	PaidDate       *time.Time   `json:"paid_date,omitempty" bson:"paid_date,omitempty"`
	Reference      string       `json:"reference,omitempty" bson:"reference,omitempty"`
	Notes          string       `json:"notes,omitempty" bson:"notes,omitempty"`
	PacEnabled     bool         `json:"pac_enabled,omitempty" bson:"pac_enabled,omitempty"`
	PaymentBank    string       `json:"payment_bank,omitempty" bson:"payment_bank,omitempty"`
}

func NewPayment(orgID string, pType Type, amount shared.Money, due time.Time) *Payment {
	return &Payment{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		Type:           pType,
		Status:         StatusPending,
		Amount:         amount,
		DueDate:        due,
	}
}
