package password

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	domainreset "github.com/richard/my-rent-go/internal/domain/passwordreset"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"golang.org/x/crypto/bcrypt"
)

const (
	pinExpiry       = 20 * time.Minute
	minPasswordLen  = 8
)

var (
	ErrInvalidCurrentPassword = errors.New("invalid current password")
	ErrInvalidPIN             = errors.New("invalid or expired pin")
	ErrPasswordTooShort       = errors.New("password too short")
	ErrUserNotFound           = errors.New("user not found")
	ErrUserInactive           = errors.New("user inactive")
	ErrForbidden              = errors.New("forbidden")
	ErrSelfModification       = errors.New("self modification")
	ErrRateLimited            = errors.New("rate limited")
)

type UserRepository interface {
	FindByEmail(ctx context.Context, email string) (*domainuser.User, error)
	FindByID(ctx context.Context, id string) (*domainuser.User, error)
	Update(ctx context.Context, u *domainuser.User) error
}

type ResetTokenRepository interface {
	InvalidateForUser(ctx context.Context, userID string) error
	Create(ctx context.Context, token *domainreset.Token) error
	FindValidByUserID(ctx context.Context, userID string) (*domainreset.Token, error)
	MarkUsed(ctx context.Context, tokenID string, usedAt time.Time) error
}

type Mailer interface {
	Send(ctx context.Context, msg email.Message) error
	Configured() bool
}

type Service struct {
	users      UserRepository
	tokens     ResetTokenRepository
	mailer     Mailer
	bcryptCost int
	limiter    *emailRateLimiter
}

func NewService(users UserRepository, tokens ResetTokenRepository, mailer Mailer, bcryptCost int) *Service {
	return &Service{
		users:      users,
		tokens:     tokens,
		mailer:     mailer,
		bcryptCost: bcryptCost,
		limiter:    newEmailRateLimiter(3, 15*time.Minute),
	}
}

type ChangePasswordCommand struct {
	UserID          string
	CurrentPassword string
	NewPassword     string
}

type ForgotPasswordCommand struct {
	Email string
}

type ResetPasswordCommand struct {
	Email       string
	PIN         string
	NewPassword string
}

type AdminResetCommand struct {
	OrganizationID string
	ActorID        string
	ActorRole      domainuser.Role
	UserID         string
}

func (s *Service) ChangePassword(ctx context.Context, cmd ChangePasswordCommand) error {
	if len(strings.TrimSpace(cmd.NewPassword)) < minPasswordLen {
		return ErrPasswordTooShort
	}
	u, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return err
	}
	if u == nil {
		return ErrUserNotFound
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(cmd.CurrentPassword)); err != nil {
		return ErrInvalidCurrentPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(cmd.NewPassword), s.bcryptCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	if err := s.users.Update(ctx, u); err != nil {
		return err
	}
	return s.tokens.InvalidateForUser(ctx, u.ID)
}

func (s *Service) ForgotPassword(ctx context.Context, cmd ForgotPasswordCommand) error {
	emailAddr := normalizeEmail(cmd.Email)
	now := time.Now().UTC()
	if !s.limiter.allow(emailAddr, now) {
		return ErrRateLimited
	}

	u, err := s.users.FindByEmail(ctx, emailAddr)
	if err != nil {
		return err
	}
	if u == nil || !u.Active {
		return nil
	}

	pin, err := generatePIN()
	if err != nil {
		return err
	}
	if err := s.createAndSendPIN(ctx, u, pin, domainreset.PurposeForgot, "", false); err != nil {
		return err
	}
	return nil
}

func (s *Service) ResetPassword(ctx context.Context, cmd ResetPasswordCommand) error {
	if len(strings.TrimSpace(cmd.NewPassword)) < minPasswordLen {
		return ErrPasswordTooShort
	}
	emailAddr := normalizeEmail(cmd.Email)
	u, err := s.users.FindByEmail(ctx, emailAddr)
	if err != nil {
		return err
	}
	if u == nil || !u.Active {
		return ErrInvalidPIN
	}

	token, err := s.tokens.FindValidByUserID(ctx, u.ID)
	if err != nil {
		return err
	}
	if token == nil || !token.IsValid(time.Now().UTC()) {
		return ErrInvalidPIN
	}
	if err := bcrypt.CompareHashAndPassword([]byte(token.PinHash), []byte(strings.TrimSpace(cmd.PIN))); err != nil {
		return ErrInvalidPIN
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cmd.NewPassword), s.bcryptCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	if err := s.users.Update(ctx, u); err != nil {
		return err
	}
	now := time.Now().UTC()
	if err := s.tokens.MarkUsed(ctx, token.ID, now); err != nil {
		return err
	}
	return s.tokens.InvalidateForUser(ctx, u.ID)
}

func (s *Service) AdminResetPassword(ctx context.Context, cmd AdminResetCommand) error {
	if !domainuser.CanManageUsers(cmd.ActorRole) {
		return ErrForbidden
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
	if !u.Active {
		return ErrUserInactive
	}
	if cmd.ActorRole == domainuser.RoleAdmin {
		if role, ok := u.OrgRole(cmd.OrganizationID); ok && role == domainuser.RoleOwner {
			return ErrForbidden
		}
	}

	pin, err := generatePIN()
	if err != nil {
		return err
	}
	return s.createAndSendPIN(ctx, u, pin, domainreset.PurposeAdminReset, cmd.ActorID, true)
}

func (s *Service) createAndSendPIN(ctx context.Context, u *domainuser.User, pin, purpose, createdBy string, setProvisionalPassword bool) error {
	pinHash, err := bcrypt.GenerateFromPassword([]byte(pin), s.bcryptCost)
	if err != nil {
		return err
	}

	if err := s.tokens.InvalidateForUser(ctx, u.ID); err != nil {
		return err
	}

	expiresAt := time.Now().UTC().Add(pinExpiry)
	token := domainreset.NewToken(u.ID, u.Email, string(pinHash), purpose, createdBy, expiresAt)
	if err := s.tokens.Create(ctx, token); err != nil {
		return err
	}

	if setProvisionalPassword {
		u.PasswordHash = string(pinHash)
		if err := s.users.Update(ctx, u); err != nil {
			return err
		}
	}

	subject, htmlBody, textBody := email.RenderPasswordResetPIN(u.FirstName, pin, expiresAt, purpose == domainreset.PurposeAdminReset)
	return s.mailer.Send(ctx, email.Message{
		To:       []string{u.Email},
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
	})
}

func generatePIN() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", fmt.Errorf("generate pin: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}
