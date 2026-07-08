package emailnotify

import (
	"testing"

	domainer "github.com/richard/my-rent-go/internal/domain/emailrecipient"
)

func TestMergeMissingNotificationTypes(t *testing.T) {
	existing := []domainer.NotificationType{domainer.TypePaymentDue}
	defaults := domainer.AllNotificationTypes

	merged, changed := mergeMissingNotificationTypes(existing, defaults)
	if !changed {
		t.Fatal("expected changed when maintenance_due is missing")
	}
	if len(merged) != len(defaults) {
		t.Fatalf("expected %d types, got %d", len(defaults), len(merged))
	}
	for _, want := range defaults {
		found := false
		for _, got := range merged {
			if got == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing type %s in merged result", want)
		}
	}

	_, changedAgain := mergeMissingNotificationTypes(merged, defaults)
	if changedAgain {
		t.Fatal("expected no change when all types already present")
	}
}
