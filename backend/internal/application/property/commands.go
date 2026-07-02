package property

import (
	"context"
	"time"

	domain "github.com/richard/my-rent-go/internal/domain/property"
	"github.com/richard/my-rent-go/internal/domain/shared"
)

// PropertyWritableFields groups the JSON/binding fields shared by create and update.
type PropertyWritableFields struct {
	Name              string  `json:"name" binding:"required"`
	Type              string  `json:"type" binding:"required"`
	Purpose           string  `json:"purpose" binding:"required"`
	PurposeOther      string  `json:"purpose_other"`
	Street            string  `json:"street" binding:"required"`
	Commune           string  `json:"commune" binding:"required"`
	City              string  `json:"city" binding:"required"`
	Region            string  `json:"region" binding:"required"`
	OwnerName         string  `json:"owner_name"`
	PropertyRol       string  `json:"property_rol"`
	Fojas             string  `json:"fojas"`
	ParkingPropertyID   string `json:"parking_property_id"`
	WarehousePropertyID string `json:"warehouse_property_id"`
	ValueUF           float64 `json:"value_uf"`
	DebtUF            float64 `json:"debt_uf"`
	MonthlyMortgageUF float64 `json:"monthly_mortgage_uf"`
	LoanTermYears     int     `json:"loan_term_years"`
	InterestRate      float64 `json:"interest_rate"`
	BankName          string  `json:"bank_name"`
	PaymentStartDate  string  `json:"payment_start_date"`
	UnitNumber        string  `json:"unit_number"`
	Floor             string  `json:"floor"`
	ConciergeEmail       string `json:"concierge_email"`
	ConciergePhone       string `json:"concierge_phone"`
	ButlerName           string `json:"butler_name"`
	Administration       string `json:"administration"`
	AdministrationEmail  string `json:"administration_email"`
	AdministrationPhone  string `json:"administration_phone"`
	AreaM2               float64      `json:"area_m2"`
	WaterCompany         string       `json:"water_company"`
	WaterClientCode      string       `json:"water_client_code"`
	ElectricityCompany   string       `json:"electricity_company"`
	ElectricityClientCode string      `json:"electricity_client_code"`
	GasCompany           string       `json:"gas_company"`
	GasClientCode        string       `json:"gas_client_code"`
	Photos               []PhotoInput `json:"photos"`
}

type PhotoInput struct {
	URL       string `json:"url"`
	Caption   string `json:"caption,omitempty"`
	IsPrimary bool   `json:"is_primary"`
}

type CreatePropertyCommand struct {
	OrganizationID string `json:"organization_id"`
	PropertyWritableFields
}

type ListPropertiesQuery struct {
	OrganizationID string `json:"organization_id"`
	Status         string `json:"status,omitempty"`
	Type           string `json:"type,omitempty"`
	Page           int    `json:"page"`
	Limit          int    `json:"limit"`
}

type PropertyRepository interface {
	Create(ctx context.Context, p *domain.Property) error
	FindByID(ctx context.Context, orgID, id string) (*domain.Property, error)
	List(ctx context.Context, orgID string, filter ListFilter) ([]domain.Property, int64, error)
	Update(ctx context.Context, p *domain.Property) error
	Delete(ctx context.Context, orgID, id string) error
	SyncWarehouseLink(ctx context.Context, orgID, apartmentID, warehouseID string) error
}

type ListFilter struct {
	Status string
	Type   string
	Page   int
	Limit  int
}

type CreatePropertyHandler struct {
	repo PropertyRepository
	bus  EventPublisher
}

type EventPublisher interface {
	Publish(ctx context.Context, event shared.DomainEvent)
}

func NewCreatePropertyHandler(repo PropertyRepository, bus EventPublisher) *CreatePropertyHandler {
	return &CreatePropertyHandler{repo: repo, bus: bus}
}

func applyPurposeStatus(p *domain.Property, purpose string) {
	if purpose == "" {
		return
	}
	if domain.Purpose(purpose) == domain.PurposeRent {
		p.Status = domain.StatusAvailable
	} else {
		p.Status = domain.StatusForSale
	}
}

