package mongodb

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Client struct {
	client   *mongo.Client
	database *mongo.Database
}

func Connect(ctx context.Context, uri, dbName string) (*Client, error) {
	opts := options.Client().ApplyURI(uri).
		SetMaxPoolSize(50).
		SetMinPoolSize(5).
		SetServerSelectionTimeout(3 * time.Second).
		SetConnectTimeout(3 * time.Second)

	client, err := mongo.Connect(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("connect mongodb: %w", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("ping mongodb: %w", err)
	}

	return &Client{client: client, database: client.Database(dbName)}, nil
}

func (c *Client) Database() *mongo.Database {
	return c.database
}

func (c *Client) Collection(name string) *mongo.Collection {
	return c.database.Collection(name)
}

func (c *Client) Disconnect(ctx context.Context) error {
	return c.client.Disconnect(ctx)
}

func (c *Client) EnsureIndexes(ctx context.Context) error {
	indexes := map[string][]mongo.IndexModel{
		"users": {
			{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true)},
		},
		"organizations": {
			{Keys: bson.D{{Key: "tax_id", Value: 1}}},
			{Keys: bson.D{{Key: "active", Value: 1}}},
		},
		"properties": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "type", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "building_id", Value: 1}}},
			{Keys: bson.D{{Key: "address.commune", Value: 1}}},
			{Keys: bson.D{{Key: "address.property_rol", Value: 1}}},
			{Keys: bson.D{{Key: "parking_property_id", Value: 1}}},
			{Keys: bson.D{{Key: "warehouse_property_id", Value: 1}}},
		},
		"tenants": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "tax_id", Value: 1}}},
		},
		"leases": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
			{Keys: bson.D{{Key: "property_id", Value: 1}}},
			{Keys: bson.D{{Key: "tenant_id", Value: 1}}},
			{Keys: bson.D{{Key: "end_date", Value: 1}}},
		},
		"payments": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
			{Keys: bson.D{{Key: "lease_id", Value: 1}}},
			{Keys: bson.D{{Key: "due_date", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "due_date", Value: 1}, {Key: "status", Value: 1}}},
		},
		"mortgages": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}}},
			{Keys: bson.D{{Key: "property_id", Value: 1}}},
			{Keys: bson.D{{Key: "bank_id", Value: 1}}},
		},
		"buildings": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}}},
		},
		"brokers": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}}},
		},
		"crm_contacts": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "type", Value: 1}}},
		},
		"documents": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}}},
			{Keys: bson.D{{Key: "expires_at", Value: 1}}},
			{Keys: bson.D{{Key: "category", Value: 1}}},
		},
		"maintenance": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
			{Keys: bson.D{{Key: "property_id", Value: 1}}},
			{Keys: bson.D{{Key: "scheduled_date", Value: 1}}},
			{Keys: bson.D{{Key: "next_due_date", Value: 1}}},
		},
		"tickets": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
			{Keys: bson.D{{Key: "property_id", Value: 1}}},
			{Keys: bson.D{{Key: "priority", Value: 1}}},
		},
		"appraisals": {
			{Keys: bson.D{{Key: "property_id", Value: 1}, {Key: "appraisal_date", Value: -1}}},
		},
		"reminders": {
			{Keys: bson.D{{Key: "status", Value: 1}, {Key: "scheduled_at", Value: 1}}},
		},
		"notifications": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "type", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "tenant_id", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "scheduled_at", Value: -1}}},
			{Keys: bson.D{
				{Key: "organization_id", Value: 1},
				{Key: "type", Value: 1},
				{Key: "metadata.payment_id", Value: 1},
				{Key: "metadata.trigger_day", Value: 1},
			}},
		},
		"notification_settings": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}}, Options: options.Index().SetUnique(true)},
		},
		"email_recipients": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "email", Value: 1}}},
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "enabled", Value: 1}}},
		},
		"audit_logs": {
			{Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "created_at", Value: -1}}},
			{Keys: bson.D{{Key: "user_id", Value: 1}}},
			{Keys: bson.D{{Key: "resource", Value: 1}, {Key: "resource_id", Value: 1}}},
		},
		"refresh_tokens": {
			{Keys: bson.D{{Key: "user_id", Value: 1}}},
			{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
		},
	}

	for coll, models := range indexes {
		if len(models) == 0 {
			continue
		}
		_, err := c.Collection(coll).Indexes().CreateMany(ctx, models)
		if err != nil {
			return fmt.Errorf("create indexes for %s: %w", coll, err)
		}
	}
	if _, err := c.Collection("documents").UpdateMany(ctx,
		bson.M{"active": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"active": true}},
	); err != nil {
		return fmt.Errorf("migrate documents active field: %w", err)
	}
	return nil
}
