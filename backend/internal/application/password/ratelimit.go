package password

import (
	"sync"
	"time"
)

type emailRateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
	limit    int
	window   time.Duration
}

func newEmailRateLimiter(limit int, window time.Duration) *emailRateLimiter {
	return &emailRateLimiter{
		attempts: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (r *emailRateLimiter) allow(email string, now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	cutoff := now.Add(-r.window)
	history := r.attempts[email]
	filtered := history[:0]
	for _, t := range history {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}
	if len(filtered) >= r.limit {
		r.attempts[email] = filtered
		return false
	}
	filtered = append(filtered, now)
	r.attempts[email] = filtered
	return true
}
