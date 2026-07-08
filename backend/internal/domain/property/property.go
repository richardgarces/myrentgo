package property

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Type string

const (
	TypeHouse        Type = "house"
	TypeApartment    Type = "apartment"
	TypeLand         Type = "land"
	TypeWarehouse    Type = "warehouse"
	TypeOffice       Type = "office"
	TypeParking      Type = "parking"
)

type Status string

const (
	StatusAvailable  Status = "available"
	StatusRented     Status = "rented"
	StatusMaintenance Status = "maintenance"
	StatusForSale    Status = "for_sale"
)

type Purpose string

const (
	PurposeLive         Purpose = "live"
	PurposeRent         Purpose = "rent"
	PurposeVacation     Purpose = "vacation"
	PurposeConstruction Purpose = "construction"
	PurposeOther        Purpose = "other"
)

type Property struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string        `json:"organization_id" bson:"organization_id"`
	BuildingID     string        `json:"building_id,omitempty" bson:"building_id,omitempty"`
	Name           string        `json:"name" bson:"name"`
	Type           Type          `json:"type" bson:"type"`
	Status         Status        `json:"status" bson:"status"`
	Purpose        Purpose       `json:"purpose,omitempty" bson:"purpose,omitempty"`
	PurposeOther   string        `json:"purpose_other,omitempty" bson:"purpose_other,omitempty"`
	Address        shared.Address `json:"address" bson:"address"`
	Description    string        `json:"description,omitempty" bson:"description,omitempty"`
	AreaM2         float64       `json:"area_m2,omitempty" bson:"area_m2,omitempty"`
	Bedrooms       int           `json:"bedrooms,omitempty" bson:"bedrooms,omitempty"`
	Bathrooms      int           `json:"bathrooms,omitempty" bson:"bathrooms,omitempty"`
	ParkingSpots   int           `json:"parking_spots,omitempty" bson:"parking_spots,omitempty"`
	OwnerName         string         `json:"owner_name,omitempty" bson:"owner_name,omitempty"`
	ParkingPropertyID   string `json:"parking_property_id,omitempty" bson:"parking_property_id,omitempty"`
	WarehousePropertyID string `json:"warehouse_property_id,omitempty" bson:"warehouse_property_id,omitempty"`
	UnitNumber        string         `json:"unit_number,omitempty" bson:"unit_number,omitempty"`
	Floor             string         `json:"floor,omitempty" bson:"floor,omitempty"`
	Concierge         ConciergeInfo  `json:"concierge,omitempty" bson:"concierge,omitempty"`
	UtilityAccounts   UtilityAccounts   `json:"utility_accounts,omitempty" bson:"utility_accounts,omitempty"`
	Insurance         PropertyInsurance `json:"insurance,omitempty" bson:"insurance,omitempty"`
	Deed              DeedInfo          `json:"deed,omitempty" bson:"deed,omitempty"`
	Photos            []Photo        `json:"photos" bson:"photos"`
	Financials        Financials     `json:"financials" bson:"financials"`
	Tags              []string       `json:"tags,omitempty" bson:"tags,omitempty"`
}

type UtilityAccounts struct {
	Water         UtilityAccount `json:"water,omitempty" bson:"water,omitempty"`
	Electricity   UtilityAccount `json:"electricity,omitempty" bson:"electricity,omitempty"`
	Gas           UtilityAccount `json:"gas,omitempty" bson:"gas,omitempty"`
}

type UtilityAccount struct {
	Company    string `json:"company,omitempty" bson:"company,omitempty"`
	ClientCode string `json:"client_code,omitempty" bson:"client_code,omitempty"`
}

type PropertyInsurance struct {
	Fire        InsurancePolicy `json:"fire,omitempty" bson:"fire,omitempty"`
	Earthquake  InsurancePolicy `json:"earthquake,omitempty" bson:"earthquake,omitempty"`
	Desgravamen InsurancePolicy `json:"desgravamen,omitempty" bson:"desgravamen,omitempty"`
}

type InsurancePolicy struct {
	Company      string  `json:"company,omitempty" bson:"company,omitempty"`
	AmountUF     float64 `json:"amount_uf,omitempty" bson:"amount_uf,omitempty"`
	PolicyNumber string  `json:"policy_number,omitempty" bson:"policy_number,omitempty"`
}

