# Docker

## Qué es
Motor de contenedores + plugin Compose.

## Para qué sirve
Empaquetar y aislar app + Mongo + Caddy + servicios de plataforma sin instalar cada binario en el SO.

## Instalación
Menú 4 del `bootstrap.sh` (repo oficial Docker CE).

## Red `platform-net`
Red Docker externa compartida. Las apps y Redis/MinIO/Vault se conectan como clientes.

## Seguridad
- No publicar puertos de BD
- Usuario `deploy` en grupo `docker` (cuidado: docker = casi root)
- Actualizar imágenes periódicamente
