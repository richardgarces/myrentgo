package mongodb

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
)

type SystemMetrics struct {
	Users            int64 `json:"users"`
	Properties       int64 `json:"properties"`
	Leases           int64 `json:"leases"`
	ActiveLeases     int64 `json:"active_leases"`
	PendingPayments  int64 `json:"pending_payments"`
	Documents        int64 `json:"documents"`
	Tenants          int64 `json:"tenants"`
}

type GlobalSystemMetrics struct {
	Organizations   int64
	Users           int64
	Properties      int64
	Leases          int64
	ActiveLeases    int64
	PendingPayments int64
	Documents       int64
	Tenants         int64
}

func (c *Client) Ping(ctx context.Context) error {
	return c.client.Ping(ctx, nil)
}

func (c *Client) OrgMetrics(ctx context.Context, orgID string) (*SystemMetrics, error) {
	m := &SystemMetrics{}
	var err error

	m.Users, err = c.Collection("users").CountDocuments(ctx, bson.M{"organizations.organization_id": orgID})
	if err != nil {
		return nil, err
	}
	m.Properties, err = c.Collection("properties").CountDocuments(ctx, bson.M{"organization_id": orgID})
	if err != nil {
		return nil, err
	}
	m.Leases, err = c.Collection("leases").CountDocuments(ctx, bson.M{"organization_id": orgID})
	if err != nil {
		return nil, err
	}
	m.ActiveLeases, err = c.Collection("leases").CountDocuments(ctx, bson.M{"organization_id": orgID, "status": "active"})
	if err != nil {
		return nil, err
	}
	m.PendingPayments, err = c.Collection("payments").CountDocuments(ctx, bson.M{"organization_id": orgID, "status": "pending"})
	if err != nil {
		return nil, err
	}
	m.Documents, err = c.Collection("documents").CountDocuments(ctx, bson.M{"organization_id": orgID})
	if err != nil {
		return nil, err
	}
	m.Tenants, err = c.Collection("tenants").CountDocuments(ctx, bson.M{"organization_id": orgID})
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (c *Client) GlobalMetrics(ctx context.Context) (*GlobalSystemMetrics, error) {
	m := &GlobalSystemMetrics{}
	var err error

	m.Organizations, err = c.Collection("organizations").CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	m.Users, err = c.Collection("users").CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	m.Properties, err = c.Collection("properties").CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	m.Leases, err = c.Collection("leases").CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	m.ActiveLeases, err = c.Collection("leases").CountDocuments(ctx, bson.M{"status": "active"})
	if err != nil {
		return nil, err
	}
	m.PendingPayments, err = c.Collection("payments").CountDocuments(ctx, bson.M{"status": "pending"})
	if err != nil {
		return nil, err
	}
	m.Documents, err = c.Collection("documents").CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	m.Tenants, err = c.Collection("tenants").CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	return m, nil
}
