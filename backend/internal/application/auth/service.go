package auth

import (
	"context"
	"errors"
	"time"

	domain "github.com/richard/my-rent-go/internal/domain/user"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserInactive       = errors.New("user is inactive")
	ErrEmailExists        = errors.New("email already exists")
	ErrEmailNotVerified   = errors.New("email not verified")
)

type RegisterCommand struct {
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=8"`
	FirstName     string `json:"first_name" binding:"required"`
	LastName      string `json:"last_name" binding:"required"`
	OrgName       string `json:"org_name" binding:"required"`
}

type LoginCommand struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type LoginResult struct {
	Tokens      *TokenPair `json:"-"`
	MFARequired bool       `json:"mfa_required,omitempty"`
	MFAToken    string     `json:"mfa_token,omitempty"`
}

type UserRepository interface {
	Create(ctx context.Context, u *domain.User) error
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
	Update(ctx context.Context, u *domain.User) error
}

type OrganizationCreator interface {
	CreateForUser(ctx context.Context, userID, name string) (string, error)
}

type TokenService interface {
	GeneratePair(user *domain.User) (*TokenPair, error)
	ValidateAccess(token string) (*Claims, error)
	Refresh(refreshToken string) (*TokenPair, error)
}

type MFAChallengeCreator interface {
	CreateLoginChallenge(userID, email string) (string, error)
}

type Claims struct {
	UserID string
	Email  string
	OrgID  string
	Role   domain.Role
}

type AuthService struct {
	users      UserRepository
	orgs       OrganizationCreator
	tokens     TokenService
	mfa        MFAChallengeCreator
	bcryptCost int
}

func NewAuthService(users UserRepository, orgs OrganizationCreator, tokens TokenService, bcryptCost int) *AuthService {
	return &AuthService{users: users, orgs: orgs, tokens: tokens, bcryptCost: bcryptCost}
}

func (s *AuthService) SetMFA(mfa MFAChallengeCreator) {
	s.mfa = mfa
}

func (s *AuthService) Register(ctx context.Context, cmd RegisterCommand) (*TokenPair, error) {
	existing, _ := s.users.FindByEmail(ctx, cmd.Email)
	if existing != nil {
		return nil, ErrEmailExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cmd.Password), s.bcryptCost)
	if err != nil {
		return nil, err
	}

	u := domain.NewUser(cmd.Email, cmd.FirstName, cmd.LastName)
	u.PasswordHash = string(hash)

	if err := s.users.Create(ctx, u); err != nil {
		return nil, err
	}

	orgID, err := s.orgs.CreateForUser(ctx, u.ID, cmd.OrgName)
	if err != nil {
		return nil, err
	}

	u.Organizations = []domain.UserOrg{{OrganizationID: orgID, Role: domain.RoleOwner}}
	if err := s.users.Update(ctx, u); err != nil {
		return nil, err
	}

	return s.tokens.GeneratePair(u)
}

func (s *AuthService) Login(ctx context.Context, cmd LoginCommand) (*LoginResult, error) {
	email := cmd.Email
	if email == "admin" {
		email = "admin@myrent.local"
	}
	u, err := s.users.FindByEmail(ctx, email)
	if err != nil || u == nil {
		return nil, ErrInvalidCredentials
	}
	if !u.Active {
		return nil, ErrUserInactive
	}
	if !u.EmailVerified {
		return nil, ErrEmailNotVerified
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(cmd.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	if u.MFAEnabled && s.mfa != nil {
		mfaToken, err := s.mfa.CreateLoginChallenge(u.ID, u.Email)
		if err != nil {
			return nil, err
		}
		return &LoginResult{MFARequired: true, MFAToken: mfaToken}, nil
	}

	tokens, err := s.tokens.GeneratePair(u)
	if err != nil {
		return nil, err
	}
	return &LoginResult{Tokens: tokens}, nil
}

func (s *AuthService) Me(ctx context.Context, userID string) (*domain.User, error) {
	return s.users.FindByID(ctx, userID)
}

type RefreshToken struct {
	Token     string    `bson:"_id"`
	UserID    string    `bson:"user_id"`
	ExpiresAt time.Time `bson:"expires_at"`
	Revoked   bool      `bson:"revoked"`
}