func applyPropertyFields(p *domain.Property, fields PropertyWritableFields) {
	p.Name = fields.Name
	p.Type = domain.Type(fields.Type)
	p.Purpose = domain.Purpose(fields.Purpose)
	if fields.Purpose == string(domain.PurposeOther) {
		p.PurposeOther = fields.PurposeOther
	} else {
		p.PurposeOther = ""
	}
	p.OwnerName = fields.OwnerName
	p.Address = shared.Address{
		Street: fields.Street, Commune: fields.Commune, City: fields.City,
		Region: fields.Region, Country: "CL", PropertyRol: fields.PropertyRol,
	}
	if fields.Fojas != "" {
		p.Deed = domain.DeedInfo{Fojas: fields.Fojas}
	} else {
		p.Deed = domain.DeedInfo{}
	}
	p.Financials.ValueUF = fields.ValueUF
	p.Financials.DebtUF = fields.DebtUF
	p.Financials.MonthlyMortgageUF = fields.MonthlyMortgageUF
	p.Financials.LoanTermYears = fields.LoanTermYears
	p.Financials.InterestRate = fields.InterestRate
	p.Financials.BankName = fields.BankName
	if fields.PaymentStartDate != "" {
		if t, err := time.Parse("2006-01-02", fields.PaymentStartDate); err == nil {
			p.Financials.PaymentStartDate = &t
		}
	} else {
		p.Financials.PaymentStartDate = nil
	}
	p.AreaM2 = fields.AreaM2
	p.UtilityAccounts = domain.UtilityAccounts{
		Water: domain.UtilityAccount{
			Company: fields.WaterCompany, ClientCode: fields.WaterClientCode,
		},
		Electricity: domain.UtilityAccount{
			Company: fields.ElectricityCompany, ClientCode: fields.ElectricityClientCode,
		},
		Gas: domain.UtilityAccount{
			Company: fields.GasCompany, ClientCode: fields.GasClientCode,
		},
	}
	if fields.Photos != nil {
		p.Photos = make([]domain.Photo, len(fields.Photos))
		for i, ph := range fields.Photos {
			p.Photos[i] = domain.Photo{URL: ph.URL, Caption: ph.Caption, IsPrimary: ph.IsPrimary}
		}
	} else {
		p.Photos = []domain.Photo{}
	}
	switch fields.Type {
	case string(domain.TypeApartment):
		p.ParkingPropertyID = fields.ParkingPropertyID
		p.WarehousePropertyID = fields.WarehousePropertyID
		p.UnitNumber = fields.UnitNumber
		p.Floor = fields.Floor
		p.Concierge = domain.ConciergeInfo{
			Email: fields.ConciergeEmail, Phone: fields.ConciergePhone,
			ButlerName: fields.ButlerName, Administration: fields.Administration,
			AdministrationEmail: fields.AdministrationEmail, AdministrationPhone: fields.AdministrationPhone,
		}
	case string(domain.TypeWarehouse):
		p.ParkingPropertyID = ""
		p.WarehousePropertyID = ""
		p.UnitNumber = fields.UnitNumber
		p.Floor = ""
		p.Concierge = domain.ConciergeInfo{}
		p.UtilityAccounts = domain.UtilityAccounts{}
	case string(domain.TypeParking):
		p.ParkingPropertyID = ""
		p.WarehousePropertyID = ""
		p.UnitNumber = fields.UnitNumber
		p.Floor = ""
		p.Concierge = domain.ConciergeInfo{}
		p.UtilityAccounts = domain.UtilityAccounts{}
	default:
		p.ParkingPropertyID = fields.ParkingPropertyID
		p.WarehousePropertyID = ""
		p.UnitNumber, p.Floor = "", ""
		p.Concierge = domain.ConciergeInfo{}
	}
}

func (h *CreatePropertyHandler) Handle(ctx context.Context, cmd CreatePropertyCommand) (*domain.Property, error) {
	p := domain.NewProperty(cmd.OrganizationID, cmd.Name, domain.Type(cmd.Type))
	applyPropertyFields(p, cmd.PropertyWritableFields)
	applyPurposeStatus(p, cmd.Purpose)

	if err := h.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	if p.Type == domain.TypeApartment {
		if err := h.repo.SyncWarehouseLink(ctx, p.OrganizationID, p.ID, p.WarehousePropertyID); err != nil {
			return nil, err
		}
	}
	h.bus.Publish(ctx, shared.NewBaseEvent("property.created", p.ID, p))
	return p, nil
}

type UpdatePropertyCommand struct {
	OrganizationID string `json:"-"`
	ID             string `json:"-"`
	PropertyWritableFields
}

func (h *CreatePropertyHandler) Get(ctx context.Context, orgID, id string) (*domain.Property, error) {
	return h.repo.FindByID(ctx, orgID, id)
}

func (h *CreatePropertyHandler) Update(ctx context.Context, cmd UpdatePropertyCommand) (*domain.Property, error) {
	p, err := h.repo.FindByID(ctx, cmd.OrganizationID, cmd.ID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, nil
	}

	applyPropertyFields(p, cmd.PropertyWritableFields)
	applyPurposeStatus(p, cmd.Purpose)

	if err := h.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	if p.Type == domain.TypeApartment {
		if err := h.repo.SyncWarehouseLink(ctx, p.OrganizationID, p.ID, p.WarehousePropertyID); err != nil {
			return nil, err
		}
	}
	h.bus.Publish(ctx, shared.NewBaseEvent("property.updated", p.ID, p))
	return p, nil
}

func (h *CreatePropertyHandler) Delete(ctx context.Context, orgID, id string) (bool, error) {
	p, err := h.repo.FindByID(ctx, orgID, id)
	if err != nil {
		return false, err
	}
	if p == nil {
		return false, nil
	}
	if err := h.repo.Delete(ctx, orgID, id); err != nil {
		return false, err
	}
	h.bus.Publish(ctx, shared.NewBaseEvent("property.deleted", id, nil))
	return true, nil
}

func (h *CreatePropertyHandler) List(ctx context.Context, q ListPropertiesQuery) ([]domain.Property, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	return h.repo.List(ctx, q.OrganizationID, ListFilter{
		Status: q.Status,
		Type:   q.Type,
		Page:   q.Page,
		Limit:  q.Limit,
	})
}
