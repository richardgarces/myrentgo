package storage

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateSize(t *testing.T) {
	dir := t.TempDir()
	store, err := NewDocumentStore(dir, 1)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name    string
		size    int
		wantErr error
	}{
		{name: "within limit", size: 512 * 1024, wantErr: nil},
		{name: "at limit", size: 1024 * 1024, wantErr: nil},
		{name: "over limit", size: 1024*1024 + 1, wantErr: ErrFileTooLarge},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := store.ValidateSize(tt.size)
			if tt.wantErr == nil && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr != nil && !errors.Is(err, tt.wantErr) {
				t.Fatalf("expected %v, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestParseDataURL(t *testing.T) {
	payload := base64.StdEncoding.EncodeToString([]byte("hello"))
	mime, data, err := ParseDataURL("data:application/pdf;base64," + payload)
	if err != nil {
		t.Fatal(err)
	}
	if mime != "application/pdf" || string(data) != "hello" {
		t.Fatalf("unexpected parse result: %s %q", mime, data)
	}

	_, _, err = ParseDataURL("")
	if err == nil || !strings.Contains(err.Error(), "empty file data") {
		t.Fatalf("expected empty file data error, got %v", err)
	}

	_, _, err = ParseDataURL("data:application/pdf;base64,%%%")
	if err == nil || !strings.Contains(err.Error(), "invalid base64") {
		t.Fatalf("expected invalid base64 error, got %v", err)
	}
}

func TestSaveAndRead(t *testing.T) {
	dir := t.TempDir()
	store, err := NewDocumentStore(dir, 30)
	if err != nil {
		t.Fatal(err)
	}

	data := []byte("pdf-content")
	path, err := store.Save("org-1", "doc-1", "contract.pdf", data)
	if err != nil {
		t.Fatal(err)
	}

	got, err := store.Read(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(data) {
		t.Fatalf("read mismatch: %q", got)
	}

	if err := store.Delete(path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, path)); !os.IsNotExist(err) {
		t.Fatal("expected file deleted")
	}
}

func TestResolveRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	store, err := NewDocumentStore(dir, 30)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Read("../secrets.txt"); err == nil {
		t.Fatal("expected path traversal rejection")
	}
}

func TestMaxUploadMB(t *testing.T) {
	store := &DocumentStore{maxBytes: 30 * 1024 * 1024}
	if store.MaxUploadMB() != 30 {
		t.Fatalf("expected 30 MB, got %d", store.MaxUploadMB())
	}
}
