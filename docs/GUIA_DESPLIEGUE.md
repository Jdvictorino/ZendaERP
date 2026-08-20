# Guía de Despliegue — ZenDA ERP en ODROID-M1S

Backend Node.js/Express + PostgreSQL 16 (Prisma) desplegado con Docker Compose sobre Ubuntu Server. **Nota:** el NVMe de 256GB no fue detectado por el sistema (pendiente de diagnóstico físico); por ahora todo — sistema y datos — vive en el eMMC de 58GB. La sección 3 se deja documentada para cuando se resuelva el NVMe y se pueda migrar.

---

## 0. Arquitectura de esta instalación

```
[ eMMC 58GB (a bordo) ]
  ├─ Ubuntu Server 20.04.6 LTS  (sistema operativo)
  └─ /srv/zenda
       ├─ app/           (código del backend)
       ├─ postgres-data/ (volumen de PostgreSQL)
       └─ backups/       (dumps automáticos)

[ NVMe 256GB (M.2) ] — pendiente: no detectado por el sistema (ver sección 3).
Cuando se resuelva o se reemplace el disco, /srv/zenda se migra ahí siguiendo esa misma sección.
```

**¿Por qué todo en eMMC por ahora?**
El ODROID-M1S no soporta arrancar el sistema operativo desde NVMe (solo desde eMMC/SD), así que el sistema siempre iba en eMMC. La idea original era usar el NVMe de 256GB como disco de datos aparte, pero el módulo no fue detectado por el sistema (`lsblk`/`lspci` vacíos incluso tras un power-cycle completo) — quedó pendiente de diagnóstico físico (asentamiento, tipo de conector M-key vs B+M-key, alimentación). Mientras tanto, se usa el eMMC de 58GB para todo: sistema, código, base de datos y backups. Es un downgrade de espacio (58GB vs 256GB) pero funcionalmente no cambia nada del resto de la guía — cuando el NVMe esté listo, la migración es directa (copiar `/srv/zenda` al nuevo disco y remontar).

**Deploy:** Docker Compose, reutilizando el `Dockerfile` (`node:22-alpine`, ya es multi-arquitectura y corre nativo en ARM64) y el `compose.yaml` que ya tienen en el repo (API + PostgreSQL).

**Exposición a internet:** en la sección 7 te dejo dos caminos — Cloudflare Tunnel/Tailscale (recomendado si tu ISP usa CGNAT, muy común en RD) o port-forwarding + Let's Encrypt si tienes forma de exponer un puerto público.

---

## 1. Grabar Ubuntu Server en el ODROID-M1S

> **Estado actual de este servidor:** ya tiene Ubuntu **20.04.6 LTS (Focal)** de fábrica instalado en el eMMC, con el kernel `linux-image-5.10.0-odroid-arm64` provisto por el repositorio `ppa.linuxfactory.or.kr` (compilado solo para Focal). Se decidió **no reflashear** por ahora y seguir la guía sobre esta versión — el resto de los pasos (Docker, PostgreSQL, Nginx) funcionan igual en 20.04.6. Esta sección queda como referencia por si en el futuro decides reflashear a una LTS más reciente (26.04 disponible en el wiki oficial); en ese caso, ten en cuenta que el kernel de terceros de este repo no tiene build para 22.04/24.04/26.04, así que un `do-release-upgrade` no es una opción — solo reflasheo limpio.

Tienes 3 formas de instalar. Elige una:

### Opción A — Selector de OS en pantalla (la más simple)

El M1S trae de fábrica un instalador en el eMMC que muestra un menú al conectar HDMI + teclado por primera vez.

1. Conecta el ODROID a un monitor HDMI y un teclado USB.
2. Enciende el equipo. Aparecerá un menú de selección de OS.
3. Elige la imagen de **Ubuntu Server** disponible (arm64) y confirma la instalación al eMMC.
4. Al terminar, reinicia. Ya puedes desconectar el monitor/teclado y pasar a operar por SSH.

### Opción B — Headless por SD card (sin monitor)

