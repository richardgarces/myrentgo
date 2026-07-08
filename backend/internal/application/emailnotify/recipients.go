package emailnotify

import (
	"context"
	"fmt"
	"strings"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
)

type notificationContext struct {
	propertyID string
	tenantID   string
}

func notificationContextFrom(n *domainnotif.Notification) notificationContext {
	ctx := notificationContext{tenantID: n.TenantID}
	if n.Metadata != nil {
		ctx.propertyID = n.Metadata["property_id"]
	}
	return ctx
}

func isTenantLinkedType(t domainnotif.Type) bool {
	switch t {
	case domainnotif.TypePaymentDue, domainnotif.TypePaymentOverdue, domainnotif.TypeLateInterest, domainnotif.TypeLeaseExpiring:
		return true
	default:
		return false
	}
}

func usesTenantRecipient(n *domainnotif.Notification) bool {
	if n.Type == domainnotif.TypeMaintenanceDue {
		return false
	}
	return n.TenantID != "" || n.Metadata["property_id"] != "" || isTenantLinkedType(n.Type)
}

func recipientMatchesNotification(rec *domainer.EmailRecipient, ctx notificationContext) bool {
	if !rec.IsPropertyLinked() {
		return true
	}
	if ctx.propertyID != "" && rec.PropertyID == ctx.propertyID {
		return true
	}
	if ctx.tenantID != "" && rec.TenantID != "" && rec.TenantID == ctx.tenantID {
		return true
	}
	return false
}

func dedupeEmails(addrs []string) []string {
	seen := make(map[string]struct{}, len(addrs))
	out := make([]string, 0, len(addrs))
	for _, a := range addrs {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		key := strings.ToLower(a)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, a)
	}
	return out
}

func (s *Service) tenantEmail(ctx context.Context, orgID, tenantID string) (string, error) {
	if tenantID == "" {
		return "", nil
	}
	t, err := s.tenants.FindByID(ctx, orgID, tenantID)
	if err != nil {
		return "", err
	}
	if t == nil {
		return "", nil
	}
	return strings.TrimSpace(t.Contact.Email), nil
}

func (s *Service) recipientEmailsForNotification(
	ctx context.Context,
	orgID string,
	notifType domainer.NotificationType,
	n *domainnotif.Notification,
) ([]string, error) {
	recs, err := s.recipients.ListEnabledForType(ctx, orgID, notifType)
	if err != nil {
		return nil, err
	}

	notifCtx := notificationContextFrom(n)
	emails := make([]string, 0, len(recs))
	for i := range recs {
		rec := &recs[i]
		if !recipientMatchesNotification(rec, notifCtx) {
			continue
		}
		addr, err := s.ResolveRecipientEmail(ctx, orgID, rec)
		if err != nil {
			if rec.IsPropertyLinked() && err == ErrTenantNoEmail {
				continue
			}
			return nil, err
		}
		if addr != "" {
			emails = append(emails, addr)
		}
	}
	return dedupeEmails(emails), nil
}

func (s *Service) resolveNotificationRecipients(ctx context.Context, orgID string, n *domainnotif.Notification) ([]string, error) {
	notifType := domainer.NotificationType(n.Type)

	if n.Type == domainnotif.TypeMaintenanceDue {
		emails, err := s.recipientEmailsForNotification(ctx, orgID, notifType, n)
		if err != nil {
			return nil, err
		}
		if len(emails) == 0 {
			return nil, s.maintenanceRecipientsError(ctx, orgID, n, notifType)
		}
		return emails, nil
	}

	if usesTenantRecipient(n) {
		emails, err := s.recipientEmailsForNotification(ctx, orgID, notifType, n)
		if err != nil {
			return nil, err
		}
		if len(emails) == 0 {
			return nil, fmt.Errorf("%s", ErrNoTenantOrInternalRecipients())
		}
		return emails, nil
	}

	emails, err := s.recipientEmailsForNotification(ctx, orgID, notifType, n)
	if err != nil {
		return nil, err
	}
	if len(emails) == 0 {
		return nil, fmt.Errorf("%s", ErrNoRecipients(n.Type))
	}
	return emails, nil
}

func (s *Service) maintenanceRecipientsError(
	ctx context.Context,
	orgID string,
	n *domainnotif.Notification,
	notifType domainer.NotificationType,
) error {
	recs, err := s.recipients.ListEnabledForType(ctx, orgID, notifType)
	if err != nil {
		return err
	}
	if len(recs) == 0 {
		return fmt.Errorf("%s", ErrNoRecipientsFor(notifType))
	}

	notifCtx := notificationContextFrom(n)
	propertyName := ""
	if n.Metadata != nil {
		propertyName = n.Metadata["property_name"]
	}

	hasGlobal := false
	hasMatching := false
	for i := range recs {
		rec := &recs[i]
		if !rec.IsPropertyLinked() {
			hasGlobal = true
			continue
		}
		if recipientMatchesNotification(rec, notifCtx) {
			hasMatching = true
		}
	}

	if notifCtx.propertyID != "" && !hasMatching && !hasGlobal {
		return fmt.Errorf("%s", ErrNoPropertyRecipientsFor(propertyName, notifType))
	}
	if notifCtx.propertyID != "" && hasMatching && !hasGlobal {
		return fmt.Errorf("%s", ErrPropertyTenantNoEmail(propertyName))
	}
	return fmt.Errorf("%s", ErrNoValidEmails())
}
