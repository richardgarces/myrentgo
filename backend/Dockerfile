# MyRent Go API — build: docker build -t myrent-api ./backend
FROM golang:1.23-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /api .
RUN adduser -D -g '' appuser && mkdir -p storage && chown appuser:appuser storage
USER appuser
EXPOSE 7070
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:7070/health || exit 1
CMD ["./api"]
