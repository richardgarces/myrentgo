package metrics

import (
	"context"
	"log/slog"
	"time"

	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
)

const defaultRefreshInterval = 60 * time.Second

// StartRefresher periodically updates gauges (MongoDB health, uptime, entity counts).
func StartRefresher(ctx context.Context, db *mongodb.Client, interval time.Duration) {
	if interval <= 0 {
		interval = defaultRefreshInterval
	}

	refresh := func() {
		runCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		UptimeSeconds.Set(syslog.UptimeSeconds())

		if err := db.Ping(runCtx); err != nil {
			MongoDBUp.Set(0)
			slog.Debug("metrics: mongodb ping failed", "error", err)
		} else {
			MongoDBUp.Set(1)
		}

		counts, err := db.GlobalMetrics(runCtx)
		if err != nil {
			slog.Debug("metrics: global counts refresh failed", "error", err)
			return
		}
		EntitiesTotal.WithLabelValues("organizations").Set(float64(counts.Organizations))
		EntitiesTotal.WithLabelValues("users").Set(float64(counts.Users))
		EntitiesTotal.WithLabelValues("properties").Set(float64(counts.Properties))
		EntitiesTotal.WithLabelValues("leases").Set(float64(counts.Leases))
		EntitiesTotal.WithLabelValues("active_leases").Set(float64(counts.ActiveLeases))
		EntitiesTotal.WithLabelValues("pending_payments").Set(float64(counts.PendingPayments))
		EntitiesTotal.WithLabelValues("documents").Set(float64(counts.Documents))
		EntitiesTotal.WithLabelValues("tenants").Set(float64(counts.Tenants))
	}

	go func() {
		refresh()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				refresh()
			}
		}
	}()
}
