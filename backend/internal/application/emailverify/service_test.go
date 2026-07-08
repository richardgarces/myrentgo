package emailverify

import (
	"context"
	"errors"
	"testing"
	"time"

	domainverify "github.com/richard/my-rent-go/internal/domain/emailverification"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"golang.org/x/crypto/bcrypt"
)

type mockUserRepo struct {
	byID map[string]*domainuser.User
}

func (m *mockUserRepo) FindByEmail(ctx context.Context, email string) (*domainuser.User, error) {
	for _, u := range m.byID {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, nil
}

func (m *mockUserRepo) FindByID(ctx context.Context, id string) (*domainuser.User, error) {
	if u, ok := m.byID[id]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockUserRepo) Update(ctx context.Context, u *domainuser.User) error {
	m.byID[u.ID] = u
	return nil
}

type mockTokenRepo struct {
	tokens map[string]*domainverify.Token
}

func (m *mockTokenRepo) InvalidateForUser(ctx context.Context, userID string) error { return nil }

func (m *mockTokenRepo) Create(ctx context.Context, token *domainverify.Token) error {
	if m.tokens == nil {
		m.tokens = make(map[string]*domainverify.Token)
	}
	m.tokens[token.ID] = token
	return nil
}

func (m *mockTokenRepo) MarkUsed(ctx context.Context, tokenID string, usedAt time.Time) error {
	if t, ok := m.tokens[tokenID]; ok {
		t.Used = true
	}
	return nil
}

func (m *mockTokenRepo) FindValidMatching(ctx context.Context, raw string, compare func(hash, raw string) bool) (*domainverify.Token, error) {
	for _, token := range m.tokens {
		if token.IsValid(time.Now().UTC()) && compare(token.TokenHash, raw) {
			return token, nil
		}
	}
	return nil, nil
}

type mockMailer struct{}

func (m *mockMailer) Send(ctx context.Context, msg email.Message) error { return nil }
func (m *mockMailer) Configured() bool                                  { return true }

func TestVerifyTokenAndSetPassword(t *testing.T) {
	ctx := context.Background()
	rawToken := "invite-token-abc123"
	tokenHash, _ := bcrypt.GenerateFromPassword([]byte(rawToken), bcrypt.MinCost)
	u := domainuser.NewUser("invite@example.com", "Invite", "User")
	u.EmailVerified = false
	token := domainverify.NewToken(u.ID, u.Email, string(tokenHash), domainverify.PurposeTeamInvite, "admin-1", time.Now().UTC().Add(36*time.Hour))

	repo := &mockUserRepo{byID: map[string]*domainuser.User{u.ID: u}}
	tokens := &mockTokenRepo{tokens: map[string]*domainverify.Token{token.ID: token}}
	svc := NewService(repo, tokens, &mockMailer{}, bcrypt.MinCost, "http://localhost:4000")

	result, err := svc.VerifyToken(ctx, rawToken)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if !result.Valid || result.Email != u.Email {
		t.Fatalf("unexpected verify result: %+v", result)
	}

	if err := svc.SetPasswordFromInvite(ctx, SetPasswordCommand{
		Token:       rawToken,
		NewPassword: "password1",
	}); err != nil {
		t.Fatalf("set password: %v", err)
	}
	if !repo.byID[u.ID].EmailVerified {
		t.Fatal("expected email verified")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.byID[u.ID].PasswordHash), []byte("password1")); err != nil {
		t.Fatal("expected password updated")
	}
}

func TestVerifyTokenInvalid(t *testing.T) {
	svc := NewService(&mockUserRepo{byID: map[string]*domainuser.User{}}, &mockTokenRepo{}, &mockMailer{}, bcrypt.MinCost, "http://localhost:4000")
	result, err := svc.VerifyToken(context.Background(), "bad-token")
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid token")
	}
}

func TestSetPasswordTooShort(t *testing.T) {
	rawToken := "invite-token"
	tokenHash, _ := bcrypt.GenerateFromPassword([]byte(rawToken), bcrypt.MinCost)
	u := domainuser.NewUser("invite@example.com", "Invite", "User")
	u.EmailVerified = false
	token := domainverify.NewToken(u.ID, u.Email, string(tokenHash), domainverify.PurposeTeamInvite, "", time.Now().UTC().Add(36*time.Hour))
	svc := NewService(
		&mockUserRepo{byID: map[string]*domainuser.User{u.ID: u}},
		&mockTokenRepo{tokens: map[string]*domainverify.Token{token.ID: token}},
		&mockMailer{},
		bcrypt.MinCost,
		"http://localhost:4000",
	)

	err := svc.SetPasswordFromInvite(context.Background(), SetPasswordCommand{Token: rawToken, NewPassword: "short"})
	if !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort, got %v", err)
	}
}
