#!/usr/bin/env bash
# Wrapper legacy — usar scripts/deploy-prod.sh
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${ROOT_DIR}/scripts/deploy-prod.sh" --yes "$@"
