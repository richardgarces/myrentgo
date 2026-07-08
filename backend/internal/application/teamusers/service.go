package teamusers

import (
	"context"
	"errors"
	"strings"

	domain "github.com/richard/my-rent-go/internal/domain/user"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrEmailExists       = errors.New("email already exists in organization")
	ErrUserNotFound      = errors.New("user not found")
	ErrInvalidRole       = errors.New("invalid role")
	ErrForbiddenRole     = errors.New("insufficient permissions for this role")
	ErrLastOwner         = errors.New("cannot remove or demote the last owner")
	ErrSelfModification  = errors.New("cannot modify your own account")
	ErrUserInactive      = errors.New("user is inactive")
)

type Member struct {
	ID            string      `json:"id"`
	Email         string      `json:"email"`
	FirstName     string      `json:"first_name"`
	LastName      string      `json:"last_name"`
	Phone         string      `json:"phone,omitempty"`
	Active        bool        `json:"active"`
	EmailVerified bool        `json:"email_verified"`
	Role          domain.Role `json:"role"`
}

type Repository interface {
	Create(ctx context.Context, u *domain.User) error
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
	Update(ctx context.Context, u *domain.User) error
	ListByOrganization(ctx context.Context, orgID string, page, limit int) ([]domain.User, int64, error)
	CountOwnersInOrg(ctx context.Context, orgID string) (int64, error)
}

type CreateCommand struct {
	OrganizationID string
	ActorID        string
	ActorRole      domain.Role
	Email          string
	Password       string
	FirstName      string
	LastName       string
	Role           domain.Role
}

type UpdateCommand struct {
	OrganizationID string
	ActorID        string
	ActorRole      domain.Role
	UserID         string
	FirstName      *string
	LastName       *string
	Role           *domain.Role
	Active         *bool
	Password       *string
}

type RemoveCommand struct {
	OrganizationID string
	ActorID        string
	ActorRole      domain.Role
	UserID         string
}

type Service struct {
	users      Repository
	invites    InviteSender
	bcryptCost int
}

type InviteSender interface {
	SendInvite(ctx context.Context, userID, createdBy string) error
}

func NewService(users Repository, bcryptCost int) *Service {
	return &Service{users: users, bcryptCost: bcryptCost}
}

func (s *Service) SetInviteSender(invites InviteSender) {
	s.invites = invites
}

func (s *Service) List(ctx context.Context, orgID string, page, limit int) ([]Member, int64, error) {
	users, total, err := s.users.ListByOrganization(ctx, orgID, page, limit)
	if err != nil {
		return nil, 0, err
	}
	items := make([]Member, 0, len(users))
	for _, u := range users {
		role, ok := u.OrgRole(orgID)
		if !ok {
			continue
		}
		items = append(items, toMember(u, role))
	}
	return items, total, nil
}

func (s *Service) Create(ctx context.Context, cmd CreateCommand) (*Member, error) {
	if !domain.CanManageUsers(cmd.ActorRole) {
		return nil, ErrForbiddenRole
	}
	email := strings.TrimSpace(strings.ToLower(cmd.Email))
	if email == "" || strings.TrimSpace(cmd.FirstName) == "" || strings.TrimSpace(cmd.LastName) == "" {
		return nil, errors.New("email, first name and last name are required")
	}
	if len(cmd.Password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}
	role := cmd.Role
	if role == "" {
		role = domain.RoleViewer
	}
	if !domain.IsValidRole(role) {
		return nil, ErrInvalidRole
	}
	if err := s.validateRoleAssignment(cmd.ActorRole, role); err != nil {
		return nil, err
	}

	existing, err := s.users.FindByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if existing.BelongsToOrg(cmd.OrganizationID) {
			return nil, ErrEmailExists
		}
		existing.SetOrgRole(cmd.OrganizationID, role)
		if !existing.Active {
			existing.Active = true
		}
		if err := s.users.Update(ctx, existing); err != nil {
			return nil, err
		}
		return ptr(toMember(*existing, role)), nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cmd.Password), s.bcryptCost)
	if err != nil {
		return nil, err
	}
	u := domain.NewUser(email, strings.TrimSpace(cmd.FirstName), strings.TrimSpace(cmd.LastName))
	u.EmailVerified = false
	u.PasswordHash = string(hash)
	u.Organizations = []domain.UserOrg{{OrganizationID: cmd.OrganizationID, Role: role}}
	if err := s.users.Create(ctx, u); err != nil {
		return nil, err
	}
	if s.invites != nil {
		_ = s.invites.SendInvite(ctx, u.ID, cmd.ActorID)
	}
	return ptr(toMember(*u, role)), nil
}

