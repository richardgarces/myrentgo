package http

import (
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
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
	Property      *handlers.PropertyHandler
	Dashboard     *handlers.DashboardHandler
	Indicators    *handlers.IndicatorsHandler
	Resources     *handlers.ResourcesHandler
	EmailNotify   *handlers.EmailNotificationsHandler
	AuthMW        *middleware.AuthMiddleware
	WSHub         *websocket.Hub
}

func NewRouter(deps Deps) *Router {
	if deps.Config.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.Logger())
	r.Use(middleware.SecurityHeaders(deps.Config.Security.CSPPolicy))
	r.Use(cors.New(cors.Config{
		AllowOrigins:     deps.Config.Security.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Org-ID"},
		AllowCredentials: true,
	}))

	rl := middleware.NewRateLimiter(deps.Config.Security.RateLimitRPS, deps.Config.Security.RateLimitBurst)
	r.Use(rl.Middleware())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": deps.Config.App.Name})
	})

	writeRoles := []domainuser.Role{domainuser.RoleOwner, domainuser.RoleAdmin, domainuser.RoleManager}

	api := r.Group("/api/v1")
	{
		authG := api.Group("/auth")
		{
			authG.POST("/register", deps.Auth.Register)
			authG.POST("/login", deps.Auth.Login)
			authG.GET("/me", deps.AuthMW.RequireAuth(), deps.Auth.Me)
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
			}

			maint := protected.Group("/maintenance")
			{
				maint.GET("", deps.Resources.ListMaintenance)
				maint.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateMaintenance)
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
				docs.GET("/:id", deps.Resources.GetDocument)
				docs.PUT("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.UpdateDocument)
				docs.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteDocument)
				docs.PATCH("/:id/deactivate", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeactivateDocument)
			}

			mortgages := protected.Group("/mortgages")
			{
				mortgages.GET("", deps.Resources.ListMortgages)
				mortgages.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.CreateMortgage)
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
				notifications.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.Resources.DeleteNotification)
				notifications.POST("/email/test", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.SendTestEmail)
				notifications.POST("/email/send", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.SendEmailNotifications)
			}

			emailRecipients := protected.Group("/email-recipients")
			{
				emailRecipients.GET("", deps.EmailNotify.ListRecipients)
				emailRecipients.GET("/types", deps.EmailNotify.ListNotificationTypes)
				emailRecipients.GET("/smtp-status", deps.EmailNotify.GetSMTPStatus)
				emailRecipients.POST("", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.CreateRecipient)
				emailRecipients.PATCH("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.UpdateRecipient)
				emailRecipients.DELETE("/:id", deps.AuthMW.RequireRole(writeRoles...), deps.EmailNotify.DeleteRecipient)
			}

			protected.PATCH("/settings/preferences", deps.Resources.UpdatePreferences)
		}
	}

	r.GET("/ws", deps.WSHub.Handle)

	return &Router{engine: r}
}

func (r *Router) Engine() *gin.Engine {
	return r.engine
}
