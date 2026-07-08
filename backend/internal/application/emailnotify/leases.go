package emailnotify

import (
	"context"
	"fmt"
	"strings"
	"time"

	domainlease "github.com/richard/my-rent-go/internal/domain/lease"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	domainsettings "github.com/richard/my-rent-go/internal/domain/notificationsettings"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
)

func (s *Service) processLeaseRules(ctx context.Context, orgID string, rule domainsettings.AutomationRule, triggerDay string, result *SchedulerResult) error {
	targetDate := truncateDate(time.Now().UTC()).AddDate(0, 0, -rule.DaysOffset)
	items, err := s.leases.ListActiveWithEndDateOn(ctx, orgID, targetDate)
	if err != nil {
		return err
	}
	result.CheckedLeases += len(items)
	for i := range items {
		l := &items[i]
		if err := s.processLeaseExpiringRule(ctx, orgID, l, rule, triggerDay, result); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, err.Error())
		}
	}
	return nil
}

func (s *Service) processLeaseExpiringRule(
	ctx context.Context,
	orgID string,
	l *domainlease.Lease,
	rule domainsettings.AutomationRule,
	triggerDay string,
	result *SchedulerResult,
) error {
	endDateKey := ""
	if l.EndDate != nil {
		endDateKey = l.EndDate.UTC().Format("2006-01-02")
	}
	exists, err := s.notifications.ExistsForLeaseEndDateTrigger(ctx, orgID, l.ID, endDateKey, triggerDay)
	if err != nil {
		return err
	}
	if exists {
		result.Skipped++
		result.Details = append(result.Details, SchedulerDetail{
			Action:       "skipped",
			Type:         string(rule.Type),
			LeaseID:      l.ID,
			TenantName:   "",
			PropertyName: "",
			Message:      "notificación ya registrada para este contrato y periodo",
		})
		return nil
	}

	ctxData, err := s.buildLeaseExpiringContext(ctx, orgID, l)
	if err != nil {
		return err
	}

	title, message := leaseExpiringNotificationContent(ctxData)
	now := time.Now().UTC()
	n := domainnotif.NewNotification(orgID, l.TenantID, title, message, rule.Type, domainnotif.ChannelEmail, now)
	n.LeaseID = l.ID
	n.Metadata = map[string]string{
		"lease_id":      l.ID,
		"trigger_day":   triggerDay,
		"property_id":   l.PropertyID,
		"end_date":      endDateKey,
		"tenant_name":   ctxData.TenantName,
		"property_name": ctxData.PropertyName,
	}
	if err := s.notifications.Create(ctx, n); err != nil {
		return err
	}
	result.Created++
	result.Details = append(result.Details, SchedulerDetail{
		Action:       "created",
		Type:         string(rule.Type),
		LeaseID:      l.ID,
		TenantName:   ctxData.TenantName,
		PropertyName: ctxData.PropertyName,
		Message:      title,
	})

	sendResult, err := s.sendLeaseExpiringNotification(ctx, orgID, n, ctxData)
	if sendResult != nil {
		result.Sent += sendResult.SentCount
		result.Failed += sendResult.FailedCount
		result.Errors = append(result.Errors, sendResult.Errors...)
		if sendResult.SentCount > 0 {
			result.Details = append(result.Details, SchedulerDetail{
				Action:       "sent",
				Type:         string(rule.Type),
				LeaseID:      l.ID,
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
				LeaseID:      l.ID,
				TenantName:   ctxData.TenantName,
				PropertyName: ctxData.PropertyName,
				Message:      errMsg,
			})
		}
	}
	return err
}

func (s *Service) buildLeaseExpiringContext(ctx context.Context, orgID string, l *domainlease.Lease) (email.LeaseExpiringContext, error) {
	ctxData := email.LeaseExpiringContext{}
	if l.EndDate != nil {
		ctxData.EndDate = l.EndDate.UTC().Format("02/01/2006")
	}
	if l.TenantID != "" {
		t, err := s.tenants.FindByID(ctx, orgID, l.TenantID)
		if err != nil {
			return ctxData, err
		}
		if t != nil {
			ctxData.TenantName = strings.TrimSpace(t.FullName())
		}
	}
	if l.PropertyID != "" {
		prop, err := s.properties.FindByID(ctx, orgID, l.PropertyID)
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

func (s *Service) sendLeaseExpiringNotification(ctx context.Context, orgID string, n *domainnotif.Notification, ctxData email.LeaseExpiringContext) (*SendResult, error) {
	emails, err := s.resolveNotificationRecipients(ctx, orgID, n)
	if err != nil {
		errMsg := err.Error()
		n.MarkFailed(errMsg)
		_ = s.notifications.Update(ctx, n)
		return &SendResult{FailedCount: 1, Errors: []string{errMsg}}, nil
	}

	subject, htmlBody, textBody := email.RenderLeaseExpiringNotification(n.Title, n.Message, ctxData)
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

func leaseExpiringNotificationContent(ctx email.LeaseExpiringContext) (string, string) {
	return "Contrato de arriendo por vencer",
		fmt.Sprintf(
			"El contrato de arriendo de %s en %s finaliza el %s (en 30 días). "+
				"Por favor confirme si desea continuar con el arriendo respondiendo a este correo.",
			ctx.TenantName, ctx.PropertyName, ctx.EndDate,
		)
}

func formatLeaseEndDateDisplay(isoDate string) string {
	if isoDate == "" {
		return ""
	}
	t, err := time.Parse("2006-01-02", isoDate)
	if err != nil {
		return isoDate
	}
	return t.Format("02/01/2006")
}
