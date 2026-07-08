package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/emailverify"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type EmailVerifyHandler struct {
	svc *emailverify.Service
}

func NewEmailVerifyHandler(svc *emailverify.Service) *EmailVerifyHandler {
	return &EmailVerifyHandler{svc: svc}
}

func (h *EmailVerifyHandler) VerifyEmail(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token requerido"})
		return
	}
	result, err := h.svc.VerifyToken(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no se pudo validar el enlace"})
		return
	}
	if !result.Valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "enlace inválido o expirado", "valid": false})
		return
	}
	c.JSON(http.StatusOK, result)
}

type setPasswordFromInviteReq struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

func (h *EmailVerifyHandler) SetPasswordFromInvite(c *gin.Context) {
	var req setPasswordFromInviteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos: la contraseña debe tener al menos 8 caracteres"})
		return
	}
	err := h.svc.SetPasswordFromInvite(c.Request.Context(), emailverify.SetPasswordCommand{
		Token:       req.Token,
		NewPassword: req.NewPassword,
	})
	if err != nil {
		c.JSON(emailVerifyErrorStatus(err), gin.H{"error": emailVerifyErrorMessage(err)})
		return
	}
	syslog.LogInfo(syslog.CategoryUser, "email verified and password set from invite")
	c.JSON(http.StatusOK, gin.H{"message": "correo verificado y contraseña actualizada. Ya puedes iniciar sesión."})
}

type resendVerificationReq struct {
	Email string `json:"email" binding:"required,email"`
}

func (h *EmailVerifyHandler) ResendVerification(c *gin.Context) {
	var req resendVerificationReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "correo electrónico inválido"})
		return
	}
	err := h.svc.ResendPublic(c.Request.Context(), emailverify.ResendCommand{Email: req.Email})
	if err != nil {
		if errors.Is(err, emailverify.ErrRateLimited) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "demasiados intentos. Espera unos minutos e inténtalo de nuevo."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no se pudo procesar la solicitud"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "si el correo está registrado y pendiente de verificación, recibirás un nuevo enlace",
	})
}

func (h *EmailVerifyHandler) AdminResendVerification(c *gin.Context) {
	claims := middleware.GetClaims(c)
	err := h.svc.ResendAdmin(c.Request.Context(), emailverify.AdminResendCommand{
		OrganizationID: middleware.GetOrgID(c),
		ActorID:        claims.UserID,
		ActorRole:      claims.Role,
		UserID:         c.Param("id"),
	})
	if err != nil {
		c.JSON(emailVerifyErrorStatus(err), gin.H{"error": emailVerifyErrorMessage(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "correo de verificación reenviado"})
}

func emailVerifyErrorStatus(err error) int {
	switch {
	case errors.Is(err, emailverify.ErrInvalidToken),
		errors.Is(err, emailverify.ErrPasswordTooShort),
		errors.Is(err, emailverify.ErrAlreadyVerified):
		return http.StatusBadRequest
	case errors.Is(err, emailverify.ErrUserNotFound):
		return http.StatusNotFound
	case errors.Is(err, emailverify.ErrUserInactive),
		errors.Is(err, emailverify.ErrForbidden):
		return http.StatusBadRequest
	case errors.Is(err, emailverify.ErrRateLimited):
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}

func emailVerifyErrorMessage(err error) string {
	switch {
	case errors.Is(err, emailverify.ErrInvalidToken):
		return "enlace inválido o expirado"
	case errors.Is(err, emailverify.ErrPasswordTooShort):
		return "la contraseña debe tener al menos 8 caracteres"
	case errors.Is(err, emailverify.ErrAlreadyVerified):
		return "el correo ya está verificado"
	case errors.Is(err, emailverify.ErrUserNotFound):
		return "usuario no encontrado"
	case errors.Is(err, emailverify.ErrUserInactive):
		return "el usuario está desactivado"
	case errors.Is(err, emailverify.ErrForbidden):
		return "no tienes permisos para esta acción"
	case errors.Is(err, emailverify.ErrRateLimited):
		return "demasiados intentos. Espera unos minutos e inténtalo de nuevo."
	default:
		return "error al procesar la solicitud"
	}
}
