package emailnotify

import (
	"context"
	"fmt"
	"strings"
	"time"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainmaint "github.com/richard/my-rent-go/internal/domain/maintenance"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	domainsettings "github.com/richard/my-rent-go/internal/domain/notificationsettings"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
)

var activeMaintenanceStatuses = []domainmaint.Status{
	domainmaint.StatusScheduled,
	domainmaint.StatusInProgress,
}

type MaintenanceNotifyResult struct {
	Created int               `json:"created"`
	Sent    int               `json:"sent"`
	Skipped int               `json:"skipped"`
	Failed  int               `json:"failed"`
	Errors  []string          `json:"errors,omitempty"`
	Details []SchedulerDetail `json:"details,omitempty"`
}

func (s *Service) SendMaintenanceNotification(ctx context.Context, orgID, maintenanceID string) (*MaintenanceNotifyResult, error) {
	m, err := s.maintenance.FindByID(ctx, orgID, maintenanceID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, fmt.Errorf("maintenance not found")
	}
	if m.Status != domainmaint.StatusScheduled && m.Status != domainmaint.StatusInProgress {
		return nil, fmt.Errorf("maintenance status must be scheduled or in_progress")
	}

	result := &MaintenanceNotifyResult{}
	if err := s.processMaintenanceManual(ctx, orgID, m, result); err != nil {
		result.Failed++
		result.Errors = append(result.Errors, err.Error())
	}
	return result, nil
}

func (s *Service) SendMaintenanceNotificationsBulk(ctx context.Context, orgID string, maintenanceIDs []string) (*MaintenanceNotifyResult, error) {
	result := &MaintenanceNotifyResult{}
	var items []domainmaint.Maintenance
	var err error

	if len(maintenanceIDs) > 0 {
		for _, id := range maintenanceIDs {
			m, findErr := s.maintenance.FindByID(ctx, orgID, id)
			if findErr != nil {
				result.Failed++
				result.Errors = append(result.Errors, findErr.Error())
				continue
			}
			if m == nil {
				result.Failed++
				result.Errors = append(result.Errors, fmt.Sprintf("maintenance not found: %s", id))
				continue
			}
			items = append(items, *m)
		}
	} else {
		items, err = s.maintenance.ListUpcoming(ctx, orgID, activeMaintenanceStatuses)
		if err != nil {
			return nil, err
		}
	}

	for i := range items {
		m := &items[i]
		if m.Status != domainmaint.StatusScheduled && m.Status != domainmaint.StatusInProgress {
			result.Skipped++
			continue
		}
		if err := s.processMaintenanceManual(ctx, orgID, m, result); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, err.Error())
		}
	}
	return result, nil
}

func (s *Service) processMaintenanceManual(ctx context.Context, orgID string, m *domainmaint.Maintenance, result *MaintenanceNotifyResult) error {
	rule := domainsettings.AutomationRule{
		Type:       domainnotif.TypeMaintenanceDue,
		DaysOffset: daysUntilScheduled(m.ScheduledDate),
	}
	return s.processMaintenanceForResult(ctx, orgID, m, rule, "manual", result, true)
}

func (s *Service) processMaintenanceRules(ctx context.Context, orgID string, rule domainsettings.AutomationRule, triggerDay string, result *SchedulerResult) error {
	targetDate := truncateDate(time.Now().UTC()).AddDate(0, 0, -rule.DaysOffset)
	items, err := s.maintenance.ListForScheduledDate(ctx, orgID, targetDate, activeMaintenanceStatuses)
	if err != nil {
		return err
	}
	result.CheckedMaintenance += len(items)
	for i := range items {
		m := &items[i]
		if err := s.processMaintenanceForScheduler(ctx, orgID, m, rule, triggerDay, result); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, err.Error())
		}
	}
	return nil
}

func (s *Service) processMaintenanceForScheduler(
	ctx context.Context,
	orgID string,
	m *domainmaint.Maintenance,
	rule domainsettings.AutomationRule,
	triggerDay string,
	result *SchedulerResult,
) error {
	exists, err := s.notifications.ExistsForMaintenanceTrigger(ctx, orgID, m.ID, rule.Type, triggerDay)
	if err != nil {
		return err
	}
	if exists {
		result.Skipped++
		result.Details = append(result.Details, SchedulerDetail{
			Action:           "skipped",
			Type:             string(rule.Type),
			MaintenanceID:    m.ID,
			MaintenanceTitle: m.Title,
			Message:          "notificación ya registrada para esta mantención y regla",
		})
		return nil
	}

	ctxData, err := s.buildMaintenanceContext(ctx, orgID, m)
	if err != nil {
		return err
	}

	title, message := maintenanceNotificationContent(rule.DaysOffset, ctxData)
	now := time.Now().UTC()
	n := domainnotif.NewNotification(orgID, "", title, message, rule.Type, domainnotif.ChannelEmail, now)
	n.Metadata = maintenanceMetadata(m, ctxData, triggerDay)
	if err := s.notifications.Create(ctx, n); err != nil {
		return err
	}
	result.Created++
	result.Details = append(result.Details, SchedulerDetail{
		Action:           "created",
		Type:             string(rule.Type),
		MaintenanceID:    m.ID,
		MaintenanceTitle: m.Title,
		PropertyName:     ctxData.PropertyName,
		Message:          title,
	})

	return s.finishMaintenanceSend(ctx, orgID, n, ctxData, m, rule, result)
}

