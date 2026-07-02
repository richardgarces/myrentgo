package mortgage

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Mortgage struct {
	shared.Entity    `bson:",inline"`
	OrganizationID   string       `json:"organization_id" bson:"organization_id"`
	PropertyID       string       `json:"property_id" bson:"property_id"`
	BankID           string       `json:"bank_id" bson:"bank_id"`
	LoanAmount       shared.Money `json:"loan_amount" bson:"loan_amount"`
	OutstandingBalance shared.Money `json:"outstanding_balance" bson:"outstanding_balance"`
	InterestRate     float64      `json:"interest_rate" bson:"interest_rate"`
	TermMonths       int          `json:"term_months" bson:"term_months"`
	MonthlyPayment   shared.Money `json:"monthly_payment" bson:"monthly_payment"`
	StartDate        time.Time    `json:"start_date" bson:"start_date"`
	EndDate          time.Time    `json:"end_date" bson:"end_date"`
	PresentValue     float64      `json:"present_value" bson:"present_value"`
	Active           bool         `json:"active" bson:"active"`
}

func NewMortgage(orgID, propertyID, bankID string, loan shared.Money, rate float64, term int) *Mortgage {
	return &Mortgage{
		Entity:           shared.NewEntity(),
		OrganizationID:   orgID,
		PropertyID:       propertyID,
		BankID:           bankID,
		LoanAmount:       loan,
		OutstandingBalance: loan,
		InterestRate:     rate,
		TermMonths:       term,
		Active:           true,
	}
}

// CalculatePresentValue computes NPV of remaining payments at given discount rate.
func (m *Mortgage) CalculatePresentValue(discountRate float64, remainingMonths int) float64 {
	monthlyRate := discountRate / 12 / 100
	pmt := m.MonthlyPayment.Amount
	if monthlyRate == 0 {
		return pmt * float64(remainingMonths)
	}
	pv := pmt * (1 - pow(1+monthlyRate, -float64(remainingMonths))) / monthlyRate
	m.PresentValue = pv
	return pv
}

func pow(base, exp float64) float64 {
	result := 1.0
	for i := 0; i < int(exp); i++ {
		result *= base
	}
	if exp < 0 {
		return 1 / pow(base, -exp)
	}
	return result
}
