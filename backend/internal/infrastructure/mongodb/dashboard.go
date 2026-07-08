package mongodb

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/richard/my-rent-go/internal/application/dashboard"
	domainlease "github.com/richard/my-rent-go/internal/domain/lease"
	domainprop "github.com/richard/my-rent-go/internal/domain/property"
	"github.com/richard/my-rent-go/internal/infrastructure/mindicador"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/sync/errgroup"
)

// CalendarEvent for unified calendar API.
type CalendarEvent struct {
	ID       string    `json:"id"`
	Type     string    `json:"type"`
	Title    string    `json:"title"`
	Date     time.Time `json:"date"`
	EntityID string    `json:"entity_id"`
}

type DashboardRepo struct {
	db *Client
	uf *mindicador.UFProvider
}

func NewDashboardRepo(db *Client, uf *mindicador.UFProvider) *DashboardRepo {
	return &DashboardRepo{db: db, uf: uf}
}

func (r *DashboardRepo) ufRate(ctx context.Context) float64 {
	if r.uf == nil {
		return 0
	}
	v, err := r.uf.GetUF(ctx)
	if err != nil || v == nil || v.Value <= 0 {
		return 0
	}
	return v.Value
}

func (r *DashboardRepo) GetStats(ctx context.Context, orgID string) (*dashboard.DashboardResult, error) {
	result := &dashboard.DashboardResult{
		UpcomingExpirations: []dashboard.ExpirationItem{},
		Profitability:       []dashboard.PropertyProfit{},
		PropertiesByType:    []dashboard.PropertyTypeCount{},
		PendingPayments:     []dashboard.PendingPaymentItem{},
	}

	var (
		total, rentable, occupied, overdue, pendingCount int64
		pendingTotal                                       float64
		rentMonth                                          string
		rentPaidTotal, rentPendingTotal                    float64
		rentPaidCount, rentPendingCount                    int64
		income, expenses, expensesUF                       float64
		ufRate                                             float64
		activeLeases                                       int
		totalMonthlyRent                                   float64
		totalValueUF                                       float64
		totalDebtUF                                        float64
		totalOriginalLoanUF                                float64
		totalMortgageUF                                    float64
		dividendMonth                                      string
		dividendPaidUF, dividendPendingUF                  float64
		dividendPaidCount, dividendPendingCount            int64
		dividendsByBank                                    []dashboard.BankDividendItem
		propertiesByType                                   []dashboard.PropertyTypeCount
		expirations                                        []dashboard.ExpirationItem
		profitability                                      []dashboard.PropertyProfit
		pendingPayments                                    []dashboard.PendingPaymentItem
	)

	g, gctx := errgroup.WithContext(ctx)
	ufRate = r.ufRate(gctx)

	g.Go(func() error {
		total, rentable = r.propertyCounts(gctx, orgID)
		return nil
	})

	g.Go(func() error {
		occupied = r.occupiedPropertyCount(gctx, orgID)
		return nil
	})

	g.Go(func() error {
		var err error
		overdue, err = r.overduePaymentCount(gctx, orgID)
		return err
	})

	g.Go(func() error {
		var err error
		rentPaidTotal, rentPendingTotal, rentPaidCount, rentPendingCount, pendingPayments, rentMonth, err = r.currentMonthRentStats(gctx, orgID, 10)
		pendingCount = rentPendingCount
		pendingTotal = rentPendingTotal
		return err
	})

	g.Go(func() error {
		payRepo := NewPaymentRepo(r.db)
		var err error
		income, expenses, expensesUF, err = payRepo.MonthlyTotals(gctx, orgID, ufRate)
		return err
	})

	g.Go(func() error {
		activeLeases, totalMonthlyRent = r.activeLeaseTotals(gctx, orgID)
		return nil
	})

	g.Go(func() error {
		totalValueUF, totalDebtUF, totalOriginalLoanUF, totalMortgageUF = r.propertyFinancialTotals(gctx, orgID)
		return nil
	})

	g.Go(func() error {
		now := time.Now().UTC()
		month := now.Format("2006-01")
		payRepo := NewPaymentRepo(r.db)
		stats, err := payRepo.DividendMonthStats(gctx, orgID, month)
		if err != nil {
			return err
		}
		dividendMonth = stats.Month
		dividendPaidUF = stats.PaidTotalUF
		dividendPendingUF = stats.PendingTotalUF
		dividendPaidCount = stats.PaidCount
		dividendPendingCount = stats.PendingCount
		banks, err := payRepo.DividendsByBank(gctx, orgID, month)
		if err != nil {
			return err
		}
		dividendsByBank = make([]dashboard.BankDividendItem, len(banks))
		for i, b := range banks {
			dividendsByBank[i] = dashboard.BankDividendItem{
				BankName:      b.BankName,
				BankID:        b.BankID,
				PendingUF:     b.PendingUF,
				PaidUF:        b.PaidUF,
				PropertyCount: b.PropertyCount,
			}
		}
		return nil
	})

	g.Go(func() error {
		propertiesByType = r.propertiesByType(gctx, orgID)
		return nil
	})

	g.Go(func() error {
		expirations = r.upcomingLeases(gctx, orgID)
		return nil
	})

	g.Go(func() error {
		profitability = r.profitabilityByProperty(gctx, orgID, ufRate)
		return nil
	})

	if err := g.Wait(); err != nil {
		return nil, err
	}

	occupancy := 0.0
	denominator := rentable
	if denominator == 0 {
		denominator = total
	}
	if denominator > 0 {
		occupancy = float64(occupied) / float64(denominator) * 100
	}

	result.TotalProperties = int(total)
	result.RentableProperties = int(rentable)
	result.RentedProperties = int(occupied)
	result.OccupancyRate = occupancy
	result.MonthlyIncome = income
	result.MonthlyExpenses = expenses
	result.MonthlyExpensesUF = expensesUF
	result.NetCashFlow = income - expenses
	result.OverduePayments = int(overdue)
	result.PendingPaymentsCount = int(pendingCount)
	result.PendingPaymentsTotal = pendingTotal
	result.PendingPayments = pendingPayments
	result.TotalRentPaid = rentPaidTotal
	result.TotalRentPending = rentPendingTotal
	result.TotalRentPaidCount = int(rentPaidCount)
	result.TotalRentPendingCount = int(rentPendingCount)
	result.RentMonth = rentMonth
	result.ActiveLeases = activeLeases
	result.TotalMonthlyRent = totalMonthlyRent
	result.TotalValueUF = totalValueUF
	result.TotalDebtUF = totalDebtUF
	result.TotalOriginalLoanUF = totalOriginalLoanUF
	result.TotalMonthlyMortgageUF = totalMortgageUF
	result.DividendMonth = dividendMonth
	result.TotalDividendPaidUF = dividendPaidUF
	result.TotalDividendPendingUF = dividendPendingUF
	result.TotalDividendPaidCount = int(dividendPaidCount)
	result.TotalDividendPendingCount = int(dividendPendingCount)
	result.DividendsByBank = dividendsByBank
	result.PropertiesByType = propertiesByType
	result.UpcomingExpirations = expirations
	result.Profitability = profitability

	return result, nil
}

