package handlers

import (
	"context"
	"net/http"
	"runtime"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/config"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	"github.com/richard/my-rent-go/internal/infrastructure/storage"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type SystemHandler struct {
	cfg      *config.Config
	db       *mongodb.Client
	docStore *storage.DocumentStore
	logs     *syslog.Store
}

func NewSystemHandler(cfg *config.Config, db *mongodb.Client, docStore *storage.DocumentStore, logs *syslog.Store) *SystemHandler {
	return &SystemHandler{cfg: cfg, db: db, docStore: docStore, logs: logs}
}

type componentHealth struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

func (h *SystemHandler) Health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	api := componentHealth{Status: "ok"}
	mongoHealth := componentHealth{Status: "ok"}
	storageHealth := componentHealth{Status: "ok"}

	if err := h.db.Ping(ctx); err != nil {
		mongoHealth.Status = "error"
		mongoHealth.Message = "MongoDB no responde"
		mongoHealth.Detail = err.Error()
	} else if !h.cfg.IsProduction() && !mongoURIHasCredentials(h.cfg.MongoDB.URI) {
		mongoHealth.Status = "warning"
		mongoHealth.Message = "MongoDB sin autenticación (solo desarrollo)"
		mongoHealth.Detail = "Producción: docker-compose.prod.yml — red interna, credenciales y sin puerto publicado."
	}

	if h.docStore != nil {
		if err := h.docStore.HealthCheck(); err != nil {
			storageHealth.Status = "error"
			storageHealth.Message = "Almacenamiento no disponible"
			storageHealth.Detail = err.Error()
		}
	} else {
		storageHealth.Status = "warning"
		storageHealth.Message = "Almacenamiento no configurado"
	}

	overall := "ok"
	if mongoHealth.Status == "error" || storageHealth.Status == "error" {
		overall = "degraded"
	}

	c.JSON(http.StatusOK, gin.H{
		"status": overall,
		"service": h.cfg.App.Name,
		"env":     h.cfg.App.Env,
		"version": "1.0.0",
		"uptime_seconds": syslog.UptimeSeconds(),
		"uptime_human":   syslog.UptimeHuman(),
		"started_at":     syslog.StartedAt().UTC(),
		"security": gin.H{
			"metrics_protected":    h.cfg.System.MetricsProtected,
			"mongodb_without_auth": !mongoURIHasCredentials(h.cfg.MongoDB.URI),
		},
		"components": gin.H{
			"api":     api,
			"mongodb": mongoHealth,
			"storage": storageHealth,
		},
	})
}

func mongoURIHasCredentials(uri string) bool {
	// mongodb://user:pass@host or mongodb+srv://user:pass@...
	if !strings.Contains(uri, "@") {
		return false
	}
	beforeAt := uri
	if idx := strings.Index(uri, "://"); idx >= 0 {
		beforeAt = uri[idx+3:]
	}
	at := strings.Index(beforeAt, "@")
	if at <= 0 {
		return false
	}
	creds := beforeAt[:at]
	return strings.Contains(creds, ":") && !strings.HasPrefix(creds, ":")
}

func (h *SystemHandler) Metrics(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	counts, err := h.db.OrgMetrics(ctx, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	c.JSON(http.StatusOK, gin.H{
		"uptime_seconds": syslog.UptimeSeconds(),
		"uptime_human":   syslog.UptimeHuman(),
		"memory": gin.H{
			"alloc_mb":       bytesToMB(mem.Alloc),
			"sys_mb":         bytesToMB(mem.Sys),
			"heap_inuse_mb":  bytesToMB(mem.HeapInuse),
			"num_goroutines": runtime.NumGoroutine(),
		},
		"counts": counts,
	})
}

func (h *SystemHandler) Logs(c *gin.Context) {
	page, limit := parsePageLimit(c)
	filter := syslog.Filter{
		Level: strings.ToLower(strings.TrimSpace(c.Query("level"))),
		Query: strings.TrimSpace(c.Query("q")),
		Page:  page,
		Limit: limit,
	}
	if from := strings.TrimSpace(c.Query("from_date")); from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			filter.FromDate = &t
		}
	}
	if to := strings.TrimSpace(c.Query("to_date")); to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			end := t.Add(24*time.Hour - time.Nanosecond)
			filter.ToDate = &end
		}
	}

	items, total := h.logs.List(filter)
	if items == nil {
		items = []syslog.Entry{}
	}
	listResponse(c, items, total, page, limit)
}

func bytesToMB(b uint64) float64 {
	return float64(b) / (1024 * 1024)
}