func (s *Service) processMaintenanceForResult(
	ctx context.Context,
	orgID string,
	m *domainmaint.Maintenance,
	rule domainsettings.AutomationRule,
	triggerDay string,
	result *MaintenanceNotifyResult,
	skipDedup bool,
) error {
	if !skipDedup {
		exists, err := s.notifications.ExistsForMaintenanceTrigger(ctx, orgID, m.ID, rule.Type, triggerDay)
		if err != nil {
			return err
		}
		if exists {
			result.Skipped++
			result.Details = append(result.Details, SchedulerDetail{
				Action:           "skipped",
				Type:             string(rule.Type),
				MaintenanceID:    m.ID,
				MaintenanceTitle: m.Title,
				Message:          "notificación ya registrada para esta mantención y regla",
			})
			return nil
		}
	}

	ctxData, err := s.buildMaintenanceContext(ctx, orgID, m)
	if err != nil {
		return err
	}

	title, message := maintenanceNotificationContent(rule.DaysOffset, ctxData)
	now := time.Now().UTC()
	n := domainnotif.NewNotification(orgID, "", title, message, rule.Type, domainnotif.ChannelEmail, now)
	n.Metadata = maintenanceMetadata(m, ctxData, triggerDay)
	if err := s.notifications.Create(ctx, n); err != nil {
		return err
	}
	result.Created++
	result.Details = append(result.Details, SchedulerDetail{
		Action:           "created",
		Type:             string(rule.Type),
		MaintenanceID:    m.ID,
		MaintenanceTitle: m.Title,
		PropertyName:     ctxData.PropertyName,
		Message:          title,
	})

	sendResult, err := s.sendMaintenanceNotification(ctx, orgID, n, ctxData)
	if sendResult != nil {
		result.Sent += sendResult.SentCount
		result.Failed += sendResult.FailedCount
		result.Errors = append(result.Errors, sendResult.Errors...)
		if sendResult.SentCount > 0 {
			result.Details = append(result.Details, SchedulerDetail{
				Action:           "sent",
				Type:             string(rule.Type),
				MaintenanceID:    m.ID,
				MaintenanceTitle: m.Title,
				PropertyName:     ctxData.PropertyName,
				Message:          fmt.Sprintf("enviada a %d destinatario(s)", sendResult.SentCount),
			})
		}
		if sendResult.FailedCount > 0 {
			errMsg := "envío fallido"
			if len(sendResult.Errors) > 0 {
				errMsg = sendResult.Errors[0]
			}
			result.Details = append(result.Details, SchedulerDetail{
				Action:           "failed",
				Type:             string(rule.Type),
				MaintenanceID:    m.ID,
				MaintenanceTitle: m.Title,
				PropertyName:     ctxData.PropertyName,
				Message:          errMsg,
			})
		}
	}
	return err
}

func (s *Service) finishMaintenanceSend(
	ctx context.Context,
	orgID string,
	n *domainnotif.Notification,
	ctxData email.MaintenanceContext,
	m *domainmaint.Maintenance,
	rule domainsettings.AutomationRule,
	result *SchedulerResult,
) error {
	sendResult, err := s.sendMaintenanceNotification(ctx, orgID, n, ctxData)
	if sendResult != nil {
		result.Sent += sendResult.SentCount
		result.Failed += sendResult.FailedCount
		result.Errors = append(result.Errors, sendResult.Errors...)
		if sendResult.SentCount > 0 {
			result.Details = append(result.Details, SchedulerDetail{
				Action:           "sent",
				Type:             string(rule.Type),
				MaintenanceID:    m.ID,
				MaintenanceTitle: m.Title,
				PropertyName:     ctxData.PropertyName,
				Message:          fmt.Sprintf("enviada a %d destinatario(s)", sendResult.SentCount),
			})
		}
		if sendResult.FailedCount > 0 {
			errMsg := "envío fallido"
			if len(sendResult.Errors) > 0 {
				errMsg = sendResult.Errors[0]
			}
			result.Details = append(result.Details, SchedulerDetail{
				Action:           "failed",
				Type:             string(rule.Type),
				MaintenanceID:    m.ID,
				MaintenanceTitle: m.Title,
				PropertyName:     ctxData.PropertyName,
				Message:          errMsg,
			})
		}
	}
	return err
}

