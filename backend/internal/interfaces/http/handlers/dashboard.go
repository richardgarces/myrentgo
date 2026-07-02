package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/dashboard"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type DashboardHandler struct {
	handler *dashboard.DashboardHandler
}

func NewDashboardHandler(h *dashboard.DashboardHandler) *DashboardHandler {
	return &DashboardHandler{handler: h}
}

// Get godoc
// @Summary Financial dashboard
// @Tags dashboard
// @Security BearerAuth
// @Produce json
// @Success 200 {object} dashboard.DashboardResult
// @Router /api/v1/dashboard [get]
func (h *DashboardHandler) Get(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	result, err := h.handler.Handle(c.Request.Context(), dashboard.DashboardQuery{OrganizationID: orgID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
