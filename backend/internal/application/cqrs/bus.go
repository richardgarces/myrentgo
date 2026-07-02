package cqrs

import (
	"context"
	"fmt"
	"reflect"
)

type Command interface{}

type Query interface{}

type Bus struct {
	commands map[string]func(ctx context.Context, cmd Command) error
	queries  map[string]func(ctx context.Context, query Query) (any, error)
}

func NewBus() *Bus {
	return &Bus{
		commands: make(map[string]func(ctx context.Context, cmd Command) error),
		queries:  make(map[string]func(ctx context.Context, query Query) (any, error)),
	}
}

func (b *Bus) RegisterCommand(cmd Command, handler func(ctx context.Context, cmd Command) error) {
	b.commands[typeName(cmd)] = handler
}

func (b *Bus) RegisterQuery(query Query, handler func(ctx context.Context, query Query) (any, error)) {
	b.queries[typeName(query)] = handler
}

func (b *Bus) Dispatch(ctx context.Context, cmd Command) error {
	handler, ok := b.commands[typeName(cmd)]
	if !ok {
		return ErrHandlerNotFound
	}
	return handler(ctx, cmd)
}

func (b *Bus) Ask(ctx context.Context, query Query) (any, error) {
	handler, ok := b.queries[typeName(query)]
	if !ok {
		return nil, ErrHandlerNotFound
	}
	return handler(ctx, query)
}

func typeName(v any) string {
	t := reflect.TypeOf(v)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	return t.Name()
}

func Register[C Command](b *Bus, handler func(ctx context.Context, cmd C) error) {
	var zero C
	b.commands[typeName(zero)] = func(ctx context.Context, cmd Command) error {
		c, ok := cmd.(C)
		if !ok {
			return fmt.Errorf("invalid command type")
		}
		return handler(ctx, c)
	}
}