func (r *DashboardRepo) propertyCounts(ctx context.Context, orgID string) (total, rentable int64) {
	pipeline := bson.A{
		bson.M{"$match": bson.M{"organization_id": orgID}},
		bson.M{"$group": bson.M{
			"_id": nil,
			"total": bson.M{"$sum": 1},
			"rentable": bson.M{"$sum": bson.M{
				"$cond": bson.A{
					bson.M{"$eq": bson.A{"$purpose", string(domainprop.PurposeRent)}},
					1,
					0,
				},
			}},
		}},
	}
	cur, err := r.db.Collection("properties").Aggregate(ctx, pipeline)
	if err != nil {
		return 0, 0
	}
	defer cur.Close(ctx)
	var rows []struct {
		Total    int64 `bson:"total"`
		Rentable int64 `bson:"rentable"`
	}
	if err := cur.All(ctx, &rows); err != nil || len(rows) == 0 {
		return 0, 0
	}
	return rows[0].Total, rows[0].Rentable
}

func (r *DashboardRepo) occupiedPropertyCount(ctx context.Context, orgID string) int64 {
	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"organization_id": orgID,
			"status":          domainlease.StatusActive,
			"property_id":     bson.M{"$ne": ""},
		}},
		bson.M{"$group": bson.M{"_id": "$property_id"}},
		bson.M{"$count": "occupied"},
	}
	cur, err := r.db.Collection("leases").Aggregate(ctx, pipeline)
	if err != nil {
		return 0
	}
	defer cur.Close(ctx)
	var rows []struct {
		Occupied int64 `bson:"occupied"`
	}
	if err := cur.All(ctx, &rows); err != nil || len(rows) == 0 {
		return 0
	}
	return rows[0].Occupied
}

