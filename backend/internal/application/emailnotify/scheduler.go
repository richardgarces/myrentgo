package emailnotify

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	domainsettings "github.com/richard/my-rent-go/internal/domain/notificationsettings"
	domainpay "github.com/richard/my-rent-go/internal/domain/payment"
	"github.com/richard/my-rent-go/internal/domain/shared"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"github.com/richard/my-rent-go/internal/infrastructure/metrics"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
)
type SchedulerDetail struct {
	Action           string `json:"action"`
	Type             string `json:"type"`
	PaymentID        string `json:"payment_id,omitempty"`
	MaintenanceID    string `json:"maintenance_id,omitempty"`
	LeaseID          string `json:"lease_id,omitempty"`
	MaintenanceTitle string `json:"maintenance_title,omitempty"`
	TenantName       string `json:"tenant_name,omitempty"`
	PropertyName     string `json:"property_name,omitempty"`
	Message          string `json:"message,omitempty"`
}

type SchedulerResult struct {
	CheckedPayments    int               `json:"checked_payments"`
	CheckedMaintenance int               `json:"checked_maintenance"`
	CheckedLeases      int               `json:"checked_leases"`
	Created            int               `json:"created"`
	Sent               int               `json:"sent"`
	Skipped            int               `json:"skipped"`
	Failed             int               `json:"failed"`
	Errors             []string          `json:"errors,omitempty"`
	Details            []SchedulerDetail `json:"details,omitempty"`
}

func (s *Service) GetAutomationSettings(ctx context.Context, orgID string) (*domainsettings.Settings, error) {
	return s.settings.GetOrCreate(ctx, orgID)
}

func (s *Service) UpdateAutomationSettings(ctx context.Context, orgID string, rules []domainsettings.AutomationRule) (*domainsettings.Settings, error) {
	settings, err := s.settings.GetOrCreate(ctx, orgID)
	if err != nil {
		return nil, err
	}
	merged := mergeAutomationRules(settings.Rules, rules)
	settings.Rules = merged
	if err := s.settings.Update(ctx, settings); err != nil {
		return nil, err
	}
	return settings, nil
}

func mergeAutomationRules(current, updates []domainsettings.AutomationRule) []domainsettings.AutomationRule {
	byID := make(map[string]domainsettings.AutomationRule, len(current))
	for _, r := range current {
		byID[r.ID] = r
	}
	for _, u := range updates {
		if existing, ok := byID[u.ID]; ok {
			existing.Enabled = u.Enabled
			byID[u.ID] = existing
			continue
		}
		byID[u.ID] = u
	}
	out := make([]domainsettings.AutomationRule, 0, len(byID))
	for _, id := range []string{
		domainsettings.RulePaymentDueReminder,
		domainsettings.RulePaymentOverdueNotice,
		domainsettings.RuleLateInterestWarning,
		domainsettings.RuleMaintenanceReminder7,
		domainsettings.RuleMaintenanceReminder1,
		domainsettings.RuleMaintenanceDayOf,
		domainsettings.RuleLeaseExpiringReminder,
	} {
		if r, ok := byID[id]; ok {
			out = append(out, r)
		}
	}
	for id, r := range byID {
		found := false
		for _, known := range out {
			if known.ID == id {
				found = true
				break
			}
		}
		if !found {
			out = append(out, r)
		}
	}
	return out
}

func (s *Service) RunScheduler(ctx context.Context, orgID string) (*SchedulerResult, error) {
	settings, err := s.settings.GetOrCreate(ctx, orgID)
	if err != nil {
		return nil, err
	}

	result := &SchedulerResult{}
	today := truncateDate(time.Now().UTC())

	for _, rule := range settings.Rules {
		if !rule.Enabled {
			continue
		}
		triggerDay := domainsettings.TriggerDayLabel(rule.DaysOffset)
		if domainsettings.IsMaintenanceRule(rule) {
			if err := s.processMaintenanceRules(ctx, orgID, rule, triggerDay, result); err != nil {
				return result, err
			}
			continue
		}
		if domainsettings.IsLeaseRule(rule) {
			if err := s.processLeaseRules(ctx, orgID, rule, triggerDay, result); err != nil {
				return result, err
			}
			continue
		}
		if !domainsettings.IsPaymentRule(rule) {
			continue
		}
		dueDate := today.AddDate(0, 0, -rule.DaysOffset)
		payments, err := s.payments.ListUnpaidRentForDueDate(ctx, orgID, dueDate)
		if err != nil {
			return result, err
		}
		result.CheckedPayments += len(payments)

		for i := range payments {
			p := &payments[i]
			if err := s.processRentPaymentRule(ctx, orgID, p, rule, triggerDay, result); err != nil {
				result.Failed++
				result.Errors = append(result.Errors, err.Error())
			}
		}
	}

	now := time.Now().UTC()
	settings.LastRunAt = &now
	settings.LastRunSummary = fmt.Sprintf(
		"pagos=%d mantenciones=%d contratos=%d creados=%d enviados=%d omitidos=%d fallidos=%d",
		result.CheckedPayments, result.CheckedMaintenance, result.CheckedLeases, result.Created, result.Sent, result.Skipped, result.Failed,
	)
	_ = s.settings.Update(ctx, settings)

	return result, nil
}

