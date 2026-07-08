package email

import (
	_ "embed"
	"encoding/base64"
)

//go:embed assets/logo.png
var logoPNG []byte

func logoDataURI() string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(logoPNG)
}

func emailHeader() string {
	return `<div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
    <img src="` + logoDataURI() + `" alt="MyRent Go" width="40" height="40" style="display:block;border-radius:8px;">
    <strong style="font-size:18px;">MyRent Go</strong>
  </div>`
}

const emailFooter = `<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
  <p style="font-size:12px;color:#888;">MyRent Go — Administración de propiedades</p>`
