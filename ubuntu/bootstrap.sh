#!/usr/bin/env bash
# =============================================================================
# Bootstrap maestro de host Ubuntu/Debian — plataforma genérica
# =============================================================================
# En el SERVIDOR Ubuntu (tras transferir el kit):
#   cd /ruta/a/ubuntu
#   sudo ./bootstrap.sh
#
# Desde tu máquina LOCAL (paso 0 — empaquetar y enviar):
#   ./push-to-server.sh
#   ./bootstrap.sh --push
#   ./bootstrap.sh            # menú → opción 0 (no requiere root)
#
# Otras opciones:
#   ./bootstrap.sh --help
#   sudo ./bootstrap.sh --info redis
#   sudo ./bootstrap.sh --status
# =============================================================================
set -euo pipefail

UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"

show_help() {
  cat <<'EOF'
Bootstrap de host Ubuntu (sistema base seguro + plataforma Docker)

USO LOCAL (tu Mac/PC — paso 0)
  ./push-to-server.sh
  ./bootstrap.sh --push
  ./bootstrap.sh --push user@IP
  Empaqueta ubuntu/ en ZIP, lo copia por SCP y lo descomprime en el remoto.

USO EN EL SERVIDOR
  sudo ./bootstrap.sh                 Menú interactivo (pasos 1–8)
  sudo ./bootstrap.sh --help
  sudo ./bootstrap.sh --status
  sudo ./bootstrap.sh --info <id>
  sudo ./bootstrap.sh --list

MENÚS
  0) Transferir kit a un Ubuntu remoto (ZIP + SSH/SCP + descomprimir)
  1) Sistema operativo    Updates, unattended, cron full, swap, logrotate, healthcheck
  2) Seguridad            SSH, fail2ban, sysctl, usuarios
  3) Firewall (UFW)       Reglas 22/80/443 y estado
  4) Docker               Motor Docker + Compose plugin
  5) Plataforma Docker    Redis, MinIO, Vault, métricas, BD, Caddy, exporters, Restic
  6) Backups              Scripts de respaldo y cron
  7) Borde                Cloudflare Tunnel + Caddy de borde
  8) Estado / verificación
  9) Catálogo HELP
 10) Comandos útiles (red: IP Wi‑Fi, puerto SSH)
  h) Mostrar --help
  q) Salir

