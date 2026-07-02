package mortgage_test

import (
	"testing"

	"github.com/richard/my-rent-go/internal/domain/mortgage"
	"github.com/richard/my-rent-go/internal/domain/shared"
)

func TestCalculatePresentValue(t *testing.T) {
	m := mortgage.NewMortgage("org-1", "prop-1", "bank-1", shared.NewMoney(100000000, "CLP"), 4.5, 240)
	m.MonthlyPayment = shared.NewMoney(650000, "CLP")

	pv := m.CalculatePresentValue(4.5, 180)
	if pv <= 0 {
		t.Error("present value should be positive")
	}
	if pv >= m.MonthlyPayment.Amount*180 {
		t.Error("present value should be less than total undiscounted payments")
	}
}
