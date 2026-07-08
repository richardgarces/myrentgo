package email

import (
	"strings"
	"testing"
)

func TestMaintenanceHeadlineAvoidsDuplicateCategory(t *testing.T) {
	ctx := MaintenanceContext{
		PropertyName: "Edificio Boho - Depto 203",
		Title:        "Termo",
		TypeLabel:    "Preventiva",
	}
	headline := maintenanceHeadline("Recordatorio de mantención", ctx)
	if headline == "Recordatorio de mantención" {
		t.Fatalf("headline should not repeat category label: %q", headline)
	}
	if !strings.Contains(headline, "Termo") {
		t.Fatalf("expected maintenance title in headline: %q", headline)
	}
	if !strings.Contains(headline, "Edificio Boho - Depto 203") {
		t.Fatalf("expected property in headline: %q", headline)
	}
}

func TestMaintenanceHeadlineKeepsSpecificTitle(t *testing.T) {
	ctx := MaintenanceContext{Title: "Termo", PropertyName: "Depto 203"}
	headline := maintenanceHeadline("Recordatorio: mantención en 7 días", ctx)
	if headline != "Recordatorio: mantención en 7 días" {
		t.Fatalf("unexpected headline: %q", headline)
	}
}

func TestRenderMaintenanceNotificationNoDuplicateHeading(t *testing.T) {
	ctx := MaintenanceContext{
		PropertyName:  "Edificio Boho - Depto 203",
		Title:         "Termo",
		TypeLabel:     "Preventiva",
		ScheduledDate: "01/11/2026",
		Cost:          "$50.000 CLP",
	}
	_, htmlBody, _ := RenderMaintenanceNotification("Recordatorio de mantención", "Mensaje de prueba.", ctx)
	count := strings.Count(htmlBody, "Recordatorio de mantención")
	if count != 1 {
		t.Fatalf("expected category label once in HTML, found %d times", count)
	}
	if !strings.Contains(htmlBody, "Termo") {
		t.Fatal("expected maintenance title in HTML body")
	}
}

func TestRenderTestNotificationSamples(t *testing.T) {
	samples := RenderTestNotificationSamples()
	if len(samples) != 6 {
		t.Fatalf("expected 6 samples, got %d", len(samples))
	}
	for _, s := range samples {
		if s.Type == "" || s.Subject == "" || s.HTML == "" || s.Text == "" {
			t.Fatalf("incomplete sample for type %q", s.Type)
		}
	}
}
