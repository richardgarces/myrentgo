package syslog

import (
	"log/slog"
	"time"
)

type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

type Entry struct {
	ID        string         `json:"id"`
	Level     Level          `json:"level"`
	Category  string         `json:"category"`
	Message   string         `json:"message"`
	Timestamp time.Time      `json:"timestamp"`
	Fields    map[string]any `json:"fields,omitempty"`
}

func levelFromSlog(level slog.Level) Level {
	switch {
	case level >= slog.LevelError:
		return LevelError
	case level >= slog.LevelWarn:
		return LevelWarn
	case level >= slog.LevelInfo:
		return LevelInfo
	default:
		return LevelDebug
	}
}
