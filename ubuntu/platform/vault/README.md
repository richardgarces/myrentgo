# Vault — gestor de secretos

**Qué es:** almacén cifrado para JWT_SECRET, DB passwords, API keys.  
**Para qué:** un solo Vault para N apps; cada app lee solo `secret/{app}/…`.

| Variable / archivo | Para qué sirve |
|--------------------|----------------|
| `VAULT_DEV_MODE=true` | Lab rápido; **no producción** |
| `VAULT_DEV_ROOT_TOKEN` | Token root solo en -dev |
| `vault.hcl` | Storage file, listener, UI en modo servidor |

**Producción (primer arranque):**

```bash
docker exec -it platform-vault vault operator init
docker exec -it platform-vault vault operator unseal
docker exec -it platform-vault vault secrets enable -path=secret kv-v2
```

Guarda las **unseal keys** y el **root token** fuera del servidor (gestor de contraseñas).
