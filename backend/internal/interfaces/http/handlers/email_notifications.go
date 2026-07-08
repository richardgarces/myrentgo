package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/richard/my-rent-go/internal/application/emailnotify"
	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainsettings "github.com/richard/my-rent-go/internal/domain/notificationsettings"
	"github.com/richard/my-rent-go/internal/infrastructure/metrics"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

type EmailNotificationsHandler struct {
	svc        *emailnotify.Service
	recipients *mongodb.EmailRecipientRepo
}

func NewEmailNotificationsHandler(svc *emailnotify.Service, recipients *mongodb.EmailRecipientRepo) *EmailNotificationsHandler {
	return &EmailNotificationsHandler{svc: svc, recipients: recipients}
}

func (h *EmailNotificationsHandler) ListRecipients(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	page, limit := parsePageLimit(c)
	items, total, err := h.recipients.List(c.Request.Context(), orgID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	listResponse(c, items, total, page, limit)
}

type createEmailRecipientReq struct {
	Email             string   `json:"email"`
	Name              string   `json:"name"`
	Label             string   `json:"label"`
	PropertyID        string   `json:"property_id"`
	Enabled           *bool    `json:"enabled"`
	NotificationTypes []string `json:"notification_types"`
}

func (h *EmailNotificationsHandler) CreateRecipient(c *gin.Context) {
	var req createEmailRecipientReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	types, err := parseNotificationTypes(req.NotificationTypes)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(types) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "selecciona al menos un tipo de aviso"})
		return
	}
	orgID := middleware.GetOrgID(c)
	ctx := c.Request.Context()

	propertyID := strings.TrimSpace(req.PropertyID)
	if propertyID == "" {
		if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "nombre y correo son obligatorios para destinatarios internos"})
			return
		}
	}

	rec := domainer.NewEmailRecipient(orgID, strings.TrimSpace(req.Email), strings.TrimSpace(req.Name), strings.TrimSpace(req.Label), types)
	if req.Enabled != nil {
		rec.Enabled = *req.Enabled
	}
	if propertyID != "" {
		if err := h.svc.ApplyPropertyLink(ctx, orgID, rec, propertyID, ""); err != nil {
			c.JSON(recipientValidationStatus(err), gin.H{"error": err.Error()})
			return
		}
	}
	if err := h.recipients.Create(ctx, rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, rec)
}

type updateEmailRecipientReq struct {
	Email             *string  `json:"email"`
	Name              *string  `json:"name"`
	Label             *string  `json:"label"`
	PropertyID        *string  `json:"property_id"`
	Enabled           *bool    `json:"enabled"`
	NotificationTypes []string `json:"notification_types"`
}

func (h *EmailNotificationsHandler) UpdateRecipient(c *gin.Context) {
	var req updateEmailRecipientReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	ctx := c.Request.Context()
	id := c.Param("id")
	rec, err := h.recipients.FindByID(ctx, orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if rec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipient not found"})
		return
	}

	if req.PropertyID != nil {
		propertyID := strings.TrimSpace(*req.PropertyID)
		if propertyID == "" {
			rec.PropertyID = ""
			rec.TenantID = ""
		} else if err := h.svc.ApplyPropertyLink(ctx, orgID, rec, propertyID, rec.ID); err != nil {
			c.JSON(recipientValidationStatus(err), gin.H{"error": err.Error()})
			return
		}
	} else if rec.IsPropertyLinked() {
		if err := h.svc.RefreshPropertyLinkedSnapshot(ctx, orgID, rec); err != nil {
			c.JSON(recipientValidationStatus(err), gin.H{"error": err.Error()})
			return
		}
	}

	if req.Email != nil && !rec.IsPropertyLinked() {
		rec.Email = strings.TrimSpace(*req.Email)
	}
	if req.Name != nil && !rec.IsPropertyLinked() {
		rec.Name = strings.TrimSpace(*req.Name)
	}
	if req.Label != nil {
		rec.Label = strings.TrimSpace(*req.Label)
	}
	if req.Enabled != nil {
		rec.Enabled = *req.Enabled
	}
	if req.NotificationTypes != nil {
		types, err := parseNotificationTypes(req.NotificationTypes)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if len(types) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "selecciona al menos un tipo de aviso"})
			return
		}
		rec.NotificationTypes = types
	}

	if !rec.IsPropertyLinked() {
		if strings.TrimSpace(rec.Email) == "" || strings.TrimSpace(rec.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "nombre y correo son obligatorios para destinatarios internos"})
			return
		}
	}

	if err := h.recipients.Update(ctx, rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rec)
}

func recipientValidationStatus(err error) int {
	switch err {
	case emailnotify.ErrPropertyNoActiveLease,
		emailnotify.ErrTenantNoEmail,
		emailnotify.ErrPropertyAlreadyLinked,
		emailnotify.ErrPropertyNotRent:
		return http.StatusBadRequest
	default:
		return http.StatusBadRequest
	}
}

func (h *EmailNotificationsHandler) SyncRecipientsFromLeases(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	result, err := h.svc.SyncRecipientsFromLeases(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "destinatarios sincronizados desde arriendos",
		"result":  result,
	})
}

func (h *EmailNotificationsHandler) DeleteRecipient(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	rec, err := h.recipients.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if rec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipient not found"})
		return
	}
	if err := h.recipients.Delete(c.Request.Context(), orgID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *EmailNotificationsHandler) GetSMTPStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"configured": h.svc.SMTPConfigured()})
}