func (s *Service) Update(ctx context.Context, cmd UpdateCommand) (*Member, error) {
	if !domain.CanManageUsers(cmd.ActorRole) {
		return nil, ErrForbiddenRole
	}
	if cmd.UserID == cmd.ActorID {
		return nil, ErrSelfModification
	}

	u, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return nil, err
	}
	if u == nil || !u.BelongsToOrg(cmd.OrganizationID) {
		return nil, ErrUserNotFound
	}

	currentRole, _ := u.OrgRole(cmd.OrganizationID)
	newRole := currentRole
	if cmd.Role != nil {
		newRole = *cmd.Role
		if !domain.IsValidRole(newRole) {
			return nil, ErrInvalidRole
		}
		if err := s.validateRoleAssignment(cmd.ActorRole, newRole); err != nil {
			return nil, err
		}
		if cmd.ActorRole == domain.RoleAdmin && currentRole == domain.RoleOwner {
			return nil, ErrForbiddenRole
		}
		if currentRole == domain.RoleOwner && newRole != domain.RoleOwner {
			if err := s.ensureNotLastOwner(ctx, cmd.OrganizationID); err != nil {
				return nil, err
			}
		}
		u.SetOrgRole(cmd.OrganizationID, newRole)
	}

	if cmd.FirstName != nil {
		u.FirstName = strings.TrimSpace(*cmd.FirstName)
	}
	if cmd.LastName != nil {
		u.LastName = strings.TrimSpace(*cmd.LastName)
	}
	if cmd.Active != nil {
		if !*cmd.Active && currentRole == domain.RoleOwner {
			if err := s.ensureNotLastOwner(ctx, cmd.OrganizationID); err != nil {
				return nil, err
			}
		}
		u.Active = *cmd.Active
	}
	if cmd.Password != nil && strings.TrimSpace(*cmd.Password) != "" {
		if len(*cmd.Password) < 8 {
			return nil, errors.New("password must be at least 8 characters")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(*cmd.Password), s.bcryptCost)
		if err != nil {
			return nil, err
		}
		u.PasswordHash = string(hash)
	}

	if err := s.users.Update(ctx, u); err != nil {
		return nil, err
	}
	role, _ := u.OrgRole(cmd.OrganizationID)
	return ptr(toMember(*u, role)), nil
}

func (s *Service) Remove(ctx context.Context, cmd RemoveCommand) error {
	if !domain.CanManageUsers(cmd.ActorRole) {
		return ErrForbiddenRole
	}
	if cmd.UserID == cmd.ActorID {
		return ErrSelfModification
	}

	u, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return err
	}
	if u == nil || !u.BelongsToOrg(cmd.OrganizationID) {
		return ErrUserNotFound
	}

	role, _ := u.OrgRole(cmd.OrganizationID)
	if role == domain.RoleOwner {
		if err := s.ensureNotLastOwner(ctx, cmd.OrganizationID); err != nil {
			return err
		}
	}

	u.RemoveFromOrg(cmd.OrganizationID)
	if len(u.Organizations) == 0 {
		u.Active = false
	}
	return s.users.Update(ctx, u)
}

func (s *Service) validateRoleAssignment(actorRole, targetRole domain.Role) error {
	if actorRole == domain.RoleOwner {
		return nil
	}
	if targetRole == domain.RoleOwner {
		return ErrForbiddenRole
	}
	return nil
}

func (s *Service) ensureNotLastOwner(ctx context.Context, orgID string) error {
	count, err := s.users.CountOwnersInOrg(ctx, orgID)
	if err != nil {
		return err
	}
	if count <= 1 {
		return ErrLastOwner
	}
	return nil
}

func toMember(u domain.User, role domain.Role) Member {
	return Member{
		ID:            u.ID,
		Email:         u.Email,
		FirstName:     u.FirstName,
		LastName:      u.LastName,
		Phone:         u.Phone,
		Active:        u.Active,
		EmailVerified: u.EmailVerified,
		Role:          role,
	}
}

func ptr(m Member) *Member {
	return &m
}
