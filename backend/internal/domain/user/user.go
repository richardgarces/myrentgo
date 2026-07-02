package user

import "github.com/richard/my-rent-go/internal/domain/shared"

type Role string

const (
	RoleOwner    Role = "owner"
	RoleAdmin    Role = "admin"
	RoleManager  Role = "manager"
	RoleAccountant Role = "accountant"
	RoleViewer   Role = "viewer"
)

type User struct {
	shared.Entity `bson:",inline"`
	Email         string   `json:"email" bson:"email"`
	PasswordHash  string   `json:"-" bson:"password_hash"`
	FirstName     string   `json:"first_name" bson:"first_name"`
	LastName      string   `json:"last_name" bson:"last_name"`
	Phone         string   `json:"phone,omitempty" bson:"phone,omitempty"`
	AvatarURL     string   `json:"avatar_url,omitempty" bson:"avatar_url,omitempty"`
	Active        bool     `json:"active" bson:"active"`
	MFAEnabled    bool     `json:"mfa_enabled" bson:"mfa_enabled"`
	MFASecret     string   `json:"-" bson:"mfa_secret,omitempty"`
	Organizations []UserOrg `json:"organizations" bson:"organizations"`
	Preferences   UserPrefs `json:"preferences" bson:"preferences"`
}

type UserOrg struct {
	OrganizationID string `json:"organization_id" bson:"organization_id"`
	Role           Role   `json:"role" bson:"role"`
}

type UserPrefs struct {
	Theme  string `json:"theme" bson:"theme"`
	Locale string `json:"locale" bson:"locale"`
}

func NewUser(email, firstName, lastName string) *User {
	return &User{
		Entity:    shared.NewEntity(),
		Email:     email,
		FirstName: firstName,
		LastName:  lastName,
		Active:    true,
		Preferences: UserPrefs{
			Theme:  "system",
			Locale: "es",
		},
	}
}

func (u *User) FullName() string {
	return u.FirstName + " " + u.LastName
}

func (u *User) HasRole(orgID string, roles ...Role) bool {
	for _, o := range u.Organizations {
		if o.OrganizationID == orgID {
			for _, r := range roles {
				if o.Role == r {
					return true
				}
			}
		}
	}
	return false
}
