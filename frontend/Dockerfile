# MyRent Go frontend — build: docker build -t myrent-frontend ./frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Unprivileged nginx (non-root, listens on 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk add --no-cache curl
USER nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/ >/dev/null || exit 1