1. Descarga la imagen oficial de Ubuntu Server para M1S desde `https://wiki.odroid.com/odroid-m1s/getting_started/os_installation_guide` (archivo tipo `ubuntu-26.04-server-odroidm1s-*.img.xz`; es la LTS más reciente disponible para el M1S, con soporte hasta 2031).
2. Graba esa imagen en una microSD con [balenaEtcher](https://etcher.balena.io/) o `dd`.
3. Inserta la SD en el M1S y enciende. El M1S arranca desde SD (tiene prioridad sobre el eMMC) y desde ahí puedes instalar/flashear al eMMC siguiendo las instrucciones del propio wiki, o simplemente dejar el sistema corriendo desde la SD si prefieres no tocar el eMMC.

### Opción C — USB-OTG desde tu PC (headless, sin monitor)

Este método convierte el eMMC del M1S en un disco USB visible desde tu computadora, para que flashees Ubuntu Server directo desde tu PC sin necesitar monitor ni teclado. Aun así necesitas una microSD pequeña, pero solo para una utilidad de arranque — no para el sistema operativo final.

1. Descarga la imagen de utilidad `ODROID-M1S_EMMC2UMS.img` desde `https://wiki.odroid.com/odroid-m1s/getting_started/os_installation_guide_usb_from_pc`.
2. Graba esa imagen (la utilidad EMMC2UMS, **no** Ubuntu) en la microSD con [balenaEtcher](https://etcher.balena.io/).
3. Inserta la microSD en el M1S y enciéndelo. El equipo arranca la utilidad y queda a la espera, sin necesidad de conectar nada más.
4. Conecta un cable micro-USB entre el puerto **USB-OTG** del M1S (no el de alimentación) y tu PC.
5. Tu PC debe reconocer el eMMC del M1S como una unidad de almacenamiento externa (en Windows aparece en el Explorador/Administración de discos con la capacidad del eMMC; en Linux, como `/dev/sdX`).
6. Descarga la imagen de Ubuntu Server para M1S (la misma de la Opción B) y grábala con balenaEtcher — esta vez el **destino** es el eMMC detectado, no la microSD.
7. Al terminar, desconecta el cable USB, retira la microSD del M1S y enciéndelo normalmente: ahora arranca Ubuntu Server desde el eMMC recién flasheado.

> Si el PC no reconoce el M1S por USB, prueba con otro cable (algunos cables micro-USB son solo de carga, sin líneas de datos) o con otro puerto.

> Si compraste el M1S con eMMC de 64GB, cualquiera de las tres opciones deja el sistema operativo en el eMMC. El NVMe queda intacto para el paso 3.

### Primer acceso

Usuario/clave por defecto suele ser `odroid` / `odroid`. Conéctate por SSH:

```bash
ssh odroid@<IP-DEL-ODROID>
passwd            # cambia la contraseña por defecto de inmediato
```

---

## 2. Configuración inicial del sistema

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

### 2.1 Hostname y zona horaria

```bash
sudo hostnamectl set-hostname zenda-server
sudo timedatectl set-timezone America/Santo_Domingo
```

### 2.2 Usuario de despliegue (evita usar el usuario por defecto para todo)

```bash
sudo adduser zenda
sudo usermod -aG sudo zenda
su - zenda
```

### 2.3 SSH con llaves y hardening básico

Desde tu computadora local, copia tu llave pública:

```bash
ssh-copy-id zenda@<IP-DEL-ODROID>
```

Luego en el servidor, edita `/etc/ssh/sshd_config`:

```
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl restart ssh
```

### 2.4 Firewall (UFW)

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Nota: el puerto **3001** (API) nunca se abre al exterior — solo lo usará Nginx internamente vía `localhost`.

### 2.5 IP estática (recomendado en un servidor)

Edita el netplan (`/etc/netplan/*.yaml`) para fijar una IP dentro de tu red local, o resérvala por MAC en tu router. Esto evita que el backend "cambie de dirección" tras un reinicio.

### 2.6 Swap (importante en placas con poca RAM)

```bash
free -h   # revisa cuánta RAM tienes (4GB u 8GB según tu variante del M1S)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Si tu M1S es de 4GB de RAM, este swap es casi obligatorio para que Postgres + Docker + Node no se ahoguen bajo carga.

---

## 3. Carpeta de datos en el eMMC (NVMe pendiente)

> El NVMe de 256GB no fue detectado (ver diagnóstico en la sección 3.5). Por ahora `/srv/zenda` se crea directo sobre el eMMC — funciona exactamente igual para todos los pasos siguientes, solo con menos espacio disponible (58GB en vez de 256GB).

### 3.1 Verificar espacio disponible en el eMMC

```bash
df -h /
```

Confirma que te queda espacio de sobra para el código, Docker, y la base de datos (con una app de este tamaño, unos pocos GB deberían bastar para empezar; vale la pena revisar esto de vez en cuando con `df -h` según crezca la base de datos).

### 3.2 Estructura de carpetas

```bash
sudo mkdir -p /srv/zenda/{app,postgres-data,backups}
sudo chown -R zenda:zenda /srv/zenda
```

De aquí en adelante, todas las rutas `/srv/zenda/...` del resto de esta guía funcionan igual, solo que viven en el eMMC en vez del NVMe.

### 3.3 Backups adicionales (recomendado mientras no hay NVMe)

Con todo en un solo disco (eMMC), conviene copiar los backups de `/srv/zenda/backups` a otro lugar de vez en cuando (tu PC, la nube) — si el eMMC falla, se pierde sistema y datos juntos, sin el NVMe como respaldo separado.

### 3.4 Cuando consigas o resuelvas el NVMe — migración

Cuando el disco esté listo, la migración es sencilla:

```bash
docker compose down                          # apaga los contenedores
sudo rsync -av /srv/zenda/ /mnt/nvme-temp/    # copia todo al NVMe ya montado
# ajustar /etc/fstab para montar el NVMe en /srv/zenda
sudo mv /srv/zenda /srv/zenda-old
sudo mkdir /srv/zenda && sudo mount -a
sudo rsync -av /mnt/nvme-temp/ /srv/zenda/
docker compose up -d                         # vuelve a levantar, ya sobre NVMe
```

Avísame cuando llegues a ese punto y armamos los comandos exactos con el UUID real del disco.

### 3.5 Referencia — diagnóstico pendiente del NVMe

Quedó pendiente de resolver por qué `lsblk`/`lspci` no detectan el módulo. Antes de reintentar, confirmar:

- Que el módulo esté bien asentado y atornillado en el slot M.2.
- Que sea tipo **M-key** (PCIe) y no **B+M-key** (SATA) — el slot del M1S no tiene líneas SATA.
- Que el adaptador de corriente entregue suficiente amperaje.

### 3.6 Referencia — particionar y montar el NVMe (para cuando esté detectado)

```bash
lsblk   # debe aparecer /dev/nvme0n1
sudo parted /dev/nvme0n1 --script mklabel gpt
sudo parted /dev/nvme0n1 --script mkpart primary ext4 0% 100%
sudo mkfs.ext4 /dev/nvme0n1p1
sudo blkid /dev/nvme0n1p1     # copia el UUID que muestra
```

Agrega a `/etc/fstab` (reemplaza el UUID, y usa el mismo truco de `printf`/`tee` en una sola línea si el pegado multilínea te sigue dando problemas):

```bash
printf 'UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  /srv/zenda  ext4  defaults,noatime  0  2\n' | sudo tee -a /etc/fstab > /dev/null
sudo mount -a
df -h /srv/zenda
```

---

## 4. Instalar Docker (ARM64)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker zenda
newgrp docker
docker --version
docker compose version
```

El script oficial detecta automáticamente arm64 e instala la versión correcta para el M1S.

---

## 5. Obtener el código y configurar variables de entorno

### 5.1 Clonar el repo en /srv/zenda

```bash
cd /srv/zenda/app
git clone <url-de-tu-repositorio> .
```

### 5.2 Variables de entorno de producción (`backend/.env`)

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Puntos clave a cambiar respecto al `.env.example` del repo:

```env
NODE_ENV=production
PORT=3001

# Debe apuntar al servicio "postgres" del compose, NO a localhost
DATABASE_URL="postgresql://zenda_user:CONTRASEÑA_FUERTE@postgres:5432/zenda_db?schema=public"

FRONTEND_URL="https://app.tudominio.com"

# Genera valores nuevos y largos, nunca reutilices los de desarrollo
JWT_SECRET="<genera-uno-nuevo-con-openssl-rand-hex-32>"
JWT_EXPIRES_IN="24h"
REFRESH_TOKEN_EXPIRES_IN="7d"

PLATFORM_OWNER_EMAIL="admin@tudominio.com"
ADMIN_PASSWORD="<contraseña-inicial-fuerte-solo-para-el-seed>"

BILLING_ENFORCEMENT_ENABLED=true
BILLING_BLOCK_MODE=auto
BILLING_ENFORCEMENT_SCHEDULER_ENABLED=true
BILLING_ENFORCEMENT_INTERVAL_MINUTES=30

PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...

RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@tudominio.com"
```

Genera el `JWT_SECRET` con:

```bash
openssl rand -hex 32
```

### 5.3 Revisar `compose.yaml`

Ajusta el volumen de PostgreSQL para que persista en `/srv/zenda` (en el eMMC por ahora) en lugar de un volumen anónimo de Docker, por ejemplo:

```yaml
services:
  postgres:
    volumes:
      - /srv/zenda/postgres-data:/var/lib/postgresql/data
  backend:
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001" # solo accesible localmente; Nginx hace el proxy
```

El `restart: unless-stopped` asegura que el backend vuelva a levantar solo si el ODROID se reinicia (por corte de luz, por ejemplo).

---

## 6. Levantar el backend con Docker Compose

```bash
cd /srv/zenda/app
docker compose build
docker compose up -d
docker compose logs -f backend
```

### 6.1 Migraciones y seed (dentro del contenedor)

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend pnpm db:seed   # opcional, datos iniciales
```

### 6.2 Verificar

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/monitoring/ready
```

---

## 7. Nginx como reverse proxy + exposición a internet

```bash
sudo apt install -y nginx
```

`/etc/nginx/sites-available/zenda`:

```nginx
server {
    listen 80;
    server_name api.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/zenda /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Ahora elige cómo vas a exponerlo a internet:

**Opción A — Cloudflare Tunnel o Tailscale (recomendado)**
La mayoría de los ISP en RD usan CGNAT, así que abrir puertos en el router no siempre funciona. Con `cloudflared` (Cloudflare Tunnel) expones `https://api.tudominio.com` sin abrir ningún puerto ni depender de IP pública, y de paso obtienes SSL gratis. Tailscale es la alternativa si solo necesitas acceso privado (tu equipo, no el público general).

**Opción B — Port-forward + Let's Encrypt**
Si tienes IP pública fija (o DDNS) y puedes hacer NAT en tu router hacia el ODROID en los puertos 80/443:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.tudominio.com
```

Certbot configura el certificado y el renovado automático.

---

## 8. Backups automáticos hacia /srv/zenda (eMMC)

`/srv/zenda/backups/backup.sh`:

```bash
#!/bin/bash
FECHA=$(date +%Y%m%d_%H%M%S)
docker compose -f /srv/zenda/app/compose.yaml exec -T postgres \
  pg_dump -U zenda_user zenda_db | gzip > /srv/zenda/backups/zenda_$FECHA.sql.gz

# conserva solo los últimos 14 backups
ls -t /srv/zenda/backups/*.sql.gz | tail -n +15 | xargs -r rm
```

```bash
chmod +x /srv/zenda/backups/backup.sh
crontab -e
```

Agrega (backup diario a las 3am):

```
0 3 * * * /srv/zenda/backups/backup.sh
```

Idealmente copia también estos `.sql.gz` fuera del ODROID de vez en cuando (otro disco, la nube, etc.) — un backup que vive solo en el mismo equipo no protege contra fallas de hardware.

---

## 9. Checklist final de seguridad

- [ ] Contraseña por defecto (`odroid`) cambiada
- [ ] Login SSH solo por llave, root deshabilitado
- [ ] UFW activo, solo 22/80/443 abiertos, **3001 nunca expuesto**
- [ ] `JWT_SECRET`, `ADMIN_PASSWORD` y credenciales de Postgres regenerados (no los de desarrollo)
- [ ] `PAYPAL_MODE=live` con credenciales reales solo cuando estés listo para producción
- [ ] SSL activo (Cloudflare Tunnel o certbot)
- [ ] Backups corriendo y verificados manualmente al menos una vez
- [ ] `docker compose ps` muestra ambos servicios `Up` tras un `sudo reboot` de prueba

---

## Apéndice — Alternativa sin Docker (PM2 nativo)

Si prefieres no usar contenedores, el mismo repo ya trae `docs/GUIA_DESPLIEGUE.md` con el flujo de PM2. En el M1S (ARM64) solo cambia la instalación de Node.js:

```bash
# Node.js 22.x vía NodeSource (sí publica builds arm64)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm pm2

# PostgreSQL 16 nativo
sudo apt install -y postgresql-16

# Código en /srv/zenda (eMMC), igual que en la sección 5
cd /srv/zenda/app/backend
pnpm install
pnpm db:generate
pnpm db:migrate
pm2 start src/index.js --name zenda-backend
pm2 startup
pm2 save
```

De ahí en adelante, el resto (Nginx, SSL, backups, firewall) es igual a las secciones 7–9 de esta guía.
