package password

import (
	"context"
	"errors"
	"testing"
	"time"

	domainreset "github.com/richard/my-rent-go/internal/domain/passwordreset"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"golang.org/x/crypto/bcrypt"
)

type mockUserRepo struct {
	byEmail map[string]*domainuser.User
	byID    map[string]*domainuser.User
}

func (m *mockUserRepo) FindByEmail(ctx context.Context, email string) (*domainuser.User, error) {
	if u, ok := m.byEmail[email]; ok {
		return u, nil
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
	m.byEmail[u.Email] = u
	m.byID[u.ID] = u
	return nil
}

type mockTokenRepo struct {
	tokens map[string]*domainreset.Token
	byUser map[string]*domainreset.Token
}

func (m *mockTokenRepo) InvalidateForUser(ctx context.Context, userID string) error {
	delete(m.byUser, userID)
	return nil
}

func (m *mockTokenRepo) Create(ctx context.Context, token *domainreset.Token) error {
	if m.tokens == nil {
		m.tokens = make(map[string]*domainreset.Token)
	}
	if m.byUser == nil {
		m.byUser = make(map[string]*domainreset.Token)
	}
	m.tokens[token.ID] = token
	m.byUser[token.UserID] = token
	return nil
}

func (m *mockTokenRepo) FindValidByUserID(ctx context.Context, userID string) (*domainreset.Token, error) {
	if t, ok := m.byUser[userID]; ok {
		return t, nil
	}
	return nil, nil
}

func (m *mockTokenRepo) MarkUsed(ctx context.Context, tokenID string, usedAt time.Time) error {
	if t, ok := m.tokens[tokenID]; ok {
		t.Used = true
		t.UsedAt = &usedAt
	}
	return nil
}

type mockMailer struct {
	sent int
}

func (m *mockMailer) Send(ctx context.Context, msg email.Message) error {
	m.sent++
	return nil
}

func (m *mockMailer) Configured() bool { return true }

func TestChangePassword(t *testing.T) {
	ctx := context.Background()
	hash, _ := bcrypt.GenerateFromPassword([]byte("oldpass1"), bcrypt.MinCost)
	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.PasswordHash = string(hash)
	repo := &mockUserRepo{
		byEmail: map[string]*domainuser.User{u.Email: u},
		byID:    map[string]*domainuser.User{u.ID: u},
	}
	tokens := &mockTokenRepo{}
	svc := NewService(repo, tokens, &mockMailer{}, bcrypt.MinCost)

	if err := svc.ChangePassword(ctx, ChangePasswordCommand{
		UserID:          u.ID,
		CurrentPassword: "oldpass1",
		NewPassword:     "newpass1",
	}); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.byID[u.ID].PasswordHash), []byte("newpass1")); err != nil {
		t.Fatal("password was not updated")
	}
}

func TestChangePasswordInvalidCurrent(t *testing.T) {
	ctx := context.Background()
	hash, _ := bcrypt.GenerateFromPassword([]byte("oldpass1"), bcrypt.MinCost)
	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.PasswordHash = string(hash)
	repo := &mockUserRepo{byID: map[string]*domainuser.User{u.ID: u}}
	svc := NewService(repo, &mockTokenRepo{}, &mockMailer{}, bcrypt.MinCost)

	err := svc.ChangePassword(ctx, ChangePasswordCommand{
		UserID:          u.ID,
		CurrentPassword: "wrong",
		NewPassword:     "newpass1",
	})
	if !errors.Is(err, ErrInvalidCurrentPassword) {
		t.Fatalf("expected ErrInvalidCurrentPassword, got %v", err)
	}
}

func TestResetPasswordWithPIN(t *testing.T) {
	ctx := context.Background()
	pin := "123456"
	pinHash, _ := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.MinCost)
	oldHash, _ := bcrypt.GenerateFromPassword([]byte("oldpass1"), bcrypt.MinCost)
	u := domainuser.NewUser("user@example.com", "Test", "User")
	u.PasswordHash = string(oldHash)
	token := domainreset.NewToken(u.ID, u.Email, string(pinHash), domainreset.PurposeForgot, "", time.Now().UTC().Add(20*time.Minute))

	repo := &mockUserRepo{
		byEmail: map[string]*domainuser.User{u.Email: u},
		byID:    map[string]*domainuser.User{u.ID: u},
	}
	tokens := &mockTokenRepo{tokens: map[string]*domainreset.Token{token.ID: token}, byUser: map[string]*domainreset.Token{u.ID: token}}
	svc := NewService(repo, tokens, &mockMailer{}, bcrypt.MinCost)

	if err := svc.ResetPassword(ctx, ResetPasswordCommand{
		Email:       u.Email,
		PIN:         pin,
		NewPassword: "newpass1",
	}); err != nil {
		t.Fatalf("reset password: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.byID[u.ID].PasswordHash), []byte("newpass1")); err != nil {
		t.Fatal("password was not reset")
	}
	if !tokens.tokens[token.ID].Used {
		t.Fatal("expected token marked used")
	}
}

func TestResetPasswordInvalidPIN(t *testing.T) {
	ctx := context.Background()
	pinHash, _ := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.MinCost)
	u := domainuser.NewUser("user@example.com", "Test", "User")
	token := domainreset.NewToken(u.ID, u.Email, string(pinHash), domainreset.PurposeForgot, "", time.Now().UTC().Add(20*time.Minute))
	repo := &mockUserRepo{byEmail: map[string]*domainuser.User{u.Email: u}, byID: map[string]*domainuser.User{u.ID: u}}
	tokens := &mockTokenRepo{tokens: map[string]*domainreset.Token{token.ID: token}, byUser: map[string]*domainreset.Token{u.ID: token}}
	svc := NewService(repo, tokens, &mockMailer{}, bcrypt.MinCost)

	err := svc.ResetPassword(ctx, ResetPasswordCommand{
		Email:       u.Email,
		PIN:         "000000",
		NewPassword: "newpass1",
	})
	if !errors.Is(err, ErrInvalidPIN) {
		t.Fatalf("expected ErrInvalidPIN, got %v", err)
	}
}

func TestForgotPasswordSendsEmail(t *testing.T) {
	ctx := context.Background()
	u := domainuser.NewUser("user@example.com", "Test", "User")
	repo := &mockUserRepo{byEmail: map[string]*domainuser.User{u.Email: u}, byID: map[string]*domainuser.User{u.ID: u}}
	tokens := &mockTokenRepo{}
	mailer := &mockMailer{}
	svc := NewService(repo, tokens, mailer, bcrypt.MinCost)

	if err := svc.ForgotPassword(ctx, ForgotPasswordCommand{Email: u.Email}); err != nil {
		t.Fatalf("forgot password: %v", err)
	}
	if mailer.sent != 1 {
		t.Fatalf("expected 1 email sent, got %d", mailer.sent)
	}
	if len(tokens.byUser) != 1 {
		t.Fatal("expected reset token created")
	}
}
