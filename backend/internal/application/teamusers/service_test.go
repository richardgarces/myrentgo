package teamusers

import (
	"context"
	"errors"
	"testing"

	domain "github.com/richard/my-rent-go/internal/domain/user"
	"golang.org/x/crypto/bcrypt"
)

type mockRepo struct {
	users  map[string]*domain.User
	owners int64
}

func (m *mockRepo) Create(ctx context.Context, u *domain.User) error {
	if m.users == nil {
		m.users = make(map[string]*domain.User)
	}
	m.users[u.ID] = u
	return nil
}

func (m *mockRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	for _, u := range m.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, nil
}

func (m *mockRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	if u, ok := m.users[id]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockRepo) Update(ctx context.Context, u *domain.User) error {
	m.users[u.ID] = u
	return nil
}

func (m *mockRepo) ListByOrganization(ctx context.Context, orgID string, page, limit int) ([]domain.User, int64, error) {
	var out []domain.User
	for _, u := range m.users {
		if u.BelongsToOrg(orgID) {
			out = append(out, *u)
		}
	}
	return out, int64(len(out)), nil
}

func (m *mockRepo) CountOwnersInOrg(ctx context.Context, orgID string) (int64, error) {
	if m.owners > 0 {
		return m.owners, nil
	}
	var count int64
	for _, u := range m.users {
		if role, ok := u.OrgRole(orgID); ok && role == domain.RoleOwner {
			count++
		}
	}
	return count, nil
}

func TestCreate(t *testing.T) {
	ctx := context.Background()
	orgID := "org-1"
	repo := &mockRepo{users: map[string]*domain.User{}}
	svc := NewService(repo, bcrypt.MinCost)

	member, err := svc.Create(ctx, CreateCommand{
		OrganizationID: orgID,
		ActorID:        "owner-1",
		ActorRole:      domain.RoleOwner,
		Email:          "viewer@example.com",
		Password:       "password1",
		FirstName:      "View",
		LastName:       "Er",
		Role:           domain.RoleViewer,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if member.Email != "viewer@example.com" || member.Role != domain.RoleViewer {
		t.Fatalf("unexpected member: %+v", member)
	}
	if member.EmailVerified {
		t.Fatal("new team user should be unverified")
	}
}

func TestCreateValidation(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name string
		cmd  CreateCommand
		err  error
	}{
		{
			name: "forbidden role",
			cmd: CreateCommand{
				OrganizationID: "org-1",
				ActorID:        "v-1",
				ActorRole:      domain.RoleViewer,
				Email:          "a@b.com",
				Password:       "password1",
				FirstName:      "A",
				LastName:       "B",
			},
			err: ErrForbiddenRole,
		},
		{
			name: "admin cannot assign owner",
			cmd: CreateCommand{
				OrganizationID: "org-1",
				ActorID:        "admin-1",
				ActorRole:      domain.RoleAdmin,
				Email:          "o@b.com",
				Password:       "password1",
				FirstName:      "O",
				LastName:       "W",
				Role:           domain.RoleOwner,
			},
			err: ErrForbiddenRole,
		},
		{
			name: "duplicate email in org",
			cmd: CreateCommand{
				OrganizationID: "org-1",
				ActorID:        "owner-1",
				ActorRole:      domain.RoleOwner,
				Email:          "dup@example.com",
				Password:       "password1",
				FirstName:      "Dup",
				LastName:       "User",
			},
			err: ErrEmailExists,
		},
	}

	repo := &mockRepo{users: map[string]*domain.User{}}
	existing := domain.NewUser("dup@example.com", "Dup", "User")
	existing.Organizations = []domain.UserOrg{{OrganizationID: "org-1", Role: domain.RoleViewer}}
	repo.users[existing.ID] = existing
	svc := NewService(repo, bcrypt.MinCost)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.Create(ctx, tt.cmd)
			if !errors.Is(err, tt.err) {
				t.Fatalf("expected %v, got %v", tt.err, err)
			}
		})
	}
}

func TestUpdateSelfModification(t *testing.T) {
	ctx := context.Background()
	repo := &mockRepo{users: map[string]*domain.User{}}
	u := domain.NewUser("admin@example.com", "Admin", "User")
	u.Organizations = []domain.UserOrg{{OrganizationID: "org-1", Role: domain.RoleAdmin}}
	repo.users[u.ID] = u

	svc := NewService(repo, bcrypt.MinCost)
	name := "Changed"
	_, err := svc.Update(ctx, UpdateCommand{
		OrganizationID: "org-1",
		ActorID:        u.ID,
		ActorRole:      domain.RoleAdmin,
		UserID:         u.ID,
		FirstName:      &name,
	})
	if !errors.Is(err, ErrSelfModification) {
		t.Fatalf("expected ErrSelfModification, got %v", err)
	}
}

func TestRemoveLastOwner(t *testing.T) {
	ctx := context.Background()
	repo := &mockRepo{users: map[string]*domain.User{}, owners: 1}
	owner := domain.NewUser("owner@example.com", "Only", "Owner")
	owner.Organizations = []domain.UserOrg{{OrganizationID: "org-1", Role: domain.RoleOwner}}
	repo.users[owner.ID] = owner

	svc := NewService(repo, bcrypt.MinCost)
	err := svc.Remove(ctx, RemoveCommand{
		OrganizationID: "org-1",
		ActorID:        "admin-1",
		ActorRole:      domain.RoleOwner,
		UserID:         owner.ID,
	})
	if !errors.Is(err, ErrLastOwner) {
		t.Fatalf("expected ErrLastOwner, got %v", err)
	}
}
