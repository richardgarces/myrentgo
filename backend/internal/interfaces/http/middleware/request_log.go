package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
)

func RequestLogger() gin.HandlerFunc {
	skipPaths := map[string]bool{
		"/health":  true,
		"/metrics": true,
		"/ws":      true,
	}

	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if skipPaths[path] {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		orgID := GetOrgID(c)
		userID := ""
		if claims := GetClaims(c); claims != nil {
			userID = claims.UserID
		}

		syslog.LogHTTP(
			c.Request.Method,
			path,
			status,
			float64(time.Since(start).Milliseconds()),
			orgID,
			userID,
		)
	}
}
