# Actualizaciones automáticas

## Mensaje al login (ESM Apps)
El aviso de «mantenimiento de seguridad expandido / ESM Apps» es **Ubuntu Pro** (opcional). No indica fallo de `unattended-upgrades`.

## Qué usar en este kit
| Capa | Qué es | Menú |
|------|--------|------|
| **unattended-upgrades** | Seguridad diaria gratis (`-security`) | `updates-menu` opción 2 |
| **Cron full-upgrade** | `apt upgrade` de todo (opcional) | opción 6 |
| **Ubuntu Pro / ESM** | Parches extra universe | `pro attach` (Canonical) |

```bash
sudo ./updates-menu.sh
# o: sudo ./bootstrap.sh → 1 → 3
```
