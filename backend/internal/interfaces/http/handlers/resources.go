package handlers

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	domaincrm "github.com/richard/my-rent-go/internal/domain/crm"
	domaindoc "github.com/richard/my-rent-go/internal/domain/document"
	domainlease "github.com/richard/my-rent-go/internal/domain/lease"
	domainmaint "github.com/richard/my-rent-go/internal/domain/maintenance"
	domainprop "github.com/richard/my-rent-go/internal/domain/property"
	domainmort "github.com/richard/my-rent-go/internal/domain/mortgage"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	domainpay "github.com/richard/my-rent-go/internal/domain/payment"
	domainrem "github.com/richard/my-rent-go/internal/domain/reminder"
	"github.com/richard/my-rent-go/internal/domain/shared"
	domaintenant "github.com/richard/my-rent-go/internal/domain/tenant"
	domainticket "github.com/richard/my-rent-go/internal/domain/ticket"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type ResourcesHandler struct {
	db         *mongodb.Client
	properties *mongodb.PropertyRepo
	tenants    *mongodb.TenantRepo
	leases     *mongodb.LeaseRepo
	payments *mongodb.PaymentRepo
	contacts *mongodb.ContactRepo
	maint    *mongodb.MaintenanceRepo
	tickets  *mongodb.TicketRepo
	docs     *mongodb.DocumentRepo
	mortgage *mongodb.MortgageRepo
	reminder *mongodb.ReminderRepo
	notif    *mongodb.NotificationRepo
}

func NewResourcesHandler(db *mongodb.Client) *ResourcesHandler {
	return &ResourcesHandler{
		db:         db,
		properties: mongodb.NewPropertyRepo(db),
		tenants:    mongodb.NewTenantRepo(db),
		leases:     mongodb.NewLeaseRepo(db),
		payments: mongodb.NewPaymentRepo(db),
		contacts: mongodb.NewContactRepo(db),
		maint:    mongodb.NewMaintenanceRepo(db),
		tickets:  mongodb.NewTicketRepo(db),
		docs:     mongodb.NewDocumentRepo(db),
		mortgage: mongodb.NewMortgageRepo(db),
		reminder: mongodb.NewReminderRepo(db),
		notif:    mongodb.NewNotificationRepo(db),
	}
}

func parsePageLimit(c *gin.Context) (int, int) {
	return parseInt(c.Query("page"), 1), parseInt(c.Query("limit"), 20)
}

func listResponse(c *gin.Context, data any, total int64, page, limit int) {
	c.JSON(http.StatusOK, gin.H{"data": data, "total": total, "page": page, "limit": limit})
}

