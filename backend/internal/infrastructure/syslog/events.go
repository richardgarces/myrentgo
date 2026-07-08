package syslog

import "log/slog"

const (
	CategoryAuth      = "auth"
	CategoryHTTP      = "http"
	CategoryDocument  = "document"
	CategoryScheduler = "scheduler"
	CategorySystem    = "system"
	CategoryUser      = "user"
)

func LogInfo(category, message string, attrs ...any) {
	slog.Info(message, append([]any{"category", category}, attrs...)...)
}

func LogWarn(category, message string, attrs ...any) {
	slog.Warn(message, append([]any{"category", category}, attrs...)...)
}

func LogError(category, message string, attrs ...any) {
	slog.Error(message, append([]any{"category", category}, attrs...)...)
}

func LogHTTP(method, path string, status int, durationMs float64, orgID, userID string) {
	attrs := []any{
		"category", CategoryHTTP,
		"method", method,
		"path", path,
		"status", status,
		"duration_ms", durationMs,
	}
	if orgID != "" {
		attrs = append(attrs, "org_id", orgID)
	}
	if userID != "" {
		attrs = append(attrs, "user_id", userID)
	}
	slog.Info("request", attrs...)
}

func LogLoginSuccess(email, userID, orgID string) {
	LogInfo(CategoryAuth, "login success", "email", email, "user_id", userID, "org_id", orgID)
}

func LogLoginFailed(email, reason string) {
	LogWarn(CategoryAuth, "login failed", "email", email, "reason", reason)
}

func LogUserCreated(email, userID, orgID, actorID string) {
	LogInfo(CategoryUser, "user created", "email", email, "user_id", userID, "org_id", orgID, "actor_id", actorID)
}

func LogDocumentUploadError(orgID, userID, reason string) {
	LogError(CategoryDocument, "document upload failed", "org_id", orgID, "user_id", userID, "reason", reason)
}

func LogSchedulerRun(name, orgID string, created, sent, failed int) {
	LogInfo(CategoryScheduler, name+" completed", "org_id", orgID, "created", created, "sent", sent, "failed", failed)
}

func LogSchedulerError(name, orgID string, err error) {
	LogError(CategoryScheduler, name+" failed", "org_id", orgID, "error", err.Error())
}

func LogPasswordChanged(userID, email string) {
	LogInfo(CategoryAuth, "password changed", "user_id", userID, "email", email)
}

func LogPasswordResetRequested(email string) {
	LogInfo(CategoryAuth, "password reset requested", "email", email)
}

func LogPasswordResetCompleted(email string) {
	LogInfo(CategoryAuth, "password reset completed", "email", email)
}

func LogPasswordResetRateLimited(email string) {
	LogWarn(CategoryAuth, "password reset rate limited", "email", email)
}

func LogPasswordAdminReset(targetUserID, actorID, orgID string) {
	LogInfo(CategoryAuth, "admin password reset", "target_user_id", targetUserID, "actor_id", actorID, "org_id", orgID)
}

func LogMFASetupStarted(userID, email string) {
	LogInfo(CategoryAuth, "mfa setup started", "user_id", userID, "email", email)
}

func LogMFAEnabled(userID, email string) {
	LogInfo(CategoryAuth, "mfa enabled", "user_id", userID, "email", email)
}

func LogMFADisabled(userID, email string) {
	LogInfo(CategoryAuth, "mfa disabled", "user_id", userID, "email", email)
}

func LogMFAVerifySuccess(email, userID string) {
	LogInfo(CategoryAuth, "mfa verify success", "email", email, "user_id", userID)
}

func LogMFAVerifyFailed(email, reason string) {
	LogWarn(CategoryAuth, "mfa verify failed", "email", email, "reason", reason)
}

func LogLoginMFARequired(email, userID string) {
	LogInfo(CategoryAuth, "login mfa required", "email", email, "user_id", userID)
}
