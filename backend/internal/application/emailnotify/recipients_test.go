package emailnotify

import (
	"strings"
	"testing"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
	domainnotif "github.com/richard/my-rent-go/internal/domain/notification"
)

func TestDedupeEmails(t *testing.T) {
	got := dedupeEmails([]string{" A@x.com ", "a@x.com", "b@x.com", "", "b@x.com"})
	if len(got) != 2 || got[0] != "A@x.com" || got[1] != "b@x.com" {
		t.Fatalf("unexpected dedupe result: %#v", got)
	}
}

func TestUsesTenantRecipient(t *testing.T) {
	n := &domainnotif.Notification{Type: domainnotif.TypePaymentDue}
	if !usesTenantRecipient(n) {
		t.Fatal("payment_due should use tenant recipient")
	}

	n = &domainnotif.Notification{Type: domainnotif.TypeMaintenanceDue, TenantID: "x"}
	if usesTenantRecipient(n) {
		t.Fatal("maintenance should stay internal-only")
	}

	n = &domainnotif.Notification{Type: domainnotif.TypePaymentDue, TenantID: "tenant-1"}
	if !usesTenantRecipient(n) {
		t.Fatal("payment with tenant_id should use tenant recipient")
	}
}

func TestRecipientMatchesMaintenanceProperty(t *testing.T) {
	rec := &domainer.EmailRecipient{PropertyID: "prop-a"}
	ctx := notificationContext{propertyID: "prop-b"}
	if recipientMatchesNotification(rec, ctx) {
		t.Fatal("property-linked recipient should not match different property")
	}

	ctx = notificationContext{propertyID: "prop-a"}
	if !recipientMatchesNotification(rec, ctx) {
		t.Fatal("property-linked recipient should match same property")
	}

	global := &domainer.EmailRecipient{}
	if !recipientMatchesNotification(global, notificationContext{propertyID: "prop-b"}) {
		t.Fatal("global recipient should match any maintenance property")
	}
}

func TestErrNoPropertyRecipientsFor(t *testing.T) {
	msg := ErrNoPropertyRecipientsFor("Edificio Boho - Depto 203", domainer.TypeMaintenanceDue)
	if !strings.Contains(msg, "Edificio Boho - Depto 203") {
		t.Fatalf("expected property name in message: %s", msg)
	}
	if !strings.Contains(msg, "Recordatorio de mantención") {
		t.Fatalf("expected type label in message: %s", msg)
	}
}
