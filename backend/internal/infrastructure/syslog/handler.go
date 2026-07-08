package syslog

import (
	"context"
	"io"
	"log/slog"
)

type StoreHandler struct {
	store    *Store
	fallback slog.Handler
}

func NewStoreHandler(store *Store, w io.Writer, level slog.Level) *StoreHandler {
	return &StoreHandler{
		store:    store,
		fallback: slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level}),
	}
}

func (h *StoreHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.fallback.Enabled(ctx, level)
}

func (h *StoreHandler) Handle(ctx context.Context, r slog.Record) error {
	fields := recordFields(r)
	category := "app"
	if v, ok := fields["category"].(string); ok && v != "" {
		category = v
		delete(fields, "category")
	}
	h.store.Add(levelFromSlog(r.Level), category, r.Message, fields)
	return h.fallback.Handle(ctx, r)
}

func (h *StoreHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &StoreHandler{
		store:    h.store,
		fallback: h.fallback.WithAttrs(attrs),
	}
}

func (h *StoreHandler) WithGroup(name string) slog.Handler {
	return &StoreHandler{
		store:    h.store,
		fallback: h.fallback.WithGroup(name),
	}
}

func recordFields(r slog.Record) map[string]any {
	fields := make(map[string]any)
	r.Attrs(func(a slog.Attr) bool {
		fields[a.Key] = a.Value.Any()
		return true
	})
	return fields
}
