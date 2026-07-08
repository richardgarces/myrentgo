package mfa

import (
	"context"
	"errors"
	"strings"

	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

const (
	issuerName = "MyRent Go"
	skew       = 1
)

var (
	ErrFeatureDisabled   = errors.New("mfa feature disabled")
	ErrAlreadyEnabled    = errors.New("mfa already enabled")
	ErrNotEnabled        = errors.New("mfa not enabled")
	ErrNoPendingSetup    = errors.New("no pending mfa setup")
	ErrInvalidCode       = errors.New("invalid totp code")
	ErrInvalidPassword   = errors.New("invalid password")
	ErrInvalidMFAToken   = errors.New("invalid mfa token")
	ErrUserNotFound      = errors.New("user not found")
	ErrUserInactive      = errors.New("user inactive")
)

type UserRepository interface {
	FindByID(ctx context.Context, id string) (*domainuser.User, error)
	Update(ctx context.Context, u *domainuser.User) error
}

type TokenService interface {
	GenerateMFAToken(userID, email string) (string, error)
	ValidateMFAToken(token string) (userID, email string, err error)
	GeneratePair(u *domainuser.User) (accessToken, refreshToken string, expiresIn int64, err error)
}

type Service struct {
	users        UserRepository
	tokens       TokenService
	featureOn    bool
	appName      string
}

func NewService(users UserRepository, tokens TokenService, featureOn bool, appName string) *Service {
	if appName == "" {
		appName = issuerName
	}
	return &Service{users: users, tokens: tokens, featureOn: featureOn, appName: appName}
}

type SetupResult struct {
	Secret    string `json:"secret"`
	OtpAuthURL string `json:"otpauth_url"`
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

func (s *Service) Setup(ctx context.Context, userID string) (*SetupResult, error) {
	if !s.featureOn {
		return nil, ErrFeatureDisabled
	}
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, ErrUserNotFound
	}
	if u.MFAEnabled {
		return nil, ErrAlreadyEnabled
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      s.appName,
		AccountName: u.Email,
		Period:      30,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
	if err != nil {
		return nil, err
	}

	u.MFASecret = key.Secret()
	if err := s.users.Update(ctx, u); err != nil {
		return nil, err
	}

	return &SetupResult{
		Secret:     key.Secret(),
		OtpAuthURL: key.URL(),
	}, nil
}

func (s *Service) Enable(ctx context.Context, userID, code string) error {
	if !s.featureOn {
		return ErrFeatureDisabled
	}
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if u == nil {
		return ErrUserNotFound
	}
	if u.MFAEnabled {
		return ErrAlreadyEnabled
	}
	if strings.TrimSpace(u.MFASecret) == "" {
		return ErrNoPendingSetup
	}
	if !validateTOTP(u.MFASecret, code) {
		return ErrInvalidCode
	}

	u.MFAEnabled = true
	return s.users.Update(ctx, u)
}

type DisableCommand struct {
	UserID   string
	Password string
	Code     string
}

func (s *Service) Disable(ctx context.Context, cmd DisableCommand) error {
	u, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return err
	}
	if u == nil {
		return ErrUserNotFound
	}
	if !u.MFAEnabled {
		return ErrNotEnabled
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(cmd.Password)); err != nil {
		return ErrInvalidPassword
	}
	if !validateTOTP(u.MFASecret, cmd.Code) {
		return ErrInvalidCode
	}

	u.MFAEnabled = false
	u.MFASecret = ""
	return s.users.Update(ctx, u)
}

type VerifyLoginCommand struct {
	MFAToken string
	Code     string
}

func (s *Service) VerifyLogin(ctx context.Context, cmd VerifyLoginCommand) (*TokenPair, error) {
	userID, _, err := s.tokens.ValidateMFAToken(cmd.MFAToken)
	if err != nil {
		return nil, ErrInvalidMFAToken
	}

	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, ErrUserNotFound
	}
	if !u.Active {
		return nil, ErrUserInactive
	}
	if !u.MFAEnabled || strings.TrimSpace(u.MFASecret) == "" {
		return nil, ErrNotEnabled
	}
	if !validateTOTP(u.MFASecret, cmd.Code) {
		return nil, ErrInvalidCode
	}

	access, refresh, expiresIn, err := s.tokens.GeneratePair(u)
	if err != nil {
		return nil, err
	}
	return &TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    expiresIn,
	}, nil
}

func (s *Service) CreateLoginChallenge(userID, email string) (string, error) {
	return s.tokens.GenerateMFAToken(userID, email)
}

func (s *Service) ValidateMFAToken(token string) (userID, email string, err error) {
	return s.tokens.ValidateMFAToken(token)
}

func validateTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}
	return totp.Validate(code, secret)
}

func (s *Service) FeatureEnabled() bool {
	return s.featureOn
}
