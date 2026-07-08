package emailnotify

import (
	"context"
	"strings"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainlease "github.com/richard/my-rent-go/internal/domain/lease"
)

type SyncFromLeasesResult struct {
	Created        int `json:"created"`
	SkippedNoEmail int `json:"skipped_no_email"`
	AlreadyExists  int `json:"already_exists"`
	Skipped        int `json:"skipped"`
}

func leasePropertyIDs(l *domainlease.Lease) []string {
	ids := make([]string, 0, 3)
	seen := make(map[string]struct{}, 3)
	for _, id := range []string{l.PropertyID, l.WarehousePropertyID, l.ParkingPropertyID} {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

func (s *Service) SyncRecipientsFromLeases(ctx context.Context, orgID string) (*SyncFromLeasesResult, error) {
	result := &SyncFromLeasesResult{}
	leases, err := s.leases.ListActive(ctx, orgID)
	if err != nil {
		return nil, err
	}

	defaultTypes := make([]domainer.NotificationType, len(domainer.AllNotificationTypes))
	copy(defaultTypes, domainer.AllNotificationTypes)

	for i := range leases {
		l := &leases[i]
		tenant, err := s.tenants.FindByID(ctx, orgID, l.TenantID)
		if err != nil {
			return nil, err
		}
		if tenant == nil {
			result.Skipped++
			continue
		}
		email := strings.TrimSpace(tenant.Contact.Email)
		if email == "" {
			result.SkippedNoEmail++
			continue
		}
		tenantName := strings.TrimSpace(tenant.FullName())

		for _, propID := range leasePropertyIDs(l) {
			existing, err := s.recipients.FindByPropertyID(ctx, orgID, propID, "")
			if err != nil {
				return nil, err
			}
			if existing != nil {
				result.AlreadyExists++
				continue
			}

			prop, err := s.properties.FindByID(ctx, orgID, propID)
			if err != nil {
				return nil, err
			}
			if prop == nil {
				result.Skipped++
				continue
			}

			rec := domainer.NewEmailRecipient(orgID, email, tenantName, "", defaultTypes)
			rec.PropertyID = propID
			rec.TenantID = l.TenantID
			rec.Enabled = true

			if err := s.recipients.Create(ctx, rec); err != nil {
				return nil, err
			}
			result.Created++
		}
	}

	return result, nil
}
