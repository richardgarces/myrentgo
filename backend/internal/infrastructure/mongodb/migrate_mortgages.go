package mongodb

import (
	"context"
	"log/slog"

	domainprop "github.com/richard/my-rent-go/internal/domain/property"
	domainmort "github.com/richard/my-rent-go/internal/domain/mortgage"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MigrateMortgagesToProperties copies legacy mortgages collection records into
// property.financials (UF) and removes the migrated documents.
func (c *Client) MigrateMortgagesToProperties(ctx context.Context, ufRate float64) error {
	propRepo := NewPropertyRepo(c)
	cursor, err := c.Collection("mortgages").Find(ctx, bson.M{}, options.Find().SetBatchSize(50))
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	var migrated, skipped int
	for cursor.Next(ctx) {
		var m domainmort.Mortgage
		if err := cursor.Decode(&m); err != nil {
			return err
		}
		if m.PropertyID == "" {
			skipped++
			continue
		}
		prop, err := propRepo.FindByID(ctx, m.OrganizationID, m.PropertyID)
		if err != nil {
			return err
		}
		if prop == nil {
			slog.Warn("orphan mortgage skipped", "mortgage_id", m.ID, "property_id", m.PropertyID)
			skipped++
			continue
		}
		updated := applyLegacyMortgageToProperty(prop, m, ufRate)
		if !updated {
			skipped++
			continue
		}
		if err := propRepo.Update(ctx, prop); err != nil {
			return err
		}
		if _, err := c.Collection("mortgages").DeleteOne(ctx, bson.M{"_id": m.ID}); err != nil {
			return err
		}
		migrated++
	}
	if err := cursor.Err(); err != nil {
		return err
	}
	if migrated > 0 || skipped > 0 {
		slog.Info("mortgages migrated to properties", "migrated", migrated, "skipped", skipped)
	}
	return nil
}

func applyLegacyMortgageToProperty(prop *domainprop.Property, m domainmort.Mortgage, ufRate float64) bool {
	prop.Financials.NormalizeMortgageUF()
	updated := false

	if prop.Financials.MonthlyMortgageUF <= 0 && m.MonthlyPayment.Amount > 0 {
		prop.Financials.MonthlyMortgageUF = clpToUF(m.MonthlyPayment.Amount, ufRate)
		updated = true
	}
	if prop.Financials.OriginalLoanUF <= 0 && m.LoanAmount.Amount > 0 {
		prop.Financials.OriginalLoanUF = clpToUF(m.LoanAmount.Amount, ufRate)
		updated = true
	}
	if prop.Financials.DebtUF <= 0 && m.OutstandingBalance.Amount > 0 {
		prop.Financials.DebtUF = clpToUF(m.OutstandingBalance.Amount, ufRate)
		updated = true
	}
	if prop.Financials.InterestRate <= 0 && m.InterestRate > 0 {
		prop.Financials.InterestRate = m.InterestRate
		updated = true
	}
	if prop.Financials.LoanTermYears <= 0 && m.TermMonths > 0 {
		prop.Financials.LoanTermYears = (m.TermMonths + 11) / 12
		updated = true
	}
	if prop.Financials.BankName == "" && m.BankID != "" {
		prop.Financials.BankName = m.BankID
		updated = true
	}
	return updated
}

func clpToUF(amount, ufRate float64) float64 {
	if ufRate > 0 {
		return amount / ufRate
	}
	return amount
}
