package mfa

import (
	"context"
	"errors"
	"testing"
	"time"

	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

type mockUserRepo struct {
	users map[string]*domainuser.User
}

func (m *mockUserRepo) FindByID(ctx context.Context, id string) (*domainuser.User, error) {
	if u, ok := m.users[id]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockUserRepo) Update(ctx context.Context, u *domainuser.User) error {
	m.users[u.ID] = u
	return nil
}

type mockTokenService struct{}

func (m *mockTokenService) GenerateMFAToken(userID, email string) (string, error) {
	return "valid-mfa-token", nil
}

func (m *mockTokenService) ValidateMFAToken(token string) (string, string, error) {
	if token != "valid-mfa-token" {
		return "", "", errors.New("invalid token")
	}
	return "user-1", "user@example.com", nil
}

func (m *mockTokenService) GeneratePair(u *domainuser.User) (string, string, int64, error) {
	return "access", "refresh", 3600, nil
}

func TestSetupAndEnable(t *testing.T) {
	ctx := context.Background()
	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.ID = "user-1"
	repo := &mockUserRepo{users: map[string]*domainuser.User{u.ID: u}}
	svc := NewService(repo, &mockTokenService{}, true, "MyRent Test")

	setup, err := svc.Setup(ctx, u.ID)
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	if setup.Secret == "" || setup.OtpAuthURL == "" {
		t.Fatal("expected secret and otpauth url")
	}

	code, err := totp.GenerateCode(setup.Secret, time.Now())
	if err != nil {
		t.Fatalf("generate code: %v", err)
	}
	if err := svc.Enable(ctx, u.ID, code); err != nil {
		t.Fatalf("enable: %v", err)
	}
	if !repo.users[u.ID].MFAEnabled {
		t.Fatal("expected MFA enabled")
	}
}

func TestEnableInvalidCode(t *testing.T) {
	ctx := context.Background()
	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.ID = "user-1"
	u.MFASecret = "JBSWY3DPEHPK3PXP"
	repo := &mockUserRepo{users: map[string]*domainuser.User{u.ID: u}}
	svc := NewService(repo, &mockTokenService{}, true, "MyRent Test")

	err := svc.Enable(ctx, u.ID, "000000")
	if !errors.Is(err, ErrInvalidCode) {
		t.Fatalf("expected ErrInvalidCode, got %v", err)
	}
}

func TestVerifyLogin(t *testing.T) {
	ctx := context.Background()
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "MyRent Test",
		AccountName: "user@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	code, err := totp.GenerateCode(key.Secret(), time.Now())
	if err != nil {
		t.Fatal(err)
	}

	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.ID = "user-1"
	u.MFAEnabled = true
	u.MFASecret = key.Secret()
	repo := &mockUserRepo{users: map[string]*domainuser.User{u.ID: u}}
	svc := NewService(repo, &mockTokenService{}, true, "MyRent Test")

	pair, err := svc.VerifyLogin(ctx, VerifyLoginCommand{MFAToken: "valid-mfa-token", Code: code})
	if err != nil {
		t.Fatalf("verify login: %v", err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("expected tokens")
	}
}

func TestDisable(t *testing.T) {
	ctx := context.Background()
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "MyRent Test",
		AccountName: "user@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	code, err := totp.GenerateCode(key.Secret(), time.Now())
	if err != nil {
		t.Fatal(err)
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte("password1"), bcrypt.MinCost)
	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.ID = "user-1"
	u.MFAEnabled = true
	u.MFASecret = key.Secret()
	u.PasswordHash = string(hash)
	repo := &mockUserRepo{users: map[string]*domainuser.User{u.ID: u}}
	svc := NewService(repo, &mockTokenService{}, true, "MyRent Test")

	if err := svc.Disable(ctx, DisableCommand{UserID: u.ID, Password: "password1", Code: code}); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if repo.users[u.ID].MFAEnabled || repo.users[u.ID].MFASecret != "" {
		t.Fatal("expected MFA disabled and secret cleared")
	}
}

func TestFeatureDisabled(t *testing.T) {
	svc := NewService(&mockUserRepo{users: map[string]*domainuser.User{}}, &mockTokenService{}, false, "MyRent Test")
	_, err := svc.Setup(context.Background(), "user-1")
	if !errors.Is(err, ErrFeatureDisabled) {
		t.Fatalf("expected ErrFeatureDisabled, got %v", err)
	}
}
