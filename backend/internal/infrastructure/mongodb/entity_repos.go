package mongodb

import (
	"context"
	"errors"
	"time"

	domaincrm "github.com/richard/my-rent-go/internal/domain/crm"
	domaindoc "github.com/richard/my-rent-go/internal/domain/document"
	domainlease "github.com/richard/my-rent-go/internal/domain/lease"
	domainmaint "github.com/richard/my-rent-go/internal/domain/maintenance"
	domainmort "github.com/richard/my-rent-go/internal/domain/mortgage"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	domainpay "github.com/richard/my-rent-go/internal/domain/payment"
	"github.com/richard/my-rent-go/internal/domain/shared"
	domainrem "github.com/richard/my-rent-go/internal/domain/reminder"
	domaintenant "github.com/richard/my-rent-go/internal/domain/tenant"
	domainticket "github.com/richard/my-rent-go/internal/domain/ticket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type TenantRepo struct{ col *mongo.Collection }

func NewTenantRepo(db *Client) *TenantRepo { return &TenantRepo{col: db.Collection("tenants")} }

func (r *TenantRepo) Create(ctx context.Context, t *domaintenant.Tenant) error {
	return insertOne(ctx, r.col, t)
}

func (r *TenantRepo) List(ctx context.Context, orgID string, page, limit int) ([]domaintenant.Tenant, int64, error) {
	return listByOrg[domaintenant.Tenant](ctx, r.col, orgID, ListParams{Page: page, Limit: limit})
}

func (r *TenantRepo) FindByID(ctx context.Context, orgID, id string) (*domaintenant.Tenant, error) {
	var t domaintenant.Tenant
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&t)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &t, err
}

func (r *TenantRepo) Update(ctx context.Context, t *domaintenant.Tenant) error {
	t.Touch()
	return replaceByOrg(ctx, r.col, t.OrganizationID, t.ID, t)
}

func (r *TenantRepo) Delete(ctx context.Context, orgID, id string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id, "organization_id": orgID})
	return err
}

func (r *TenantRepo) Deactivate(ctx context.Context, orgID, id string) error {
	now := time.Now().UTC()
	return patchByOrg(ctx, r.col, orgID, id, bson.M{"active": false, "updated_at": now})
}

type LeaseRepo struct{ col *mongo.Collection }

func NewLeaseRepo(db *Client) *LeaseRepo { return &LeaseRepo{col: db.Collection("leases")} }

func (r *LeaseRepo) Create(ctx context.Context, l *domainlease.Lease) error {
	return insertOne(ctx, r.col, l)
}

func (r *LeaseRepo) List(ctx context.Context, orgID string, page, limit int, status string) ([]domainlease.Lease, int64, error) {
	f := bson.M{}
	if status != "" {
		f["status"] = status
	}
	return listByOrg[domainlease.Lease](ctx, r.col, orgID, ListParams{Page: page, Limit: limit, Filter: f})
}

func (r *LeaseRepo) FindByID(ctx context.Context, orgID, id string) (*domainlease.Lease, error) {
	var l domainlease.Lease
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&l)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &l, err
}

func (r *LeaseRepo) Update(ctx context.Context, l *domainlease.Lease) error {
	l.Touch()
	return replaceByOrg(ctx, r.col, l.OrganizationID, l.ID, l)
}

func (r *LeaseRepo) ExistsByTenantID(ctx context.Context, orgID, tenantID string) (bool, error) {
	count, err := r.col.CountDocuments(ctx, bson.M{"organization_id": orgID, "tenant_id": tenantID})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *LeaseRepo) HasActiveLeaseForProperty(ctx context.Context, orgID, propertyID, excludeLeaseID string) (bool, error) {
	filter := bson.M{
		"organization_id": orgID,
		"status":          domainlease.StatusActive,
		"$or": []bson.M{
			{"property_id": propertyID},
			{"warehouse_property_id": propertyID},
			{"parking_property_id": propertyID},
		},
	}
	if excludeLeaseID != "" {
		filter["_id"] = bson.M{"$ne": excludeLeaseID}
	}
	count, err := r.col.CountDocuments(ctx, filter)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *LeaseRepo) HasActiveLeaseForTenant(ctx context.Context, orgID, tenantID, excludeLeaseID string) (bool, error) {
	filter := bson.M{
		"organization_id": orgID,
		"tenant_id":       tenantID,
		"status":          domainlease.StatusActive,
	}
	if excludeLeaseID != "" {
		filter["_id"] = bson.M{"$ne": excludeLeaseID}
	}
	count, err := r.col.CountDocuments(ctx, filter)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *LeaseRepo) Terminate(ctx context.Context, orgID, id string) error {
	now := time.Now().UTC()
	return patchByOrg(ctx, r.col, orgID, id, bson.M{
		"status":     domainlease.StatusTerminated,
		"updated_at": now,
	})
}

