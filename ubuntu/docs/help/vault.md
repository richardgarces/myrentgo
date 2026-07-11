# Vault

## Qué es
HashiCorp Vault: secretos cifrados, rotación, auditoría, políticas por path.

## Para qué sirve
Centralizar `JWT_SECRET`, passwords de BD, keys SMTP sin copiar `.env` a mano entre hosts.

## Cuándo instalarlo
Desde la segunda app, o cuando necesites rotación/auditoría. Con **una sola app**, un `.env` `chmod 600` puede bastar.

## Parámetros / archivos
| Elemento | Significado |
|----------|-------------|
| `VAULT_DEV_MODE` | Lab; **false** en producción |
| `vault.hcl` | Storage file, listener, UI |
| Paths | `secret/{app}/backend` |

## Post-install producción
`vault operator init` → unseal → `secrets enable kv-v2`.
Guarda unseal keys **fuera** del servidor.
