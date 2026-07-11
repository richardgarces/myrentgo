================================================================================
  Ubuntu — kit de host seguro y plataforma Docker (replicable)
================================================================================

Sistema maestro para preparar cualquier servidor Ubuntu/Debian antes de
desplegar una o más aplicaciones: SO endurecido, firewall, Docker y software
de apoyo (cada uno instalable por separado).

Esta es la versión en texto plano de README.md (legible con less/cat, sin GUI).

--------------------------------------------------------------------------------
Paso 0 — Transferir el kit a un Ubuntu remoto (automático)
--------------------------------------------------------------------------------

Desde tu Mac/PC (un solo comando, desde la raíz del repo):

  ./ubuntu/push-to-server.sh

Con destino explícito:

  ./ubuntu/push-to-server.sh --user deploy --ip 203.0.113.10 --port 2222

Equivalente: ./ubuntu/bootstrap.sh --push

Sin flags, el script pregunta por separado: usuario, IP/hostname, directorio,
puerto SSH y clave.

El script:

  1. Empaqueta toda la carpeta ubuntu/ en un ZIP (excluye .env secretos y .build/)
  2. Conecta por SSH al servidor que indiques
  3. Transfiere el ZIP con SCP
  4. Descomprime en el remoto (~/platform-kit/ubuntu por defecto) y marca
     los .sh como ejecutables
  5. Elimina el ZIP remoto (ya descomprimido). Si ubuntu/ ya existía en el
     remoto, se reemplaza por completo
  6. Ejecuta ./init.bash en el servidor (instala glow o mdcat y abre README.md)
  7. Abre una sesión SSH interactiva ya dentro de ~/platform-kit/ubuntu
     (salir con exit)

Si el host estaba apagado/dormido y el ZIP local ya existe, reintenta sin
re-empaquetar:

  ./ubuntu/push-to-server.sh --user richard --ip 192.168.1.198 --port 2222 --zip auto

Luego en el servidor (el paso 0 ya te deja ahí por SSH; si no):

  ssh user@IP
  cd ~/platform-kit/ubuntu
  sudo ./bootstrap.sh

Para releer esta guía en el servidor (sin GUI):

  cd ~/platform-kit/ubuntu
  ./init.bash              # README.md con formato (glow/mdcat)
  less README.txt          # esta versión en texto plano
  cat README.txt

Opciones:

  ./ubuntu/push-to-server.sh --user user --ip 203.0.113.10 --dir /opt/platform-kit --port 22
  ./ubuntu/push-to-server.sh --user user --ip vps.example.com --identity ~/.ssh/id_ed25519

--------------------------------------------------------------------------------
Visor Markdown en el servidor (init.bash)
--------------------------------------------------------------------------------

Sin interfaz gráfica, desde la raíz del kit:

  cd ~/platform-kit/ubuntu
  ./init.bash                 # instala glow/mdcat si falta y abre README.md
  ./init.bash --install-only  # solo instalar el visor
  ./init.bash docs/CATALOGO.md

Orden de preferencia: glow -> mdcat -> pandoc/less -> less/cat.

--------------------------------------------------------------------------------
Inicio en el servidor (pasos 1+)
--------------------------------------------------------------------------------

  cd ubuntu   # o ~/platform-kit/ubuntu tras el paso 0
  sudo ./bootstrap.sh

Ayuda:

  ./bootstrap.sh --help
  sudo ./bootstrap.sh --list
  sudo ./bootstrap.sh --info redis
  sudo ./bootstrap.sh --status

--------------------------------------------------------------------------------
Orden recomendado (host nuevo)
--------------------------------------------------------------------------------

  Paso  Menú                 Qué hace
  ----  -------------------  --------------------------------------------------
  0     Transferir (local)   ZIP + SSH/SCP + descomprimir en el Ubuntu remoto
  1     Sistema operativo    Updates, unattended, cron full, swap, logrotate,
                             healthcheck
  2     Seguridad            SSH por clave, fail2ban, sysctl
  3     Firewall             UFW: 22 / 80 / 443 (o solo 22 con Tunnel)
  4     Docker               Engine + Compose + red platform-net
  7     Borde                Cloudflare Tunnel y/o Caddy de borde
  5     Plataforma           Redis, MinIO, Vault, Prometheus, exporters, BD,
                             Restic
  6     Backups              restic CLI + dirs + cron
  —     App                  Despliega tu aplicación (compose propio)

--------------------------------------------------------------------------------
Estructura
--------------------------------------------------------------------------------

  ubuntu/
  ├── bootstrap.sh
  ├── init.bash            # instalar glow/mdcat + abrir README.md
  ├── push-to-server.sh
  ├── README.md            # guía (Markdown)
  ├── README.txt           # esta guía (texto plano)
  ├── lib/common.sh
  ├── scripts/
  │   ├── remote/          # paso 0
  │   ├── os/              # updates, swap, logrotate, healthcheck
  │   ├── security/
  │   ├── firewall/
  │   ├── docker/
  │   ├── edge/            # cloudflared
  │   ├── backups/
  │   └── platform/manage.sh
  ├── platform/
  │   ├── redis|minio|vault|prometheus|alertmanager|grafana
  │   ├── mongodb|postgres|restic
  │   ├── caddy|cloudflared|node-exporter|cadvisor
  └── docs/
      ├── CATALOGO.md / CATALOGO.txt
      └── help/*.md / help/*.txt

Cada platform/<servicio>/.env.example explica línea a línea qué es cada
parámetro y para qué sirve.

--------------------------------------------------------------------------------
Cómo añadir un servicio (ej. Redis)
--------------------------------------------------------------------------------

  sudo ./bootstrap.sh
  # 5 -> 1 Redis -> 1 preparar .env -> 2 editar secretos -> 4 levantar

--------------------------------------------------------------------------------
Replicar en otro servidor
--------------------------------------------------------------------------------

  1. Ejecuta el paso 0 (./ubuntu/push-to-server.sh) hacia el nuevo host.
  2. En el servidor: sudo ./bootstrap.sh (pasos 1->6).
  3. Regenera o transfiere secretos .env de forma segura.
  4. Inicializa Vault/Restic si aplica.
  5. Despliega tus apps en platform-net o con compose propio.

Variables globales útiles:

  Variable         Default           Uso
  ---------------  ----------------  ------------------------------------------
  PLATFORM_ROOT    /opt/platform     Datos/backups/logs del host
  PLATFORM_NET     platform-net      Red Docker compartida

--------------------------------------------------------------------------------
Relación con las aplicaciones
--------------------------------------------------------------------------------

  Pieza                          Dónde vive
  -----------------------------  ----------------------------------------------
  App (API, frontend, proxy)     Compose / despliegue propio de cada producto
  Software de apoyo compartido   ubuntu/platform/ (este kit)

--------------------------------------------------------------------------------
Seguridad (resumen)
--------------------------------------------------------------------------------

  - Puertos de BD / Redis / MinIO / Vault / métricas: solo 127.0.0.1 o red
    Docker interna.
  - UFW: no abrir 27017, 5432, 6379, 9000, 8200, 9090.
  - Secrets en .env con chmod 600 (nunca commit; el paso 0 no los incluye
    en el ZIP).
  - Unattended-upgrades: parches de seguridad diarios.

--------------------------------------------------------------------------------
Licencia / alcance
--------------------------------------------------------------------------------

Scripts pensados para Ubuntu 22.04/24.04 LTS y Debian 12. Los pasos 1-7 en el
servidor requieren sudo. El paso 0 se ejecuta desde tu máquina local. Revisa
cada script antes de producción.
