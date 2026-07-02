package shared

import (
	"time"

	"github.com/google/uuid"
)

type Entity struct {
	ID        string    `json:"id" bson:"_id"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
	UpdatedAt time.Time `json:"updated_at" bson:"updated_at"`
}

func NewEntity() Entity {
	now := time.Now().UTC()
	return Entity{
		ID:        uuid.New().String(),
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func (e *Entity) Touch() {
	e.UpdatedAt = time.Now().UTC()
}

type Money struct {
	Amount   float64 `json:"amount" bson:"amount"`
	Currency string  `json:"currency" bson:"currency"`
}

func NewMoney(amount float64, currency string) Money {
	if currency == "" {
		currency = "CLP"
	}
	return Money{Amount: amount, Currency: currency}
}

type Address struct {
	Street      string  `json:"street" bson:"street"`
	Number      string  `json:"number" bson:"number"`
	Unit        string  `json:"unit,omitempty" bson:"unit,omitempty"`
	Commune     string  `json:"commune" bson:"commune"`
	City        string  `json:"city" bson:"city"`
	Region      string  `json:"region" bson:"region"`
	Country     string  `json:"country" bson:"country"`
	PostalCode  string  `json:"postal_code,omitempty" bson:"postal_code,omitempty"`
	PropertyRol string  `json:"property_rol,omitempty" bson:"property_rol,omitempty"`
	Latitude    float64 `json:"latitude,omitempty" bson:"latitude,omitempty"`
	Longitude   float64 `json:"longitude,omitempty" bson:"longitude,omitempty"`
}

type ContactInfo struct {
	Email   string `json:"email,omitempty" bson:"email,omitempty"`
	Phone   string `json:"phone,omitempty" bson:"phone,omitempty"`
	Mobile  string `json:"mobile,omitempty" bson:"mobile,omitempty"`
	WhatsApp string `json:"whatsapp,omitempty" bson:"whatsapp,omitempty"`
}
