package mongodb

import (
	"context"
	"errors"
	"time"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type EmailRecipientRepo struct{ col *mongo.Collection }

func NewEmailRecipientRepo(db *Client) *EmailRecipientRepo {
	return &EmailRecipientRepo{col: db.Collection("email_recipients")}
}

func (r *EmailRecipientRepo) Create(ctx context.Context, rec *domainer.EmailRecipient) error {
	return insertOne(ctx, r.col, rec)
}

func (r *EmailRecipientRepo) List(ctx context.Context, orgID string, page, limit int) ([]domainer.EmailRecipient, int64, error) {
	return listByOrg[domainer.EmailRecipient](ctx, r.col, orgID, ListParams{
		Page: page, Limit: limit, Sort: bson.D{{Key: "name", Value: 1}},
	})
}

func (r *EmailRecipientRepo) FindByID(ctx context.Context, orgID, id string) (*domainer.EmailRecipient, error) {
	var rec domainer.EmailRecipient
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&rec)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &rec, err
}

func (r *EmailRecipientRepo) Update(ctx context.Context, rec *domainer.EmailRecipient) error {
	rec.Touch()
	return replaceByOrg(ctx, r.col, rec.OrganizationID, rec.ID, rec)
}

func (r *EmailRecipientRepo) Delete(ctx context.Context, orgID, id string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id, "organization_id": orgID})
	return err
}

func (r *EmailRecipientRepo) FindByPropertyID(ctx context.Context, orgID, propertyID, excludeID string) (*domainer.EmailRecipient, error) {
	filter := bson.M{
		"organization_id": orgID,
		"property_id":     propertyID,
	}
	if excludeID != "" {
		filter["_id"] = bson.M{"$ne": excludeID}
	}
	var rec domainer.EmailRecipient
	err := r.col.FindOne(ctx, filter).Decode(&rec)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &rec, err
}

func (r *EmailRecipientRepo) ListEnabledForType(ctx context.Context, orgID string, notifType domainer.NotificationType) ([]domainer.EmailRecipient, error) {
	filter := bson.M{
		"organization_id": orgID,
		"enabled":         true,
		"notification_types": notifType,
	}
	cursor, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []domainer.EmailRecipient
	return items, cursor.All(ctx, &items)
}

func (r *NotificationRepo) ListPendingEmail(ctx context.Context, orgID string, before time.Time) ([]domainnotif.Notification, error) {
	filter := bson.M{
		"organization_id": orgID,
		"channel":         domainnotif.ChannelEmail,
		"status":          domainnotif.StatusPending,
		"scheduled_at":    bson.M{"$lte": before},
	}
	opts := options.Find().SetSort(bson.D{{Key: "scheduled_at", Value: 1}})
	cursor, err := r.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []domainnotif.Notification
	return items, cursor.All(ctx, &items)
}
