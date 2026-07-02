package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/auth"
	appproperty "github.com/richard/my-rent-go/internal/application/property"
	domain "github.com/richard/my-rent-go/internal/domain/property"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type AuthHandler struct {
	auth *auth.AuthService
}

func NewAuthHandler(svc *auth.AuthService) *AuthHandler {
	return &AuthHandler{auth: svc}
}

// Register godoc
// @Summary Register new user and organization
// @Tags auth
// @Accept json
// @Produce json
// @Param body body auth.RegisterCommand true "Register"
// @Success 201 {object} auth.TokenPair
// @Router /api/v1/auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var cmd auth.RegisterCommand
	if err := c.ShouldBindJSON(&cmd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tokens, err := h.auth.Register(c.Request.Context(), cmd)
	if err != nil {
		status := http.StatusInternalServerError
		if err == auth.ErrEmailExists {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tokens)
}

// Login godoc
// @Summary Login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body auth.LoginCommand true "Login"
// @Success 200 {object} auth.TokenPair
// @Router /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var cmd auth.LoginCommand
	if err := c.ShouldBindJSON(&cmd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tokens, err := h.auth.Login(c.Request.Context(), cmd)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	c.JSON(http.StatusOK, tokens)
}

// Me godoc
// @Summary Get current user
// @Tags auth
// @Security BearerAuth
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/auth/me [get]
func (h *AuthHandler) Me(c *gin.Context) {
	claims := middleware.GetClaims(c)
	user, err := h.auth.Me(c.Request.Context(), claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, user)
}

type PropertyHandler struct {
	handler *appproperty.CreatePropertyHandler
}

func NewPropertyHandler(h *appproperty.CreatePropertyHandler) *PropertyHandler {
	return &PropertyHandler{handler: h}
}

// List godoc
// @Summary List properties
// @Tags properties
// @Security BearerAuth
// @Produce json
// @Param status query string false "Status filter"
// @Param page query int false "Page"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/properties [get]
func (h *PropertyHandler) List(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	q := appproperty.ListPropertiesQuery{
		OrganizationID: orgID,
		Status:         c.Query("status"),
		Type:           c.Query("type"),
		Page:           parseInt(c.Query("page"), 1),
		Limit:          parseInt(c.Query("limit"), 20),
	}
	items, total, err := h.handler.List(c.Request.Context(), q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []domain.Property{}
	}
	c.JSON(http.StatusOK, gin.H{"data": items, "total": total, "page": q.Page, "limit": q.Limit})
}

// Create godoc
// @Summary Create property
// @Tags properties
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body appproperty.CreatePropertyCommand true "Property"
// @Success 201 {object} map[string]any
// @Router /api/v1/properties [post]
func (h *PropertyHandler) Create(c *gin.Context) {
	var cmd appproperty.CreatePropertyCommand
	if err := c.ShouldBindJSON(&cmd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cmd.OrganizationID = middleware.GetOrgID(c)
	p, err := h.handler.Handle(c.Request.Context(), cmd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

// Get godoc
// @Summary Get property by ID
// @Tags properties
// @Security BearerAuth
// @Produce json
// @Param id path string true "Property ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/properties/{id} [get]
func (h *PropertyHandler) Get(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	p, err := h.handler.Get(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "property not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

// Update godoc
// @Summary Update property
// @Tags properties
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Property ID"
// @Param body body appproperty.UpdatePropertyCommand true "Property"
// @Success 200 {object} map[string]any
// @Router /api/v1/properties/{id} [put]
func (h *PropertyHandler) Update(c *gin.Context) {
	var cmd appproperty.UpdatePropertyCommand
	if err := c.ShouldBindJSON(&cmd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cmd.OrganizationID = middleware.GetOrgID(c)
	cmd.ID = c.Param("id")
	p, err := h.handler.Update(c.Request.Context(), cmd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "property not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

// Delete godoc
// @Summary Delete property
// @Tags properties
// @Security BearerAuth
// @Param id path string true "Property ID"
// @Success 204
// @Router /api/v1/properties/{id} [delete]
func (h *PropertyHandler) Delete(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	ok, err := h.handler.Delete(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "property not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	var v int
	if _, err := fmt.Sscanf(s, "%d", &v); err != nil {
		return def
	}
	return v
}
