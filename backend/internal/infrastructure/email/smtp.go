package email

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	FromName string
}

type Client struct {
	cfg        Config
	configured bool
}

func NewClient(cfg Config) *Client {
	from := strings.TrimSpace(cfg.From)
	host := strings.TrimSpace(cfg.Host)
	configured := host != "" && from != ""
	return &Client{cfg: cfg, configured: configured}
}

func (c *Client) Configured() bool {
	return c.configured
}

type Message struct {
	To       []string
	Subject  string
	HTMLBody string
	TextBody string
}

func (c *Client) Send(ctx context.Context, msg Message) error {
	if len(msg.To) == 0 {
		return nil
	}
	if !c.configured {
		slog.InfoContext(ctx, "email skipped (SMTP not configured)",
			"to", msg.To, "subject", msg.Subject)
		return nil
	}

	from := c.cfg.From
	fromHeader := from
	if name := strings.TrimSpace(c.cfg.FromName); name != "" {
		fromHeader = fmt.Sprintf("%s <%s>", name, from)
	}

	var body bytes.Buffer
	body.WriteString("From: " + fromHeader + "\r\n")
	body.WriteString("To: " + strings.Join(msg.To, ", ") + "\r\n")
	body.WriteString("Subject: " + msg.Subject + "\r\n")
	body.WriteString("MIME-Version: 1.0\r\n")

	if msg.HTMLBody != "" {
		boundary := "myrent-go-boundary"
		body.WriteString("Content-Type: multipart/alternative; boundary=" + boundary + "\r\n\r\n")
		if msg.TextBody != "" {
			body.WriteString("--" + boundary + "\r\n")
			body.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
			body.WriteString(msg.TextBody + "\r\n")
		}
		body.WriteString("--" + boundary + "\r\n")
		body.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
		body.WriteString(msg.HTMLBody + "\r\n")
		body.WriteString("--" + boundary + "--\r\n")
	} else {
		body.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
		body.WriteString(msg.TextBody + "\r\n")
	}

	addr := fmt.Sprintf("%s:%d", c.cfg.Host, c.cfg.Port)
	var auth smtp.Auth
	if user := strings.TrimSpace(c.cfg.User); user != "" {
		auth = smtp.PlainAuth("", user, c.cfg.Password, c.cfg.Host)
	}
	if err := smtp.SendMail(addr, auth, from, msg.To, body.Bytes()); err != nil {
		return fmt.Errorf("send mail: %w", err)
	}
	slog.InfoContext(ctx, "email sent", "to", msg.To, "subject", msg.Subject)
	return nil
}
