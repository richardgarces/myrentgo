// Package main MyRent Go API
//
// @title MyRent Go API
// @version 1.0
// @description Plataforma SaaS de administración de propiedades y arriendos
// @host localhost:7070
// @BasePath /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/richard/my-rent-go/internal/application/auth"
	"github.com/richard/my-rent-go/internal/application/mfa"
	"github.com/richard/my-rent-go/internal/application/password"
	"github.com/richard/my-rent-go/internal/application/emailverify"
	"github.com/richard/my-rent-go/internal/application/dashboard"
	"github.com/richard/my-rent-go/internal/application/emailnotify"
	"github.com/richard/my-rent-go/internal/application/eventbus"
	"github.com/richard/my-rent-go/internal/application/leaserenewal"
	appproperty "github.com/richard/my-rent-go/internal/application/property"
	"github.com/richard/my-rent-go/internal/application/teamusers"
	"github.com/richard/my-rent-go/internal/config"
	jwtsvc "github.com/richard/my-rent-go/internal/infrastructure/jwt"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"github.com/richard/my-rent-go/internal/infrastructure/mindicador"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	"github.com/richard/my-rent-go/internal/infrastructure/storage"
	"github.com/richard/my-rent-go/internal/infrastructure/syslog"
	"github.com/richard/my-rent-go/internal/infrastructure/metrics"
	httpx "github.com/richard/my-rent-go/internal/interfaces/http"
	"github.com/richard/my-rent-go/internal/interfaces/http/handlers"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
	"github.com/richard/my-rent-go/internal/interfaces/websocket"
)

