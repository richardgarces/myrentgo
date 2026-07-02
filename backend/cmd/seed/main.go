package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/richard/my-rent-go/internal/config"
	"github.com/richard/my-rent-go/internal/domain/organization"
	"github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	"go.mongodb.org/mongo-driver/bson"
	"golang.org/x/crypto/bcrypt"
)

const adminEmail = "admin@myrent.local"
const adminPassword = "admin123"

var orgScopedCollections = []string{
	"properties", "tenants", "leases", "payments", "mortgages",
	"buildings", "brokers", "crm_contacts", "documents", "maintenance",
	"tickets", "audit_logs",
}

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := mongodb.Connect(ctx, cfg.MongoDB.URI, cfg.MongoDB.Database)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Disconnect(context.Background())

	if err := db.EnsureIndexes(ctx); err != nil {
		log.Fatal(err)
	}

	userRepo := mongodb.NewUserRepo(db)
	orgRepo := mongodb.NewOrgRepo(db)

	if os.Getenv("SEED_REPAIR") == "1" {
		if err := repairOrganizationAlignment(ctx, db, userRepo, orgRepo); err != nil {
			log.Fatal(err)
		}
		return
	}

	existing, _ := userRepo.FindByEmail(ctx, adminEmail)
	if existing != nil && os.Getenv("SEED_FORCE") != "1" {
		fmt.Println("Bootstrap skipped: admin user already exists (use SEED_FORCE=1 to reset)")
		fmt.Println("  Email:    ", adminEmail)
		fmt.Println("  Password: ", adminPassword)
		fmt.Println("  Login:    admin /", adminPassword)
		if len(existing.Organizations) > 0 {
			fmt.Println("  Org ID:   ", existing.Organizations[0].OrganizationID)
		}
		return
	}

	if os.Getenv("SEED_FORCE") == "1" {
		for _, coll := range []string{"users", "organizations"} {
			_ = db.Collection(coll).Drop(ctx)
		}
		if err := db.EnsureIndexes(ctx); err != nil {
			log.Fatal(err)
		}
	}

	org := organization.NewOrganization("Mi Organización", "")
	if err := orgRepo.Create(ctx, org); err != nil {
		log.Fatal(err)
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(adminPassword), 12)
	u := user.NewUser(adminEmail, "Admin", "Sistema")
	u.PasswordHash = string(hash)
	u.Organizations = []user.UserOrg{{OrganizationID: org.ID, Role: user.RoleOwner}}

	if err := userRepo.Create(ctx, u); err != nil {
		log.Fatal(err)
	}

	if n, err := migrateDataToOrganization(ctx, db, org.ID); err != nil {
		log.Fatal(err)
	} else if n > 0 {
		fmt.Printf("Aligned %d existing documents to organization %s\n", n, org.ID)
	}

	fmt.Println("Admin bootstrap completed successfully")
	fmt.Println("  Email:    ", adminEmail)
	fmt.Println("  Password: ", adminPassword)
	fmt.Println("  Login:    admin /", adminPassword)
	fmt.Println("  Org ID:   ", org.ID)
}

func migrateDataToOrganization(ctx context.Context, db *mongodb.Client, targetOrgID string) (int64, error) {
	var total int64
	for _, coll := range orgScopedCollections {
		res, err := db.Collection(coll).UpdateMany(ctx,
			bson.M{"organization_id": bson.M{"$ne": targetOrgID}},
			bson.M{"$set": bson.M{"organization_id": targetOrgID}},
		)
		if err != nil {
			return total, fmt.Errorf("migrate %s: %w", coll, err)
		}
		total += res.ModifiedCount
	}
	return total, nil
}

func repairOrganizationAlignment(ctx context.Context, db *mongodb.Client, userRepo *mongodb.UserRepo, orgRepo *mongodb.OrgRepo) error {
	admin, err := userRepo.FindByEmail(ctx, adminEmail)
	if err != nil {
		return err
	}
	if admin == nil {
		fmt.Println("Repair skipped: admin user not found (run bootstrap first)")
		return nil
	}
	if len(admin.Organizations) == 0 {
		return fmt.Errorf("admin user has no organization")
	}

	adminOrgID := admin.Organizations[0].OrganizationID
	if err := ensureOrganization(ctx, orgRepo, adminOrgID); err != nil {
		return err
	}

	n, err := migrateDataToOrganization(ctx, db, adminOrgID)
	if err != nil {
		return err
	}
	fmt.Printf("Repair complete: aligned %d documents to org %s\n", n, adminOrgID)
	return nil
}

func ensureOrganization(ctx context.Context, orgRepo *mongodb.OrgRepo, orgID string) error {
	existing, err := orgRepo.FindByID(ctx, orgID)
	if err != nil {
		return err
	}
	if existing != nil {
		return nil
	}

	org := organization.NewOrganization("Mi Organización", "")
	org.ID = orgID
	if err := orgRepo.Create(ctx, org); err != nil {
		return err
	}
	fmt.Println("Created missing organization record:", orgID)
	return nil
}

func init() {
	if os.Getenv("APP_ENV") == "" {
		os.Setenv("APP_ENV", "development")
	}
}