func (s *Service) processRentPaymentRule(
	ctx context.Context,
	orgID string,
	p *domainpay.Payment,
	rule domainsettings.AutomationRule,
	triggerDay string,
	result *SchedulerResult,
) error {
	exists, err := s.notifications.ExistsForPaymentTrigger(ctx, orgID, p.ID, rule.Type, triggerDay)
	if err != nil {
		return err
	}
	if exists {
		result.Skipped++
		result.Details = append(result.Details, SchedulerDetail{
			Action:    "skipped",
			Type:      string(rule.Type),
			PaymentID: p.ID,
			Message:   "notificación ya registrada para este pago y regla",
		})
		return nil
	}

	ctxData, err := s.buildRentPaymentContext(ctx, orgID, p)
	if err != nil {
		return err
	}

	title, message := rentNotificationContent(rule.Type, ctxData)
	now := time.Now().UTC()
	n := domainnotif.NewNotification(orgID, p.TenantID, title, message, rule.Type, domainnotif.ChannelEmail, now)
	n.LeaseID = p.LeaseID
	n.Metadata = map[string]string{
		"payment_id":   p.ID,
		"trigger_day":  triggerDay,
		"property_id":  p.PropertyID,
		"due_date":     ctxData.DueDate,
		"amount":       ctxData.Amount,
		"tenant_name":  ctxData.TenantName,
		"property_name": ctxData.PropertyName,
	}
	if err := s.notifications.Create(ctx, n); err != nil {
		return err
	}
	result.Created++
	result.Details = append(result.Details, SchedulerDetail{
		Action:       "created",
		Type:         string(rule.Type),
		PaymentID:    p.ID,
		TenantName:   ctxData.TenantName,
		PropertyName: ctxData.PropertyName,
		Message:      title,
	})

	sendResult, err := s.sendRentNotification(ctx, orgID, n, rule.Type, ctxData)
	if sendResult != nil {
		result.Sent += sendResult.SentCount
		result.Failed += sendResult.FailedCount
		result.Errors = append(result.Errors, sendResult.Errors...)
		if sendResult.SentCount > 0 {
			result.Details = append(result.Details, SchedulerDetail{
				Action:       "sent",
				Type:         string(rule.Type),
				PaymentID:    p.ID,
				TenantName:   ctxData.TenantName,
				PropertyName: ctxData.PropertyName,
				Message:      fmt.Sprintf("enviada a %d destinatario(s)", sendResult.SentCount),
			})
		}
		if sendResult.FailedCount > 0 {
			errMsg := "envío fallido"
			if len(sendResult.Errors) > 0 {
				errMsg = sendResult.Errors[0]
			}
			result.Details = append(result.Details, SchedulerDetail{
				Action:       "failed",
				Type:         string(rule.Type),
				PaymentID:    p.ID,
				TenantName:   ctxData.TenantName,
				PropertyName: ctxData.PropertyName,
				Message:      errMsg,
			})
		}
	}
	return err
}

func (s *Service) buildRentPaymentContext(ctx context.Context, orgID string, p *domainpay.Payment) (email.RentPaymentContext, error) {
	ctxData := email.RentPaymentContext{
		DueDate: p.DueDate.UTC().Format("02/01/2006"),
		Amount:  formatMoney(p.Amount),
	}
	if p.TenantID != "" {
		t, err := s.tenants.FindByID(ctx, orgID, p.TenantID)
		if err != nil {
			return ctxData, err
		}
		if t != nil {
			ctxData.TenantName = strings.TrimSpace(t.FullName())
		}
	}
	if p.PropertyID != "" {
		prop, err := s.properties.FindByID(ctx, orgID, p.PropertyID)
		if err != nil {
			return ctxData, err
		}
		if prop != nil {
			ctxData.PropertyName = prop.Name
		}
	}
	if ctxData.TenantName == "" {
		ctxData.TenantName = "Arrendatario"
	}
	if ctxData.PropertyName == "" {
		ctxData.PropertyName = "Propiedad"
	}
	return ctxData, nil
}