func main() {
	cfg := config.Load()
	logStore := syslog.InitDefault(cfg.System.LogMaxEntries)
	logger := slog.New(syslog.NewStoreHandler(logStore, os.Stdout, slog.LevelInfo))
	slog.SetDefault(logger)
	syslog.LogInfo(syslog.CategorySystem, "server initializing", "env", cfg.App.Env)

	if cfg.System.MetricsEnabled {
		metrics.Init()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	mongo, err := mongodb.Connect(ctx, cfg.MongoDB.URI, cfg.MongoDB.Database)
	if err != nil {
		slog.Error("mongodb connection failed", "error", err)
		os.Exit(1)
	}
	defer mongo.Disconnect(context.Background())

	if err := mongo.EnsureIndexes(ctx); err != nil {
		slog.Error("index creation failed", "error", err)
		os.Exit(1)
	}

	ufProvider := mindicador.NewUFProvider()
	ufRate := 0.0
	if v, err := ufProvider.GetUF(ctx); err == nil && v != nil {
		ufRate = v.Value
	} else {
		slog.Warn("uf unavailable for mortgage migration", "error", err)
	}
	if err := mongo.MigrateMortgagesToProperties(ctx, ufRate); err != nil {
		slog.Error("mortgage migration failed", "error", err)
		os.Exit(1)
	}

	bus := eventbus.New()
	wsHub := websocket.NewHub()

	userRepo := mongodb.NewUserRepo(mongo)
	orgRepo := mongodb.NewOrgRepo(mongo)
	propRepo := mongodb.NewPropertyRepo(mongo)
	dashRepo := mongodb.NewDashboardRepo(mongo, ufProvider)

	jwtService := jwtsvc.NewService(cfg.JWT.Secret, cfg.JWT.AccessTTL, cfg.JWT.RefreshTTL, cfg.JWT.Issuer)
	mfaBridge := jwtsvc.NewMFATokenBridge(jwtService)
	mfaSvc := mfa.NewService(userRepo, mfaBridge, cfg.Security.MFAEnabled, cfg.App.Name)
	authService := auth.NewAuthService(userRepo, orgRepo, jwtService, cfg.Security.BcryptCost)
	authService.SetMFA(mfaSvc)
	propHandler := appproperty.NewCreatePropertyHandler(propRepo, bus)
	dashHandler := dashboard.NewDashboardHandler(dashRepo)
	docStore, err := storage.NewDocumentStore(cfg.Storage.DocumentsPath, cfg.Storage.MaxUploadMB)
	if err != nil {
		slog.Error("document storage init failed", "error", err)
		os.Exit(1)
	}
	resourcesHandler := handlers.NewResourcesHandler(mongo, docStore, ufProvider)
	emailClient := email.NewClient(email.Config{
		Host:     cfg.Notify.SMTPHost,
		Port:     cfg.Notify.SMTPPort,
		User:     cfg.Notify.SMTPUser,
		Password: cfg.Notify.SMTPPassword,
		From:     cfg.Notify.SMTPFrom,
		FromName: cfg.Notify.SMTPFromName,
	})
	emailRecipientRepo := mongodb.NewEmailRecipientRepo(mongo)
	notificationRepo := mongodb.NewNotificationRepo(mongo)
	leaseRepo := mongodb.NewLeaseRepo(mongo)
	emailNotifySvc := emailnotify.NewService(
		emailClient,
		emailRecipientRepo,
		notificationRepo,
		mongodb.NewNotificationSettingsRepo(mongo),
		mongodb.NewPaymentRepo(mongo),
		mongodb.NewMaintenanceRepo(mongo),
		mongodb.NewTenantRepo(mongo),
		mongodb.NewPropertyRepo(mongo),
		leaseRepo,
	)
	emailNotifyHandler := handlers.NewEmailNotificationsHandler(emailNotifySvc, emailRecipientRepo)
	teamUsersSvc := teamusers.NewService(userRepo, cfg.Security.BcryptCost)
	emailVerifyRepo := mongodb.NewEmailVerificationRepo(mongo)
	emailVerifySvc := emailverify.NewService(userRepo, emailVerifyRepo, emailClient, cfg.Security.BcryptCost, cfg.App.FrontendURL)
	teamUsersSvc.SetInviteSender(emailVerifySvc)
	usersHandler := handlers.NewUsersHandler(teamUsersSvc)
	emailVerifyHandler := handlers.NewEmailVerifyHandler(emailVerifySvc)
	passwordResetRepo := mongodb.NewPasswordResetRepo(mongo)
	passwordSvc := password.NewService(userRepo, passwordResetRepo, emailClient, cfg.Security.BcryptCost)
	passwordHandler := handlers.NewPasswordHandler(passwordSvc)
	mfaHandler := handlers.NewMFAHandler(mfaSvc)

	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	defer schedulerCancel()
	if cfg.Notify.SchedulerEnabled {
		emailnotify.StartBackgroundScheduler(schedulerCtx, emailNotifySvc, orgRepo, cfg.Notify.SchedulerInterval)
		leaserenewal.StartBackgroundScheduler(schedulerCtx, leaseRepo, orgRepo, cfg.Notify.SchedulerInterval)
		slog.Info("email scheduler enabled", "interval", cfg.Notify.SchedulerInterval.String())
	}

	if cfg.System.MetricsEnabled {
		refreshInterval := time.Duration(cfg.System.MetricsRefreshSecs) * time.Second
		metrics.StartRefresher(schedulerCtx, mongo, refreshInterval)
	}

	router := httpx.NewRouter(httpx.Deps{
		Config:      cfg,
		Auth:        handlers.NewAuthHandler(authService, orgRepo),
		Password:    passwordHandler,
		MFA:         mfaHandler,
		Property:    handlers.NewPropertyHandler(propHandler),
		Dashboard:   handlers.NewDashboardHandler(dashHandler),
		Indicators:  handlers.NewIndicatorsHandler(ufProvider),
		Resources:   resourcesHandler,
		EmailNotify: emailNotifyHandler,
		Users:       usersHandler,
		EmailVerify: emailVerifyHandler,
		System:      handlers.NewSystemHandler(cfg, mongo, docStore, logStore),
		AuthMW:      middleware.NewAuth(jwtService),
		WSHub:       wsHub,
	})

	srv := &http.Server{
		Addr:         ":" + cfg.App.Port,
		Handler:      router.Engine(),
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", cfg.App.Port, "env", cfg.App.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
	slog.Info("server stopped")
}
