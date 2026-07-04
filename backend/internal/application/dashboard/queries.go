package dashboard

import (
	"context"
	"time"
)

type DashboardQuery struct {
	OrganizationID string `json:"organization_id"`
}

type DashboardResult struct {
	TotalProperties        int                `json:"total_properties"`
	RentableProperties     int                `json:"rentable_properties"`
	RentedProperties       int                `json:"rented_properties"`
	OccupancyRate          float64            `json:"occupancy_rate"`
	MonthlyIncome          float64            `json:"monthly_income"`
	MonthlyExpenses        float64            `json:"monthly_expenses"`
	MonthlyExpensesUF      float64            `json:"monthly_expenses_uf,omitempty"`
	NetCashFlow            float64            `json:"net_cash_flow"`
	OverduePayments        int                `json:"overdue_payments"`
	PendingPaymentsCount   int                `json:"pending_payments_count"`
	PendingPaymentsTotal   float64            `json:"pending_payments_total"`
	PendingPayments        []PendingPaymentItem `json:"pending_payments"`
	RentMonth              string             `json:"rent_month"`
	TotalRentPaid          float64            `json:"total_rent_paid"`
	TotalRentPending       float64            `json:"total_rent_pending"`
	TotalRentPaidCount     int                `json:"total_rent_paid_count"`
	TotalRentPendingCount  int                `json:"total_rent_pending_count"`
	ActiveLeases           int                `json:"active_leases"`
	TotalMonthlyRent       float64            `json:"total_monthly_rent"`
	TotalValueUF           float64            `json:"total_value_uf"`
	TotalDebtUF            float64            `json:"total_debt_uf"`
	TotalOriginalLoanUF    float64            `json:"total_original_loan_uf"`
	TotalMonthlyMortgageUF float64            `json:"total_monthly_mortgage_uf"`
	DividendMonth          string             `json:"dividend_month"`
	TotalDividendPaidUF    float64            `json:"total_dividend_paid_uf"`
	TotalDividendPendingUF float64            `json:"total_dividend_pending_uf"`
	TotalDividendPaidCount int                `json:"total_dividend_paid_count"`
	TotalDividendPendingCount int             `json:"total_dividend_pending_count"`
	DividendsByBank        []BankDividendItem `json:"dividends_by_bank"`
	PropertiesByType       []PropertyTypeCount `json:"properties_by_type"`
	UpcomingExpirations    []ExpirationItem   `json:"upcoming_expirations"`
	Profitability          []PropertyProfit   `json:"profitability"`
}

type PropertyTypeCount struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type BankDividendItem struct {
	BankName      string  `json:"bank_name"`
	BankID        string  `json:"bank_id,omitempty"`
	PendingUF     float64 `json:"pending_uf"`
	PaidUF        float64 `json:"paid_uf"`
	PropertyCount int     `json:"property_count"`
}

type PendingPaymentItem struct {
	ID           string    `json:"id"`
	TenantName   string    `json:"tenant_name"`
	PropertyName string    `json:"property_name"`
	Amount       float64   `json:"amount"`
	DueDate      time.Time `json:"due_date"`
	Status       string    `json:"status"`
	Type         string    `json:"type"`
}

type ExpirationItem struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Title       string    `json:"title"`
	ExpiresAt   time.Time `json:"expires_at"`
	DaysLeft    int       `json:"days_left"`
}

type PropertyProfit struct {
	PropertyID   string  `json:"property_id"`
	PropertyName string  `json:"property_name"`
	Income       float64 `json:"income"`
	Expenses     float64 `json:"expenses"`
	ExpensesUF   float64 `json:"expenses_uf,omitempty"`
	Profit       float64 `json:"profit"`
	ROI          float64 `json:"roi"`
}

type DashboardRepository interface {
	GetStats(ctx context.Context, orgID string) (*DashboardResult, error)
}

type DashboardHandler struct {
	repo DashboardRepository
}

func NewDashboardHandler(repo DashboardRepository) *DashboardHandler {
	return &DashboardHandler{repo: repo}
}

func (h *DashboardHandler) Handle(ctx context.Context, q DashboardQuery) (*DashboardResult, error) {
	return h.repo.GetStats(ctx, q.OrganizationID)
}
