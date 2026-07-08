package leaserenewal

import (
	"context"
	"log/slog"
	"time"

	"github.com/richard/my-rent-go/internal/infrastructure/metrics"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
)

// StartBackgroundScheduler renews expired active leases with auto_renew enabled.
func StartBackgroundScheduler(ctx context.Context, leases *mongodb.LeaseRepo, orgs *mongodb.OrgRepo, interval time.Duration) {
	run := func() {
		start := time.Now()
		runCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		orgIDs, err := orgs.ListActiveIDs(runCtx)
		if err != nil {
			metrics.RecordSchedulerRun("lease_renewal", false, time.Since(start).Seconds())
			slog.Error("lease renewal: list organizations", "error", err)
			return
		}
		now := time.Now().UTC()
		failed := false
		for _, orgID := range orgIDs {
			renewed, err := ProcessAutoRenewals(runCtx, leases, orgID, now)
			if err != nil {
				failed = true
				slog.Error("lease renewal: run failed", "org_id", orgID, "error", err)
				continue
			}
			if renewed > 0 {
				slog.Info("lease renewal: completed", "org_id", orgID, "renewed", renewed)
			}
		}
		metrics.RecordSchedulerRun("lease_renewal", !failed, time.Since(start).Seconds())
	}

	go func() {
		run()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}

func ProcessAutoRenewals(ctx context.Context, leases *mongodb.LeaseRepo, orgID string, now time.Time) (int, error) {
	items, err := leases.ListExpiredForAutoRenew(ctx, orgID, now)
	if err != nil {
		return 0, err
	}
	renewed := 0
	for i := range items {
		l := &items[i]
		if l.ApplyAutoRenewal(now) {
			if err := leases.Update(ctx, l); err != nil {
				return renewed, err
			}
			renewed++
		}
	}
	return renewed, nil
}
