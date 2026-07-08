package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/teamusers"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type UsersHandler struct {
	svc *teamusers.Service
}

func NewUsersHandler(svc *teamusers.Service) *UsersHandler {
	return &UsersHandler{svc: svc}
}

func (h *UsersHandler) List(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.svc.List(c.Request.Context(), orgID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []teamusers.Member{}
	}
	listResponse(c, items, total, page, limit)
}

type createUserReq struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
	Role      string `json:"role"`
}

func (h *UsersHandler) Create(c *gin.Context) {
	var req createUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims := middleware.GetClaims(c)
	member, err := h.svc.Create(c.Request.Context(), teamusers.CreateCommand{
		OrganizationID: middleware.GetOrgID(c),
		ActorID:        claims.UserID,
		ActorRole:      claims.Role,
		Email:          req.Email,
		Password:       req.Password,
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		Role:           domainuser.Role(req.Role),
	})
	if err != nil {
		c.JSON(userErrorStatus(err), gin.H{"error": userErrorMessage(err)})
		return
	}
	syslog.LogUserCreated(member.Email, member.ID, middleware.GetOrgID(c), claims.UserID)
	c.JSON(http.StatusCreated, member)
}

type updateUserReq struct {
	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
	Role      *string `json:"role"`
	Active    *bool   `json:"active"`
	Password  *string `json:"password"`
}

func (h *UsersHandler) Update(c *gin.Context) {
	var req updateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims := middleware.GetClaims(c)
	cmd := teamusers.UpdateCommand{
		OrganizationID: middleware.GetOrgID(c),
		ActorID:        claims.UserID,
		ActorRole:      claims.Role,
		UserID:         c.Param("id"),
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		Active:         req.Active,
		Password:       req.Password,
	}
	if req.Role != nil {
		role := domainuser.Role(*req.Role)
		cmd.Role = &role
	}
	member, err := h.svc.Update(c.Request.Context(), cmd)
	if err != nil {
		c.JSON(userErrorStatus(err), gin.H{"error": userErrorMessage(err)})
		return
	}
	c.JSON(http.StatusOK, member)
}

func (h *UsersHandler) Delete(c *gin.Context) {
	claims := middleware.GetClaims(c)
	err := h.svc.Remove(c.Request.Context(), teamusers.RemoveCommand{
		OrganizationID: middleware.GetOrgID(c),
		ActorID:        claims.UserID,
		ActorRole:      claims.Role,
		UserID:         c.Param("id"),
	})
	if err != nil {
		c.JSON(userErrorStatus(err), gin.H{"error": userErrorMessage(err)})
		return
	}
	c.Status(http.StatusNoContent)
}

func userErrorStatus(err error) int {
	switch {
	case errors.Is(err, teamusers.ErrEmailExists):
		return http.StatusConflict
	case errors.Is(err, teamusers.ErrUserNotFound):
		return http.StatusNotFound
	case errors.Is(err, teamusers.ErrInvalidRole),
		errors.Is(err, teamusers.ErrForbiddenRole),
		errors.Is(err, teamusers.ErrLastOwner),
		errors.Is(err, teamusers.ErrSelfModification):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

func userErrorMessage(err error) string {
	switch {
	case errors.Is(err, teamusers.ErrEmailExists):
		return "el correo ya pertenece a un usuario del equipo"
	case errors.Is(err, teamusers.ErrUserNotFound):
		return "usuario no encontrado"
	case errors.Is(err, teamusers.ErrInvalidRole):
		return "rol inválido"
	case errors.Is(err, teamusers.ErrForbiddenRole):
		return "no tienes permisos para asignar este rol"
	case errors.Is(err, teamusers.ErrLastOwner):
		return "no se puede quitar o degradar al último propietario"
	case errors.Is(err, teamusers.ErrSelfModification):
		return "no puedes modificar tu propia cuenta desde aquí"
	default:
		return err.Error()
	}
}
