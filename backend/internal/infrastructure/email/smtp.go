package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
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
	host := strings.TrimSpace(cfg.Host)
	from := strings.TrimSpace(cfg.From)
	user := strings.TrimSpace(cfg.User)
	password := strings.TrimSpace(cfg.Password)
	port := cfg.Port
	if port <= 0 {
		port = 587
	}
	cfg.Port = port
	configured := host != "" && from != ""
	if user != "" {
		configured = configured && password != ""
	}
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

	if err := c.sendMail(from, msg.To, body.Bytes()); err != nil {
		return fmt.Errorf("send mail: %w", err)
	}
	slog.InfoContext(ctx, "email sent", "to", msg.To, "subject", msg.Subject)
	return nil
}

func (c *Client) tlsConfig() *tls.Config {
	return &tls.Config{
		ServerName: c.cfg.Host,
		MinVersion: tls.VersionTLS12,
	}
}

func (c *Client) sendMail(from string, to []string, raw []byte) error {
	addr := fmt.Sprintf("%s:%d", c.cfg.Host, c.cfg.Port)

	var auth smtp.Auth
	if user := strings.TrimSpace(c.cfg.User); user != "" {
		auth = smtp.PlainAuth("", user, c.cfg.Password, c.cfg.Host)
	}

	if c.cfg.Port == 465 {
		return c.sendSMTPS(addr, auth, from, to, raw)
	}
	return c.sendSTARTTLS(addr, auth, from, to, raw)
}

func (c *Client) sendSMTPS(addr string, auth smtp.Auth, from string, to []string, raw []byte) error {
	conn, err := tls.Dial("tcp", addr, c.tlsConfig())
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, c.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	return c.submit(client, from, to, raw)
}

func (c *Client) sendSTARTTLS(addr string, auth smtp.Auth, from string, to []string, raw []byte) error {
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, c.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(c.tlsConfig()); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	} else if auth != nil {
		return fmt.Errorf("server does not support STARTTLS (required for authenticated SMTP)")
	}

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	return c.submit(client, from, to, raw)
}

func (c *Client) submit(client *smtp.Client, from string, to []string, raw []byte) error {
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("rcpt %s: %w", rcpt, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := w.Write(raw); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close data: %w", err)
	}
	return client.Quit()
}
