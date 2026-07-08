package auth

import (
	"context"
	"errors"
	"testing"

	domain "github.com/richard/my-rent-go/internal/domain/user"
	"golang.org/x/crypto/bcrypt"
)

type mockUserRepo struct {
	byEmail map[string]*domain.User
	byID    map[string]*domain.User
}

func (m *mockUserRepo) Create(ctx context.Context, u *domain.User) error {
	if m.byEmail == nil {
		m.byEmail = make(map[string]*domain.User)
	}
	if m.byID == nil {
		m.byID = make(map[string]*domain.User)
	}
	m.byEmail[u.Email] = u
	m.byID[u.ID] = u
	return nil
}

func (m *mockUserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	if u, ok := m.byEmail[email]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockUserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	if u, ok := m.byID[id]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockUserRepo) Update(ctx context.Context, u *domain.User) error {
	m.byEmail[u.Email] = u
	m.byID[u.ID] = u
	return nil
}

type mockOrgCreator struct {
	orgID string
	err   error
}

func (m *mockOrgCreator) CreateForUser(ctx context.Context, userID, name string) (string, error) {
	if m.err != nil {
		return "", m.err
	}
	if m.orgID == "" {
		return "org-1", nil
	}
	return m.orgID, nil
}

type mockTokenService struct {
	pair *TokenPair
	err  error
}

func (m *mockTokenService) GeneratePair(user *domain.User) (*TokenPair, error) {
	if m.err != nil {
		return nil, m.err
	}
	if m.pair != nil {
		return m.pair, nil
	}
	return &TokenPair{AccessToken: "access", RefreshToken: "refresh", ExpiresIn: 3600}, nil
}

func (m *mockTokenService) ValidateAccess(token string) (*Claims, error) {
	return nil, errors.New("not implemented")
}

func (m *mockTokenService) Refresh(refreshToken string) (*TokenPair, error) {
	return nil, errors.New("not implemented")
}

type mockMFA struct {
	token string
	err   error
}

func (m *mockMFA) CreateLoginChallenge(userID, email string) (string, error) {
	if m.err != nil {
		return "", m.err
	}
	if m.token != "" {
		return m.token, nil
	}
	return "mfa-token", nil
}

func verifiedUser(email, password string) *domain.User {
	u := domain.NewUser(email, "Test", "User")
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		panic(err)
	}
	u.PasswordHash = string(h)
	u.EmailVerified = true
	return u
}

func TestLogin(t *testing.T) {
	ctx := context.Background()
	password := "admin123"

	tests := []struct {
		name    string
		cmd     LoginCommand
		user    *domain.User
		mfa     MFAChallengeCreator
		wantErr error
		wantMFA bool
		wantTok bool
	}{
		{
			name:    "valid credentials",
			cmd:     LoginCommand{Email: "user@example.com", Password: password},
			user:    verifiedUser("user@example.com", password),
			wantTok: true,
		},
		{
			name:    "admin alias maps to admin@myrent.local",
			cmd:     LoginCommand{Email: "admin", Password: password},
			user:    verifiedUser("admin@myrent.local", password),
			wantTok: true,
		},
		{
			name:    "invalid password",
			cmd:     LoginCommand{Email: "user@example.com", Password: "wrong"},
			user:    verifiedUser("user@example.com", password),
			wantErr: ErrInvalidCredentials,
		},
		{
			name:    "unknown user",
			cmd:     LoginCommand{Email: "missing@example.com", Password: password},
			wantErr: ErrInvalidCredentials,
		},
		{
			name:    "inactive user",
			cmd:     LoginCommand{Email: "user@example.com", Password: password},
			user:    func() *domain.User { u := verifiedUser("user@example.com", password); u.Active = false; return u }(),
			wantErr: ErrUserInactive,
		},
		{
			name:    "unverified email",
			cmd:     LoginCommand{Email: "user@example.com", Password: password},
			user:    func() *domain.User { u := verifiedUser("user@example.com", password); u.EmailVerified = false; return u }(),
			wantErr: ErrEmailNotVerified,
		},
		{
			name: "mfa required",
			cmd:  LoginCommand{Email: "user@example.com", Password: password},
			user: func() *domain.User {
				u := verifiedUser("user@example.com", password)
				u.MFAEnabled = true
				return u
			}(),
			mfa:     &mockMFA{token: "challenge-token"},
			wantMFA: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &mockUserRepo{byEmail: map[string]*domain.User{}, byID: map[string]*domain.User{}}
			if tt.user != nil {
				repo.byEmail[tt.user.Email] = tt.user
				repo.byID[tt.user.ID] = tt.user
			}
			svc := NewAuthService(repo, &mockOrgCreator{}, &mockTokenService{}, bcrypt.MinCost)
			if tt.mfa != nil {
				svc.SetMFA(tt.mfa)
			}

			result, err := svc.Login(ctx, tt.cmd)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("expected %v, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantMFA {
				if !result.MFARequired || result.MFAToken != "challenge-token" || result.Tokens != nil {
					t.Fatalf("expected MFA challenge, got %+v", result)
				}
				return
			}
			if tt.wantTok && (result.Tokens == nil || result.Tokens.AccessToken == "") {
				t.Fatal("expected token pair")
			}
		})
	}
}

func TestRegister(t *testing.T) {
	ctx := context.Background()
	repo := &mockUserRepo{byEmail: map[string]*domain.User{}, byID: map[string]*domain.User{}}
	svc := NewAuthService(repo, &mockOrgCreator{}, &mockTokenService{}, bcrypt.MinCost)

	pair, err := svc.Register(ctx, RegisterCommand{
		Email:     "new@example.com",
		Password:  "password1",
		FirstName: "New",
		LastName:  "User",
		OrgName:   "Org",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if pair.AccessToken == "" {
		t.Fatal("expected access token")
	}

	_, err = svc.Register(ctx, RegisterCommand{
		Email:     "new@example.com",
		Password:  "password1",
		FirstName: "Dup",
		LastName:  "User",
		OrgName:   "Org",
	})
	if !errors.Is(err, ErrEmailExists) {
		t.Fatalf("expected ErrEmailExists, got %v", err)
	}
}