func (r *DashboardRepo) overduePaymentCount(ctx context.Context, orgID string) (int64, error) {
	now := time.Now().UTC()
	// Solo arriendos: "Morosos" debe coincidir con el historial de pagos de arriendo,
	// no con dividendos u otros tipos de pago.
	return r.db.Collection("payments").CountDocuments(ctx, bson.M{
		"organization_id": orgID,
		"type":            "rent",
		"$or": bson.A{
			bson.M{"status": "overdue"},
			bson.M{"status": "pending", "due_date": bson.M{"$lt": now}},
		},
	})
}

func currentMonthBounds(now time.Time) (start, end time.Time) {
	start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	end = start.AddDate(0, 1, 0)
	return start, end
}

func rentDueDateForMonth(year int, month time.Month, paymentDay int) time.Time {
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	day := paymentDay
	if day < 1 {
		day = 1
	}
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func (r *DashboardRepo) currentMonthRentStats(ctx context.Context, orgID string, listLimit int) (paidTotal, pendingTotal float64, paidCount, pendingCount int64, items []dashboard.PendingPaymentItem, month string, err error) {
	now := time.Now().UTC()
	start, end := currentMonthBounds(now)
	month = now.Format("2006-01")
	items = []dashboard.PendingPaymentItem{}

	paidPipeline := bson.A{
		bson.M{"$match": bson.M{
			"organization_id": orgID,
			"type":            "rent",
			"status":          "paid",
			"$or": bson.A{
				bson.M{"paid_date": bson.M{"$gte": start, "$lt": end}},
				bson.M{"due_date": bson.M{"$gte": start, "$lt": end}},
			},
		}},
		bson.M{"$group": bson.M{
			"_id":   nil,
			"count": bson.M{"$sum": 1},
			"total": bson.M{"$sum": "$amount.amount"},
		}},
	}
	paidCur, err := r.db.Collection("payments").Aggregate(ctx, paidPipeline)
	if err != nil {
		return 0, 0, 0, 0, nil, month, err
	}
	defer paidCur.Close(ctx)
	var paidRows []struct {
		Count int64   `bson:"count"`
		Total float64 `bson:"total"`
	}
	if err := paidCur.All(ctx, &paidRows); err != nil {
		return 0, 0, 0, 0, nil, month, err
	}
	if len(paidRows) > 0 {
		paidCount = paidRows[0].Count
		paidTotal = paidRows[0].Total
	}

	paidLeaseCur, err := r.db.Collection("payments").Find(ctx, bson.M{
		"organization_id": orgID,
		"type":            "rent",
		"status":          "paid",
		"due_date":        bson.M{"$gte": start, "$lt": end},
	}, options.Find().SetProjection(bson.M{"lease_id": 1}))
	if err != nil {
		return 0, 0, 0, 0, nil, month, err
	}
	defer paidLeaseCur.Close(ctx)
	paidLeaseIDs := make(map[string]struct{})
	for paidLeaseCur.Next(ctx) {
		var row struct {
			LeaseID string `bson:"lease_id"`
		}
		if err := paidLeaseCur.Decode(&row); err != nil {
			return 0, 0, 0, 0, nil, month, err
		}
		if row.LeaseID != "" {
			paidLeaseIDs[row.LeaseID] = struct{}{}
		}
	}
	if err := paidLeaseCur.Err(); err != nil {
		return 0, 0, 0, 0, nil, month, err
	}

	unpaidRentCur, err := r.db.Collection("payments").Find(ctx, bson.M{
		"organization_id": orgID,
		"type":            "rent",
		"status":          bson.M{"$in": bson.A{"pending", "overdue"}},
		"due_date":        bson.M{"$gte": start, "$lt": end},
	})
	if err != nil {
		return 0, 0, 0, 0, nil, month, err
	}
	defer unpaidRentCur.Close(ctx)
	unpaidByLease := make(map[string]struct {
		ID      string
		Amount  float64
		DueDate time.Time
		Status  string
	})
	for unpaidRentCur.Next(ctx) {
		var row struct {
			ID      string    `bson:"_id"`
			LeaseID string    `bson:"lease_id"`
			Status  string    `bson:"status"`
			DueDate time.Time `bson:"due_date"`
			Amount  struct {
				Amount float64 `bson:"amount"`
			} `bson:"amount"`
		}
		if err := unpaidRentCur.Decode(&row); err != nil {
			return 0, 0, 0, 0, nil, month, err
		}
		if row.LeaseID == "" {
			continue
		}
		unpaidByLease[row.LeaseID] = struct {
			ID      string
			Amount  float64
			DueDate time.Time
			Status  string
		}{ID: row.ID, Amount: row.Amount.Amount, DueDate: row.DueDate, Status: row.Status}
	}
	if err := unpaidRentCur.Err(); err != nil {
		return 0, 0, 0, 0, nil, month, err
	}

	leasePipeline := bson.A{
		bson.M{"$match": bson.M{
			"organization_id": orgID,
			"status":          domainlease.StatusActive,
		}},
		bson.M{"$lookup": bson.M{
			"from":         "tenants",
			"localField":   "tenant_id",
			"foreignField": "_id",
			"as":           "tenant",
		}},
		bson.M{"$lookup": bson.M{
			"from":         "properties",
			"localField":   "property_id",
			"foreignField": "_id",
			"as":           "property",
		}},
		bson.M{"$unwind": bson.M{"path": "$tenant", "preserveNullAndEmptyArrays": true}},
		bson.M{"$unwind": bson.M{"path": "$property", "preserveNullAndEmptyArrays": true}},
	}
	leaseCur, err := r.db.Collection("leases").Aggregate(ctx, leasePipeline)
	if err != nil {
		return 0, 0, 0, 0, nil, month, err
	}
	defer leaseCur.Close(ctx)

	var leaseRows []struct {
		ID          string `bson:"_id"`
		PaymentDay  int    `bson:"payment_day"`
		MonthlyRent struct {
			Amount float64 `bson:"amount"`
		} `bson:"monthly_rent"`
		Tenant struct {
			FirstName string `bson:"first_name"`
			LastName  string `bson:"last_name"`
		} `bson:"tenant"`
		Property struct {
			Name string `bson:"name"`
		} `bson:"property"`
	}
	if err := leaseCur.All(ctx, &leaseRows); err != nil {
		return 0, 0, 0, 0, nil, month, err
	}

	type pendingEntry struct {
		item dashboard.PendingPaymentItem
		sort time.Time
	}
	pendingEntries := make([]pendingEntry, 0)

	for _, lease := range leaseRows {
		if _, paid := paidLeaseIDs[lease.ID]; paid {
			continue
		}

		amount := lease.MonthlyRent.Amount
		dueDate := rentDueDateForMonth(now.Year(), now.Month(), lease.PaymentDay)
		status := "pending"
		itemID := lease.ID

		if unpaid, ok := unpaidByLease[lease.ID]; ok {
			amount = unpaid.Amount
			dueDate = unpaid.DueDate
			status = unpaid.Status
			itemID = unpaid.ID
		}
		if status == "pending" && dueDate.Before(now) {
			status = "overdue"
		}

		pendingTotal += amount
		pendingCount++

		tenantName := strings.TrimSpace(lease.Tenant.FirstName + " " + lease.Tenant.LastName)
		pendingEntries = append(pendingEntries, pendingEntry{
			sort: dueDate,
			item: dashboard.PendingPaymentItem{
				ID:           itemID,
				TenantName:   tenantName,
				PropertyName: lease.Property.Name,
				Amount:       amount,
				DueDate:      dueDate,
				Status:       status,
				Type:         "rent",
			},
		})
	}

	sort.Slice(pendingEntries, func(i, j int) bool {
		return pendingEntries[i].sort.Before(pendingEntries[j].sort)
	})

	limit := listLimit
	if limit <= 0 {
		limit = 10
	}
	if len(pendingEntries) > limit {
		pendingEntries = pendingEntries[:limit]
	}
	items = make([]dashboard.PendingPaymentItem, 0, len(pendingEntries))
	for _, entry := range pendingEntries {
		items = append(items, entry.item)
	}

	return paidTotal, pendingTotal, paidCount, pendingCount, items, month, nil
}

func (r *DashboardRepo) activeLeaseTotals(ctx context.Context, orgID string) (count int, totalRent float64) {
	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"organization_id": orgID,
			"status":          domainlease.StatusActive,
		}},
		bson.M{"$group": bson.M{
			"_id":        nil,
			"count":      bson.M{"$sum": 1},
			"total_rent": bson.M{"$sum": "$monthly_rent.amount"},
		}},
	}
	cur, err := r.db.Collection("leases").Aggregate(ctx, pipeline)
	if err != nil {
		return 0, 0
	}
	defer cur.Close(ctx)
	var rows []struct {
		Count     int     `bson:"count"`
		TotalRent float64 `bson:"total_rent"`
	}
	if err := cur.All(ctx, &rows); err != nil || len(rows) == 0 {
		return 0, 0
	}
	return rows[0].Count, rows[0].TotalRent
}

