package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	App      AppConfig
	MongoDB  MongoDBConfig
	JWT      JWTConfig
	Security SecurityConfig
	Storage  StorageConfig
	Notify   NotifyConfig
	System   SystemConfig
}

type SystemConfig struct {
	LogMaxEntries      int
	MetricsEnabled     bool
	MetricsProtected   bool
	MetricsScrapeToken string
	MetricsRefreshSecs int
}

type AppConfig struct {
	Name        string
	Env         string
	Port        string
	FrontendURL string
	BaseURL     string
}

type MongoDBConfig struct {
	URI      string
	Database string
}

type JWTConfig struct {
	Secret           string
	AccessTTL        time.Duration
	RefreshTTL       time.Duration
	Issuer           string
}

type SecurityConfig struct {
	BcryptCost       int
	RateLimitRPS     float64
	RateLimitBurst   int
	LoginRateLimit   int
	LoginRateWindow  time.Duration
	MFAEnabled       bool
	AllowedOrigins   []string
	CSPPolicy        string
}

type StorageConfig struct {
	DocumentsPath string
	MaxUploadMB   int64
}

type NotifyConfig struct {
	SMTPHost      string
	SMTPPort      int
	SMTPUser      string
	SMTPPassword  string
	SMTPFrom      string
	SMTPFromName  string
	FromEmail     string // deprecated alias for SMTPFrom
	TelegramToken string
	WhatsAppAPI   string
	SchedulerEnabled   bool
	SchedulerInterval  time.Duration
}

func Load() *Config {
	appEnv := getEnv("APP_ENV", "development")
	return &Config{
		App: AppConfig{
			Name:        getEnv("APP_NAME", "MyRent Go"),
			Env:         appEnv,
			Port:        getEnv("APP_PORT", "7070"),
			FrontendURL: getEnv("FRONTEND_URL", "http://localhost:5173"),
			BaseURL:     getEnv("BASE_URL", "http://localhost:7070"),
		},
		MongoDB: MongoDBConfig{
			URI:      getEnv("MONGODB_URI", "mongodb://localhost:27017"),
			Database: getEnv("MONGODB_DATABASE", "myrent"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "change-me-in-production-use-32-chars-min"),
			AccessTTL:  getDurationEnv("JWT_ACCESS_TTL", 15*time.Minute),
			RefreshTTL: getDurationEnv("JWT_REFRESH_TTL", 7*24*time.Hour),
			Issuer:     getEnv("JWT_ISSUER", "my-rent-go"),
		},
		Security: SecurityConfig{
			BcryptCost:      getIntEnv("BCRYPT_COST", 12),
			RateLimitRPS:    getFloatEnv("RATE_LIMIT_RPS", 10),
			RateLimitBurst:  getIntEnv("RATE_LIMIT_BURST", 20),
			LoginRateLimit:  getIntEnv("LOGIN_RATE_LIMIT", 5),
			LoginRateWindow: getDurationEnv("LOGIN_RATE_WINDOW", time.Minute),
			MFAEnabled:      getBoolEnv("MFA_ENABLED", true),
			AllowedOrigins: strings.Split(getEnv("CORS_ORIGINS", "http://localhost:4000,http://localhost:5173"), ","),
			CSPPolicy: getEnv("CSP_POLICY",
				"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:;"),
		},
		Storage: StorageConfig{
			DocumentsPath: getEnv("DOCUMENTS_PATH", "./storage/documents"),
			MaxUploadMB:   int64(getIntEnv("MAX_UPLOAD_MB", 30)),
		},
		Notify: NotifyConfig{
			SMTPHost:      getEnv("SMTP_HOST", ""),
			SMTPPort:      getIntEnv("SMTP_PORT", 587),
			SMTPUser:      getEnv("SMTP_USER", ""),
			SMTPPassword:  getEnv("SMTP_PASSWORD", ""),
			SMTPFrom:      firstNonEmpty(getEnv("SMTP_FROM", ""), getEnv("FROM_EMAIL", "")),
			SMTPFromName:  getEnv("SMTP_FROM_NAME", "MyRent Go"),
			FromEmail:     getEnv("FROM_EMAIL", "noreply@myrent.local"),
			TelegramToken: getEnv("TELEGRAM_BOT_TOKEN", ""),
			WhatsAppAPI:   getEnv("WHATSAPP_API_URL", ""),
			SchedulerEnabled:  getBoolEnv("EMAIL_SCHEDULER_ENABLED", true),
			SchedulerInterval: getDurationEnv("EMAIL_SCHEDULER_INTERVAL", 24*time.Hour),
		},
		System: SystemConfig{
			LogMaxEntries:      getIntEnv("SYSTEM_LOG_MAX_ENTRIES", 5000),
			MetricsEnabled:     getBoolEnv("METRICS_ENABLED", true),
			MetricsProtected:   getBoolEnv("METRICS_PROTECTED", appEnv == "production"),
			MetricsScrapeToken: getEnv("METRICS_SCRAPE_TOKEN", ""),
			MetricsRefreshSecs: getIntEnv("METRICS_REFRESH_INTERVAL_SECS", 60),
		},
	}
}

func (c *Config) IsProduction() bool {
	return c.App.Env == "production"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getIntEnv(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getFloatEnv(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

func getBoolEnv(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
