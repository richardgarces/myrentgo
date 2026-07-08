package emailverify

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	domainverify "github.com/richard/my-rent-go/internal/domain/emailverification"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"golang.org/x/crypto/bcrypt"
)

const (
	tokenExpiry    = 36 * time.Hour
	minPasswordLen = 8
	tokenBytes     = 32
)

var (
	ErrInvalidToken     = errors.New("invalid or expired token")
	ErrPasswordTooShort = errors.New("password too short")
	ErrUserNotFound     = errors.New("user not found")
	ErrUserInactive     = errors.New("user inactive")
	ErrAlreadyVerified  = errors.New("email already verified")
	ErrForbidden        = errors.New("forbidden")
	ErrRateLimited      = errors.New("rate limited")
)

type UserRepository interface {
	FindByEmail(ctx context.Context, email string) (*domainuser.User, error)
	FindByID(ctx context.Context, id string) (*domainuser.User, error)
	Update(ctx context.Context, u *domainuser.User) error
}

type TokenRepository interface {
	InvalidateForUser(ctx context.Context, userID string) error
	Create(ctx context.Context, token *domainverify.Token) error
	MarkUsed(ctx context.Context, tokenID string, usedAt time.Time) error
	FindValidMatching(ctx context.Context, raw string, compare func(hash, raw string) bool) (*domainverify.Token, error)
}

type Mailer interface {
	Send(ctx context.Context, msg email.Message) error
	Configured() bool
}

type Service struct {
	users       UserRepository
	tokens      TokenRepository
	mailer      Mailer
	bcryptCost  int
	frontendURL string
	limiter     *emailRateLimiter
}

func NewService(users UserRepository, tokens TokenRepository, mailer Mailer, bcryptCost int, frontendURL string) *Service {
	return &Service{
		users:       users,
		tokens:      tokens,
		mailer:      mailer,
		bcryptCost:  bcryptCost,
		frontendURL: strings.TrimRight(frontendURL, "/"),
		limiter:     newEmailRateLimiter(3, 15*time.Minute),
	}
}

type VerifyResult struct {
	Valid     bool   `json:"valid"`
	Email     string `json:"email,omitempty"`
	FirstName string `json:"first_name,omitempty"`
}

type SetPasswordCommand struct {
	Token       string
	NewPassword string
}

type ResendCommand struct {
	Email string
}

type AdminResendCommand struct {
	OrganizationID string
	ActorID        string
	ActorRole      domainuser.Role
	UserID         string
}

func (s *Service) SendInvite(ctx context.Context, userID, createdBy string) error {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if u == nil || !u.Active {
		return ErrUserNotFound
	}
	if u.EmailVerified {
		return nil
	}
	return s.createAndSend(ctx, u, createdBy)
}

func (s *Service) VerifyToken(ctx context.Context, rawToken string) (*VerifyResult, error) {
	u, _, err := s.resolveToken(ctx, rawToken)
	if err != nil {
		return &VerifyResult{Valid: false}, nil
	}
	if u.EmailVerified {
		return &VerifyResult{Valid: false}, nil
	}
	return &VerifyResult{
		Valid:     true,
		Email:     u.Email,
		FirstName: u.FirstName,
	}, nil
}

func (s *Service) SetPasswordFromInvite(ctx context.Context, cmd SetPasswordCommand) error {
	if len(strings.TrimSpace(cmd.NewPassword)) < minPasswordLen {
		return ErrPasswordTooShort
	}

	u, token, err := s.resolveToken(ctx, cmd.Token)
	if err != nil {
		return err
	}
	if u.EmailVerified {
		return ErrAlreadyVerified
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cmd.NewPassword), s.bcryptCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	u.EmailVerified = true
	if err := s.users.Update(ctx, u); err != nil {
		return err
	}

	now := time.Now().UTC()
	if err := s.tokens.MarkUsed(ctx, token.ID, now); err != nil {
		return err
	}
	return s.tokens.InvalidateForUser(ctx, u.ID)
}

func (s *Service) ResendPublic(ctx context.Context, cmd ResendCommand) error {
	emailAddr := normalizeEmail(cmd.Email)
	now := time.Now().UTC()
	if !s.limiter.allow(emailAddr, now) {
		return ErrRateLimited
	}

	u, err := s.users.FindByEmail(ctx, emailAddr)
	if err != nil {
		return err
	}
	if u == nil || !u.Active || u.EmailVerified {
		return nil
	}
	return s.createAndSend(ctx, u, "")
}

func (s *Service) ResendAdmin(ctx context.Context, cmd AdminResendCommand) error {
	if !domainuser.CanManageUsers(cmd.ActorRole) {
		return ErrForbidden
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
	if u.EmailVerified {
		return ErrAlreadyVerified
	}
	return s.createAndSend(ctx, u, cmd.ActorID)
}

func (s *Service) createAndSend(ctx context.Context, u *domainuser.User, createdBy string) error {
	raw, err := generateToken()
	if err != nil {
		return err
	}
	tokenHash, err := bcrypt.GenerateFromPassword([]byte(raw), s.bcryptCost)
	if err != nil {
		return err
	}

	if err := s.tokens.InvalidateForUser(ctx, u.ID); err != nil {
		return err
	}

	expiresAt := time.Now().UTC().Add(tokenExpiry)
	token := domainverify.NewToken(u.ID, u.Email, string(tokenHash), domainverify.PurposeTeamInvite, createdBy, expiresAt)
	if err := s.tokens.Create(ctx, token); err != nil {
		return err
	}

	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", s.frontendURL, raw)
	subject, htmlBody, textBody := email.RenderTeamInviteVerification(u.FirstName, verifyURL, expiresAt)
	return s.mailer.Send(ctx, email.Message{
		To:       []string{u.Email},
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
	})
}

func (s *Service) resolveToken(ctx context.Context, raw string) (*domainuser.User, *domainverify.Token, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil, ErrInvalidToken
	}

	token, err := s.tokens.FindValidMatching(ctx, raw, func(hash, plain string) bool {
		return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
	})
	if err != nil {
		return nil, nil, err
	}
	if token == nil || !token.IsValid(time.Now().UTC()) {
		return nil, nil, ErrInvalidToken
	}

	u, err := s.users.FindByID(ctx, token.UserID)
	if err != nil {
		return nil, nil, err
	}
	if u == nil || !u.Active {
		return nil, nil, ErrInvalidToken
	}
	return u, token, nil
}

func generateToken() (string, error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}
