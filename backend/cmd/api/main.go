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
	"github.com/richard/my-rent-go/internal/application/dashboard"
	"github.com/richard/my-rent-go/internal/application/emailnotify"
	"github.com/richard/my-rent-go/internal/application/eventbus"
	appproperty "github.com/richard/my-rent-go/internal/application/property"
	"github.com/richard/my-rent-go/internal/config"
	jwtsvc "github.com/richard/my-rent-go/internal/infrastructure/jwt"
	"github.com/richard/my-rent-go/internal/infrastructure/email"
	"github.com/richard/my-rent-go/internal/infrastructure/mindicador"
	"github.com/richard/my-rent-go/internal/infrastructure/mongodb"
	httpx "github.com/richard/my-rent-go/internal/interfaces/http"
	"github.com/richard/my-rent-go/internal/interfaces/http/handlers"
	"github.com/richard/my-rent-go/internal/interfaces/http/middleware"
	"github.com/richard/my-rent-go/internal/interfaces/websocket"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

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

	bus := eventbus.New()
	wsHub := websocket.NewHub()

	userRepo := mongodb.NewUserRepo(mongo)
	orgRepo := mongodb.NewOrgRepo(mongo)
	propRepo := mongodb.NewPropertyRepo(mongo)
	ufProvider := mindicador.NewUFProvider()
	dashRepo := mongodb.NewDashboardRepo(mongo, ufProvider)

	jwtService := jwtsvc.NewService(cfg.JWT.Secret, cfg.JWT.AccessTTL, cfg.JWT.RefreshTTL, cfg.JWT.Issuer)
	authService := auth.NewAuthService(userRepo, orgRepo, jwtService, cfg.Security.BcryptCost)
	propHandler := appproperty.NewCreatePropertyHandler(propRepo, bus)
	dashHandler := dashboard.NewDashboardHandler(dashRepo)
	resourcesHandler := handlers.NewResourcesHandler(mongo)
	emailClient := email.NewClient(email.Config{
		Host:     cfg.Notify.SMTPHost,
		Port:     cfg.Notify.SMTPPort,
		User:     cfg.Notify.SMTPUser,
		Password: cfg.Notify.SMTPPassword,
		From:     cfg.Notify.SMTPFrom,
		FromName: cfg.Notify.SMTPFromName,
	})
	emailRecipientRepo := mongodb.NewEmailRecipientRepo(mongo)
	emailNotifySvc := emailnotify.NewService(emailClient, emailRecipientRepo, mongodb.NewNotificationRepo(mongo))
	emailNotifyHandler := handlers.NewEmailNotificationsHandler(emailNotifySvc, emailRecipientRepo)

	router := httpx.NewRouter(httpx.Deps{
		Config:      cfg,
		Auth:        handlers.NewAuthHandler(authService),
		Property:    handlers.NewPropertyHandler(propHandler),
		Dashboard:   handlers.NewDashboardHandler(dashHandler),
		Indicators:  handlers.NewIndicatorsHandler(ufProvider),
		Resources:   resourcesHandler,
		EmailNotify: emailNotifyHandler,
		AuthMW:      middleware.NewAuth(jwtService),
		WSHub:       wsHub,
	})

	srv := &http.Server{
		Addr:         ":" + cfg.App.Port,
		Handler:      router.Engine(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
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
