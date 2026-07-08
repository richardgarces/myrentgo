#!/usr/bin/env bash
# Optional security tool bootstrap (non-fatal).

_ensure_go_bin_path() {
  if have_cmd go; then
    local gopath_bin
    gopath_bin="$(go env GOPATH 2>/dev/null)/bin"
    if [[ -n "$gopath_bin" && -d "$gopath_bin" ]]; then
      export PATH="${gopath_bin}:${PATH}"
    fi
  fi
}

_try_go_install() {
  local pkg="$1"
  local name="$2"
  if have_cmd "$name"; then
    return 0
  fi
  if ! have_cmd go; then
    return 1
  fi
  log_info "Instalando ${name} (go install ${pkg})..."
  if go install "${pkg}" 2>/dev/null; then
    _ensure_go_bin_path
    have_cmd "$name"
  else
    log_warn "No se pudo instalar ${name}; continuar sin él"
    return 1
  fi
}

ensure_security_tools() {
  [[ "${AUTO_INSTALL_TOOLS:-1}" == "0" ]] && return 0

  _ensure_go_bin_path

  if ! have_cmd govulncheck; then
    _try_go_install "golang.org/x/vuln/cmd/govulncheck@latest" "govulncheck" || true
  fi
  if ! have_cmd gosec; then
    _try_go_install "github.com/securego/gosec/v2/cmd/gosec@latest" "gosec" || true
  fi
}
