package storage

import (
	"encoding/base64"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var dataURLPrefix = regexp.MustCompile(`^data:([^;]+);base64,`)

// DocumentStore persists uploaded document binaries on the local filesystem.
type DocumentStore struct {
	basePath string
	maxBytes int64
}

func NewDocumentStore(basePath string, maxUploadMB int64) (*DocumentStore, error) {
	if err := os.MkdirAll(basePath, 0o750); err != nil {
		return nil, fmt.Errorf("create documents directory: %w", err)
	}
	return &DocumentStore{
		basePath: basePath,
		maxBytes: maxUploadMB * 1024 * 1024,
	}, nil
}

func (s *DocumentStore) BasePath() string { return s.basePath }

// HealthCheck verifies the documents directory exists and is writable.
func (s *DocumentStore) HealthCheck() error {
	testFile := filepath.Join(s.basePath, ".healthcheck")
	if err := os.WriteFile(testFile, []byte("ok"), 0o600); err != nil {
		return fmt.Errorf("storage not writable: %w", err)
	}
	_ = os.Remove(testFile)
	return nil
}

func (s *DocumentStore) MaxBytes() int64 { return s.maxBytes }

func (s *DocumentStore) MaxUploadMB() int64 {
	if s.maxBytes <= 0 {
		return 0
	}
	return s.maxBytes / (1024 * 1024)
}

// ParseDataURL decodes a browser data URL or raw base64 payload.
func ParseDataURL(raw string) (mime string, data []byte, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil, fmt.Errorf("empty file data")
	}
	payload := raw
	if m := dataURLPrefix.FindStringSubmatch(raw); len(m) == 2 {
		mime = m[1]
		payload = raw[len(m[0]):]
	}
	data, err = base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", nil, fmt.Errorf("invalid base64 file data")
	}
	return mime, data, nil
}

func (s *DocumentStore) ValidateSize(size int) error {
	if s.maxBytes > 0 && int64(size) > s.maxBytes {
		return ErrFileTooLarge
	}
	return nil
}

// Save writes bytes under {base}/{orgID}/{docID}/{fileName} and returns a relative storage path.
func (s *DocumentStore) Save(orgID, docID, fileName string, data []byte) (string, error) {
	if err := s.ValidateSize(len(data)); err != nil {
		return "", err
	}
	dir := filepath.Join(s.basePath, orgID, docID)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("create document dir: %w", err)
	}
	name := sanitizeFileName(fileName)
	abs := filepath.Join(dir, name)
	if err := os.WriteFile(abs, data, 0o600); err != nil {
		return "", fmt.Errorf("write document file: %w", err)
	}
	return filepath.ToSlash(filepath.Join(orgID, docID, name)), nil
}

func (s *DocumentStore) Read(relativePath string) ([]byte, error) {
	abs, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(s.basePath, abs)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return nil, fmt.Errorf("invalid storage path")
	}
	return fs.ReadFile(os.DirFS(s.basePath), rel)
}

func (s *DocumentStore) Delete(relativePath string) error {
	if strings.TrimSpace(relativePath) == "" {
		return nil
	}
	abs, err := s.resolve(relativePath)
	if err != nil {
		return err
	}
	if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
		return err
	}
	dir := filepath.Dir(abs)
	_ = os.Remove(dir)
	return nil
}

func (s *DocumentStore) resolve(relativePath string) (string, error) {
	clean := filepath.Clean(relativePath)
	if clean == "." || strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
		return "", fmt.Errorf("invalid storage path")
	}
	abs := filepath.Join(s.basePath, clean)
	baseAbs, err := filepath.Abs(s.basePath)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(abs)
	if err != nil {
		return "", err
	}
	if targetAbs != baseAbs && !strings.HasPrefix(targetAbs, baseAbs+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid storage path")
	}
	return targetAbs, nil
}

func sanitizeFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "" || name == "." || name == ".." {
		return "document"
	}
	return name
}
