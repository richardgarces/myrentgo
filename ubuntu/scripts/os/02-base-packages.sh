#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Instalar paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  ca-certificates \
  curl \
  wget \
  gnupg \
  lsb-release \
  apt-transport-https \
  software-properties-common \
  jq \
  git \
  htop \
  vim \
  nano \
  unzip \
  zip \
  rsync \
  tmux \
  fail2ban \
  ufw \
  unattended-upgrades \
  apt-listchanges \
  openssl \
  net-tools \
  dnsutils \
  netcat-openbsd \
  chrony

info "Paquetes base instalados."
systemctl enable --now chrony || true
info "Chrony (NTP) activo."