type ConciergeInfo struct {
	Email                string `json:"email,omitempty" bson:"email,omitempty"`
	Phone                string `json:"phone,omitempty" bson:"phone,omitempty"`
	ButlerName           string `json:"butler_name,omitempty" bson:"butler_name,omitempty"`
	Administration       string `json:"administration,omitempty" bson:"administration,omitempty"`
	AdministrationEmail  string `json:"administration_email,omitempty" bson:"administration_email,omitempty"`
	AdministrationPhone  string `json:"administration_phone,omitempty" bson:"administration_phone,omitempty"`
}

type DeedInfo struct {
	Fojas    string `json:"fojas,omitempty" bson:"fojas,omitempty"`
	Number   string `json:"number,omitempty" bson:"number,omitempty"`
	Year     int    `json:"year,omitempty" bson:"year,omitempty"`
	Registry string `json:"registry,omitempty" bson:"registry,omitempty"`
}

type Photo struct {
	URL       string `json:"url" bson:"url"`
	Caption   string `json:"caption,omitempty" bson:"caption,omitempty"`
	IsPrimary bool   `json:"is_primary" bson:"is_primary"`
}

type Financials struct {
	PurchasePrice       shared.Money `json:"purchase_price" bson:"purchase_price"`
	CommercialValue     shared.Money `json:"commercial_value" bson:"commercial_value"`
	MonthlyExpenses     shared.Money `json:"monthly_expenses" bson:"monthly_expenses"`
	PropertyTax         shared.Money `json:"property_tax" bson:"property_tax"`
	CommonExpenses      shared.Money `json:"common_expenses" bson:"common_expenses"`
	ExpectedRent        shared.Money `json:"expected_rent" bson:"expected_rent"`
	ValueUF             float64      `json:"value_uf,omitempty" bson:"value_uf,omitempty"`
	CommercialValueUF   float64      `json:"commercial_value_uf,omitempty" bson:"commercial_value_uf,omitempty"`
	DebtUF              float64      `json:"debt_uf,omitempty" bson:"debt_uf,omitempty"`
	OriginalLoanUF      float64      `json:"original_loan_uf,omitempty" bson:"original_loan_uf,omitempty"`
	MonthlyMortgageUF   float64      `json:"monthly_mortgage_uf,omitempty" bson:"monthly_mortgage_uf,omitempty"`
	legacyMonthlyMortgage shared.Money `bson:"monthly_mortgage,omitempty" json:"-"`
	LoanTermYears       int          `json:"loan_term_years,omitempty" bson:"loan_term_years,omitempty"`
	InstallmentsPaid    int          `json:"installments_paid,omitempty" bson:"installments_paid,omitempty"`
	InterestRate        float64      `json:"interest_rate,omitempty" bson:"interest_rate,omitempty"`
	BankName            string       `json:"bank_name,omitempty" bson:"bank_name,omitempty"`
	CreditNumber        string       `json:"credit_number,omitempty" bson:"credit_number,omitempty"`
	PaymentStartDate    *time.Time   `json:"payment_start_date,omitempty" bson:"payment_start_date,omitempty"`
	PacEnabled          bool         `json:"pac_enabled,omitempty" bson:"pac_enabled,omitempty"`
	PaymentBank         string       `json:"payment_bank,omitempty" bson:"payment_bank,omitempty"`
}

// NormalizeMortgageUF copies legacy monthly_mortgage amounts (stored as CLP Money)
// into monthly_mortgage_uf. Existing values were typically entered in UF.
func (f *Financials) NormalizeMortgageUF() {
	if f.MonthlyMortgageUF == 0 && f.legacyMonthlyMortgage.Amount > 0 {
		f.MonthlyMortgageUF = f.legacyMonthlyMortgage.Amount
	}
}

func NewProperty(orgID, name string, pType Type) *Property {
	return &Property{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		Name:           name,
		Type:           pType,
		Status:         StatusAvailable,
		Address: shared.Address{Country: "CL"},
		Photos:         []Photo{},
		Financials: Financials{
			PurchasePrice:   shared.NewMoney(0, "CLP"),
			CommercialValue: shared.NewMoney(0, "CLP"),
		},
	}
}
