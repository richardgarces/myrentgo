package syslog

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Filter struct {
	Level    string
	FromDate *time.Time
	ToDate   *time.Time
	Query    string
	Page     int
	Limit    int
}

var defaultStore = NewStore(5000)

func DefaultStore() *Store { return defaultStore }

func InitDefault(maxEntries int) *Store {
	if maxEntries < 100 {
		maxEntries = 5000
	}
	defaultStore = NewStore(maxEntries)
	return defaultStore
}

type Store struct {
	mu       sync.RWMutex
	entries  []Entry
	max      int
	sequence atomic.Uint64
}

func NewStore(maxEntries int) *Store {
	if maxEntries < 100 {
		maxEntries = 5000
	}
	return &Store{
		entries: make([]Entry, 0, 256),
		max:     maxEntries,
	}
}

func (s *Store) Add(level Level, category, message string, fields map[string]any) Entry {
	entry := Entry{
		ID:        s.nextID(),
		Level:     level,
		Category:  category,
		Message:   message,
		Timestamp: time.Now().UTC(),
	}
	if len(fields) > 0 {
		entry.Fields = make(map[string]any, len(fields))
		for k, v := range fields {
			entry.Fields[k] = v
		}
	}

	s.mu.Lock()
	s.entries = append(s.entries, entry)
	if len(s.entries) > s.max {
		s.entries = s.entries[len(s.entries)-s.max:]
	}
	s.mu.Unlock()
	return entry
}

func (s *Store) List(f Filter) ([]Entry, int64) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.Limit < 1 {
		f.Limit = 50
	}
	if f.Limit > 200 {
		f.Limit =  200
	}

	level := strings.ToLower(strings.TrimSpace(f.Level))
	query := strings.ToLower(strings.TrimSpace(f.Query))

	s.mu.RLock()
	matched := make([]Entry, 0, len(s.entries))
	for i := len(s.entries) - 1; i >= 0; i-- {
		e := s.entries[i]
		if level != "" && string(e.Level) != level {
			continue
		}
		if f.FromDate != nil && e.Timestamp.Before(*f.FromDate) {
			continue
		}
		if f.ToDate != nil && e.Timestamp.After(*f.ToDate) {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(e.Message), query) &&
			!strings.Contains(strings.ToLower(e.Category), query) &&
			!fieldsContain(e.Fields, query) {
			continue
		}
		matched = append(matched, e)
	}
	s.mu.RUnlock()

	total := int64(len(matched))
	start := (f.Page - 1) * f.Limit
	if start >= len(matched) {
		return []Entry{}, total
	}
	end := start + f.Limit
	if end > len(matched) {
		end = len(matched)
	}
	out := matched[start:end]
	if out == nil {
		out = []Entry{}
	}
	return out, total
}

func fieldsContain(fields map[string]any, query string) bool {
	if len(fields) == 0 {
		return false
	}
	for k, v := range fields {
		if strings.Contains(strings.ToLower(k), query) {
			return true
		}
		if strings.Contains(strings.ToLower(formatValue(v)), query) {
			return true
		}
	}
	return false
}

func formatValue(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []string:
		return strings.Join(t, " ")
	default:
		return fmt.Sprint(v)
	}
}

func (s *Store) nextID() string {
	n := s.sequence.Add(1)
	return time.Now().UTC().Format("20060102150405") + "-" + itoa(n)
}

func itoa(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