func maintenanceMetadata(m *domainmaint.Maintenance, ctxData email.MaintenanceContext, triggerDay string) map[string]string {
	return map[string]string{
		"maintenance_id":    m.ID,
		"trigger_day":       triggerDay,
		"property_id":       m.PropertyID,
		"property_name":     ctxData.PropertyName,
		"maintenance_title": ctxData.Title,
		"maintenance_type":  string(m.Type),
		"scheduled_date":    ctxData.ScheduledDate,
		"cost":              ctxData.Cost,
	}
}

func (s *Service) buildMaintenanceContext(ctx context.Context, orgID string, m *domainmaint.Maintenance) (email.MaintenanceContext, error) {
	ctxData := email.MaintenanceContext{
		Title:         m.Title,
		TypeLabel:     email.MaintenanceTypeLabel(string(m.Type)),
		ScheduledDate: m.ScheduledDate.UTC().Format("02/01/2006"),
		Cost:          formatMoney(m.Cost),
	}
	if m.PropertyID != "" {
		prop, err := s.properties.FindByID(ctx, orgID, m.PropertyID)
		if err != nil {
			return ctxData, err
		}
		if prop != nil {
			ctxData.PropertyName = prop.Name
		}
	}
	if ctxData.PropertyName == "" {
		ctxData.PropertyName = "Propiedad"
	}
	return ctxData, nil
}

func (s *Service) sendMaintenanceNotification(ctx context.Context, orgID string, n *domainnotif.Notification, ctxData email.MaintenanceContext) (*SendResult, error) {
	recs, err := s.recipients.ListEnabledForType(ctx, orgID, domainer.TypeMaintenanceDue)
	if err != nil {
		return nil, err
	}
	if len(recs) == 0 {
		n.Status = domainnotif.StatusFailed
		_ = s.notifications.Update(ctx, n)
		return &SendResult{FailedCount: 1, Errors: []string{"no enabled recipients for type maintenance_due"}}, nil
	}

	emails := make([]string, 0, len(recs))
	for _, r := range recs {
		if addr := strings.TrimSpace(r.Email); addr != "" {
			emails = append(emails, addr)
		}
	}
	if len(emails) == 0 {
		return nil, fmt.Errorf("no valid email addresses configured")
	}

	subject, htmlBody, textBody := email.RenderMaintenanceNotification(n.Title, n.Message, ctxData)
	sendErr := s.mailer.Send(ctx, email.Message{
		To:       emails,
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
	})

	now := time.Now().UTC()
	if sendErr != nil {
		n.Status = domainnotif.StatusFailed
		n.SentAt = nil
		_ = s.notifications.Update(ctx, n)
		return &SendResult{FailedCount: 1, Errors: []string{sendErr.Error()}}, nil
	}

	n.Status = domainnotif.StatusSent
	n.SentAt = &now
	if err := s.notifications.Update(ctx, n); err != nil {
		return &SendResult{SentCount: len(emails), Recipients: emails}, err
	}
	return &SendResult{SentCount: len(emails), Recipients: emails}, nil
}

func maintenanceNotificationContent(daysOffset int, ctx email.MaintenanceContext) (string, string) {
	switch {
	case daysOffset == 0:
		return "Mantención programada para hoy",
			fmt.Sprintf(
				"La mantención «%s» en %s (%s) está programada para hoy (%s). Costo estimado: %s.",
				ctx.Title, ctx.PropertyName, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost,
			)
	case daysOffset == -1:
		return "Recordatorio: mantención mañana",
			fmt.Sprintf(
				"La mantención «%s» en %s (%s) está programada para mañana (%s). Costo estimado: %s.",
				ctx.Title, ctx.PropertyName, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost,
			)
	case daysOffset == -7:
		return "Recordatorio: mantención en 7 días",
			fmt.Sprintf(
				"La mantención «%s» en %s (%s) está programada para el %s (en 7 días). Costo estimado: %s.",
				ctx.Title, ctx.PropertyName, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost,
			)
	default:
		days := -daysOffset
		if days > 0 {
			return fmt.Sprintf("Recordatorio: mantención en %d días", days),
				fmt.Sprintf(
					"La mantención «%s» en %s (%s) está programada para el %s. Costo estimado: %s.",
					ctx.Title, ctx.PropertyName, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost,
				)
		}
		return "Recordatorio de mantención",
			fmt.Sprintf(
				"La mantención «%s» en %s (%s) está programada para el %s. Costo estimado: %s.",
				ctx.Title, ctx.PropertyName, ctx.TypeLabel, ctx.ScheduledDate, ctx.Cost,
			)
	}
}

func daysUntilScheduled(scheduled time.Time) int {
	today := truncateDate(time.Now().UTC())
	target := truncateDate(scheduled.UTC())
	return int(target.Sub(today).Hours() / 24)
}
