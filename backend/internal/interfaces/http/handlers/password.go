package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/password"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type PasswordHandler struct {
	svc *password.Service
}

func NewPasswordHandler(svc *password.Service) *PasswordHandler {
	return &PasswordHandler{svc: svc}
}

type changePasswordReq struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

func (h *PasswordHandler) ChangePassword(c *gin.Context) {
	var req changePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos: la nueva contraseña debe tener al menos 8 caracteres"})
		return
	}
	claims := middleware.GetClaims(c)
	err := h.svc.ChangePassword(c.Request.Context(), password.ChangePasswordCommand{
		UserID:          claims.UserID,
		CurrentPassword: req.CurrentPassword,
		NewPassword:     req.NewPassword,
	})
	if err != nil {
		c.JSON(passwordErrorStatus(err), gin.H{"error": passwordErrorMessage(err)})
		return
	}
	syslog.LogPasswordChanged(claims.UserID, claims.Email)
	c.JSON(http.StatusOK, gin.H{"message": "contraseña actualizada correctamente"})
}

type forgotPasswordReq struct {
	Email string `json:"email" binding:"required,email"`
}

func (h *PasswordHandler) ForgotPassword(c *gin.Context) {
	var req forgotPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "correo electrónico inválido"})
		return
	}
	err := h.svc.ForgotPassword(c.Request.Context(), password.ForgotPasswordCommand{Email: req.Email})
	if err != nil {
		if errors.Is(err, password.ErrRateLimited) {
			syslog.LogPasswordResetRateLimited(req.Email)
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "demasiados intentos. Espera unos minutos e inténtalo de nuevo."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no se pudo procesar la solicitud"})
		return
	}
	syslog.LogPasswordResetRequested(req.Email)
	c.JSON(http.StatusOK, gin.H{
		"message": "si el correo está registrado, recibirás un PIN para restablecer tu contraseña",
	})
}

type resetPasswordReq struct {
	Email       string `json:"email" binding:"required,email"`
	PIN         string `json:"pin" binding:"required,len=6"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

func (h *PasswordHandler) ResetPassword(c *gin.Context) {
	var req resetPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos: revisa el correo, PIN de 6 dígitos y contraseña de al menos 8 caracteres"})
		return
	}
	err := h.svc.ResetPassword(c.Request.Context(), password.ResetPasswordCommand{
		Email:       req.Email,
		PIN:         req.PIN,
		NewPassword: req.NewPassword,
	})
	if err != nil {
		c.JSON(passwordErrorStatus(err), gin.H{"error": passwordErrorMessage(err)})
		return
	}
	syslog.LogPasswordResetCompleted(req.Email)
	c.JSON(http.StatusOK, gin.H{"message": "contraseña restablecida correctamente"})
}

func (h *PasswordHandler) AdminResetPassword(c *gin.Context) {
	claims := middleware.GetClaims(c)
	targetID := c.Param("id")
	err := h.svc.AdminResetPassword(c.Request.Context(), password.AdminResetCommand{
		OrganizationID: middleware.GetOrgID(c),
		ActorID:        claims.UserID,
		ActorRole:      claims.Role,
		UserID:         targetID,
	})
	if err != nil {
		c.JSON(passwordErrorStatus(err), gin.H{"error": passwordErrorMessage(err)})
		return
	}
	syslog.LogPasswordAdminReset(targetID, claims.UserID, middleware.GetOrgID(c))
	c.JSON(http.StatusOK, gin.H{"message": "se envió un PIN provisional al correo del usuario"})
}

func passwordErrorStatus(err error) int {
	switch {
	case errors.Is(err, password.ErrInvalidCurrentPassword),
		errors.Is(err, password.ErrInvalidPIN):
		return http.StatusBadRequest
	case errors.Is(err, password.ErrPasswordTooShort):
		return http.StatusBadRequest
	case errors.Is(err, password.ErrUserNotFound):
		return http.StatusNotFound
	case errors.Is(err, password.ErrUserInactive),
		errors.Is(err, password.ErrForbidden),
		errors.Is(err, password.ErrSelfModification):
		return http.StatusBadRequest
	case errors.Is(err, password.ErrRateLimited):
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}

func passwordErrorMessage(err error) string {
	switch {
	case errors.Is(err, password.ErrInvalidCurrentPassword):
		return "la contraseña actual no es correcta"
	case errors.Is(err, password.ErrInvalidPIN):
		return "PIN inválido o expirado"
	case errors.Is(err, password.ErrPasswordTooShort):
		return "la contraseña debe tener al menos 8 caracteres"
	case errors.Is(err, password.ErrUserNotFound):
		return "usuario no encontrado"
	case errors.Is(err, password.ErrUserInactive):
		return "el usuario está desactivado"
	case errors.Is(err, password.ErrForbidden):
		return "no tienes permisos para esta acción"
	case errors.Is(err, password.ErrSelfModification):
		return "no puedes restablecer tu propia contraseña desde aquí"
	case errors.Is(err, password.ErrRateLimited):
		return "demasiados intentos. Espera unos minutos e inténtalo de nuevo."
	default:
		return "error al procesar la solicitud"
	}
}
