package emailnotify

import (
	"context"
	"fmt"
	"strings"
	"time"

	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
)

type Service struct {
	mailer        *email.Client
	recipients    *mongodb.EmailRecipientRepo
	notifications *mongodb.NotificationRepo
	settings      *mongodb.NotificationSettingsRepo
	payments      *mongodb.PaymentRepo
	maintenance   *mongodb.MaintenanceRepo
	tenants       *mongodb.TenantRepo
	properties    *mongodb.PropertyRepo
	leases        *mongodb.LeaseRepo
}

func NewService(
	mailer *email.Client,
	recipients *mongodb.EmailRecipientRepo,
	notifications *mongodb.NotificationRepo,
	settings *mongodb.NotificationSettingsRepo,
	payments *mongodb.PaymentRepo,
	maintenance *mongodb.MaintenanceRepo,
	tenants *mongodb.TenantRepo,
	properties *mongodb.PropertyRepo,
	leases *mongodb.LeaseRepo,
) *Service {
	return &Service{
		mailer:        mailer,
		recipients:    recipients,
		notifications: notifications,
		settings:      settings,
		payments:      payments,
		maintenance:   maintenance,
		tenants:       tenants,
		properties:    properties,
		leases:        leases,
	}
}

func (s *Service) SMTPConfigured() bool {
	return s.mailer.Configured()
}

type SendResult struct {
	SentCount   int      `json:"sent_count"`
	FailedCount int      `json:"failed_count"`
	Recipients  []string `json:"recipients,omitempty"`
	Errors      []string `json:"errors,omitempty"`
}

func (s *Service) SendTest(ctx context.Context, orgID, recipientID, emailAddr string, allFormats bool) (*SendResult, error) {
	var name, to string
	if recipientID != "" {
		rec, err := s.recipients.FindByID(ctx, orgID, recipientID)
		if err != nil {
			return nil, err
		}
		if rec == nil {
			return nil, fmt.Errorf("recipient not found")
		}
		name = rec.Name
		to, err = s.ResolveRecipientEmail(ctx, orgID, rec)
		if err != nil {
			return nil, err
		}
	} else if emailAddr != "" {
		to = strings.TrimSpace(emailAddr)
	} else {
		return nil, fmt.Errorf("recipient_id or email required")
	}
	if to == "" {
		return nil, fmt.Errorf("no email address")
	}

	if allFormats {
		return s.sendTestAllFormats(ctx, to)
	}

	subject, htmlBody, textBody := email.RenderTestEmail(name)
	if err := s.mailer.Send(ctx, email.Message{
		To:       []string{to},
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
	}); err != nil {
		return &SendResult{FailedCount: 1, Errors: []string{err.Error()}}, err
	}
	return &SendResult{SentCount: 1, Recipients: []string{to}}, nil
}

func (s *Service) sendTestAllFormats(ctx context.Context, to string) (*SendResult, error) {
	result := &SendResult{Recipients: []string{to}}
	for _, sample := range email.RenderTestNotificationSamples() {
		label := NotificationTypeLabel(sample.Type)
		subject := fmt.Sprintf("[Prueba] %s — %s", label, sample.Subject)
		if err := s.mailer.Send(ctx, email.Message{
			To:       []string{to},
			Subject:  subject,
			HTMLBody: sample.HTML,
			TextBody: sample.Text,
		}); err != nil {
			result.FailedCount++
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %s", label, err.Error()))
			continue
		}
		result.SentCount++
	}
	if result.SentCount == 0 && result.FailedCount > 0 {
		return result, fmt.Errorf("no se pudo enviar ningún correo de prueba")
	}
	return result, nil
}

func (s *Service) SendPending(ctx context.Context, orgID string) (*SendResult, error) {
	items, err := s.notifications.ListPendingEmail(ctx, orgID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	result := &SendResult{}
	for i := range items {
		r, err := s.sendOne(ctx, orgID, &items[i])
		if err != nil {
			result.FailedCount++
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		result.SentCount += r.SentCount
		result.Recipients = append(result.Recipients, r.Recipients...)
	}
	return result, nil
}

func (s *Service) SendNotification(ctx context.Context, orgID, notificationID string) (*SendResult, error) {
	n, err := s.notifications.FindByID(ctx, orgID, notificationID)
	if err != nil {
		return nil, err
	}
	if n == nil {
		return nil, fmt.Errorf("notification not found")
	}
	if n.Channel != domainnotif.ChannelEmail {
		return nil, fmt.Errorf("notification channel is not email")
	}
	if n.Status != domainnotif.StatusPending && n.Status != domainnotif.StatusFailed {
		return nil, fmt.Errorf("notification cannot be sent")
	}
	return s.sendOne(ctx, orgID, n)
}

func (s *Service) sendOne(ctx context.Context, orgID string, n *domainnotif.Notification) (*SendResult, error) {
	emails, err := s.resolveNotificationRecipients(ctx, orgID, n)
	if err != nil {
		errMsg := err.Error()
		n.MarkFailed(errMsg)
		_ = s.notifications.Update(ctx, n)
		return &SendResult{FailedCount: 1, Errors: []string{errMsg}}, err
	}

	subject, htmlBody, textBody := email.RenderNotification(n.Title, n.Title, n.Message, string(n.Type))
	if n.Type == domainnotif.TypeMaintenanceDue {
		ctxData := email.MaintenanceContext{
			PropertyName:  n.Metadata["property_name"],
			Title:         n.Metadata["maintenance_title"],
			TypeLabel:     email.MaintenanceTypeLabel(n.Metadata["maintenance_type"]),
			ScheduledDate: n.Metadata["scheduled_date"],
			Cost:          n.Metadata["cost"],
		}
		subject, htmlBody, textBody = email.RenderMaintenanceNotification(n.Title, n.Message, ctxData)
	}
	if n.Type == domainnotif.TypeLeaseExpiring {
		ctxData := email.LeaseExpiringContext{
			TenantName:   n.Metadata["tenant_name"],
			PropertyName: n.Metadata["property_name"],
			EndDate:      formatLeaseEndDateDisplay(n.Metadata["end_date"]),
		}
		subject, htmlBody, textBody = email.RenderLeaseExpiringNotification(n.Title, n.Message, ctxData)
	}
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
		return &SendResult{FailedCount: 1, Errors: []string{sendErr.Error()}}, sendErr
	}

	n.MarkSent(now)
	if err := s.notifications.Update(ctx, n); err != nil {
		return &SendResult{SentCount: len(emails), Recipients: emails}, err
	}
	return &SendResult{SentCount: len(emails), Recipients: emails}, nil
}