DOCUMENTACIÓN
  README.md / README.txt
  docs/CATALOGO.txt
  platform/*/.env.example   (cada parámetro documentado)

Orden recomendado en host nuevo:
  0 (desde local) → 1 → 2 → 3 → 4 → 7 (Tunnel/Caddy si aplica) → 5 → 6
EOF
}

cmd_status() {
  header "Estado del host"
  echo "Hostname: $(hostname)"
  echo "SO:       $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo desconocido)"
  echo "Kernel:   $(uname -r)"
  echo "Uptime:   $(uptime -p 2>/dev/null || uptime)"
  echo
  if command -v ufw >/dev/null 2>&1; then
    echo "=== UFW ==="
    ufw status verbose || true
  else
    warn "UFW no instalado"
  fi
  echo
  if command -v docker >/dev/null 2>&1; then
    echo "=== Docker ==="
    docker version --format 'Client {{.Client.Version}} / Server {{.Server.Version}}' 2>/dev/null || docker --version
    echo "Redes platform:"
    docker network ls --filter name=platform- 2>/dev/null || true
    echo "Contenedores platform:"
    docker ps --filter name=platform- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  else
    warn "Docker no instalado"
  fi
  echo
  if [[ -d /var/log/unattended-upgrades ]]; then
    echo "=== Unattended upgrades (últimas líneas) ==="
    tail -5 /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null || echo "(sin log aún)"
  fi
  echo
  if swapon --show 2>/dev/null | grep -q .; then
    echo "=== Swap ==="
    swapon --show
  fi
  if [[ -f /opt/platform/logs/healthcheck.log ]]; then
    echo "=== Healthcheck (últimas líneas) ==="
    tail -5 /opt/platform/logs/healthcheck.log || true
  fi
}

cmd_list() {
  header "Software de plataforma disponible"
  cat <<'EOF'
  ID              Descripción breve
  ----            ------------------
  redis           Cache / colas en memoria
  minio           Object storage S3-compatible
  vault           Secretos centralizados (KV)
  prometheus      Scraping y almacenamiento de métricas
  alertmanager    Enrutado de alertas (correo / Telegram)
  grafana         Dashboards sobre Prometheus
  mongodb         Base de datos documental
  postgres        Base de datos relacional SQL
  restic          Backup cifrado off-site (S3/B2/MinIO)
  caddy           Reverse proxy de borde (TLS)
  cloudflared     Cloudflare Tunnel (sin abrir router)
  node-exporter   Métricas del host (CPU/disco/RAM)
  cadvisor        Métricas por contenedor Docker

  Más detalle: sudo ./bootstrap.sh --info <id>
  Catálogo:    docs/CATALOGO.txt  (también .md)
EOF
}

cmd_info() {
  local id="${1:-}"
  if [[ -z "$id" ]]; then
    error "Uso: $0 --info <id>   (ej. redis)"
    exit 1
  fi
  local f_txt="${UBUNTU_ROOT}/docs/help/${id}.txt"
  local f_md="${UBUNTU_ROOT}/docs/help/${id}.md"
  local f=""
  if [[ -f "$f_txt" ]]; then
    f="$f_txt"
  elif [[ -f "$f_md" ]]; then
    f="$f_md"
  fi
  if [[ -n "$f" ]]; then
    less -F "$f" 2>/dev/null || cat "$f"
  else
    error "No hay ficha de ayuda para '${id}'."
    echo "Disponibles: redis minio vault prometheus alertmanager grafana mongodb postgres restic caddy cloudflared node-exporter cadvisor docker ufw network public-access updates"
    exit 1
  fi
}

run_script() {
  local rel="$1"
  shift || true
  local path="${UBUNTU_ROOT}/scripts/${rel}"
  if [[ ! -x "$path" && -f "$path" ]]; then
    chmod +x "$path"
  fi
  if [[ ! -f "$path" ]]; then
    error "No existe: scripts/${rel}"
    return 0
  fi
  if [[ $# -gt 0 ]]; then
    info "Ejecutando scripts/${rel} $* ..."
  else
    info "Ejecutando scripts/${rel} ..."
  fi
  # No tumbar el menú si el script falla (grep/pipefail, etc.)
  if ! bash "$path" "$@"; then
    warn "El script scripts/${rel} terminó con error (el menú continúa)."
  fi
  return 0
}

cmd_push() {
  local pusher="${UBUNTU_ROOT}/scripts/remote/00-pack-and-push.sh"
  if [[ ! -f "$pusher" ]]; then
    error "Falta ${pusher}"
    return 1
  fi
  chmod +x "$pusher" "${UBUNTU_ROOT}/push-to-server.sh" 2>/dev/null || true
  bash "$pusher" "$@"
}

menu_os() {
  require_root
  while true; do
    clear || true
    header "1) Sistema operativo"
    cat <<'EOF'
  1) Actualizar paquetes ahora (apt update && upgrade) — una sola vez
  2) Instalar paquetes base (curl, jq, htop, git, fail2ban, ufw, unattended-upgrades)
  3) Menú: actualizaciones automáticas (seguridad / ESM / full cron / estado)
  4) Configurar swap (swapfile + swappiness)
  5) Logrotate para logs de plataforma
  6) Healthcheck del host (disco/RAM/load/Docker → cron + log)
  0) Volver

  Tip: el aviso del login sobre «ESM Apps» se explica en el menú 3 → opción 1.
  Seguridad diaria gratis = menú 3 → opción 2 (unattended-upgrades).
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "os/01-apt-update.sh" ;;
      2) run_script "os/02-base-packages.sh" ;;
      3) bash "${UBUNTU_ROOT}/scripts/os/updates-menu.sh" ;;
      4) run_script "os/06-swap.sh" ;;
      5) run_script "os/07-logrotate.sh" ;;
      6) run_script "os/08-host-healthcheck.sh" ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
    pause
  done
}

menu_security() {
  require_root
  while true; do
    clear || true
    header "2) Seguridad / hardening"
    cat <<'EOF'
  1) Endurecer SSH (clave, desactivar password, PermitRootLogin prohibit-password)
  2) Instalar y configurar fail2ban (sshd)
  3) Aplicar sysctl de red básicos (anti IP spoofing / SYN cookies)
  4) Crear usuario deploy (con sudo + docker) — opcional
  0) Volver

  IMPORTANTE: configura tu clave SSH ANTES de desactivar login por contraseña.
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "security/01-harden-ssh.sh" ;;
      2) run_script "security/02-fail2ban.sh" ;;
      3) run_script "security/03-sysctl.sh" ;;
      4) run_script "security/04-deploy-user.sh" ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
    pause
  done
}

menu_firewall() {
  require_root
  while true; do
    clear || true
    header "3) Firewall UFW"
    cat <<'EOF'
  1) Instalar UFW y políticas por defecto (deny in / allow out)
  2) Permitir OpenSSH + HTTP/HTTPS (22, 80, 443)
  3) Activar UFW
  4) Ver estado
  5) Añadir IP permitida a SSH (restrictivo)
  0) Volver
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "firewall/01-ufw-install.sh" ;;
      2) run_script "firewall/02-ufw-base-rules.sh" ;;
      3) run_script "firewall/03-ufw-enable.sh" ;;
      4) ufw status verbose || true; pause ;;
      5) run_script "firewall/04-ufw-allow-ssh-from-ip.sh" ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
    pause
  done
}

menu_docker() {
  require_root
  while true; do
    clear || true
    header "4) Docker"
    cat <<'EOF'
  1) Instalar Docker Engine + Compose plugin (repo oficial)
  2) Crear red compartida platform-net
  3) Verificar instalación
  4) Limpiar imágenes/caches no usados (cuidado)
  0) Volver
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "docker/01-install-docker.sh" ;;
      2) run_script "docker/02-platform-network.sh" ;;
      3) run_script "docker/03-verify.sh" ;;
      4) run_script "docker/04-prune.sh" ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
    pause
  done
}

menu_platform() {
  require_root
  while true; do
    clear || true
    header "5) Plataforma Docker (software de apoyo)"
    cat <<'EOF'
  Cada servicio es independiente (compose + .env.example documentado).

  1) Redis
  2) MinIO (S3)
  3) Vault
  4) Prometheus
  5) Alertmanager
  6) Grafana
  7) MongoDB
  8) PostgreSQL
  9) Restic (herramienta + cron de respaldo)
 10) Caddy (reverse proxy de borde)
 11) Node Exporter (métricas del host)
 12) cAdvisor (métricas de contenedores)
 13) Abrir ficha HELP de un servicio
 14) Estado de contenedores platform-*
  0) Volver

  Antes: menú 4 → instalar Docker y crear platform-net.
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "platform/manage.sh" redis ;;
      2) run_script "platform/manage.sh" minio ;;
      3) run_script "platform/manage.sh" vault ;;
      4) run_script "platform/manage.sh" prometheus ;;
      5) run_script "platform/manage.sh" alertmanager ;;
      6) run_script "platform/manage.sh" grafana ;;
      7) run_script "platform/manage.sh" mongodb ;;
      8) run_script "platform/manage.sh" postgres ;;
      9) run_script "platform/manage.sh" restic ;;
      10) run_script "platform/manage.sh" caddy ;;
      11) run_script "platform/manage.sh" node-exporter ;;
      12) run_script "platform/manage.sh" cadvisor ;;
      13)
        read -r -p "ID del servicio (redis, caddy, cloudflared, ...): " sid
        cmd_info "$sid" || true
        pause
        ;;
      14)
        docker ps -a --filter name=platform- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
        pause
        ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
  done
}

menu_edge() {
  require_root
  while true; do
    clear || true
    header "7) Borde / acceso público"
    cat <<'EOF'
  1) Checklist acceso público (DNS + router + Caddy / Tunnel)
  2) Instalar Cloudflare Tunnel (cloudflared)
  3) Gestionar Tunnel (README / copiar config)
  4) Caddy de borde (compose en platform/caddy)
  5) HELP public-access (paso a paso)
  6) HELP cloudflared
  7) HELP caddy
  0) Volver

  Tip casa/NAT: Tunnel → platform-caddy:80 → tus apps (sin abrir router).
  Si curl a la IP pública muestra micro_httpd: el router no reenvía a este host.
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) bash "${UBUNTU_ROOT}/scripts/edge/check-public-access.sh" ;;
      2) run_script "edge/01-install-cloudflared.sh" ;;
      3) bash "${UBUNTU_ROOT}/scripts/edge/manage-tunnel.sh"; pause ;;
      4) run_script "platform/manage.sh" caddy ;;
      5) cmd_info public-access; pause ;;
      6) cmd_info cloudflared; pause ;;
      7) cmd_info caddy; pause ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
    pause
  done
}

menu_backups() {
  require_root
  while true; do
    clear || true
    header "6) Backups"
    cat <<'EOF'
  1) Instalar restic CLI (apt o binario)
  2) Preparar directorio /opt/platform/backups + script wrapper
  3) Configurar cron diario de ejemplo (edición interactiva)
  4) Ver documentación de Restic / política
  0) Volver
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "backups/01-install-restic.sh" ;;
      2) run_script "backups/02-prepare-dirs.sh" ;;
      3) run_script "backups/03-cron-example.sh" ;;
      4) cmd_info restic; pause ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
    pause
  done
}

menu_help_catalog() {
  clear || true
  header "9) Catálogo HELP"
  if [[ -f "${UBUNTU_ROOT}/docs/CATALOGO.txt" ]]; then
    less -F "${UBUNTU_ROOT}/docs/CATALOGO.txt" 2>/dev/null || cat "${UBUNTU_ROOT}/docs/CATALOGO.txt"
  elif [[ -f "${UBUNTU_ROOT}/docs/CATALOGO.md" ]]; then
    less -F "${UBUNTU_ROOT}/docs/CATALOGO.md" 2>/dev/null || cat "${UBUNTU_ROOT}/docs/CATALOGO.md"
  else
    cmd_list
  fi
  pause
}

menu_utils() {
  while true; do
    clear || true
    header "10) Comandos útiles"
    cat <<'EOF'
  1) Red — menú (IP, Wi‑Fi, cable, SSH, rfkill)  [ejecutar]
  2) Ver ficha help de red (docs/help/network.txt)
  0) Volver
EOF
    read -r -p "Opción: " o
    case "$o" in
      1) run_script "utils/network-menu.sh" ;;
      2)
        if [[ -f "${UBUNTU_ROOT}/docs/help/network.txt" ]]; then
          less -F "${UBUNTU_ROOT}/docs/help/network.txt" 2>/dev/null \
            || cat "${UBUNTU_ROOT}/docs/help/network.txt"
        else
          warn "No existe docs/help/network.txt"
        fi
        pause
        ;;
      0) return ;;
      *) warn "Opción inválida" ;;
    esac
  done
}

menu_push() {
  clear || true
  header "0) Transferir kit a Ubuntu remoto"
  cat <<'EOF'
  Este paso se ejecuta desde tu máquina LOCAL (o cualquier host con SSH).
  1. Empaqueta toda la carpeta ubuntu/ en un ZIP (sin .env secretos)
  2. Conecta por SSH al servidor
  3. Copia el ZIP con SCP
  4. Descomprime y deja permisos +x en los scripts

  Luego en el servidor: cd …/ubuntu && sudo ./bootstrap.sh  (pasos 1+)
EOF
  echo
  if ask_yes_no "¿Iniciar empaquetado y transferencia ahora?"; then
    cmd_push
  else
    info "Cancelado. También puedes ejecutar: ./push-to-server.sh"
  fi
  pause
}

main_menu() {
  # Si una opción [sudo] se eligió sin root, require_root relanza con sudo.
  ensure_menu_root() {
    if [[ "${EUID}" -eq 0 ]]; then
      return 0
    fi
    require_root
  }

  while true; do
    clear || true
    header "Bootstrap Ubuntu — plataforma genérica"
    cat <<'EOF'
  0) Transferir este kit a un Ubuntu remoto (ZIP + SSH/SCP)
  1) Sistema operativo (updates, swap, logrotate, healthcheck) [sudo]
  2) Seguridad (SSH, fail2ban, sysctl)                         [sudo]
  3) Firewall (UFW)                                            [sudo]
  4) Docker Engine + Compose                                   [sudo]
  5) Plataforma Docker (BD, métricas, Caddy, exporters…)       [sudo]
  6) Backups                                                   [sudo]
  7) Borde (Cloudflare Tunnel + Caddy)                         [sudo]
  8) Estado del host                                           [sudo]
  9) Catálogo HELP / para qué sirve cada software
 10) Comandos útiles (red: IP Wi‑Fi, puerto SSH)
  h) Mostrar --help
  q) Salir
EOF
    read -r -p "Opción: " o
    case "$o" in
      0) menu_push ;;
      1) ensure_menu_root; menu_os ;;
      2) ensure_menu_root; menu_security ;;
      3) ensure_menu_root; menu_firewall ;;
      4) ensure_menu_root; menu_docker ;;
      5) ensure_menu_root; menu_platform ;;
      6) ensure_menu_root; menu_backups ;;
      7) ensure_menu_root; menu_edge ;;
      8) ensure_menu_root; cmd_status; pause ;;
      9) menu_help_catalog ;;
      10) menu_utils ;;
      h|H) show_help; pause ;;
      q|Q) info "Salida."; exit 0 ;;
      *) warn "Opción inválida (usa q para salir)" ;;
    esac
  done
}

# ── Entrada ──────────────────────────────────────────────────────────────────
case "${1:-}" in
  --help|-h) show_help; exit 0 ;;
  --push)
    shift
    cmd_push "$@"
    exit 0
    ;;
  --status) require_root; cmd_status; exit 0 ;;
  --list) cmd_list; exit 0 ;;
  --info) shift; cmd_info "${1:-}"; exit 0 ;;
  "")
    # Menú: root solo se exige en submenús 1–7
    main_menu
    ;;
  *)
    error "Opción desconocida: $1"
    show_help
    exit 1
    ;;
esac
