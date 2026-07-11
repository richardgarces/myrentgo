#!/usr/bin/env bash
set -euo pipefail
UBUNTU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "${UBUNTU_ROOT}/lib/common.sh"
require_root
require_debian_family

header "Instalar Docker Engine + Compose plugin"
# Repo oficial Docker: https://docs.docker.com/engine/install/ubuntu/

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

# shellcheck disable=SC1091
. /etc/os-release
ARCH="$(dpkg --print-architecture)"
CODENAME="${VERSION_CODENAME:-$(lsb_release -cs)}"

# Debian vs Ubuntu
if [[ "${ID}" == "debian" ]]; then
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
else
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
fi

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
info "Docker instalado."
docker --version
docker compose version
ensure_platform_dirs
info "Directorios: ${PLATFORM_ROOT}"
