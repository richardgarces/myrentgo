package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/infrastructure/mindicador"
)

type IndicatorsHandler struct {
	uf *mindicador.UFProvider
}

func NewIndicatorsHandler(uf *mindicador.UFProvider) *IndicatorsHandler {
	return &IndicatorsHandler{uf: uf}
}

// GetUF godoc
// @Summary UF indicator (CLP)
// @Tags indicators
// @Security BearerAuth
// @Produce json
// @Success 200 {object} mindicador.UFValue
// @Router /api/v1/indicators/uf [get]
func (h *IndicatorsHandler) GetUF(c *gin.Context) {
	value, err := h.uf.GetUF(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "no se pudo obtener el valor UF"})
		return
	}
	c.JSON(http.StatusOK, value)
}
