package mongodb

import (
	"context"
	"time"

	domainverify "github.com/richard/my-rent-go/internal/domain/emailverification"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type EmailVerificationRepo struct {
	col *mongo.Collection
}

func NewEmailVerificationRepo(db *Client) *EmailVerificationRepo {
	return &EmailVerificationRepo{col: db.Collection("email_verification_tokens")}
}

func (r *EmailVerificationRepo) Create(ctx context.Context, token *domainverify.Token) error {
	_, err := r.col.InsertOne(ctx, token)
	return err
}

func (r *EmailVerificationRepo) InvalidateForUser(ctx context.Context, userID string) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateMany(ctx,
		bson.M{"user_id": userID, "used": false},
		bson.M{"$set": bson.M{"used": true, "used_at": now}},
	)
	return err
}

func (r *EmailVerificationRepo) MarkUsed(ctx context.Context, tokenID string, usedAt time.Time) error {
	_, err := r.col.UpdateOne(ctx,
		bson.M{"_id": tokenID},
		bson.M{"$set": bson.M{"used": true, "used_at": usedAt}},
	)
	return err
}

func (r *EmailVerificationRepo) FindValidMatching(ctx context.Context, raw string, compare func(hash, raw string) bool) (*domainverify.Token, error) {
	now := time.Now().UTC()
	cursor, err := r.col.Find(ctx,
		bson.M{
			"used":       false,
			"expires_at": bson.M{"$gt": now},
		},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var token domainverify.Token
		if err := cursor.Decode(&token); err != nil {
			return nil, err
		}
		if compare(token.TokenHash, raw) {
			return &token, nil
		}
	}
	return nil, nil
}
