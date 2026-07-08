package passwordreset

import (
	"testing"
	"time"
)

func TestTokenIsValid(t *testing.T) {
	now := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name  string
		token *Token
		want  bool
	}{
		{
			name: "valid unused token",
			token: &Token{
				ExpiresAt: now.Add(time.Hour),
				Used:      false,
			},
			want: true,
		},
		{
			name: "expired token",
			token: &Token{
				ExpiresAt: now.Add(-time.Minute),
				Used:      false,
			},
			want: false,
		},
		{
			name: "used token",
			token: &Token{
				ExpiresAt: now.Add(time.Hour),
				Used:      true,
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.token.IsValid(now); got != tt.want {
				t.Fatalf("IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNewToken(t *testing.T) {
	expires := time.Now().UTC().Add(20 * time.Minute)
	token := NewToken("user-1", "user@example.com", "hash", PurposeForgot, "", expires)
	if token.UserID != "user-1" || token.Purpose != PurposeForgot || token.ID == "" {
		t.Fatalf("unexpected token: %+v", token)
	}
}