func (r *DashboardRepo) propertyFinancialTotals(ctx context.Context, orgID string) (valueUF, debtUF, originalLoanUF, mortgageUF float64) {
	pipeline := bson.A{
		bson.M{"$match": bson.M{"organization_id": orgID}},
		bson.M{"$group": bson.M{
			"_id": nil,
			"total_value_uf": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$financials.value_uf", 0}}},
			"total_debt_uf": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$financials.debt_uf", 0}}},
			"total_original_loan_uf": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$financials.original_loan_uf", 0}}},
			"total_mortgage_uf": bson.M{"$sum": bson.M{"$ifNull": bson.A{
				"$financials.monthly_mortgage_uf",
				bson.M{"$ifNull": bson.A{"$financials.monthly_mortgage.amount", 0}},
			}}},
		}},
	}
	cur, err := r.db.Collection("properties").Aggregate(ctx, pipeline)
	if err != nil {
		return 0, 0, 0, 0
	}
	defer cur.Close(ctx)
	var rows []struct {
		TotalValueUF         float64 `bson:"total_value_uf"`
		TotalDebtUF          float64 `bson:"total_debt_uf"`
		TotalOriginalLoanUF  float64 `bson:"total_original_loan_uf"`
		TotalMortgageUF      float64 `bson:"total_mortgage_uf"`
	}
	if err := cur.All(ctx, &rows); err != nil || len(rows) == 0 {
		return 0, 0, 0, 0
	}
	return rows[0].TotalValueUF, rows[0].TotalDebtUF, rows[0].TotalOriginalLoanUF, rows[0].TotalMortgageUF
}

