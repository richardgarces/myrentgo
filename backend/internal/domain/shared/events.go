package shared

import (
	"time"

	"github.com/google/uuid"
)

type DomainEvent interface {
	EventName() string
	AggregateID() string
	OccurredAt() time.Time
}

type BaseEvent struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	AggregateId string    `json:"aggregate_id"`
	OccurredOn  time.Time `json:"occurred_on"`
	Payload     any       `json:"payload,omitempty"`
}

func NewBaseEvent(name, aggregateID string, payload any) BaseEvent {
	return BaseEvent{
		ID:          uuid.New().String(),
		Name:        name,
		AggregateId: aggregateID,
		OccurredOn:  time.Now().UTC(),
		Payload:     payload,
	}
}

func (e BaseEvent) EventName() string     { return e.Name }
func (e BaseEvent) AggregateID() string   { return e.AggregateId }
func (e BaseEvent) OccurredAt() time.Time { return e.OccurredOn }