func (r *LeaseRepo) ListActive(ctx context.Context, orgID string) ([]domainlease.Lease, error) {
	cursor, err := r.col.Find(ctx, bson.M{
		"organization_id": orgID,
		"status":          domainlease.StatusActive,
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []domainlease.Lease
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []domainlease.Lease{}
	}
	return items, nil
}

func (r *LeaseRepo) Upcoming(ctx context.Context, orgID string, withinDays int) ([]domainlease.Lease, error) {
	until := time.Now().UTC().AddDate(0, 0, withinDays)
	cursor, err := r.col.Find(ctx, bson.M{
		"organization_id": orgID,
		"status":          domainlease.StatusActive,
		"end_date":        bson.M{"$exists": true, "$ne": nil, "$lte": until},
	}, options.Find().SetSort(bson.D{{Key: "end_date", Value: 1}}).SetLimit(10))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []domainlease.Lease
	return items, cursor.All(ctx, &items)
}

type PaymentRepo struct{ col *mongo.Collection }

func NewPaymentRepo(db *Client) *PaymentRepo { return &PaymentRepo{col: db.Collection("payments")} }

func (r *PaymentRepo) Create(ctx context.Context, p *domainpay.Payment) error {
	return insertOne(ctx, r.col, p)
}

func (r *PaymentRepo) CreateMany(ctx context.Context, payments []*domainpay.Payment) error {
	if len(payments) == 0 {
		return nil
	}
	docs := make([]interface{}, len(payments))
	for i, p := range payments {
		docs[i] = p
	}
	_, err := r.col.InsertMany(ctx, docs)
	return err
}

func (r *PaymentRepo) RentExistsForLeaseMonth(ctx context.Context, orgID, leaseID string, monthStart, monthEnd time.Time) (bool, error) {
	count, err := r.col.CountDocuments(ctx, bson.M{
		"organization_id": orgID,
		"lease_id":        leaseID,
		"type":            domainpay.TypeRent,
		"status":          bson.M{"$in": []domainpay.Status{domainpay.StatusPending, domainpay.StatusPaid, domainpay.StatusOverdue}},
		"due_date":        bson.M{"$gte": monthStart, "$lt": monthEnd},
	})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

type PaymentListFilter struct {
	Type       string
	Status     string
	PropertyID string
	BankName   string
	Month      string // YYYY-MM
}

func (r *PaymentRepo) buildListFilter(f PaymentListFilter) bson.M {
	query := bson.M{}
	if f.Type != "" {
		query["type"] = f.Type
	}
	if f.Status != "" {
		query["status"] = f.Status
	}
	if f.PropertyID != "" {
		query["property_id"] = f.PropertyID
	}
	if f.BankName != "" {
		query["bank_name"] = f.BankName
	}
	if f.Month != "" {
		if parsed, err := time.Parse("2006-01", f.Month); err == nil {
			start := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
			end := start.AddDate(0, 1, 0)
			query["due_date"] = bson.M{"$gte": start, "$lt": end}
		}
	}
	return query
}

func (r *PaymentRepo) List(ctx context.Context, orgID string, page, limit int, status string) ([]domainpay.Payment, int64, error) {
	return r.ListFiltered(ctx, orgID, page, limit, PaymentListFilter{Status: status})
}

func (r *PaymentRepo) ListFiltered(ctx context.Context, orgID string, page, limit int, f PaymentListFilter) ([]domainpay.Payment, int64, error) {
	return listByOrg[domainpay.Payment](ctx, r.col, orgID, ListParams{Page: page, Limit: limit, Filter: r.buildListFilter(f), Sort: bson.D{{Key: "due_date", Value: -1}}})
}

func (r *PaymentRepo) DividendExistsForPropertyMonth(ctx context.Context, orgID, propertyID string, monthStart, monthEnd time.Time) (bool, error) {
	count, err := r.col.CountDocuments(ctx, bson.M{
		"organization_id": orgID,
		"property_id":     propertyID,
		"type":            domainpay.TypeDividend,
		"status":          bson.M{"$in": []domainpay.Status{domainpay.StatusPending, domainpay.StatusPaid, domainpay.StatusOverdue}},
		"due_date":        bson.M{"$gte": monthStart, "$lt": monthEnd},
	})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *PaymentRepo) MarkPaid(ctx context.Context, orgID, id string) error {
	now := time.Now().UTC()
	return patchByOrg(ctx, r.col, orgID, id, bson.M{"status": domainpay.StatusPaid, "paid_date": now, "updated_at": now})
}

func (r *PaymentRepo) FindByID(ctx context.Context, orgID, id string) (*domainpay.Payment, error) {
	var p domainpay.Payment
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&p)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PaymentRepo) UpdateDividend(ctx context.Context, orgID string, p *domainpay.Payment) error {
	now := time.Now().UTC()
	p.UpdatedAt = now
	return replaceByOrg(ctx, r.col, orgID, p.ID, p)
}

func (r *PaymentRepo) MonthlyTotals(ctx context.Context, orgID string, ufRate float64) (income, expenses, expensesUF float64, err error) {
	now := time.Now().UTC()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"organization_id": orgID,
			"status":          domainpay.StatusPaid,
			"paid_date":       bson.M{"$gte": start, "$lt": end},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"type":     "$type",
				"currency": bson.M{"$toUpper": bson.M{"$ifNull": bson.A{"$amount.currency", "CLP"}}},
			},
			"total": bson.M{"$sum": "$amount.amount"},
		}}},
	}
	cursor, err := r.col.Aggregate(ctx, pipeline)
	if err != nil {
		return 0, 0, 0, err
	}
	defer cursor.Close(ctx)

	var rows []struct {
		ID struct {
			Type     string `bson:"type"`
			Currency string `bson:"currency"`
		} `bson:"_id"`
		Total float64 `bson:"total"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		return 0, 0, 0, err
	}
	for _, row := range rows {
		clp := shared.AmountInCLP(row.Total, row.ID.Currency, ufRate)
		switch domainpay.Type(row.ID.Type) {
		case domainpay.TypeRent, domainpay.TypeDeposit:
			income += clp
		default:
			expenses += clp
			if row.ID.Currency == "UF" {
				expensesUF += row.Total
			}
		}
	}
	return income, expenses, expensesUF, nil
}

type DividendMonthStats struct {
	Month         string
	PaidTotalUF   float64
	PendingTotalUF float64
	PaidCount     int64
	PendingCount  int64
}

type BankDividendTotal struct {
	BankName      string
	BankID        string
	PendingUF     float64
	PaidUF        float64
	PropertyCount int
}

func (r *PaymentRepo) DividendMonthStats(ctx context.Context, orgID, month string) (DividendMonthStats, error) {
	stats := DividendMonthStats{Month: month}
	parsed, err := time.Parse("2006-01", month)
	if err != nil {
		return stats, err
	}
	start := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"organization_id": orgID,
			"type":            domainpay.TypeDividend,
			"due_date":        bson.M{"$gte": start, "$lt": end},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":   "$status",
			"count": bson.M{"$sum": 1},
			"total": bson.M{"$sum": "$amount.amount"},
		}}},
	}
	cursor, err := r.col.Aggregate(ctx, pipeline)
	if err != nil {
		return stats, err
	}
	defer cursor.Close(ctx)

	var rows []struct {
		ID    string  `bson:"_id"`
		Count int64   `bson:"count"`
		Total float64 `bson:"total"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		return stats, err
	}
	for _, row := range rows {
		switch domainpay.Status(row.ID) {
		case domainpay.StatusPaid:
			stats.PaidCount = row.Count
			stats.PaidTotalUF = row.Total
		case domainpay.StatusPending, domainpay.StatusOverdue:
			stats.PendingCount += row.Count
			stats.PendingTotalUF += row.Total
		}
	}
	return stats, nil
}

