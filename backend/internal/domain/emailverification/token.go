package emailverification

import (
	"time"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

const PurposeTeamInvite = "team_invite"

type Token struct {
	shared.Entity `bson:",inline"`
	UserID        string    `bson:"user_id"`
	Email         string    `bson:"email"`
	TokenHash     string    `bson:"token_hash"`
	Purpose       string    `bson:"purpose"`
	ExpiresAt     time.Time `bson:"expires_at"`
	Used          bool      `bson:"used"`
	UsedAt        *time.Time `bson:"used_at,omitempty"`
	CreatedBy     string    `bson:"created_by,omitempty"`
}

func NewToken(userID, email, tokenHash, purpose, createdBy string, expiresAt time.Time) *Token {
	return &Token{
		Entity:    shared.NewEntity(),
		UserID:    userID,
		Email:     email,
		TokenHash: tokenHash,
		Purpose:   purpose,
		ExpiresAt: expiresAt,
		CreatedBy: createdBy,
	}
}

func (t *Token) IsValid(now time.Time) bool {
	return !t.Used && now.Before(t.ExpiresAt)
}
