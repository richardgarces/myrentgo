package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/mfa"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type MFAHandler struct {
	svc *mfa.Service
}

func NewMFAHandler(svc *mfa.Service) *MFAHandler {
	return &MFAHandler{svc: svc}
}

func (h *MFAHandler) Setup(c *gin.Context) {
	claims := middleware.GetClaims(c)
	result, err := h.svc.Setup(c.Request.Context(), claims.UserID)
	if err != nil {
		c.JSON(mfaErrorStatus(err), gin.H{"error": mfaErrorMessage(err)})
		return
	}
	syslog.LogMFASetupStarted(claims.UserID, claims.Email)
	c.JSON(http.StatusOK, result)
}

type mfaEnableReq struct {
	Code string `json:"code" binding:"required,len=6"`
}

func (h *MFAHandler) Enable(c *gin.Context) {
	var req mfaEnableReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ingresa un código de 6 dígitos"})
		return
	}
	claims := middleware.GetClaims(c)
	if err := h.svc.Enable(c.Request.Context(), claims.UserID, req.Code); err != nil {
		c.JSON(mfaErrorStatus(err), gin.H{"error": mfaErrorMessage(err)})
		return
	}
	syslog.LogMFAEnabled(claims.UserID, claims.Email)
	c.JSON(http.StatusOK, gin.H{"message": "autenticación de dos factores activada"})
}

type mfaDisableReq struct {
	Password string `json:"password" binding:"required"`
	Code     string `json:"code" binding:"required,len=6"`
}

func (h *MFAHandler) Disable(c *gin.Context) {
	var req mfaDisableReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "contraseña y código de 6 dígitos requeridos"})
		return
	}
	claims := middleware.GetClaims(c)
	if err := h.svc.Disable(c.Request.Context(), mfa.DisableCommand{
		UserID:   claims.UserID,
		Password: req.Password,
		Code:     req.Code,
	}); err != nil {
		c.JSON(mfaErrorStatus(err), gin.H{"error": mfaErrorMessage(err)})
		return
	}
	syslog.LogMFADisabled(claims.UserID, claims.Email)
	c.JSON(http.StatusOK, gin.H{"message": "autenticación de dos factores desactivada"})
}

type mfaVerifyReq struct {
	MFAToken string `json:"mfa_token" binding:"required"`
	Code     string `json:"code" binding:"required,len=6"`
}

func (h *MFAHandler) Verify(c *gin.Context) {
	var req mfaVerifyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token y código de 6 dígitos requeridos"})
		return
	}
	tokens, err := h.svc.VerifyLogin(c.Request.Context(), mfa.VerifyLoginCommand{
		MFAToken: req.MFAToken,
		Code:     req.Code,
	})
	if err != nil {
		email := ""
		if userID, em, vErr := h.svc.ValidateMFAToken(req.MFAToken); vErr == nil {
			email = em
			if errors.Is(err, mfa.ErrInvalidCode) {
				syslog.LogMFAVerifyFailed(email, err.Error())
			}
			_ = userID
		} else if errors.Is(err, mfa.ErrInvalidMFAToken) {
			syslog.LogMFAVerifyFailed("", err.Error())
		}
		c.JSON(mfaErrorStatus(err), gin.H{"error": mfaErrorMessage(err)})
		return
	}
	email, userID, _ := h.svc.ValidateMFAToken(req.MFAToken)
	syslog.LogMFAVerifySuccess(email, userID)
	c.JSON(http.StatusOK, tokens)
}

func mfaErrorStatus(err error) int {
	switch {
	case errors.Is(err, mfa.ErrInvalidCode),
		errors.Is(err, mfa.ErrInvalidPassword),
		errors.Is(err, mfa.ErrInvalidMFAToken),
		errors.Is(err, mfa.ErrNoPendingSetup),
		errors.Is(err, mfa.ErrAlreadyEnabled),
		errors.Is(err, mfa.ErrNotEnabled):
		return http.StatusBadRequest
	case errors.Is(err, mfa.ErrUserNotFound):
		return http.StatusNotFound
	case errors.Is(err, mfa.ErrUserInactive):
		return http.StatusForbidden
	case errors.Is(err, mfa.ErrFeatureDisabled):
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

func mfaErrorMessage(err error) string {
	switch {
	case errors.Is(err, mfa.ErrFeatureDisabled):
		return "la autenticación de dos factores no está disponible en este entorno"
	case errors.Is(err, mfa.ErrAlreadyEnabled):
		return "MFA ya está activo en tu cuenta"
	case errors.Is(err, mfa.ErrNotEnabled):
		return "MFA no está activo en tu cuenta"
	case errors.Is(err, mfa.ErrNoPendingSetup):
		return "primero debes iniciar la configuración de MFA"
	case errors.Is(err, mfa.ErrInvalidCode):
		return "código de verificación incorrecto"
	case errors.Is(err, mfa.ErrInvalidPassword):
		return "la contraseña no es correcta"
	case errors.Is(err, mfa.ErrInvalidMFAToken):
		return "sesión de verificación expirada. Inicia sesión nuevamente."
	case errors.Is(err, mfa.ErrUserNotFound):
		return "usuario no encontrado"
	case errors.Is(err, mfa.ErrUserInactive):
		return "tu cuenta está desactivada"
	default:
		return "error al procesar la solicitud"
	}
}