type sendTestEmailReq struct {
	RecipientID string `json:"recipient_id"`
	Email       string `json:"email"`
	AllFormats  bool   `json:"all_formats"`
}

func (h *EmailNotificationsHandler) SendTestEmail(c *gin.Context) {
	var req sendTestEmailReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	result, err := h.svc.SendTest(c.Request.Context(), orgID, req.RecipientID, req.Email, req.AllFormats)
	if err != nil {
		status := http.StatusInternalServerError
		if !h.svc.SMTPConfigured() {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, gin.H{"error": err.Error(), "result": result})
		return
	}
	message := "correo de prueba enviado"
	if req.AllFormats {
		message = fmt.Sprintf("%d correos de prueba enviados (uno por tipo de aviso)", result.SentCount)
	}
	c.JSON(http.StatusOK, gin.H{"message": message, "result": result, "configured": h.svc.SMTPConfigured()})
}

type sendEmailNotificationReq struct {
	NotificationID string `json:"notification_id"`
}

func (h *EmailNotificationsHandler) SendEmailNotifications(c *gin.Context) {
	var req sendEmailNotificationReq
	_ = c.ShouldBindJSON(&req)

	orgID := middleware.GetOrgID(c)
	var result *emailnotify.SendResult
	var err error

	if req.NotificationID != "" {
		result, err = h.svc.SendNotification(c.Request.Context(), orgID, req.NotificationID)
	} else {
		result, err = h.svc.SendPending(c.Request.Context(), orgID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "result": result})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "notificaciones enviadas", "result": result})
}

func (h *EmailNotificationsHandler) SendSingleNotification(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	result, err := h.svc.SendNotification(c.Request.Context(), orgID, id)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		} else if strings.Contains(err.Error(), "channel is not email") || strings.Contains(err.Error(), "cannot be sent") {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error(), "result": result})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "notificación enviada", "result": result})
}

func parseNotificationTypes(types []string) ([]domainer.NotificationType, error) {
	if types == nil {
		return []domainer.NotificationType{}, nil
	}
	out := make([]domainer.NotificationType, 0, len(types))
	for _, t := range types {
		if !domainer.IsValidNotificationType(t) {
			return nil, errInvalidType(t)
		}
		out = append(out, domainer.NotificationType(t))
	}
	return out, nil
}

func errInvalidType(t string) error {
	return &invalidTypeError{Type: t}
}

type invalidTypeError struct{ Type string }

func (e *invalidTypeError) Error() string {
	return "invalid notification type: " + e.Type
}

func (h *EmailNotificationsHandler) ListNotificationTypes(c *gin.Context) {
	types := make([]gin.H, 0, len(domainer.AllNotificationTypes))
	labels := map[domainer.NotificationType]string{
		domainer.TypePaymentDue:      "Recordatorio de pago (3 días antes)",
		domainer.TypePaymentOverdue:  "Pago vencido (día siguiente)",
		domainer.TypeLateInterest:    "Multas por mora (5 días después)",
		domainer.TypeDividendDue:     "Dividendo por vencer",
		domainer.TypeLeaseExpiring:   "Arriendo por vencer",
		domainer.TypeMaintenanceDue:  "Recordatorio de mantención",
	}
	for _, t := range domainer.AllNotificationTypes {
		label := labels[t]
		if label == "" {
			label = emailnotify.NotificationTypeLabel(string(t))
		}
		types = append(types, gin.H{"id": t, "label": label})
	}
	c.JSON(http.StatusOK, gin.H{"data": types})
}

func (h *EmailNotificationsHandler) GetAutomationSettings(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	settings, err := h.svc.GetAutomationSettings(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, settings)
}

type updateAutomationSettingsReq struct {
	Rules []struct {
		ID      string `json:"id" binding:"required"`
		Enabled bool   `json:"enabled"`
	} `json:"rules" binding:"required"`
}

func (h *EmailNotificationsHandler) UpdateAutomationSettings(c *gin.Context) {
	var req updateAutomationSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	orgID := middleware.GetOrgID(c)
	current, err := h.svc.GetAutomationSettings(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updates := make([]domainsettings.AutomationRule, 0, len(req.Rules))
	for _, r := range req.Rules {
		existing := current.RuleByID(r.ID)
		if existing == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown rule id: " + r.ID})
			return
		}
		rule := *existing
		rule.Enabled = r.Enabled
		updates = append(updates, rule)
	}
	settings, err := h.svc.UpdateAutomationSettings(c.Request.Context(), orgID, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *EmailNotificationsHandler) RunEmailScheduler(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	start := time.Now()
	result, err := h.svc.RunScheduler(c.Request.Context(), orgID)
	metrics.RecordSchedulerRun("email_manual", err == nil, time.Since(start).Seconds())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "result": result})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "scheduler ejecutado", "result": result})
}

type notifyMaintenanceBulkReq struct {
	MaintenanceIDs []string `json:"maintenance_ids"`
}

func (h *EmailNotificationsHandler) NotifyMaintenance(c *gin.Context) {
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	result, err := h.svc.SendMaintenanceNotification(c.Request.Context(), orgID, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "result": result})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "notificación de mantención enviada", "result": result})
}

func (h *EmailNotificationsHandler) NotifyMaintenanceBulk(c *gin.Context) {
	var req notifyMaintenanceBulkReq
	_ = c.ShouldBindJSON(&req)
	orgID := middleware.GetOrgID(c)
	result, err := h.svc.SendMaintenanceNotificationsBulk(c.Request.Context(), orgID, req.MaintenanceIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "result": result})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "notificaciones de mantención procesadas", "result": result})
}
