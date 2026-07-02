package eventbus

import (
	"context"
	"log/slog"
	"sync"

	"github.com/richard/my-rent-go/internal/domain/shared"
)

type Handler func(ctx context.Context, event shared.DomainEvent) error

type EventBus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
}

func New() *EventBus {
	return &EventBus{
		handlers: make(map[string][]Handler),
	}
}

func (b *EventBus) Subscribe(eventName string, handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventName] = append(b.handlers[eventName], handler)
}

func (b *EventBus) Publish(ctx context.Context, event shared.DomainEvent) {
	b.mu.RLock()
	handlers := b.handlers[event.EventName()]
	b.mu.RUnlock()

	for _, h := range handlers {
		go func(handler Handler) {
			if err := handler(ctx, event); err != nil {
				slog.Error("event handler failed",
					"event", event.EventName(),
					"aggregate", event.AggregateID(),
					"error", err,
				)
			}
		}(h)
	}
}
