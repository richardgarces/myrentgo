package handlers

import (
	"errors"
	"strings"
	"testing"

	"github.com/richard/my-rent-go/internal/infrastructure/storage"
)

func TestDocumentTooLargeMessage(t *testing.T) {
	msg := documentTooLargeMessage(30)
	if !strings.Contains(msg, "30 MB") {
		t.Fatalf("unexpected message: %s", msg)
	}
}

func TestIsMongoDocumentTooLarge(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "document is too large", err: errors.New("document is too large"), want: true},
		{name: "bsonobj size", err: errors.New("BSONObj size: 16777217"), want: true},
		{name: "other", err: errors.New("connection refused"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMongoDocumentTooLarge(tt.err); got != tt.want {
				t.Fatalf("isMongoDocumentTooLarge() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsInvalidFileData(t *testing.T) {
	if !isInvalidFileData(errors.New("invalid base64 file data")) {
		t.Fatal("expected invalid base64 to match")
	}
	if isInvalidFileData(storage.ErrFileTooLarge) {
		t.Fatal("file too large should not match invalid file data")
	}
}
