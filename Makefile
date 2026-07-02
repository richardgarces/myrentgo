.PHONY: help dev build test seed docker-up docker-down docker-prod lint swagger

help:
	@echo "MyRent Go - Comandos disponibles:"
	@echo "  make dev          - Backend + frontend en desarrollo"
	@echo "  make build        - Compilar backend y frontend"
	@echo "  make test         - Ejecutar tests"
	@echo "  make seed         - Crear usuario admin inicial"
	@echo "  make docker-up    - Docker Compose desarrollo"
	@echo "  make docker-down  - Detener contenedores"
	@echo "  make docker-prod  - Docker Compose producción"
	@echo "  make lint         - Linters"
	@echo "  make swagger      - Generar OpenAPI"

dev-api:
	cd backend && go run ./cmd/api

dev-frontend:
	cd frontend && VITE_PORT=4000 npm run dev

dev:
	@echo "Inicia en terminales separadas: make dev-api && make dev-frontend"

build-api:
	cd backend && CGO_ENABLED=0 go build -o ../bin/api ./cmd/api

build-frontend:
	cd frontend && npm ci && npm run build

build: build-api build-frontend

test:
	cd backend && go test ./... -v -race -cover

seed:
	cd backend && go run ./cmd/seed

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-prod:
	docker compose -f docker-compose.prod.yml up -d --build

lint:
	cd backend && go vet ./...
	cd frontend && npm run lint 2>/dev/null || true

swagger:
	cd backend && go install github.com/swaggo/swag/cmd/swag@latest && swag init -g cmd/api/main.go -o docs/swagger

install:
	cd frontend && npm install
	cd backend && go mod download
