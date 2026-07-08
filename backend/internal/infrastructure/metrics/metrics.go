package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const namespace = "myrent"

var (
	HTTPRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "http_requests_total",
		Help:      "Total HTTP requests processed.",
	}, []string{"method", "path", "status"})

	HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Name:      "http_request_duration_seconds",
		Help:      "HTTP request latency in seconds.",
		Buckets:   prometheus.DefBuckets,
	}, []string{"method", "path"})

	HTTPRequestsInFlight = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "http_requests_in_flight",
		Help:      "Number of HTTP requests currently being processed.",
	})

	MongoDBUp = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "mongodb_up",
		Help:      "1 if MongoDB responds to ping, 0 otherwise.",
	})

	UptimeSeconds = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "uptime_seconds",
		Help:      "Process uptime in seconds.",
	})

	EntitiesTotal = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "entities_total",
		Help:      "Total entity counts across all organizations.",
	}, []string{"entity"})

	LoginAttemptsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "login_attempts_total",
		Help:      "Login attempts by result.",
	}, []string{"result"})

	DocumentUploadsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "document_uploads_total",
		Help:      "Document upload attempts by result.",
	}, []string{"result"})

	SchedulerRunsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "scheduler_runs_total",
		Help:      "Background and manual scheduler runs by scheduler and result.",
	}, []string{"scheduler", "result"})

	SchedulerDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Name:      "scheduler_duration_seconds",
		Help:      "Scheduler run duration in seconds.",
		Buckets:   []float64{0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300},
	}, []string{"scheduler"})
)

func Init() {
	// DefaultRegisterer already includes Go and process collectors (see prometheus/registry.go init).
}

func RecordLogin(success bool) {
	result := "failure"
	if success {
		result = "success"
	}
	LoginAttemptsTotal.WithLabelValues(result).Inc()
}

func RecordDocumentUpload(success bool) {
	result := "failure"
	if success {
		result = "success"
	}
	DocumentUploadsTotal.WithLabelValues(result).Inc()
}

func RecordSchedulerRun(name string, success bool, durationSeconds float64) {
	result := "failure"
	if success {
		result = "success"
	}
	SchedulerRunsTotal.WithLabelValues(name, result).Inc()
	SchedulerDuration.WithLabelValues(name).Observe(durationSeconds)
}
