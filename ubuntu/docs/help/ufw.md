# UFW

## Qué es
Uncomplicated Firewall — frontend simple de iptables/nftables.

## Para qué sirve
Permitir solo SSH/HTTP/HTTPS; denegar el resto entrante.

## Reglas recomendadas
- `allow OpenSSH`
- `allow 80/tcp`, `allow 443/tcp`
- Denegar 27017, 5432, 6379, 9000, 8200, 9090 desde WAN

## Opcional
Limitar SSH a tu IP de casa/oficina (`ufw allow from IP to any port 22`).
