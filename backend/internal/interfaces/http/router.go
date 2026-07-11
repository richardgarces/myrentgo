package http

import (
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/richard/my-rent-go/internal/config"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
	"github.com/richard/my-rent-go/internal/interfaces/http/handlers"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
	"github.com/richard/my-rent-go/internal/interfaces/websocket"
)

type Router struct {
	engine *gin.Engine
}

type Deps struct {
	Config        *config.Config
	Auth          *handlers.AuthHandler
	Password      *handlers.PasswordHandler
	MFA           *handlers.MFAHandler
	Property      *handlers.PropertyHandler
	Dashboard     *handlers.DashboardHandler
	Indicators    *handlers.IndicatorsHandler
	Resources     *handlers.ResourcesHandler
	EmailNotify   *handlers.EmailNotificationsHandler
	Users         *handlers.UsersHandler
	EmailVerify   *handlers.EmailVerifyHandler
	System        *handlers.SystemHandler
	AuthMW        *middleware.AuthMiddleware
	WSHub         *websocket.Hub
}

func NewRouter(deps Deps) *Router {
	if deps.Config.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	if deps.Config.System.MetricsEnabled {
		r.Use(middleware.Prometheus())
	}
	r.Use(middleware.RequestLogger())
	r.Use(middleware.SecurityHeaders(deps.Config.Security.CSPPolicy))
	r.Use(cors.New(cors.Config{
		AllowOrigins:     deps.Config.Security.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Org-ID"},
		AllowCredentials: true,
	}))

	rl := middleware.NewRateLimiter(deps.Config.Security.RateLimitRPS, deps.Config.Security.RateLimitBurst)
	r.Use(rl.Middleware())

	loginRL := middleware.NewFixedWindowRateLimiter(
		deps.Config.Security.LoginRateLimit,
		deps.Config.Security.LoginRateWindow,
	)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": deps.Config.App.Name})
	})

	writeRoles := []domainuser.Role{domainuser.RoleOwner, domainuser.RoleAdmin, domainuser.RoleManager}
	userMgmtRoles := []domainuser.Role{domainuser.RoleOwner, domainuser.RoleAdmin}

	if deps.Config.System.MetricsEnabled {
		metricsHandler := gin.WrapH(promhttp.Handler())
		metrics := r.Group("/metrics")
		metrics.Use(middleware.MetricsAccess(
			deps.Config.System.MetricsProtected,
			deps.Config.System.MetricsScrapeToken,
			deps.AuthMW,
			userMgmtRoles...,
		))
		metrics.GET("", metricsHandler)
	}

	api := r.Group("/api/v1")
	{
		authG := api.Group("/auth")
		{
			authG.POST("/register", deps.Auth.Register)
			authG.POST("/login", loginRL.Middleware(), deps.Auth.Login)
			authG.POST("/forgot-password", deps.Password.ForgotPassword)
			authG.POST("/reset-password", deps.Password.ResetPassword)
			authG.GET("/verify-email", deps.EmailVerify.VerifyEmail)
			authG.POST("/set-password-from-invite", deps.EmailVerify.SetPasswordFromInvite)
			authG.POST("/resend-verification", deps.EmailVerify.ResendVerification)
			authG.POST("/mfa/verify", deps.MFA.Verify)
			authG.GET("/me", deps.AuthMW.RequireAuth(), deps.Auth.Me)
			authG.POST("/change-password", deps.AuthMW.RequireAuth(), deps.Password.ChangePassword)
			authG.POST("/mfa/setup", deps.AuthMW.RequireAuth(), deps.MFA.Setup)
			authG.POST("/mfa/enable", deps.AuthMW.RequireAuth(), deps.MFA.Enable)
			authG.POST("/mfa/disable", deps.AuthMW.RequireAuth(), deps.MFA.Disable)
		}

		protected := api.Group("")
		protected.Use(deps.AuthMW.RequireAuth())
		{
			protected.GET("/dashboard", deps.Dashboard.Get)
			protected.GET("/indicators/uf", deps.Indicators.GetUF)
			protected.GET("/calendar", deps.Resources.GetCalendar)

			props := protected.Group("/properties")
			{
				props.GET("", deps.Property.List)
				props.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Property.Create)
				props.GET("/:id", deps.Property.Get)
				props.PUT("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Property.Update)
				props.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Property.Delete)
			}

			tenants := protected.Group("/tenants")
			{
				tenants.GET("", deps.Resources.ListTenants)
				tenants.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateTenant)
				tenants.GET("/:id", deps.Resources.GetTenant)
				tenants.PUT("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateTenant)
				tenants.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteTenant)
				tenants.PATCH("/:id/deactivate", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeactivateTenant)
			}

			leases := protected.Group("/leases")
			{
				leases.GET("", deps.Resources.ListLeases)
				leases.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateLease)
				leases.GET("/:id", deps.Resources.GetLease)
				leases.PUT("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateLease)
				leases.PATCH("/:id/terminate", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.TerminateLease)
			}

			payments := protected.Group("/payments")
			{
				payments.GET("", deps.Resources.ListPayments)
				payments.POST("/generate-pending", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.GeneratePendingRentPayments)
				payments.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreatePayment)
				payments.PATCH("/:id/paid", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.MarkPaymentPaid)
			}

			dividends := protected.Group("/dividends")
			{
				dividends.GET("", deps.Resources.ListDividends)
				dividends.GET("/stats", deps.Resources.GetDividendStats)
				dividends.GET("/banks", deps.Resources.ListDividendBanks)
				dividends.POST("/generate-pending", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.GeneratePendingDividends)
				dividends.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateDividend)
				dividends.PATCH("/:id/paid", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.MarkDividendPaid)
				dividends.PATCH("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateDividend)
			}

			crm := protected.Group("/crm/contacts")
			{
				crm.GET("", deps.Resources.ListContacts)
				crm.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateContact)
				crm.GET("/:id", deps.Resources.GetContact)
				crm.PATCH("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateContact)
				crm.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteContact)
			}

			maint := protected.Group("/maintenance")
			{
				maint.GET("", deps.Resources.ListMaintenance)
				maint.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateMaintenance)
				maint.POST("/notify", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.NotifyMaintenanceBulk)
				maint.POST("/:id/notify", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.NotifyMaintenance)
				maint.PATCH("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateMaintenance)
				maint.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteMaintenance)
			}

			tickets := protected.Group("/tickets")
			{
				tickets.GET("", deps.Resources.ListTickets)
				tickets.POST("", deps.Resources.CreateTicket)
			}

			docs := protected.Group("/documents")
			{
				docs.GET("", deps.Resources.ListDocuments)
				docs.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateDocument)
				docs.GET("/:id/file", deps.Resources.ServeDocumentFile)
				docs.GET("/:id", deps.Resources.GetDocument)
				docs.PUT("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateDocument)
				docs.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteDocument)
				docs.PATCH("/:id/deactivate", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeactivateDocument)
			}

			mortgages := protected.Group("/mortgages")
			{
				mortgages.GET("", deps.Resources.ListMortgages)
				mortgages.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateMortgage)
				mortgages.PATCH("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateMortgage)
				mortgages.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteMortgage)
			}

			reminders := protected.Group("/reminders")
			{
				reminders.GET("", deps.Resources.ListReminders)
				reminders.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateReminder)
			}

			notifications := protected.Group("/notifications")
			{
				notifications.GET("", deps.Resources.ListNotifications)
				notifications.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateNotification)
				notifications.PATCH("/:id/status", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateNotificationStatus)
				notifications.POST("/:id/send", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.SendSingleNotification)
				notifications.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteNotification)
				notifications.POST("/email/test", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.SendTestEmail)
				notifications.POST("/email/send", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.SendEmailNotifications)
				notifications.POST("/email/run-scheduler", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.RunEmailScheduler)
			}

			emailRecipients := protected.Group("/email-recipients")
			{
				emailRecipients.GET("", deps.EmailNotify.ListRecipients)
				emailRecipients.GET("/types", deps.EmailNotify.ListNotificationTypes)
				emailRecipients.GET("/automation-settings", deps.EmailNotify.GetAutomationSettings)
				emailRecipients.PATCH("/automation-settings", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.UpdateAutomationSettings)
				emailRecipients.GET("/smtp-status", deps.EmailNotify.GetSMTPStatus)
				emailRecipients.POST("/sync-from-leases", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.SyncRecipientsFromLeases)
				emailRecipients.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.CreateRecipient)
				emailRecipients.PATCH("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.UpdateRecipient)
				emailRecipients.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.DeleteRecipient)
			}

			protected.PATCH("/settings/preferences", deps.Resources.UpdatePreferences)

			users := protected.Group("/users")
			{
				users.GET("", deps.AuthMW.RequireRole(userMgmtRoles...), deps.Users.List)
				users.POST("", deps.AuthMW.RequireRole(userMgmtRoles...), deps.Users.Create)
				users.PATCH("/:id", deps.AuthMW.RequireRole(userMgmtRoles...), deps.Users.Update)
				users.POST("/:id/reset-password", deps.AuthMW.RequireRole(userMgmtRoles...), deps.Password.AdminResetPassword)
				users.POST("/:id/resend-verification", deps.AuthMW.RequireRole(userMgmtRoles...), deps.EmailVerify.AdminResendVerification)
				users.DELETE("/:id", deps.AuthMW.RequireRole(userMgmtRoles...), deps.Users.Delete)
			}

			system := protected.Group("/system")
			system.Use(deps.AuthMW.RequireRole(userMgmtRoles...))
			{
				system.GET("/health", deps.System.Health)
				system.GET("/metrics", deps.System.Metrics)
				system.GET("/logs", deps.System.Logs)
			}
		}
	}

	r.GET("/ws", deps.WSHub.Handle)

	return &Router{engine: r}
}

func (r *Router) Engine() *gin.Engine {
	return r.engine
}
