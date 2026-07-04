package mongodb

import (
	"context"
	"errors"

	appproperty "github.com/richard/my-rent-go/internal/application/property"
	domainorg "github.com/richard/my-rent-go/internal/domain/organization"
	domainprop "github.com/richard/my-rent-go/internal/domain/property"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type UserRepo struct {
	col *mongo.Collection
}

func NewUserRepo(db *Client) *UserRepo {
	return &UserRepo{col: db.Collection("users")}
}

func (r *UserRepo) Create(ctx context.Context, u *domainuser.User) error {
	_, err := r.col.InsertOne(ctx, u)
	return err
}

func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*domainuser.User, error) {
	var u domainuser.User
	err := r.col.FindOne(ctx, bson.M{"email": email}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) FindByID(ctx context.Context, id string) (*domainuser.User, error) {
	var u domainuser.User
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) Update(ctx context.Context, u *domainuser.User) error {
	u.Touch()
	_, err := r.col.ReplaceOne(ctx, bson.M{"_id": u.ID}, u)
	return err
}

type OrgRepo struct {
	col *mongo.Collection
}

func NewOrgRepo(db *Client) *OrgRepo {
	return &OrgRepo{col: db.Collection("organizations")}
}

func (r *OrgRepo) Create(ctx context.Context, org *domainorg.Organization) error {
	_, err := r.col.InsertOne(ctx, org)
	return err
}

func (r *OrgRepo) FindByID(ctx context.Context, id string) (*domainorg.Organization, error) {
	var org domainorg.Organization
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&org)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &org, err
}

func (r *OrgRepo) DeleteByID(ctx context.Context, id string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *OrgRepo) CreateForUser(ctx context.Context, userID, name string) (string, error) {
	org := domainorg.NewOrganization(name, "")
	if err := r.Create(ctx, org); err != nil {
		return "", err
	}
	return org.ID, nil
}

type PropertyRepo struct {
	col *mongo.Collection
}

func NewPropertyRepo(db *Client) *PropertyRepo {
	return &PropertyRepo{col: db.Collection("properties")}
}

func (r *PropertyRepo) Create(ctx context.Context, p *domainprop.Property) error {
	_, err := r.col.InsertOne(ctx, p)
	return err
}

func (r *PropertyRepo) FindByID(ctx context.Context, orgID, id string) (*domainprop.Property, error) {
	var p domainprop.Property
	err := r.col.FindOne(ctx, bson.M{"_id": id, "organization_id": orgID}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err == nil {
		p.Financials.NormalizeMortgageUF()
	}
	return &p, err
}

func (r *PropertyRepo) List(ctx context.Context, orgID string, filter appproperty.ListFilter) ([]domainprop.Property, int64, error) {
	query := bson.M{"organization_id": orgID}
	if filter.Status != "" {
		query["status"] = filter.Status
	}
	if filter.Type != "" {
		query["type"] = filter.Type
	}

	total, err := r.col.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}

	skip := int64((filter.Page - 1) * filter.Limit)
	opts := options.Find().
		SetSkip(skip).
		SetLimit(int64(filter.Limit)).
		SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := r.col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var items []domainprop.Property
	if err := cursor.All(ctx, &items); err != nil {
		return nil, 0, err
	}
	if items == nil {
		items = []domainprop.Property{}
	}
	for i := range items {
		items[i].Financials.NormalizeMortgageUF()
	}
	return items, total, nil
}

func (r *PropertyRepo) ListWithMortgage(ctx context.Context, orgID string) ([]domainprop.Property, error) {
	query := bson.M{
		"organization_id": orgID,
		"$or": bson.A{
			bson.M{"financials.monthly_mortgage_uf": bson.M{"$gt": 0}},
			bson.M{"financials.monthly_mortgage.amount": bson.M{"$gt": 0}},
		},
	}
	cursor, err := r.col.Find(ctx, query)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var items []domainprop.Property
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []domainprop.Property{}
	}
	for i := range items {
		items[i].Financials.NormalizeMortgageUF()
	}
	return items, nil
}

func (r *PropertyRepo) Update(ctx context.Context, p *domainprop.Property) error {
	p.Touch()
	_, err := r.col.ReplaceOne(ctx, bson.M{"_id": p.ID, "organization_id": p.OrganizationID}, p)
	return err
}

func (r *PropertyRepo) Delete(ctx context.Context, orgID, id string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id, "organization_id": orgID})
	return err
}

// SyncWarehouseLink keeps warehouse ownership on the apartment document only.
// A warehouse may belong to at most one apartment; legacy apartment_property_id on
// warehouses is cleared whenever an apartment link is created or updated.
func (r *PropertyRepo) SyncWarehouseLink(ctx context.Context, orgID, apartmentID, warehouseID string) error {
	if warehouseID != "" {
		if _, err := r.col.UpdateMany(ctx, bson.M{
			"organization_id":       orgID,
			"type":                  string(domainprop.TypeApartment),
			"warehouse_property_id": warehouseID,
			"_id":                   bson.M{"$ne": apartmentID},
		}, bson.M{"$unset": bson.M{"warehouse_property_id": ""}}); err != nil {
			return err
		}
		if _, err := r.col.UpdateOne(ctx, bson.M{
			"_id":             warehouseID,
			"organization_id": orgID,
		}, bson.M{"$unset": bson.M{"apartment_property_id": ""}}); err != nil {
			return err
		}
	}
	_, err := r.col.UpdateMany(ctx, bson.M{
		"organization_id":       orgID,
		"type":                  string(domainprop.TypeWarehouse),
		"apartment_property_id": apartmentID,
	}, bson.M{"$unset": bson.M{"apartment_property_id": ""}})
	return err
}