func (r *PaymentRepo) DividendsByBank(ctx context.Context, orgID, month string) ([]BankDividendTotal, error) {
	parsed, err := time.Parse("2006-01", month)
	if err != nil {
		return nil, err
	}
	start := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"organization_id": orgID,
			"type":            domainpay.TypeDividend,
			"due_date":        bson.M{"$gte": start, "$lt": end},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"bank_name": bson.M{"$ifNull": bson.A{"$bank_name", "Sin banco"}},
				"bank_id":   bson.M{"$ifNull": bson.A{"$bank_id", ""}},
			},
			"pending_uf": bson.M{"$sum": bson.M{
				"$cond": bson.A{
					bson.M{"$in": bson.A{"$status", bson.A{"pending", "overdue"}}},
					"$amount.amount",
					0,
				},
			}},
			"paid_uf": bson.M{"$sum": bson.M{
				"$cond": bson.A{
					bson.M{"$eq": bson.A{"$status", "paid"}},
					"$amount.amount",
					0,
				},
			}},
			"properties": bson.M{"$addToSet": "$property_id"},
		}}},
		{{Key: "$sort", Value: bson.M{"_id.bank_name": 1}}},
	}
	cursor, err := r.col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var rows []struct {
		ID struct {
			BankName string `bson:"bank_name"`
			BankID   string `bson:"bank_id"`
		} `bson:"_id"`
		PendingUF  float64    `bson:"pending_uf"`
		PaidUF     float64    `bson:"paid_uf"`
		Properties []string   `bson:"properties"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		return nil, err
	}
	result := make([]BankDividendTotal, 0, len(rows))
	for _, row := range rows {
		result = append(result, BankDividendTotal{
			BankName:      row.ID.BankName,
			BankID:        row.ID.BankID,
			PendingUF:     row.PendingUF,
			PaidUF:        row.PaidUF,
			PropertyCount: len(row.Properties),
		})
	}
	return result, nil
}

type ContactRepo struct{ col *mongo.Collection }

func NewContactRepo(db *Client) *ContactRepo { return &ContactRepo{col: db.Collection("crm_contacts")} }

func (r *ContactRepo) Create(ctx context.Context, c *domaincrm.Contact) error {
	return insertOne(ctx, r.col, c)
}

func (r *ContactRepo) List(ctx context.Context, orgID string, page, limit int, cType string) ([]domaincrm.Contact, int64, error) {
	f := bson.M{}
	if cType != "" {
		f["type"] = cType
	}
	return listByOrg[domaincrm.Contact](ctx, r.col, orgID, ListParams{Page: page, Limit: limit, Filter: f})
}

type MaintenanceRepo struct{ col *mongo.Collection }

func NewMaintenanceRepo(db *Client) *MaintenanceRepo {
	return &MaintenanceRepo{col: db.Collection("maintenance")}
}

func (r *MaintenanceRepo) Create(ctx context.Context, m *domainmaint.Maintenance) error {
	return insertOne(ctx, r.col, m)
}

func (r *MaintenanceRepo) List(ctx context.Context, orgID string, page, limit int) ([]domainmaint.Maintenance, int64, error) {
	return listByOrg[domainmaint.Maintenance](ctx, r.col, orgID, ListParams{
		Page: page, Limit: limit, Sort: bson.D{{Key: "scheduled_date", Value: 1}},
	})
}

type TicketRepo struct{ col *mongo.Collection }

func NewTicketRepo(db *Client) *TicketRepo { return &TicketRepo{col: db.Collection("tickets")} }

func (r *TicketRepo) Create(ctx context.Context, t *domainticket.Ticket) error {
	return insertOne(ctx, r.col, t)
}

func (r *TicketRepo) List(ctx context.Context, orgID string, page, limit int, status string) ([]domainticket.Ticket, int64, error) {
	f := bson.M{}
	if status != "" {
		f["status"] = status
	}
	return listByOrg[domainticket.Ticket](ctx, r.col, orgID, ListParams{Page: page, Limit: limit, Filter: f})
}

type DocumentRepo struct{ col *mongo.Collection }

func NewDocumentRepo(db *Client) *DocumentRepo { return &DocumentRepo{col: db.Collection("documents")} }

func (r *DocumentRepo) Create(ctx context.Context, d *domaindoc.Document) error {
	return insertOne(ctx, r.col, d)
}

func (r *DocumentRepo) List(ctx context.Context, orgID string, page, limit int, category, entityType, entityID string) ([]domaindoc.Document, int64, error) {
	f := bson.M{}
	if category != "" {
		f["category"] = category
	}
	if entityType != "" {
		f["entity_type"] = entityType
	}
	if entityID != "" {
		f["entity_id"] = entityID
	}
	return listByOrg[domaindoc.Document](ctx, r.col, orgID, ListParams{Page: page, Limit: limit, Filter: f})
}

func (r *DocumentRepo) FindByID(ctx context.Context, orgID, id string) (*domaindoc.Document, error) {
	var d domaindoc.Document
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &d, err
}

func (r *DocumentRepo) Update(ctx context.Context, d *domaindoc.Document) error {
	d.Touch()
	return replaceByOrg(ctx, r.col, d.OrganizationID, d.ID, d)
}

func (r *DocumentRepo) Delete(ctx context.Context, orgID, id string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id, "organization_id": orgID})
	return err
}

func (r *DocumentRepo) Deactivate(ctx context.Context, orgID, id string) error {
	now := time.Now().UTC()
	return patchByOrg(ctx, r.col, orgID, id, bson.M{"active": false, "updated_at": now})
}

func (r *DocumentRepo) IsReferenced(ctx context.Context, orgID, id string) (bool, error) {
	leaseCount, err := r.col.Database().Collection("leases").CountDocuments(ctx, bson.M{
		"organization_id": orgID,
		"document_id":     id,
	})
	if err != nil {
		return false, err
	}
	if leaseCount > 0 {
		return true, nil
	}
	appraisalCount, err := r.col.Database().Collection("appraisals").CountDocuments(ctx, bson.M{
		"organization_id": orgID,
		"document_id":     id,
	})
	if err != nil {
		return false, err
	}
	return appraisalCount > 0, nil
}

type MortgageRepo struct{ col *mongo.Collection }

func NewMortgageRepo(db *Client) *MortgageRepo { return &MortgageRepo{col: db.Collection("mortgages")} }

func (r *MortgageRepo) Create(ctx context.Context, m *domainmort.Mortgage) error {
	return insertOne(ctx, r.col, m)
}

func (r *MortgageRepo) List(ctx context.Context, orgID string, page, limit int) ([]domainmort.Mortgage, int64, error) {
	return listByOrg[domainmort.Mortgage](ctx, r.col, orgID, ListParams{Page: page, Limit: limit})
}

type ReminderRepo struct{ col *mongo.Collection }

func NewReminderRepo(db *Client) *ReminderRepo { return &ReminderRepo{col: db.Collection("reminders")} }

func (r *ReminderRepo) Create(ctx context.Context, rem *domainrem.Reminder) error {
	return insertOne(ctx, r.col, rem)
}

func (r *ReminderRepo) List(ctx context.Context, orgID string, page, limit int) ([]domainrem.Reminder, int64, error) {
	return listByOrg[domainrem.Reminder](ctx, r.col, orgID, ListParams{
		Page: page, Limit: limit, Sort: bson.D{{Key: "scheduled_at", Value: 1}},
	})
}

func (r *ReminderRepo) Upcoming(ctx context.Context, orgID string, days int) ([]domainrem.Reminder, error) {
	until := time.Now().UTC().AddDate(0, 0, days)
	cursor, err := r.col.Find(ctx, bson.M{
		"organization_id": orgID,
		"scheduled_at":    bson.M{"$lte": until},
		"status":          domainrem.StatusPending,
	}, options.Find().SetSort(bson.D{{Key: "scheduled_at", Value: 1}}).SetLimit(20))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []domainrem.Reminder
	return items, cursor.All(ctx, &items)
}

type NotificationFilter struct {
	Status   string
	Type     string
	TenantID string
	FromDate *time.Time
	ToDate   *time.Time
}

type NotificationRepo struct{ col *mongo.Collection }

func NewNotificationRepo(db *Client) *NotificationRepo {
	return &NotificationRepo{col: db.Collection("notifications")}
}

func (r *NotificationRepo) Create(ctx context.Context, n *domainnotif.Notification) error {
	return insertOne(ctx, r.col, n)
}

func (r *NotificationRepo) List(ctx context.Context, orgID string, page, limit int, filter NotificationFilter) ([]domainnotif.Notification, int64, error) {
	f := bson.M{}
	if filter.Status != "" {
		f["status"] = filter.Status
	}
	if filter.Type != "" {
		f["type"] = filter.Type
	}
	if filter.TenantID != "" {
		f["tenant_id"] = filter.TenantID
	}
	if filter.FromDate != nil || filter.ToDate != nil {
		dateQuery := bson.M{}
		if filter.FromDate != nil {
			dateQuery["$gte"] = *filter.FromDate
		}
		if filter.ToDate != nil {
			dateQuery["$lte"] = *filter.ToDate
		}
		f["scheduled_at"] = dateQuery
	}
	return listByOrg[domainnotif.Notification](ctx, r.col, orgID, ListParams{
		Page: page, Limit: limit, Filter: f, Sort: bson.D{{Key: "scheduled_at", Value: -1}},
	})
}

func (r *NotificationRepo) FindByID(ctx context.Context, orgID, id string) (*domainnotif.Notification, error) {
	var n domainnotif.Notification
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&n)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &n, err
}

func (r *NotificationRepo) Update(ctx context.Context, n *domainnotif.Notification) error {
	n.Touch()
	return replaceByOrg(ctx, r.col, n.OrganizationID, n.ID, n)
}

func (r *NotificationRepo) Delete(ctx context.Context, orgID, id string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id, "organization_id": orgID})
	return err
}
