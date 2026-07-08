package middleware

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/infrastructure/metrics"
)

var (
	uuidSegment = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	objectID    = regexp.MustCompile(`(?i)\b[0-9a-f]{24}\b`)
	numericID   = regexp.MustCompile(`/\d+(?:/|$)`)
)

func Prometheus() gin.HandlerFunc {
	skipPaths := map[string]bool{
		"/health":  true,
		"/metrics": true,
	}

	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if skipPaths[path] {
			c.Next()
			return
		}

		metrics.HTTPRequestsInFlight.Inc()
		start := time.Now()
		c.Next()
		metrics.HTTPRequestsInFlight.Dec()

		route := normalizePath(c)
		method := c.Request.Method
		status := strconv.Itoa(c.Writer.Status())
		duration := time.Since(start).Seconds()

		metrics.HTTPRequestsTotal.WithLabelValues(method, route, status).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(method, route).Observe(duration)
	}
}

func normalizePath(c *gin.Context) string {
	if route := strings.TrimSpace(c.FullPath()); route != "" {
		return route
	}

	path := c.Request.URL.Path
	path = uuidSegment.ReplaceAllString(path, ":id")
	path = objectID.ReplaceAllString(path, ":id")
	path = numericID.ReplaceAllString(path, "/:id/")
	if strings.HasSuffix(path, "/") && path != "/" {
		path = strings.TrimSuffix(path, "/")
	}
	if path == "" {
		return "unknown"
	}
	return path
}
