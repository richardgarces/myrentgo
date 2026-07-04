package shared

import "strings"

// AmountInCLP converts a monetary amount to CLP using the daily UF rate when needed.
func AmountInCLP(amount float64, currency string, ufRate float64) float64 {
	if strings.EqualFold(currency, "UF") && ufRate > 0 {
		return amount * ufRate
	}
	return amount
}
