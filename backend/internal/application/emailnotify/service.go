package emailnotify

import (
	"context"
	"fmt"
	"strings"
	"time"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
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

func (s *Service) SendTest(ctx context.Context, orgID, recipientID, emailAddr string) (*SendResult, error) {
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
		to = rec.Email
	} else if emailAddr != "" {
		to = strings.TrimSpace(emailAddr)
	} else {
		return nil, fmt.Errorf("recipient_id or email required")
	}
	if to == "" {
		return nil, fmt.Errorf("no email address")
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
	if n.Status != domainnotif.StatusPending {
		return nil, fmt.Errorf("notification is not pending")
	}
	return s.sendOne(ctx, orgID, n)
}

func (s *Service) sendOne(ctx context.Context, orgID string, n *domainnotif.Notification) (*SendResult, error) {
	recs, err := s.recipients.ListEnabledForType(ctx, orgID, domainer.NotificationType(n.Type))
	if err != nil {
		return nil, err
	}
	if len(recs) == 0 {
		return nil, fmt.Errorf("no enabled recipients for type %s", n.Type)
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
		return &SendResult{FailedCount: 1, Errors: []string{sendErr.Error()}}, sendErr
	}

	n.Status = domainnotif.StatusSent
	n.SentAt = &now
	if err := s.notifications.Update(ctx, n); err != nil {
		return &SendResult{SentCount: len(emails), Recipients: emails}, err
	}
	return &SendResult{SentCount: len(emails), Recipients: emails}, nil
}