func (r *DashboardRepo) propertiesByType(ctx context.Context, orgID string) []dashboard.PropertyTypeCount {
	pipeline := bson.A{
		bson.M{"$match": bson.M{"organization_id": orgID}},
		bson.M{"$group": bson.M{
			"_id":   "$type",
			"count": bson.M{"$sum": 1},
		}},
		bson.M{"$sort": bson.M{"count": -1}},
	}
	cur, err := r.db.Collection("properties").Aggregate(ctx, pipeline)
	if err != nil {
		return nil
	}
	defer cur.Close(ctx)
	var rows []struct {
		Type  string `bson:"_id"`
		Count int    `bson:"count"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil
	}
	items := make([]dashboard.PropertyTypeCount, 0, len(rows))
	for _, row := range rows {
		items = append(items, dashboard.PropertyTypeCount{Type: row.Type, Count: row.Count})
	}
	return items
}

func (r *DashboardRepo) upcomingLeases(ctx context.Context, orgID string) []dashboard.ExpirationItem {
	now := time.Now().UTC()
	cur, err := r.db.Collection("leases").Find(ctx, bson.M{
		"organization_id": orgID,
		"status":          domainlease.StatusActive,
		"end_date":        bson.M{"$exists": true, "$ne": nil, "$gte": now},
	}, options.Find().SetLimit(5).SetSort(bson.D{{Key: "end_date", Value: 1}}))
	if err != nil {
		return nil
	}
	defer cur.Close(ctx)

	var leases []domainlease.Lease
	if err := cur.All(ctx, &leases); err != nil {
		return nil
	}

	items := make([]dashboard.ExpirationItem, 0, len(leases))
	for _, l := range leases {
		if l.EndDate == nil {
			continue
		}
		items = append(items, dashboard.ExpirationItem{
			ID: l.ID, Type: "lease", Title: "Vence contrato de arriendo",
			ExpiresAt: *l.EndDate, DaysLeft: int(l.EndDate.Sub(now).Hours() / 24),
		})
	}
	return items
}

func currencyIsUF() bson.M {
	return bson.M{"$eq": bson.A{
		bson.M{"$toUpper": bson.M{"$ifNull": bson.A{"$amount.currency", "CLP"}}},
		"UF",
	}}
}

func (r *DashboardRepo) profitabilityByProperty(ctx context.Context, orgID string, ufRate float64) []dashboard.PropertyProfit {
	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"organization_id": orgID,
			"status":          "paid",
			"property_id":     bson.M{"$ne": ""},
		}},
		bson.M{"$group": bson.M{
			"_id": "$property_id",
			"income_clp": bson.M{"$sum": bson.M{"$cond": bson.A{
				bson.M{"$and": bson.A{
					bson.M{"$eq": bson.A{"$type", "rent"}},
					bson.M{"$not": currencyIsUF()},
				}},
				"$amount.amount",
				0,
			}}},
			"income_uf": bson.M{"$sum": bson.M{"$cond": bson.A{
				bson.M{"$and": bson.A{
					bson.M{"$eq": bson.A{"$type", "rent"}},
					currencyIsUF(),
				}},
				"$amount.amount",
				0,
			}}},
			"expenses_clp": bson.M{"$sum": bson.M{"$cond": bson.A{
				bson.M{"$and": bson.A{
					bson.M{"$ne": bson.A{"$type", "rent"}},
					bson.M{"$ne": bson.A{"$type", "deposit"}},
					bson.M{"$not": currencyIsUF()},
				}},
				"$amount.amount",
				0,
			}}},
			"expenses_uf": bson.M{"$sum": bson.M{"$cond": bson.A{
				bson.M{"$and": bson.A{
					bson.M{"$ne": bson.A{"$type", "rent"}},
					bson.M{"$ne": bson.A{"$type", "deposit"}},
					currencyIsUF(),
				}},
				"$amount.amount",
				0,
			}}},
		}},
		bson.M{"$match": bson.M{"$or": bson.A{
			bson.M{"income_clp": bson.M{"$gt": 0}},
			bson.M{"income_uf": bson.M{"$gt": 0}},
			bson.M{"expenses_clp": bson.M{"$gt": 0}},
			bson.M{"expenses_uf": bson.M{"$gt": 0}},
		}}},
		bson.M{"$lookup": bson.M{
			"from":         "properties",
			"localField":   "_id",
			"foreignField": "_id",
			"as":           "property",
		}},
		bson.M{"$unwind": bson.M{"path": "$property", "preserveNullAndEmptyArrays": true}},
	}

	cur, err := r.db.Collection("payments").Aggregate(ctx, pipeline)
	if err != nil {
		return nil
	}
	defer cur.Close(ctx)

	var rows []struct {
		PropertyID  string  `bson:"_id"`
		IncomeCLP   float64 `bson:"income_clp"`
		IncomeUF    float64 `bson:"income_uf"`
		ExpensesCLP float64 `bson:"expenses_clp"`
		ExpensesUF  float64 `bson:"expenses_uf"`
		Property    struct {
			Name string `bson:"name"`
		} `bson:"property"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil
	}

	items := make([]dashboard.PropertyProfit, 0, len(rows))
	for _, row := range rows {
		income := row.IncomeCLP
		if ufRate > 0 {
			income += row.IncomeUF * ufRate
		}
		expenses := row.ExpensesCLP
		if ufRate > 0 {
			expenses += row.ExpensesUF * ufRate
		}
		profit := income - expenses
		roi := 0.0
		if expenses > 0 {
			roi = profit / expenses * 100
		}
		name := row.Property.Name
		if name == "" {
			name = row.PropertyID
		}
		items = append(items, dashboard.PropertyProfit{
			PropertyID: row.PropertyID, PropertyName: name,
			Income: income, Expenses: expenses, ExpensesUF: row.ExpensesUF, Profit: profit, ROI: roi,
		})
	}
	return items
}

