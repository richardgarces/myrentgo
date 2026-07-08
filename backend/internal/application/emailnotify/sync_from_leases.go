package emailnotify

import (
	"context"
	"strings"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainlease "github.com/richard/my-rent-go/internal/domain/lease"
)

type SyncFromLeasesResult struct {
	Created        int `json:"created"`
	Updated        int `json:"updated"`
	SkippedNoEmail int `json:"skipped_no_email"`
	AlreadyExists  int `json:"already_exists"`
	Skipped        int `json:"skipped"`
}

func mergeMissingNotificationTypes(existing []domainer.NotificationType, defaults []domainer.NotificationType) ([]domainer.NotificationType, bool) {
	have := make(map[domainer.NotificationType]struct{}, len(existing))
	for _, t := range existing {
		have[t] = struct{}{}
	}
	merged := make([]domainer.NotificationType, len(existing))
	copy(merged, existing)
	changed := false
	for _, t := range defaults {
		if _, ok := have[t]; ok {
			continue
		}
		merged = append(merged, t)
		changed = true
	}
	return merged, changed
}

func (s *Service) ensurePropertyRecipientFromLease(ctx context.Context, orgID, propertyID string) (bool, error) {
	propertyID = strings.TrimSpace(propertyID)
	if propertyID == "" {
		return false, nil
	}

	defaultTypes := make([]domainer.NotificationType, len(domainer.AllNotificationTypes))
	copy(defaultTypes, domainer.AllNotificationTypes)

	existing, err := s.recipients.FindByPropertyID(ctx, orgID, propertyID, "")
	if err != nil {
		return false, err
	}
	if existing != nil {
		merged, changed := mergeMissingNotificationTypes(existing.NotificationTypes, defaultTypes)
		if !changed {
			return false, nil
		}
		existing.NotificationTypes = merged
		if err := s.recipients.Update(ctx, existing); err != nil {
			return false, err
		}
		return true, nil
	}

	info, err := s.ResolvePropertyLink(ctx, orgID, propertyID)
	if err != nil {
		return false, nil
	}

	rec := domainer.NewEmailRecipient(orgID, info.Email, info.TenantName, "", defaultTypes)
	rec.PropertyID = propertyID
	rec.TenantID = info.TenantID
	rec.Enabled = true
	if err := s.recipients.Create(ctx, rec); err != nil {
		return false, err
	}
	return true, nil
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
				merged, changed := mergeMissingNotificationTypes(existing.NotificationTypes, defaultTypes)
				if changed {
					existing.NotificationTypes = merged
					if err := s.recipients.Update(ctx, existing); err != nil {
						return nil, err
					}
					result.Updated++
				} else {
					result.AlreadyExists++
				}
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
