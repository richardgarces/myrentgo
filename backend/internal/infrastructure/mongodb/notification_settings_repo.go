package mongodb

import (
	"context"
	"errors"

	domainsettings "github.com/richard/my-rent-go/internal/domain/notificationsettings"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type NotificationSettingsRepo struct{ col *mongo.Collection }

func NewNotificationSettingsRepo(db *Client) *NotificationSettingsRepo {
	return &NotificationSettingsRepo{col: db.Collection("notification_settings")}
}

func (r *NotificationSettingsRepo) GetOrCreate(ctx context.Context, orgID string) (*domainsettings.Settings, error) {
	var s domainsettings.Settings
	err := r.col.FindOne(ctx, bson.M{"organization_id": orgID}).Decode(&s)
	if errors.Is(err, mongo.ErrNoDocuments) {
		s = *domainsettings.NewSettings(orgID)
		if err := insertOne(ctx, r.col, &s); err != nil {
			return nil, err
		}
		return &s, nil
	}
	if err != nil {
		return nil, err
	}
	before := len(s.Rules)
	mergeMissingRules(&s)
	if len(s.Rules) > before {
		if err := r.Update(ctx, &s); err != nil {
			return nil, err
		}
	}
	return &s, nil
}

func mergeMissingRules(s *domainsettings.Settings) {
	existing := make(map[string]bool, len(s.Rules))
	for _, r := range s.Rules {
		existing[r.ID] = true
	}
	for _, def := range domainsettings.DefaultRules() {
		if !existing[def.ID] {
			s.Rules = append(s.Rules, def)
		}
	}
}

func (r *NotificationSettingsRepo) Update(ctx context.Context, s *domainsettings.Settings) error {
	s.Touch()
	return replaceByOrg(ctx, r.col, s.OrganizationID, s.ID, s)
}
