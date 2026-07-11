package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
)

// MetricsAccess allows Prometheus scrape via METRICS_SCRAPE_TOKEN or admin JWT when metrics are protected.
func MetricsAccess(protected bool, scrapeToken string, authMW *AuthMiddleware, roles ...domainuser.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !protected {
			c.Next()
			return
		}
		if scrapeToken != "" && bearerToken(c) == scrapeToken {
			c.Next()
			return
		}
		authMW.RequireAuth()(c)
		if c.IsAborted() {
			return
		}
		authMW.RequireRole(roles...)(c)
	}
}

func bearerToken(c *gin.Context) string {
	header := c.GetHeader("Authorization")
	if header == "" || !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

// ValidScrapeToken compares tokens in constant time (for tests and reuse).
func ValidScrapeToken(got, want string) bool {
	if want == "" || got == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// UnauthorizedMetrics aborts with 401 when scrape token does not match (helper for explicit checks).
func UnauthorizedMetrics(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
}
