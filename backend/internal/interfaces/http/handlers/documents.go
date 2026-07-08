package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	domaindoc "github.com/richard/my-rent-go/internal/domain/document"
	"github.com/richard/my-rent-go/internal/infrastructure/storage"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
)

func (h *ResourcesHandler) persistDocumentFile(d *domaindoc.Document, fileData string) error {
	if fileData == "" || h.docStore == nil {
		return nil
	}
	mime, data, err := storage.ParseDataURL(fileData)
	if err != nil {
		return err
	}
	if d.MimeType == "" && mime != "" {
		d.MimeType = mime
	}
	if d.SizeBytes == 0 {
		d.SizeBytes = int64(len(data))
	}
	if err := h.docStore.ValidateSize(len(data)); err != nil {
		return err
	}
	if d.StoragePath != "" {
		_ = h.docStore.Delete(d.StoragePath)
	}
	path, err := h.docStore.Save(d.OrganizationID, d.ID, d.FileName, data)
	if err != nil {
		return err
	}
	d.StoragePath = path
	d.FileData = ""
	return nil
}

func (h *ResourcesHandler) respondDocumentFileError(c *gin.Context, err error) {
	orgID := middleware.GetOrgID(c)
	userID := ""
	if claims := middleware.GetClaims(c); claims != nil {
		userID = claims.UserID
	}
	syslog.LogDocumentUploadError(orgID, userID, err.Error())
	switch {
	case errors.Is(err, storage.ErrFileTooLarge):
		maxMB := int64(30)
		if h.docStore != nil {
			maxMB = h.docStore.MaxUploadMB()
		}
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": documentTooLargeMessage(maxMB)})
	case isInvalidFileData(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Archivo inválido. Vuelve a seleccionar el documento."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": documentPersistErrorMessage(err)})
	}
}

func documentTooLargeMessage(maxMB int64) string {
	return fmt.Sprintf(
		"El archivo supera el tamaño máximo permitido (%d MB). Comprime el PDF o elige un archivo más pequeño.",
		maxMB,
	)
}

func documentPersistErrorMessage(err error) string {
	if gin.Mode() == gin.ReleaseMode {
		return "No se pudo guardar el documento"
	}
	if err == nil {
		return "No se pudo guardar el documento"
	}
	if isMongoDocumentTooLarge(err) {
		return "El documento es demasiado grande para guardarlo. Reduce el tamaño del archivo e intenta de nuevo."
	}
	return err.Error()
}

func isMongoDocumentTooLarge(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "document is too large") ||
		strings.Contains(msg, "document too large") ||
		strings.Contains(msg, "bsonobj size")
}

func isInvalidFileData(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "invalid base64") || strings.Contains(msg, "empty file data")
}

func (h *ResourcesHandler) ServeDocumentFile(c *gin.Context) {
	if h.docStore == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Almacenamiento de documentos no configurado"})
		return
	}
	orgID := middleware.GetOrgID(c)
	id := c.Param("id")
	d, err := h.docs.FindByID(c.Request.Context(), orgID, id)
	if err != nil {
		respondInternalError(c, err, "No se pudo cargar el documento")
		return
	}
	if d == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	mime := d.MimeType
	if mime == "" {
		mime = "application/octet-stream"
	}
	fileName := d.FileName
	if fileName == "" {
		fileName = d.Title
	}

	if d.StoragePath != "" {
		data, err := h.docStore.Read(d.StoragePath)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "No se encontró el archivo del documento"})
			return
		}
		c.Header("Content-Disposition", contentDispositionInline(fileName))
		c.Data(http.StatusOK, mime, data)
		return
	}

	if d.FileData == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "El documento no tiene archivo adjunto"})
		return
	}
	_, data, err := storage.ParseDataURL(d.FileData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer el archivo del documento"})
		return
	}
	c.Header("Content-Disposition", contentDispositionInline(fileName))
	c.Data(http.StatusOK, mime, data)
}

func contentDispositionInline(fileName string) string {
	safe := strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == '\\' {
			return -1
		}
		return r
	}, fileName)
	if safe == "" {
		safe = "document"
	}
	return `inline; filename="` + safe + `"`
}

func (h *ResourcesHandler) stripDocumentPayload(d *domaindoc.Document) {
	if d == nil {
		return
	}
	if d.StoragePath != "" {
		d.FileData = ""
	}
}

func (h *ResourcesHandler) removeDocumentFile(d *domaindoc.Document) {
	if h.docStore == nil || d == nil || d.StoragePath == "" {
		return
	}
	_ = h.docStore.Delete(d.StoragePath)
}