func (db *Client) CalendarEvents(ctx context.Context, orgID string, days int) ([]CalendarEvent, error) {
	until := time.Now().UTC().AddDate(0, 0, days)
	var (
		mu     sync.Mutex
		events []CalendarEvent
	)

	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		cur, err := db.Collection("leases").Find(gctx, bson.M{
			"organization_id": orgID,
			"status":          "active",
			"end_date":        bson.M{"$exists": true, "$ne": nil, "$lte": until},
		})
		if err != nil {
			return nil
		}
		defer cur.Close(gctx)
		var leases []domainlease.Lease
		if err := cur.All(gctx, &leases); err != nil {
			return nil
		}
		mu.Lock()
		for _, l := range leases {
			if l.EndDate == nil {
				continue
			}
			events = append(events, CalendarEvent{ID: l.ID, Type: "lease", Title: "Vence contrato", Date: *l.EndDate, EntityID: l.PropertyID})
		}
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		cur, err := db.Collection("payments").Find(gctx, bson.M{
			"organization_id": orgID,
			"status":          bson.M{"$in": bson.A{"pending", "overdue"}},
			"due_date":        bson.M{"$lte": until},
		})
		if err != nil {
			return nil
		}
		defer cur.Close(gctx)
		var payments []struct {
			ID      string    `bson:"_id"`
			Type    string    `bson:"type"`
			DueDate time.Time `bson:"due_date"`
			LeaseID string    `bson:"lease_id"`
		}
		if err := cur.All(gctx, &payments); err != nil {
			return nil
		}
		mu.Lock()
		for _, p := range payments {
			events = append(events, CalendarEvent{ID: p.ID, Type: "payment", Title: p.Type, Date: p.DueDate, EntityID: p.LeaseID})
		}
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		cur, err := db.Collection("maintenance").Find(gctx, bson.M{
			"organization_id": orgID,
			"scheduled_date":  bson.M{"$lte": until},
			"status":          bson.M{"$ne": "completed"},
		})
		if err != nil {
			return nil
		}
		defer cur.Close(gctx)
		var items []struct {
			ID            string    `bson:"_id"`
			Title         string    `bson:"title"`
			ScheduledDate time.Time `bson:"scheduled_date"`
			PropertyID    string    `bson:"property_id"`
		}
		if err := cur.All(gctx, &items); err != nil {
			return nil
		}
		mu.Lock()
		for _, m := range items {
			events = append(events, CalendarEvent{ID: m.ID, Type: "maintenance", Title: m.Title, Date: m.ScheduledDate, EntityID: m.PropertyID})
		}
		mu.Unlock()
		return nil
	})

	_ = g.Wait()
	return events, nil
}
