package mongodb

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ListParams struct {
	Page   int
	Limit  int
	Filter bson.M
	Sort   bson.D
}

func listByOrg[T any](ctx context.Context, col *mongo.Collection, orgID string, p ListParams) ([]T, int64, error) {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Limit < 1 || p.Limit > 100 {
		p.Limit = 20
	}

	query := bson.M{"organization_id": orgID}
	for k, v := range p.Filter {
		query[k] = v
	}

	total, err := col.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}

	sort := p.Sort
	if sort == nil {
		sort = bson.D{{Key: "created_at", Value: -1}}
	}

	opts := options.Find().
		SetSkip(int64((p.Page - 1) * p.Limit)).
		SetLimit(int64(p.Limit)).
		SetSort(sort)

	cursor, err := col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var items []T
	if err := cursor.All(ctx, &items); err != nil {
		return nil, 0, err
	}
	if items == nil {
		items = []T{}
	}
	return items, total, nil
}

func insertOne(ctx context.Context, col *mongo.Collection, doc any) error {
	_, err := col.InsertOne(ctx, doc)
	return err
}

func replaceByOrg(ctx context.Context, col *mongo.Collection, orgID, id string, doc any) error {
	_, err := col.ReplaceOne(ctx, bson.M{"_id": id, "organization_id": orgID}, doc)
	return err
}

func patchByOrg(ctx context.Context, col *mongo.Collection, orgID, id string, update bson.M) error {
	_, err := col.UpdateOne(ctx, bson.M{"_id": id, "organization_id": orgID}, bson.M{"$set": update})
	return err
}
