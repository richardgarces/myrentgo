package mongodb

import (
	"context"
	"errors"
	"time"

	domainreset "github.com/richard/my-rent-go/internal/domain/passwordreset"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type PasswordResetRepo struct {
	col *mongo.Collection
}

func NewPasswordResetRepo(db *Client) *PasswordResetRepo {
	return &PasswordResetRepo{col: db.Collection("password_reset_tokens")}
}

func (r *PasswordResetRepo) Create(ctx context.Context, token *domainreset.Token) error {
	_, err := r.col.InsertOne(ctx, token)
	return err
}

func (r *PasswordResetRepo) InvalidateForUser(ctx context.Context, userID string) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateMany(ctx,
		bson.M{"user_id": userID, "used": false},
		bson.M{"$set": bson.M{"used": true, "used_at": now}},
	)
	return err
}

func (r *PasswordResetRepo) FindValidByUserID(ctx context.Context, userID string) (*domainreset.Token, error) {
	now := time.Now().UTC()
	var token domainreset.Token
	err := r.col.FindOne(ctx,
		bson.M{
			"user_id":    userID,
			"used":       false,
			"expires_at": bson.M{"$gt": now},
		},
		options.FindOne().SetSort(bson.D{{Key: "created_at", Value: -1}}),
	).Decode(&token)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &token, err
}

func (r *PasswordResetRepo) MarkUsed(ctx context.Context, tokenID string, usedAt time.Time) error {
	_, err := r.col.UpdateOne(ctx,
		bson.M{"_id": tokenID},
		bson.M{"$set": bson.M{"used": true, "used_at": usedAt}},
	)
	return err
}
