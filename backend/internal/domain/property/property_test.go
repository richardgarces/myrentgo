package property_test

import (
	"testing"

	"github.com/richard/my-rent-go/internal/domain/property"
	"github.com/richard/my-rent-go/internal/domain/shared"
)

func TestNewProperty(t *testing.T) {
	p := property.NewProperty("org-1", "Test Depto", property.TypeApartment)
	if p.OrganizationID != "org-1" {
		t.Errorf("expected org-1, got %s", p.OrganizationID)
	}
	if p.Status != property.StatusAvailable {
		t.Errorf("expected available status")
	}
	if p.ID == "" {
		t.Error("expected non-empty ID")
	}
}

func TestPropertyFinancials(t *testing.T) {
	p := property.NewProperty("org-1", "Casa", property.TypeHouse)
	p.Financials.ExpectedRent = shared.NewMoney(500000, "CLP")
	if p.Financials.ExpectedRent.Amount != 500000 {
		t.Errorf("expected 500000 rent")
	}
}
