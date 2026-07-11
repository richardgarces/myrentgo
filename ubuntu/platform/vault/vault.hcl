# vault.hcl — configuración de Vault en modo servidor (NO -dev)
#
# storage "file": backend local en /vault/file (volumen Docker).
# Para HA en clusters grandes usa raft o Consul; file basta en un host pequeño.
storage "file" {
  path = "/vault/file"
}

# listener: API HTTP. En producción delante de Caddy/Nginx con TLS, o activa tls_cert_file.
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

# ui: consola web embebida (http://127.0.0.1:8200/ui)
ui = true

# api_addr: URL anunciada a clientes y seal; ajústala al host real.
api_addr = "http://127.0.0.1:8200"

# disable_mlock: en Docker suele ser necesario (capa extra de mlock puede fallar).
# En bare metal con memoria bloqueada puedes poner false.
disable_mlock = true