func (s *Service) sendRentNotification(ctx context.Context, orgID string, n *domainnotif.Notification, notifType domainnotif.Type, ctxData email.RentPaymentContext) (*SendResult, error) {
	emails, err := s.resolveNotificationRecipients(ctx, orgID, n)
	if err != nil {
		errMsg := err.Error()
		n.MarkFailed(errMsg)
		_ = s.notifications.Update(ctx, n)
		return &SendResult{FailedCount: 1, Errors: []string{errMsg}}, nil
	}

	subject, htmlBody, textBody := email.RenderRentPaymentNotification(string(notifType), n.Title, n.Message, ctxData)
	sendErr := s.mailer.Send(ctx, email.Message{
		To:       emails,
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
	})

	now := time.Now().UTC()
	if sendErr != nil {
		n.MarkFailed(sendErr.Error())
		_ = s.notifications.Update(ctx, n)
		return &SendResult{FailedCount: 1, Errors: []string{sendErr.Error()}}, nil
	}

	n.MarkSent(now)
	if err := s.notifications.Update(ctx, n); err != nil {
		return &SendResult{SentCount: len(emails), Recipients: emails}, err
	}
	return &SendResult{SentCount: len(emails), Recipients: emails}, nil
}

func rentNotificationContent(notifType domainnotif.Type, ctx email.RentPaymentContext) (string, string) {
	switch notifType {
	case domainnotif.TypePaymentDue:
		return "Recordatorio: arriendo vence en 3 días",
			fmt.Sprintf(
				"El pago de arriendo de %s (%s) por %s vence el %s. Quedan 3 días para la fecha de pago.",
				ctx.TenantName, ctx.PropertyName, ctx.Amount, ctx.DueDate,
			)
	case domainnotif.TypePaymentOverdue:
		return "Pago de arriendo vencido",
			fmt.Sprintf(
				"El pago de arriendo de %s (%s) por %s con vencimiento el %s no ha sido registrado. El pago está vencido.",
				ctx.TenantName, ctx.PropertyName, ctx.Amount, ctx.DueDate,
			)
	case domainnotif.TypeLateInterest:
		return "Pago vencido — se aplicarán multas",
			fmt.Sprintf(
				"El pago de arriendo de %s (%s) por %s con vencimiento el %s lleva más de 5 días sin pagarse. Se aplicarán multas por mora según el contrato.",
				ctx.TenantName, ctx.PropertyName, ctx.Amount, ctx.DueDate,
			)
	default:
		return "Notificación de arriendo", fmt.Sprintf("Pago pendiente: %s — %s", ctx.TenantName, ctx.Amount)
	}
}

func formatMoney(m shared.Money) string {
	currency := strings.TrimSpace(m.Currency)
	if currency == "" {
		currency = "CLP"
	}
	return fmt.Sprintf("$%s %s", formatAmount(m.Amount), currency)
}

func formatAmount(amount float64) string {
	s := fmt.Sprintf("%.0f", amount)
	var out strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out.WriteByte('.')
		}
		out.WriteRune(c)
	}
	return out.String()
}

func truncateDate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// StartBackgroundScheduler runs the email scheduler on startup and on a fixed interval for all active orgs.
func StartBackgroundScheduler(ctx context.Context, svc *Service, orgs *mongodb.OrgRepo, interval time.Duration) {
	run := func() {
		start := time.Now()
		runCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		orgIDs, err := orgs.ListActiveIDs(runCtx)
		if err != nil {
			metrics.RecordSchedulerRun("email", false, time.Since(start).Seconds())
			slog.Error("email scheduler: list organizations", "error", err)
			return
		}
		failed := false
		for _, orgID := range orgIDs {
			result, err := svc.RunScheduler(runCtx, orgID)
			if err != nil {
				failed = true
				slog.Error("email scheduler: run failed", "org_id", orgID, "error", err)
				continue
			}
			if result.Created > 0 || result.Failed > 0 {
				slog.Info("email scheduler: completed",
					"org_id", orgID,
					"created", result.Created,
					"sent", result.Sent,
					"skipped", result.Skipped,
					"failed", result.Failed,
				)
			}
		}
		metrics.RecordSchedulerRun("email", !failed, time.Since(start).Seconds())
	}

	go func() {
		run()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}
