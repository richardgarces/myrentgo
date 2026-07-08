package notificationsettings

import (
	"strconv"
	"time"

	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	"github.com/richard/my-rent-go/internal/domain/shared"
)

const (
	RulePaymentDueReminder       = "payment_due_reminder"
	RulePaymentOverdueNotice     = "payment_overdue_notice"
	RuleLateInterestWarning      = "late_interest_warning"
	RuleMaintenanceReminder7     = "maintenance_reminder_7"
	RuleMaintenanceReminder1     = "maintenance_reminder_1"
	RuleMaintenanceDayOf         = "maintenance_day_of"
	RuleLeaseExpiringReminder    = "lease_expiring_reminder"
)

// AutomationRule defines when an automatic rent payment email is sent relative to due_date.
type AutomationRule struct {
	ID         string             `json:"id" bson:"id"`
	Type       domainnotif.Type   `json:"type" bson:"type"`
	Label      string             `json:"label" bson:"label"`
	DaysOffset int                `json:"days_offset" bson:"days_offset"`
	Enabled    bool               `json:"enabled" bson:"enabled"`
}

// Settings stores per-organization email automation configuration.
type Settings struct {
	shared.Entity  `bson:",inline"`
	OrganizationID string           `json:"organization_id" bson:"organization_id"`
	Rules          []AutomationRule `json:"rules" bson:"rules"`
	LastRunAt      *time.Time       `json:"last_run_at,omitempty" bson:"last_run_at,omitempty"`
	LastRunSummary string           `json:"last_run_summary,omitempty" bson:"last_run_summary,omitempty"`
}

func DefaultRules() []AutomationRule {
	return []AutomationRule{
		{
			ID:         RulePaymentDueReminder,
			Type:       domainnotif.TypePaymentDue,
			Label:      "Recordatorio 3 días antes del vencimiento",
			DaysOffset: -3,
			Enabled:    true,
		},
		{
			ID:         RulePaymentOverdueNotice,
			Type:       domainnotif.TypePaymentOverdue,
			Label:      "Aviso de pago vencido (día siguiente)",
			DaysOffset: 1,
			Enabled:    true,
		},
		{
			ID:         RuleLateInterestWarning,
			Type:       domainnotif.TypeLateInterest,
			Label:      "Aviso de multas por mora (5 días después)",
			DaysOffset: 5,
			Enabled:    true,
		},
		{
			ID:         RuleMaintenanceReminder7,
			Type:       domainnotif.TypeMaintenanceDue,
			Label:      "Recordatorio 7 días antes de la mantención",
			DaysOffset: -7,
			Enabled:    true,
		},
		{
			ID:         RuleMaintenanceReminder1,
			Type:       domainnotif.TypeMaintenanceDue,
			Label:      "Recordatorio 1 día antes de la mantención",
			DaysOffset: -1,
			Enabled:    true,
		},
		{
			ID:         RuleMaintenanceDayOf,
			Type:       domainnotif.TypeMaintenanceDue,
			Label:      "Mantención programada para hoy",
			DaysOffset: 0,
			Enabled:    true,
		},
		{
			ID:         RuleLeaseExpiringReminder,
			Type:       domainnotif.TypeLeaseExpiring,
			Label:      "Aviso 30 días antes del fin de contrato",
			DaysOffset: -30,
			Enabled:    true,
		},
	}
}

func IsMaintenanceRule(rule AutomationRule) bool {
	return rule.Type == domainnotif.TypeMaintenanceDue
}

func IsPaymentRule(rule AutomationRule) bool {
	switch rule.Type {
	case domainnotif.TypePaymentDue, domainnotif.TypePaymentOverdue, domainnotif.TypeLateInterest:
		return true
	default:
		return false
	}
}

func IsLeaseRule(rule AutomationRule) bool {
	return rule.Type == domainnotif.TypeLeaseExpiring
}

func NewSettings(orgID string) *Settings {
	return &Settings{
		Entity:         shared.NewEntity(),
		OrganizationID: orgID,
		Rules:          DefaultRules(),
	}
}

func (s *Settings) RuleByID(id string) *AutomationRule {
	for i := range s.Rules {
		if s.Rules[i].ID == id {
			return &s.Rules[i]
		}
	}
	return nil
}

func TriggerDayLabel(daysOffset int) string {
	if daysOffset > 0 {
		return "+" + strconv.Itoa(daysOffset)
	}
	return strconv.Itoa(daysOffset)
}
