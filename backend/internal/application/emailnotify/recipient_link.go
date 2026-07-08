package emailnotify

import (
	"context"
	"errors"
	"fmt"
	"strings"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainprop "github.com/richard/my-rent-go/internal/domain/property"
)

var (
	ErrPropertyNoActiveLease = errors.New("el departamento no tiene un arriendo activo")
	ErrTenantNoEmail         = errors.New("el arrendatario no tiene correo configurado")
	ErrPropertyAlreadyLinked = errors.New("ya existe un destinatario vinculado a este departamento")
	ErrPropertyNotRent       = errors.New("la propiedad debe tener finalidad de arriendo")
)

type PropertyLinkInfo struct {
	PropertyID   string
	TenantID     string
	PropertyName string
	TenantName   string
	Email        string
}

func (s *Service) ResolvePropertyLink(ctx context.Context, orgID, propertyID string) (*PropertyLinkInfo, error) {
	propertyID = strings.TrimSpace(propertyID)
	if propertyID == "" {
		return nil, fmt.Errorf("property_id requerido")
	}

	prop, err := s.properties.FindByID(ctx, orgID, propertyID)
	if err != nil {
		return nil, err
	}
	if prop == nil {
		return nil, fmt.Errorf("propiedad no encontrada")
	}
	if prop.Purpose != domainprop.PurposeRent {
		return nil, ErrPropertyNotRent
	}

	lease, err := s.leases.FindActiveByPropertyID(ctx, orgID, propertyID)
	if err != nil {
		return nil, err
	}
	if lease == nil {
		return nil, ErrPropertyNoActiveLease
	}

	tenant, err := s.tenants.FindByID(ctx, orgID, lease.TenantID)
	if err != nil {
		return nil, err
	}
	if tenant == nil {
		return nil, fmt.Errorf("arrendatario no encontrado")
	}

	email := strings.TrimSpace(tenant.Contact.Email)
	if email == "" {
		return nil, ErrTenantNoEmail
	}

	return &PropertyLinkInfo{
		PropertyID:   propertyID,
		TenantID:     lease.TenantID,
		PropertyName: prop.Name,
		TenantName:   strings.TrimSpace(tenant.FullName()),
		Email:        email,
	}, nil
}

func (s *Service) ApplyPropertyLink(ctx context.Context, orgID string, rec *domainer.EmailRecipient, propertyID string, excludeRecipientID string) error {
	propertyID = strings.TrimSpace(propertyID)
	if propertyID == "" {
		rec.PropertyID = ""
		rec.TenantID = ""
		return nil
	}

	existing, err := s.recipients.FindByPropertyID(ctx, orgID, propertyID, excludeRecipientID)
	if err != nil {
		return err
	}
	if existing != nil {
		return ErrPropertyAlreadyLinked
	}

	info, err := s.ResolvePropertyLink(ctx, orgID, propertyID)
	if err != nil {
		return err
	}

	rec.PropertyID = info.PropertyID
	rec.TenantID = info.TenantID
	rec.Name = info.TenantName
	rec.Email = info.Email
	return nil
}

func (s *Service) ResolveRecipientEmail(ctx context.Context, orgID string, rec *domainer.EmailRecipient) (string, error) {
	if rec == nil {
		return "", fmt.Errorf("recipient not found")
	}
	if rec.IsPropertyLinked() {
		info, err := s.ResolvePropertyLink(ctx, orgID, rec.PropertyID)
		if err != nil {
			if errors.Is(err, ErrTenantNoEmail) || errors.Is(err, ErrPropertyNoActiveLease) {
				return "", ErrTenantNoEmail
			}
			return "", err
		}
		return info.Email, nil
	}
	email := strings.TrimSpace(rec.Email)
	if email == "" {
		return "", fmt.Errorf("no hay dirección de correo configurada")
	}
	return email, nil
}

func (s *Service) RefreshPropertyLinkedSnapshot(ctx context.Context, orgID string, rec *domainer.EmailRecipient) error {
	if !rec.IsPropertyLinked() {
		return nil
	}
	info, err := s.ResolvePropertyLink(ctx, orgID, rec.PropertyID)
	if err != nil {
		return err
	}
	rec.TenantID = info.TenantID
	rec.Name = info.TenantName
	rec.Email = info.Email
	return nil
}
