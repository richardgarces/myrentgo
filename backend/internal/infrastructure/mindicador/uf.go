package mindicador

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const ufAPIURL = "https://mindicador.cl/api/uf"

type UFValue struct {
	Value  float64 `json:"value"`
	Date   string  `json:"date"`
	Source string  `json:"source"`
}

type ufResponse struct {
	Serie []struct {
		Fecha string  `json:"fecha"`
		Valor float64 `json:"valor"`
	} `json:"serie"`
}

type UFProvider struct {
	client   *http.Client
	mu       sync.RWMutex
	cached   *UFValue
	cacheDay string
}

func NewUFProvider() *UFProvider {
	return &UFProvider{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *UFProvider) GetUF(ctx context.Context) (*UFValue, error) {
	today := chileToday()

	p.mu.RLock()
	if p.cached != nil && p.cacheDay == today {
		v := *p.cached
		p.mu.RUnlock()
		return &v, nil
	}
	p.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ufAPIURL, nil)
	if err != nil {
		return nil, err
	}

	res, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mindicador request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mindicador status %d", res.StatusCode)
	}

	var body ufResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("mindicador decode: %w", err)
	}
	if len(body.Serie) == 0 || body.Serie[0].Valor <= 0 {
		return nil, fmt.Errorf("mindicador empty serie")
	}

	parsed, err := time.Parse(time.RFC3339, body.Serie[0].Fecha)
	if err != nil {
		parsed = time.Now()
	}
	date := parsed.In(chileLocation()).Format("2006-01-02")

	value := &UFValue{
		Value:  body.Serie[0].Valor,
		Date:   date,
		Source: "mindicador.cl",
	}

	p.mu.Lock()
	p.cached = value
	p.cacheDay = today
	p.mu.Unlock()

	return value, nil
}

func chileToday() string {
	return time.Now().In(chileLocation()).Format("2006-01-02")
}

func chileLocation() *time.Location {
	loc, err := time.LoadLocation("America/Santiago")
	if err != nil {
		return time.FixedZone("CLT", -4*3600)
	}
	return loc
}
