package emailverification

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
			name: "valid invite token",
			token: &Token{
				ExpiresAt: now.Add(36 * time.Hour),
				Used:      false,
			},
			want: true,
		},
		{
			name: "expired invite token",
			token: &Token{
				ExpiresAt: now.Add(-time.Hour),
				Used:      false,
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
	expires := time.Now().UTC().Add(36 * time.Hour)
	token := NewToken("user-1", "user@example.com", "hash", PurposeTeamInvite, "admin-1", expires)
	if token.Purpose != PurposeTeamInvite || token.CreatedBy != "admin-1" {
		t.Fatalf("unexpected token: %+v", token)
	}
}
