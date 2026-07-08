package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func respondInternalError(c *gin.Context, err error, fallback string) {
	if fallback == "" {
		fallback = "internal server error"
	}
	if gin.Mode() == gin.ReleaseMode {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fallback})
		return
	}
	msg := fallback
	if err != nil {
		msg = err.Error()
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
}
