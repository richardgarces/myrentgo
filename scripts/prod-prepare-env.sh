#!/usr/bin/env bash
# Prepara .env de producción en el servidor (copia plantilla + secretos).
# Uso: ./scripts/prod-prepare-env.sh [--non-interactive]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NON_INTERACTIVE=false
[[ "${1:-}" == "--non-interactive" || "${1:-}" == "-y" ]] && NON_INTERACTIVE=true

ENV_FILE="${ROOT_DIR}/.env"
EXAMPLE="${ROOT_DIR}/.env.production.example"

info() { echo "[✓] $*"; }
warn() { echo "[!] $*" >&2; }
error() { echo "[✗] $*" >&2; }

set_env_var() {
  local key="$1" val="$2" file="${3:-$ENV_FILE}"
  local tmp
  tmp="$(mktemp)"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    # Escapar / & para sed; valor en comillas simples vía awk más seguro
    awk -v k="$key" -v v="$val" '
      BEGIN { FS="="; OFS="=" }
      $1 == k { print k "=" v; next }
      { print }
    ' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    echo "${key}=${val}" >>"$file"
    rm -f "$tmp"
  fi
}

get_env_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true
}

if [[ ! -f "$EXAMPLE" ]]; then
  error "No existe $EXAMPLE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  info "Creado .env desde .env.production.example"
else
  info ".env ya existe — se actualizarán solo secretos CHANGE_ME si hace falta"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
fi

# JWT
jwt="$(get_env_var JWT_SECRET)"
if [[ -z "$jwt" || "$jwt" == CHANGE_ME* ]]; then
  jwt="$(openssl rand -base64 32 | tr -d '\n')"
  set_env_var JWT_SECRET "$jwt"
  info "JWT_SECRET generado"
fi

# Mongo password + URI (password URL-safe o URI con password encoded)
mongo_pw="$(get_env_var MONGO_ROOT_PASSWORD)"
mongo_user="$(get_env_var MONGO_ROOT_USER)"
mongo_user="${mongo_user:-myrent_admin}"
mongo_db="$(get_env_var MONGODB_DATABASE)"
mongo_db="${mongo_db:-myrent}"

urlencode() {
  # Codifica para userinfo de URI Mongo (/, +, @, etc.)
  python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

build_mongo_uri() {
  local user="$1" pw="$2" db="$3"
  local enc
  enc="$(urlencode "$pw")"
  echo "mongodb://${user}:${enc}@mongodb:27017/${db}?authSource=admin"
}

if [[ -z "$mongo_pw" || "$mongo_pw" == CHANGE_ME* ]]; then
  # hex: sin / + = que rompen la URI
  mongo_pw="$(openssl rand -hex 24)"
  set_env_var MONGO_ROOT_PASSWORD "$mongo_pw"
  set_env_var MONGO_ROOT_USER "$mongo_user"
  set_env_var MONGODB_URI "$(build_mongo_uri "$mongo_user" "$mongo_pw" "$mongo_db")"
  info "MONGO_ROOT_PASSWORD + MONGODB_URI generados (password URL-safe)"
else
  # Siempre regenerar URI encoded (arregla "unescaped slash in password")
  set_env_var MONGODB_URI "$(build_mongo_uri "$mongo_user" "$mongo_pw" "$mongo_db")"
  info "MONGODB_URI actualizada (password URL-encoded)"
fi

# Metrics token
mt="$(get_env_var METRICS_SCRAPE_TOKEN)"
if [[ -z "$mt" || "$mt" == CHANGE_ME* ]]; then
  mt="$(openssl rand -base64 32 | tr -d '\n')"
  set_env_var METRICS_SCRAPE_TOKEN "$mt"
  info "METRICS_SCRAPE_TOKEN generado"
fi

# Dominio (defaults ya en example)
domain="$(get_env_var DOMAIN)"
if [[ -z "$domain" ]]; then
  set_env_var DOMAIN "rent.meincart.com"
  set_env_var FRONTEND_URL "https://rent.meincart.com"
  set_env_var BASE_URL "https://rent.meincart.com"
  set_env_var CORS_ORIGINS "https://rent.meincart.com"
fi

# ACME / contacto
acme="$(get_env_var ACME_EMAIL)"
if [[ -z "$acme" || "$acme" == *example.com || "$acme" == CHANGE_ME* || "$acme" == "admin@meincart.com" ]]; then
  if [[ "$NON_INTERACTIVE" == true ]]; then
    warn "ACME_EMAIL sigue genérico — edita .env si usas Caddy builtin"
  else
    read -r -p "Email de contacto ACME/avisos [richardgarces@gmail.com]: " email_in
    email_in="${email_in:-richardgarces@gmail.com}"
    set_env_var ACME_EMAIL "$email_in"
    info "ACME_EMAIL=${email_in}"
  fi
fi

# SMTP
smtp_pass="$(get_env_var SMTP_PASSWORD)"
if [[ -z "$smtp_pass" || "$smtp_pass" == CHANGE_ME* ]]; then
  if [[ "$NON_INTERACTIVE" == true ]]; then
    warn "SMTP_PASSWORD no configurado — la app no enviará correos hasta editar .env"
  else
    echo
    echo "SMTP (Brevo) — Enter para dejar pendiente:"
    read -r -p "  SMTP_PASSWORD (clave SMTP Brevo): " smtp_in
    if [[ -n "$smtp_in" ]]; then
      set_env_var SMTP_PASSWORD "$smtp_in"
      read -r -p "  SMTP_USER [$(get_env_var SMTP_USER)]: " user_in
      [[ -n "$user_in" ]] && set_env_var SMTP_USER "$user_in"
      read -r -p "  SMTP_FROM [$(get_env_var SMTP_FROM)]: " from_in
      [[ -n "$from_in" ]] && set_env_var SMTP_FROM "$from_in"
      info "SMTP actualizado"
    else
      warn "SMTP pendiente — edita .env después si hace falta"
    fi
  fi
fi

info ".env listo: $ENV_FILE"
echo "  Revisa: DOMAIN=$(get_env_var DOMAIN)  SMTP_HOST=$(get_env_var SMTP_HOST)"