// Tenants
func (h *ResourcesHandler) ListTenants(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.tenants.List(c.Request.Context(), orgID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createTenantReq struct {
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	TaxID     string `json:"tax_id"`
}

func (h *ResourcesHandler) CreateTenant(c *gin.Context) {
	var req createTenantReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	t := domaintenant.NewTenant(orgID, req.FirstName, req.LastName)
	t.TaxID = req.TaxID
	t.Contact = shared.ContactInfo{Email: req.Email, Phone: req.Phone}
	if err := h.tenants.Create(c.Request.Context(), t); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *ResourcesHandler) GetTenant(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	t, err := h.tenants.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	c.JSON(http.StatusOK, t)
}

type updateTenantReq struct {
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	TaxID     string `json:"tax_id"`
}

func (h *ResourcesHandler) UpdateTenant(c *gin.Context) {
	var req updateTenantReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	t, err := h.tenants.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	t.FirstName = req.FirstName
	t.LastName = req.LastName
	t.TaxID = req.TaxID
	t.Contact = shared.ContactInfo{Email: req.Email, Phone: req.Phone}
	if err := h.tenants.Update(c.Request.Context(), t); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *ResourcesHandler) DeleteTenant(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	t, err := h.tenants.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	hasLease, err := h.leases.ExistsByTenantID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasLease {
		c.JSON(http.StatusConflict, gin.H{"error": "No se puede eliminar: arrendatario asociado a un arriendo"})
		return
	}
	if err := h.tenants.Delete(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ResourcesHandler) DeactivateTenant(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	t, err := h.tenants.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	if !t.Active {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant already inactive"})
		return
	}
	if err := h.tenants.Deactivate(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "inactive"})
}

// Leases
func (h *ResourcesHandler) ListLeases(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.leases.List(c.Request.Context(), orgID, page, limit, c.Query("status"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createLeaseReq struct {
	PropertyID          string  `json:"property_id" binding:"required"`
	WarehousePropertyID string  `json:"warehouse_property_id"`
	ParkingPropertyID   string  `json:"parking_property_id"`
	TenantID            string  `json:"tenant_id" binding:"required"`
	StartDate           string  `json:"start_date"`
	EndDate             string  `json:"end_date"`
	MonthlyRent         float64 `json:"monthly_rent" binding:"required"`
	IPCAdjustment       bool    `json:"ipc_adjustment"`
	PaymentDay          int     `json:"payment_day"`
}

func parseOptionalDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (h *ResourcesHandler) validateLeaseIncludedProperties(ctx context.Context, orgID, apartmentID, warehouseID, parkingID string) error {
	if warehouseID == "" && parkingID == "" {
		return nil
	}
	prop, err := h.properties.FindByID(ctx, orgID, apartmentID)
	if err != nil {
		return err
	}
	if prop == nil {
		return errPropertyNotFound
	}
	if prop.Type != domainprop.TypeApartment {
		return errIncludedPropertiesRequireApartment
	}
	if warehouseID != "" {
		if prop.WarehousePropertyID != warehouseID {
			return errWarehouseNotLinkedToApartment
		}
	}
	if parkingID != "" {
		if prop.ParkingPropertyID != parkingID {
			return errParkingNotLinkedToApartment
		}
	}
	return nil
}

func (h *ResourcesHandler) validateLeasePropertyPurpose(ctx context.Context, orgID, propertyID, allowPropertyID string) error {
	prop, err := h.properties.FindByID(ctx, orgID, propertyID)
	if err != nil {
		return err
	}
	if prop == nil {
		return errPropertyNotFound
	}
	if prop.Purpose != domainprop.PurposeRent {
		if allowPropertyID != "" && propertyID == allowPropertyID {
			return nil
		}
		return errPropertyNotForRent
	}
	return nil
}

func (h *ResourcesHandler) checkIncludedPropertiesAvailable(ctx context.Context, orgID, excludeLeaseID, warehouseID, parkingID string) error {
	for _, id := range []string{warehouseID, parkingID} {
		if id == "" {
			continue
		}
		hasActive, err := h.leases.HasActiveLeaseForProperty(ctx, orgID, id, excludeLeaseID)
		if err != nil {
			return err
		}
		if hasActive {
			return errPropertyHasActiveLease
		}
	}
	return nil
}

var (
	errPropertyNotFound                   = &leaseValidationError{"propiedad no encontrada"}
	errPropertyNotForRent                 = &leaseValidationError{"la propiedad no está destinada para arrendar"}
	errIncludedPropertiesRequireApartment = &leaseValidationError{"solo un departamento puede incluir bodega o estacionamiento en el arriendo"}
	errWarehouseNotLinkedToApartment      = &leaseValidationError{"la bodega no está vinculada al departamento seleccionado"}
	errParkingNotLinkedToApartment        = &leaseValidationError{"el estacionamiento no está vinculado al departamento seleccionado"}
	errPropertyHasActiveLease             = &leaseValidationError{"una propiedad incluida ya tiene un arriendo activo"}
)

type leaseValidationError struct{ msg string }

func (e *leaseValidationError) Error() string { return e.msg }

func leaseValidationHTTPStatus(err error) int {
	if err == errPropertyHasActiveLease {
		return http.StatusConflict
	}
	if _, ok := err.(*leaseValidationError); ok {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}

func (h *ResourcesHandler) CreateLease(c *gin.Context) {
	var req createLeaseReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	start, err1 := parseOptionalDate(req.StartDate)
	end, err2 := parseOptionalDate(req.EndDate)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}
	orgID := middleware.GetOrgID(c)
	hasActive, err := h.leases.HasActiveLeaseForProperty(c.Request.Context(), orgID, req.PropertyID, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasActive {
		c.JSON(http.StatusConflict, gin.H{"error": "La propiedad ya tiene un arriendo activo"})
		return
	}
	hasActiveTenant, err := h.leases.HasActiveLeaseForTenant(c.Request.Context(), orgID, req.TenantID, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasActiveTenant {
		c.JSON(http.StatusConflict, gin.H{"error": "El arrendatario ya tiene un arriendo activo"})
		return
	}
	if err := h.validateLeasePropertyPurpose(c.Request.Context(), orgID, req.PropertyID, ""); err != nil {
		c.JSON(leaseValidationHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.validateLeaseIncludedProperties(c.Request.Context(), orgID, req.PropertyID, req.WarehousePropertyID, req.ParkingPropertyID); err != nil {
		c.JSON(leaseValidationHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.checkIncludedPropertiesAvailable(c.Request.Context(), orgID, "", req.WarehousePropertyID, req.ParkingPropertyID); err != nil {
		c.JSON(leaseValidationHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	l := domainlease.NewLease(orgID, req.PropertyID, req.TenantID, start, end, shared.NewMoney(req.MonthlyRent, "CLP"))
	l.WarehousePropertyID = req.WarehousePropertyID
	l.ParkingPropertyID = req.ParkingPropertyID
	l.Status = domainlease.StatusActive
	l.IPCAdjustment = req.IPCAdjustment
	if req.PaymentDay > 0 {
		l.PaymentDay = req.PaymentDay
	}
	if err := h.leases.Create(c.Request.Context(), l); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, l)
}

func (h *ResourcesHandler) GetLease(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	l, err := h.leases.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if l == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "lease not found"})
		return
	}
	c.JSON(http.StatusOK, l)
}

type updateLeaseReq struct {
	PropertyID          string  `json:"property_id" binding:"required"`
	WarehousePropertyID string  `json:"warehouse_property_id"`
	ParkingPropertyID   string  `json:"parking_property_id"`
	TenantID            string  `json:"tenant_id" binding:"required"`
	StartDate           string  `json:"start_date"`
	EndDate             string  `json:"end_date"`
	MonthlyRent         float64 `json:"monthly_rent" binding:"required"`
	IPCAdjustment       bool    `json:"ipc_adjustment"`
	PaymentDay          int     `json:"payment_day"`
}

func (h *ResourcesHandler) UpdateLease(c *gin.Context) {
	var req updateLeaseReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	start, err1 := parseOptionalDate(req.StartDate)
	end, err2 := parseOptionalDate(req.EndDate)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	l, err := h.leases.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if l == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "lease not found"})
		return
	}
	if l.Status == domainlease.StatusTerminated {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot edit a terminated lease"})
		return
	}
	if req.PropertyID != l.PropertyID {
		hasActive, err := h.leases.HasActiveLeaseForProperty(c.Request.Context(), orgID, req.PropertyID, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if hasActive {
			c.JSON(http.StatusConflict, gin.H{"error": "La propiedad ya tiene un arriendo activo"})
			return
		}
	}
	if req.TenantID != l.TenantID {
		hasActiveTenant, err := h.leases.HasActiveLeaseForTenant(c.Request.Context(), orgID, req.TenantID, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if hasActiveTenant {
			c.JSON(http.StatusConflict, gin.H{"error": "El arrendatario ya tiene un arriendo activo"})
			return
		}
	}
	if err := h.validateLeasePropertyPurpose(c.Request.Context(), orgID, req.PropertyID, l.PropertyID); err != nil {
		c.JSON(leaseValidationHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.validateLeaseIncludedProperties(c.Request.Context(), orgID, req.PropertyID, req.WarehousePropertyID, req.ParkingPropertyID); err != nil {
		c.JSON(leaseValidationHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	includedChanged := req.WarehousePropertyID != l.WarehousePropertyID || req.ParkingPropertyID != l.ParkingPropertyID
	if includedChanged {
		if err := h.checkIncludedPropertiesAvailable(c.Request.Context(), orgID, id, req.WarehousePropertyID, req.ParkingPropertyID); err != nil {
			c.JSON(leaseValidationHTTPStatus(err), gin.H{"error": err.Error()})
			return
		}
	}
	l.PropertyID = req.PropertyID
	l.WarehousePropertyID = req.WarehousePropertyID
	l.ParkingPropertyID = req.ParkingPropertyID
	l.TenantID = req.TenantID
	l.StartDate = start
	l.EndDate = end
	l.MonthlyRent = shared.NewMoney(req.MonthlyRent, "CLP")
	l.IPCAdjustment = req.IPCAdjustment
	if req.PaymentDay > 0 {
		l.PaymentDay = req.PaymentDay
	}
	if err := h.leases.Update(c.Request.Context(), l); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, l)
}

func (h *ResourcesHandler) TerminateLease(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	l, err := h.leases.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if l == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "lease not found"})
		return
	}
	if l.Status == domainlease.StatusTerminated {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lease already terminated"})
		return
	}
	if err := h.leases.Terminate(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "terminated"})
}

// Payments
func (h *ResourcesHandler) ListPayments(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.payments.List(c.Request.Context(), orgID, page, limit, c.Query("status"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createPaymentReq struct {
	PropertyID string  `json:"property_id"`
	LeaseID    string  `json:"lease_id"`
	TenantID   string  `json:"tenant_id"`
	Type       string  `json:"type" binding:"required"`
	Amount     float64 `json:"amount" binding:"required"`
	Currency   string  `json:"currency"`
	DueDate    string  `json:"due_date" binding:"required"`
	Notes      string  `json:"notes,omitempty"`
	BankName   string  `json:"bank_name,omitempty"`
	BankID     string  `json:"bank_id,omitempty"`
}

func (h *ResourcesHandler) CreatePayment(c *gin.Context) {
	var req createPaymentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	due, err := time.Parse("2006-01-02", req.DueDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid due_date"})
		return
	}
	orgID := middleware.GetOrgID(c)
	currency := req.Currency
	if currency == "" {
		currency = "CLP"
	}
	p := domainpay.NewPayment(orgID, domainpay.Type(req.Type), shared.NewMoney(req.Amount, currency), due)
	p.PropertyID = req.PropertyID
	p.LeaseID = req.LeaseID
	p.TenantID = req.TenantID
	p.BankName = req.BankName
	p.BankID = req.BankID
	if req.Type == string(domainpay.TypeDeposit) {
		p.Notes = req.Notes
	}
	if time.Now().After(due) && p.Status == domainpay.StatusPending {
		p.Status = domainpay.StatusOverdue
	}
	if err := h.payments.Create(c.Request.Context(), p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

func (h *ResourcesHandler) MarkPaymentPaid(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	if err := h.payments.MarkPaid(c.Request.Context(), orgID, c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "paid"})
}

type generatePendingPaymentsReq struct {
	Month  string `json:"month"`
	DryRun bool   `json:"dry_run"`
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

func (h *ResourcesHandler) GeneratePendingRentPayments(c *gin.Context) {
	var req generatePendingPaymentsReq
	if err := c.ShouldBindJSON(&req); err != nil && c.Request.ContentLength > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	monthStr := req.Month
	if monthStr == "" {
		now := time.Now().UTC()
		monthStr = now.Format("2006-01")
	}
	parsed, err := time.Parse("2006-01", monthStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month, use YYYY-MM"})
		return
	}

	monthStart := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, 0)

	orgID := middleware.GetOrgID(c)
	leases, err := h.leases.ListActive(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var toCreate []*domainpay.Payment
	skipped := 0
	now := time.Now().UTC()

	for _, lease := range leases {
		exists, err := h.payments.RentExistsForLeaseMonth(c.Request.Context(), orgID, lease.ID, monthStart, monthEnd)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if exists {
			skipped++
			continue
		}

		due := rentDueDateForMonth(parsed.Year(), parsed.Month(), lease.PaymentDay)
		p := domainpay.NewPayment(orgID, domainpay.TypeRent, lease.MonthlyRent, due)
		p.PropertyID = lease.PropertyID
		p.LeaseID = lease.ID
		p.TenantID = lease.TenantID
		if now.After(due) && p.Status == domainpay.StatusPending {
			p.Status = domainpay.StatusOverdue
		}
		toCreate = append(toCreate, p)
	}

	monthAlreadyGenerated := len(toCreate) == 0 && len(leases) > 0

	if req.DryRun {
		c.JSON(http.StatusOK, gin.H{
			"month":                   monthStr,
			"would_create":            len(toCreate),
			"skipped":                 skipped,
			"month_already_generated": monthAlreadyGenerated,
			"dry_run":                 true,
		})
		return
	}

	if len(toCreate) > 0 {
		if err := h.payments.CreateMany(c.Request.Context(), toCreate); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	created := make([]domainpay.Payment, len(toCreate))
	for i, p := range toCreate {
		created[i] = *p
	}

	c.JSON(http.StatusCreated, gin.H{
		"month":                   monthStr,
		"created":                 len(created),
		"skipped":                 skipped,
		"month_already_generated": monthAlreadyGenerated,
		"data":                    created,
	})
}

func dividendDueDateForMonth(year int, month time.Month, paymentDay int) time.Time {
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	day := paymentDay
	if day < 1 {
		day = 5
	}
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func paymentDayFromProperty(p domainprop.Property) int {
	if p.Financials.PaymentStartDate != nil {
		return p.Financials.PaymentStartDate.Day()
	}
	return 5
}

func (h *ResourcesHandler) resolveBankID(ctx context.Context, orgID, bankName string) string {
	if bankName == "" {
		return ""
	}
	contacts, _, err := h.contacts.List(ctx, orgID, 1, 200, string(domaincrm.TypeBank))
	if err != nil {
		return ""
	}
	lower := strings.ToLower(strings.TrimSpace(bankName))
	for _, c := range contacts {
		if strings.ToLower(strings.TrimSpace(c.Name)) == lower {
			return c.ID
		}
	}
	return ""
}

func paymentBankFromProperty(p domainprop.Property) string {
	if p.Financials.PaymentBank != "" {
		return p.Financials.PaymentBank
	}
	return p.Financials.BankName
}

func applyPropertyDividendDefaults(p *domainpay.Payment, prop *domainprop.Property) {
	if prop == nil {
		return
	}
	if p.BankName == "" {
		p.BankName = prop.Financials.BankName
	}
	if p.PaymentBank == "" {
		p.PaymentBank = paymentBankFromProperty(*prop)
	}
}

// Dividends
func (h *ResourcesHandler) ListDividends(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	filter := mongodb.PaymentListFilter{
		Type:       string(domainpay.TypeDividend),
		Status:     c.Query("status"),
		PropertyID: c.Query("property_id"),
		BankName:   c.Query("bank_name"),
		Month:      c.Query("month"),
	}
	items, total, err := h.payments.ListFiltered(c.Request.Context(), orgID, page, limit, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createDividendReq struct {
	PropertyID  string  `json:"property_id" binding:"required"`
	BankID      string  `json:"bank_id"`
	BankName    string  `json:"bank_name"`
	PaymentBank string  `json:"payment_bank"`
	PacEnabled  bool    `json:"pac_enabled"`
	Amount      float64 `json:"amount" binding:"required"`
	Currency    string  `json:"currency"`
	DueDate     string  `json:"due_date" binding:"required"`
	Notes       string  `json:"notes,omitempty"`
}

func (h *ResourcesHandler) CreateDividend(c *gin.Context) {
	var req createDividendReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	due, err := time.Parse("2006-01-02", req.DueDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid due_date"})
		return
	}
	currency := req.Currency
	if currency == "" {
		currency = "UF"
	}
	orgID := middleware.GetOrgID(c)
	p := domainpay.NewPayment(orgID, domainpay.TypeDividend, shared.NewMoney(req.Amount, currency), due)
	p.PropertyID = req.PropertyID
	p.BankID = req.BankID
	p.BankName = req.BankName
	p.PaymentBank = req.PaymentBank
	p.PacEnabled = req.PacEnabled
	p.Notes = req.Notes
	if req.PropertyID != "" {
		if prop, _ := h.properties.FindByID(c.Request.Context(), orgID, req.PropertyID); prop != nil {
			applyPropertyDividendDefaults(p, prop)
			if p.BankID == "" {
				p.BankID = h.resolveBankID(c.Request.Context(), orgID, p.BankName)
			}
		}
	}
	if p.BankID == "" && p.BankName != "" {
		p.BankID = h.resolveBankID(c.Request.Context(), orgID, p.BankName)
	}
	if time.Now().After(due) && p.Status == domainpay.StatusPending {
		p.Status = domainpay.StatusOverdue
	}
	if err := h.payments.Create(c.Request.Context(), p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

func (h *ResourcesHandler) MarkDividendPaid(c *gin.Context) {
	h.MarkPaymentPaid(c)
}

type updateDividendReq struct {
	BankID      *string `json:"bank_id"`
	BankName    *string `json:"bank_name"`
	PaymentBank *string `json:"payment_bank"`
	PacEnabled  *bool   `json:"pac_enabled"`
	Amount      *float64 `json:"amount"`
	Currency    *string  `json:"currency"`
	DueDate     *string  `json:"due_date"`
	Notes       *string  `json:"notes"`
}

func (h *ResourcesHandler) UpdateDividend(c *gin.Context) {
	var req updateDividendReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	p, err := h.payments.FindByID(c.Request.Context(), orgID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if p == nil || p.Type != domainpay.TypeDividend {
		c.JSON(http.StatusNotFound, gin.H{"error": "dividend not found"})
		return
	}
	if req.BankID != nil {
		p.BankID = *req.BankID
	}
	if req.BankName != nil {
		p.BankName = *req.BankName
	}
	if req.PaymentBank != nil {
		p.PaymentBank = *req.PaymentBank
	}
	if req.PacEnabled != nil {
		p.PacEnabled = *req.PacEnabled
	}
	if req.Amount != nil {
		currency := p.Amount.Currency
		if req.Currency != nil && *req.Currency != "" {
			currency = *req.Currency
		}
		p.Amount = shared.NewMoney(*req.Amount, currency)
	} else if req.Currency != nil && *req.Currency != "" {
		p.Amount = shared.NewMoney(p.Amount.Amount, *req.Currency)
	}
	if req.DueDate != nil {
		due, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid due_date"})
			return
		}
		p.DueDate = due
		if p.Status == domainpay.StatusPending && time.Now().After(due) {
			p.Status = domainpay.StatusOverdue
		}
	}
	if req.Notes != nil {
		p.Notes = *req.Notes
	}
	if p.BankID == "" && p.BankName != "" {
		p.BankID = h.resolveBankID(c.Request.Context(), orgID, p.BankName)
	}
	if err := h.payments.UpdateDividend(c.Request.Context(), orgID, p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *ResourcesHandler) GeneratePendingDividends(c *gin.Context) {
	var req generatePendingPaymentsReq
	if err := c.ShouldBindJSON(&req); err != nil && c.Request.ContentLength > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	monthStr := req.Month
	if monthStr == "" {
		now := time.Now().UTC()
		monthStr = now.Format("2006-01")
	}
	parsed, err := time.Parse("2006-01", monthStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month, use YYYY-MM"})
		return
	}

	monthStart := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, 0)

	orgID := middleware.GetOrgID(c)
	properties, err := h.properties.ListWithMortgage(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var toCreate []*domainpay.Payment
	skipped := 0
	eligible := 0
	now := time.Now().UTC()

	for _, prop := range properties {
		if prop.Financials.MonthlyMortgageUF <= 0 {
			skipped++
			continue
		}
		eligible++
		exists, err := h.payments.DividendExistsForPropertyMonth(c.Request.Context(), orgID, prop.ID, monthStart, monthEnd)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if exists {
			skipped++
			continue
		}

		due := dividendDueDateForMonth(parsed.Year(), parsed.Month(), paymentDayFromProperty(prop))
		p := domainpay.NewPayment(orgID, domainpay.TypeDividend, shared.NewMoney(prop.Financials.MonthlyMortgageUF, "UF"), due)
		p.PropertyID = prop.ID
		p.BankName = prop.Financials.BankName
		p.PaymentBank = paymentBankFromProperty(prop)
		p.PacEnabled = prop.Financials.PacEnabled
		p.BankID = h.resolveBankID(c.Request.Context(), orgID, p.BankName)
		if now.After(due) && p.Status == domainpay.StatusPending {
			p.Status = domainpay.StatusOverdue
		}
		toCreate = append(toCreate, p)
	}

	monthAlreadyGenerated := eligible > 0 && len(toCreate) == 0

	if req.DryRun {
		c.JSON(http.StatusOK, gin.H{
			"month":                   monthStr,
			"would_create":            len(toCreate),
			"skipped":                 skipped,
			"eligible":                eligible,
			"month_already_generated": monthAlreadyGenerated,
			"dry_run":                 true,
		})
		return
	}

	if len(toCreate) > 0 {
		if err := h.payments.CreateMany(c.Request.Context(), toCreate); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	created := make([]domainpay.Payment, len(toCreate))
	for i, p := range toCreate {
		created[i] = *p
	}

	c.JSON(http.StatusCreated, gin.H{
		"month":                   monthStr,
		"created":                 len(created),
		"skipped":                 skipped,
		"eligible":                eligible,
		"month_already_generated": monthAlreadyGenerated,
		"data":                    created,
	})
}

func mortgagePropertyTotals(properties []domainprop.Property) (count int, totalUF float64) {
	for _, prop := range properties {
		if prop.Financials.MonthlyMortgageUF <= 0 {
			continue
		}
		count++
		totalUF += prop.Financials.MonthlyMortgageUF
	}
	return count, totalUF
}

func (h *ResourcesHandler) GetDividendStats(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	month := c.Query("month")
	if month == "" {
		month = time.Now().UTC().Format("2006-01")
	}
	stats, err := h.payments.DividendMonthStats(c.Request.Context(), orgID, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	banks, err := h.payments.DividendsByBank(c.Request.Context(), orgID, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	mortgaged, err := h.properties.ListWithMortgage(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	mortgageCount, totalMonthlyMortgageUF := mortgagePropertyTotals(mortgaged)
	bankItems := make([]gin.H, len(banks))
	for i, b := range banks {
		bankItems[i] = gin.H{
			"bank_name":      b.BankName,
			"bank_id":        b.BankID,
			"pending_uf":     b.PendingUF,
			"paid_uf":        b.PaidUF,
			"property_count": b.PropertyCount,
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"month":                    stats.Month,
		"total_paid_uf":            stats.PaidTotalUF,
		"total_pending_uf":         stats.PendingTotalUF,
		"total_paid_count":         stats.PaidCount,
		"total_pending_count":      stats.PendingCount,
		"total_monthly_mortgage_uf": totalMonthlyMortgageUF,
		"mortgage_property_count":  mortgageCount,
		"by_bank":                  bankItems,
	})
}

func (h *ResourcesHandler) ListDividendBanks(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	month := c.Query("month")
	if month == "" {
		month = time.Now().UTC().Format("2006-01")
	}
	type bankOption struct {
		name string
		id   string
	}
	seen := make(map[string]bankOption)
	addBank := func(name, id string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		key := strings.ToLower(name)
		if existing, ok := seen[key]; ok {
			if existing.id == "" && id != "" {
				seen[key] = bankOption{name: name, id: id}
			}
			return
		}
		seen[key] = bankOption{name: name, id: id}
	}

	contacts, _, err := h.contacts.List(c.Request.Context(), orgID, 1, 500, string(domaincrm.TypeBank))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, c := range contacts {
		addBank(c.Name, c.ID)
	}
	properties, err := h.properties.ListWithMortgage(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, prop := range properties {
		if prop.Financials.BankName != "" {
			addBank(prop.Financials.BankName, h.resolveBankID(c.Request.Context(), orgID, prop.Financials.BankName))
		}
		if pb := paymentBankFromProperty(prop); pb != "" && pb != prop.Financials.BankName {
			addBank(pb, h.resolveBankID(c.Request.Context(), orgID, pb))
		}
	}
	dividendBanks, err := h.payments.DividendsByBank(c.Request.Context(), orgID, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, b := range dividendBanks {
		addBank(b.BankName, b.BankID)
	}

	items := make([]gin.H, 0, len(seen))
	for _, b := range seen {
		items = append(items, gin.H{"bank_name": b.name, "bank_id": b.id})
	}
	sort.Slice(items, func(i, j int) bool {
		a, _ := items[i]["bank_name"].(string)
		b, _ := items[j]["bank_name"].(string)
		return strings.ToLower(a) < strings.ToLower(b)
	})
	c.JSON(http.StatusOK, gin.H{"data": items, "month": month})
}

// CRM
func (h *ResourcesHandler) ListContacts(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.contacts.List(c.Request.Context(), orgID, page, limit, c.Query("type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createContactReq struct {
	Type  string `json:"type" binding:"required"`
	Name  string `json:"name" binding:"required"`
	Email string `json:"email"`
	Phone string `json:"phone"`
}

func (h *ResourcesHandler) CreateContact(c *gin.Context) {
	var req createContactReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	contact := domaincrm.NewContact(orgID, domaincrm.ContactType(req.Type), req.Name)
	contact.Contact = shared.ContactInfo{Email: req.Email, Phone: req.Phone}
	if err := h.contacts.Create(c.Request.Context(), contact); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, contact)
}

// Maintenance
func (h *ResourcesHandler) ListMaintenance(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.maint.List(c.Request.Context(), orgID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createMaintenanceReq struct {
	PropertyID    string  `json:"property_id" binding:"required"`
	Title         string  `json:"title" binding:"required"`
	Type          string  `json:"type"`
	ScheduledDate string  `json:"scheduled_date" binding:"required"`
	Cost          float64 `json:"cost"`
}

func (h *ResourcesHandler) CreateMaintenance(c *gin.Context) {
	var req createMaintenanceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scheduled, err := time.Parse("2006-01-02", req.ScheduledDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scheduled_date"})
		return
	}
	orgID := middleware.GetOrgID(c)
	mType := domainmaint.TypePreventive
	if req.Type != "" {
		mType = domainmaint.Type(req.Type)
	}
	m := domainmaint.NewMaintenance(orgID, req.PropertyID, req.Title, mType, scheduled)
	m.Cost = shared.NewMoney(req.Cost, "CLP")
	if err := h.maint.Create(c.Request.Context(), m); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, m)
}

// Tickets
func (h *ResourcesHandler) ListTickets(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.tickets.List(c.Request.Context(), orgID, page, limit, c.Query("status"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createTicketReq struct {
	PropertyID  string `json:"property_id" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

func (h *ResourcesHandler) CreateTicket(c *gin.Context) {
	var req createTicketReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	priority := domainticket.PriorityMedium
	if req.Priority != "" {
		priority = domainticket.Priority(req.Priority)
	}
	t := domainticket.NewTicket(orgID, req.PropertyID, req.Title, req.Description, priority)
	t.ReportedBy = middleware.GetClaims(c).UserID
	if err := h.tickets.Create(c.Request.Context(), t); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, t)
}

// Documents
func (h *ResourcesHandler) ListDocuments(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.docs.List(c.Request.Context(), orgID, page, limit, c.Query("category"), c.Query("entity_type"), c.Query("entity_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createDocumentReq struct {
	EntityType string `json:"entity_type" binding:"required"`
	EntityID   string `json:"entity_id" binding:"required"`
	Category   string `json:"category" binding:"required"`
	Title      string `json:"title" binding:"required"`
	FileName   string `json:"file_name"`
	FileData   string `json:"file_data"`
	MimeType   string `json:"mime_type"`
	SizeBytes  int64  `json:"size_bytes"`
}

func (h *ResourcesHandler) CreateDocument(c *gin.Context) {
	var req createDocumentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	d := domaindoc.NewDocument(orgID, req.EntityType, req.EntityID, domaindoc.Category(req.Category), req.Title)
	d.FileName = req.FileName
	if d.FileName == "" {
		d.FileName = req.Title + ".pdf"
	}
	d.FileData = req.FileData
	d.MimeType = req.MimeType
	if d.MimeType == "" {
		d.MimeType = "application/pdf"
	}
	d.SizeBytes = req.SizeBytes
	d.UploadedBy = middleware.GetClaims(c).UserID
	if err := h.docs.Create(c.Request.Context(), d); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, d)
}

func (h *ResourcesHandler) GetDocument(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	d, err := h.docs.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if d == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	c.JSON(http.StatusOK, d)
}

type updateDocumentReq struct {
	EntityType string `json:"entity_type" binding:"required"`
	EntityID   string `json:"entity_id" binding:"required"`
	Category   string `json:"category" binding:"required"`
	Title      string `json:"title" binding:"required"`
	FileName   string `json:"file_name"`
	FileData   string `json:"file_data"`
	MimeType   string `json:"mime_type"`
	SizeBytes  int64  `json:"size_bytes"`
}

func (h *ResourcesHandler) UpdateDocument(c *gin.Context) {
	var req updateDocumentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	d, err := h.docs.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if d == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	d.EntityType = req.EntityType
	d.EntityID = req.EntityID
	d.Category = domaindoc.Category(req.Category)
	d.Title = req.Title
	if req.FileName != "" {
		d.FileName = req.FileName
	}
	if req.FileData != "" {
		d.FileData = req.FileData
	}
	if req.MimeType != "" {
		d.MimeType = req.MimeType
	}
	if req.SizeBytes > 0 {
		d.SizeBytes = req.SizeBytes
	}
	if err := h.docs.Update(c.Request.Context(), d); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, d)
}

func (h *ResourcesHandler) DeleteDocument(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	d, err := h.docs.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if d == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	referenced, err := h.docs.IsReferenced(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if referenced {
		c.JSON(http.StatusConflict, gin.H{"error": "No se puede eliminar: documento vinculado a un arriendo o tasación"})
		return
	}
	if err := h.docs.Delete(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ResourcesHandler) DeactivateDocument(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	d, err := h.docs.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if d == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	if !d.Active {
		c.JSON(http.StatusBadRequest, gin.H{"error": "document already inactive"})
		return
	}
	if err := h.docs.Deactivate(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "inactive"})
}

// Mortgages / Finance
func (h *ResourcesHandler) ListMortgages(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.mortgage.List(c.Request.Context(), orgID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createMortgageReq struct {
	PropertyID     string  `json:"property_id" binding:"required"`
	BankID         string  `json:"bank_id"`
	LoanAmount     float64 `json:"loan_amount" binding:"required"`
	InterestRate   float64 `json:"interest_rate"`
	TermMonths     int     `json:"term_months"`
	MonthlyPayment float64 `json:"monthly_payment"`
}

func (h *ResourcesHandler) CreateMortgage(c *gin.Context) {
	var req createMortgageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	m := domainmort.NewMortgage(orgID, req.PropertyID, req.BankID, shared.NewMoney(req.LoanAmount, "CLP"), req.InterestRate, req.TermMonths)
	m.MonthlyPayment = shared.NewMoney(req.MonthlyPayment, "CLP")
	m.CalculatePresentValue(req.InterestRate, req.TermMonths)
	if err := h.mortgage.Create(c.Request.Context(), m); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, m)
}

// Calendar
func (h *ResourcesHandler) GetCalendar(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	days := parseInt(c.Query("days"), 60)
	events, err := h.db.CalendarEvents(c.Request.Context(), orgID, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": events})
}

// Reminders
func (h *ResourcesHandler) ListReminders(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.reminder.List(c.Request.Context(), orgID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createReminderReq struct {
	EntityType  string `json:"entity_type" binding:"required"`
	EntityID    string `json:"entity_id" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Message     string `json:"message"`
	Channel     string `json:"channel"`
	Recipient   string `json:"recipient" binding:"required"`
	ScheduledAt string `json:"scheduled_at" binding:"required"`
}

func (h *ResourcesHandler) CreateReminder(c *gin.Context) {
	var req createReminderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scheduled, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		scheduled, err = time.Parse("2006-01-02", req.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scheduled_at"})
			return
		}
	}
	channel := domainrem.ChannelEmail
	if req.Channel != "" {
		channel = domainrem.Channel(req.Channel)
	}
	orgID := middleware.GetOrgID(c)
	rem := domainrem.NewReminder(orgID, req.EntityType, req.EntityID, req.Title, req.Message, channel, req.Recipient, scheduled)
	if err := h.reminder.Create(c.Request.Context(), rem); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, rem)
}

// Notifications
func (h *ResourcesHandler) ListNotifications(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	filter := mongodb.NotificationFilter{
		Status:   c.Query("status"),
		Type:     c.Query("type"),
		TenantID: c.Query("tenant_id"),
	}
	if fromDate, err := parseDateRange(c.Query("from_date"), false); err == nil && fromDate != nil {
		filter.FromDate = fromDate
	}
	if toDate, err := parseDateRange(c.Query("to_date"), true); err == nil && toDate != nil {
		filter.ToDate = toDate
	}
	items, total, err := h.notif.List(c.Request.Context(), orgID, page, limit, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createNotificationReq struct {
	TenantID    string            `json:"tenant_id" binding:"required"`
	LeaseID     string            `json:"lease_id"`
	Type        string            `json:"type" binding:"required"`
	Title       string            `json:"title" binding:"required"`
	Message     string            `json:"message" binding:"required"`
	Channel     string            `json:"channel" binding:"required"`
	ScheduledAt string            `json:"scheduled_at" binding:"required"`
	Metadata    map[string]string `json:"metadata"`
}

func (h *ResourcesHandler) CreateNotification(c *gin.Context) {
	var req createNotificationReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scheduledAt, err := parseFlexibleTime(req.ScheduledAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scheduled_at"})
		return
	}
	if !isValidNotificationType(req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid type"})
		return
	}
	if !isValidNotificationChannel(req.Channel) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel"})
		return
	}
	orgID := middleware.GetOrgID(c)
	n := domainnotif.NewNotification(
		orgID,
		req.TenantID,
		req.Title,
		req.Message,
		domainnotif.Type(req.Type),
		domainnotif.Channel(req.Channel),
		*scheduledAt,
	)
	n.LeaseID = req.LeaseID
	if len(req.Metadata) > 0 {
		n.Metadata = req.Metadata
	}
	if err := h.notif.Create(c.Request.Context(), n); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, n)
}

type updateNotificationStatusReq struct {
	Status string `json:"status" binding:"required"`
}

func (h *ResourcesHandler) UpdateNotificationStatus(c *gin.Context) {
	var req updateNotificationStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status != string(domainnotif.StatusSent) && req.Status != string(domainnotif.StatusCancelled) && req.Status != string(domainnotif.StatusFailed) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	n, err := h.notif.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
		return
	}
	n.Status = domainnotif.Status(req.Status)
	if n.Status == domainnotif.StatusSent {
		now := time.Now().UTC()
		n.SentAt = &now
	} else {
		n.SentAt = nil
	}
	if err := h.notif.Update(c.Request.Context(), n); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, n)
}

func (h *ResourcesHandler) DeleteNotification(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	n, err := h.notif.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
		return
	}
	if err := h.notif.Delete(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func parseFlexibleTime(v string) (*time.Time, error) {
	t, err := time.Parse(time.RFC3339, v)
	if err == nil {
		t = t.UTC()
		return &t, nil
	}
	t, err = time.Parse("2006-01-02T15:04", v)
	if err == nil {
		t = t.UTC()
		return &t, nil
	}
	t, err = time.Parse("2006-01-02", v)
	if err != nil {
		return nil, err
	}
	t = t.UTC()
	return &t, nil
}

func parseDateRange(v string, inclusiveEnd bool) (*time.Time, error) {
	if v == "" {
		return nil, nil
	}
	t, err := parseFlexibleTime(v)
	if err != nil {
		return nil, err
	}
	if inclusiveEnd && len(v) == len("2006-01-02") {
		end := t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		return &end, nil
	}
	return t, nil
}

func isValidNotificationType(v string) bool {
	switch domainnotif.Type(v) {
	case domainnotif.TypePaymentDue, domainnotif.TypePaymentOverdue, domainnotif.TypeLateInterest:
		return true
	default:
		return false
	}
}

func isValidNotificationChannel(v string) bool {
	switch domainnotif.Channel(v) {
	case domainnotif.ChannelEmail, domainnotif.ChannelWhatsApp, domainnotif.ChannelSMS, domainnotif.ChannelManual:
		return true
	default:
		return false
	}
}

// Settings - update user preferences
type updatePrefsReq struct {
	Theme  string `json:"theme"`
	Locale string `json:"locale"`
}

func (h *ResourcesHandler) UpdatePreferences(c *gin.Context) {
	// delegated via auth handler / me update - stub returns current prefs from claims
	c.JSON(http.StatusOK, gin.H{"message": "preferences saved"})
}
