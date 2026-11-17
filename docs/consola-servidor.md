# Consola del servidor: preparación y recuperación

La sección **Servidor** del panel de plataforma abre una terminal como `zenda` en el host y un editor de la base de datos. Antes de usarla hay que preparar el servidor una sola vez. Nada de esto requiere `sudo`.

## 1. Llave SSH de la consola (como `zenda` en zenda-server)

```bash
mkdir -p /srv/zenda/secrets
ssh-keygen -t ed25519 -N "" -C zenda-console -f /srv/zenda/secrets/console_ed25519
```

Agrega la llave pública a `~/.ssh/authorized_keys` en **una sola línea**, con las restricciones delante:

```bash
echo "from=\"172.16.0.0/12\",no-agent-forwarding,no-port-forwarding,no-X11-forwarding $(cat /srv/zenda/secrets/console_ed25519.pub)" >> ~/.ssh/authorized_keys
```

Con `from="172.16.0.0/12"` la llave solo sirve desde la red de Docker (el backend está en `172.18.0.0/16`); copiada a otra máquina no abre nada.

El backend lee la llave con el usuario del contenedor (uid 1000, que en el host es `odroid`). Pásale la llave a ese uid usando la propia imagen del backend (`zenda` está en el grupo `docker`, no hace falta `sudo`):

```bash
docker run --rm --user 0 --entrypoint chown -v /srv/zenda/secrets:/s "$(docker inspect -f '{{.Config.Image}}' zenda-backend)" 1000:1000 /s/console_ed25519
```

`odroid` ya pertenece al grupo `sudo`, así que poder leer la llave no le da acceso nuevo.

## 2. Huella del servidor

```bash
ssh-keyscan -t ed25519 localhost 2>/dev/null | ssh-keygen -lf -
```

Copia la parte que va después de `SHA256:` (por ejemplo `AbC…xyz`). Si la huella no coincide, la consola no conecta.

## 3. Compose del servidor

El `compose.yaml` de `/srv/zenda/app` tiene cambios propios del servidor y contiene secretos: no lo edites. Crea al lado `compose.override.yaml` (Docker Compose lo combina solo y git no lo sigue):

```yaml
services:
  backend:
    volumes:
      - /srv/zenda/secrets/console_ed25519:/run/secrets/console_ed25519:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      CONSOLE_SSH_HOST: host.docker.internal
      CONSOLE_SSH_USER: zenda
      CONSOLE_SSH_KEY_PATH: /run/secrets/console_ed25519
      CONSOLE_SSH_HOST_FINGERPRINT: "<huella del paso 2, sin SHA256:>"
```

Los volúmenes del override se suman a los de `compose.yaml`. Comprueba el resultado con `docker compose config | grep -E "CONSOLE_|console_ed25519|host.docker.internal"`.

## 4. Despliegue

1. Preparación del servidor (pasos 1 a 3).
2. Respaldo: `bash /srv/zenda/backups/backup.sh` y renombrar el archivo a `zenda_db_<fecha>_antes-vX.Y.Z.sql.gz`.
3. Backend: `git pull --ff-only` y el build desacoplado de siempre.
4. Migración: `docker exec zenda-backend npx prisma migrate deploy` (crea `platform_security` y `platform_audit_log`).
5. OTA de la app.

Apenas esté desplegado, entra a **Servidor** y configura el segundo factor: escanea el QR con Google Authenticator, Authy o similar y confirma con un código. Mientras no esté configurado, cualquiera con la contraseña de plataforma podría configurarlo primero.

## 5. Si pierdes el autenticador

Solo se recupera por SSH:

```bash
docker exec zenda-backend node scripts/reset-totp.js
```

Después vuelve a **Servidor** y configura un autenticador nuevo.

## Conexión WebSocket

El WebSocket de la terminal pasa por Cloudflare → cloudflared → nginx (`/etc/nginx/sites-enabled/zenda` ya tiene las cabeceras `Upgrade`/`Connection` y `proxy_read_timeout 86400`). El backend envía un ping cada 30 s para que Cloudflare no corte una terminal inactiva.

## Límites conocidos

- El registro de comandos es aproximado: el autocompletado, el historial y editores como vim no se registran fielmente. Una contraseña pegada antes de que aparezca el aviso de `sudo` sí quedaría registrada.
- El editor bloquea por lista de palabras (`COPY`, `SET`, `DO`, `query_to_xml`…), no con un usuario de base de datos de solo lectura. Frena una sesión robada, no a quien ya tiene la terminal.
- Para tareas largas en la terminal usa `nohup … &`: la sesión se cierra a los 10 minutos sin escribir y como máximo a las 8 horas.
