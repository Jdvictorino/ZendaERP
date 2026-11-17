# Consola del servidor en el panel de plataforma — diseño

Rama: `consola-servidor` (desde `main` 5419bc4, versión 1.1.16).

## Intención

El dueño quiere administrar el servidor (`zenda-server`, Odroid aarch64, Ubuntu 20.04) y su base de datos desde el panel de plataforma (`PlatformBillingControlView`), sin depender de SSH + Tailscale para el día a día. Eligió la **terminal completa protegida**: una terminal real igual a su sesión SSH y un editor de la base de datos con lectura y escritura, protegidos con segundo factor, solo para su usuario de plataforma, con registro de todo y cierre por inactividad.

Éxito: desde el panel abre "Servidor", escribe el código de su app autenticadora, y obtiene una terminal como `zenda` donde puede correr `docker compose …`, `git pull`, `bash /srv/zenda/backups/backup.sh`, ver registros, etc.; o una vista de la base de datos donde busca filas y ejecuta SQL. Todo queda en un registro que puede revisar.

## Decisiones del dueño

- **Alcance de la terminal:** igual que su SSH de hoy — usuario `zenda` en el servidor (docker, git, copias, registros y también la otra aplicación `financiaos`). `sudo` sigue pidiendo contraseña.
- **Enfoque A:** el backend abre una sesión **SSH hacia el propio servidor** con una llave exclusiva que solo se acepta desde la red de Docker.
- **Segundo factor:** códigos de 6 dígitos de una app autenticadora (TOTP), configurados una vez con un QR; se piden **cada vez** que se abre la terminal o el editor.
- **Registro:** cada comando y cada consulta, con fecha e IP, visible en el mismo panel.
- **Inactividad:** la terminal se cierra tras **10 minutos** sin uso.

## Enfoques considerados

- **A — SSH desde el backend (elegido).** `sshd` del servidor ya maneja la terminal (PTY, colores, tamaño); el backend solo autentica, retransmite y registra. Riesgo: el backend guarda una llave con el poder de `zenda`.
- **B — servicio propio en el servidor** que abre la terminal. Mismo riesgo, más código propio, una librería nativa a compilar para aarch64 y un servicio más que mantener. Descartado.
- **C — darle al backend el socket de Docker.** Equivale a root en el servidor. Descartado.

## Hechos del entorno (verificados 2026-11-17)

- Backend: contenedor `zenda-backend` en la red Docker `app_default` (IP 172.18.0.2, gateway **172.18.0.1**), publicado solo en `127.0.0.1:3001`; sale a internet por el túnel de Cloudflare como `api.zendaerp.online`.
- `sshd` escucha en `0.0.0.0:22`; `~zenda/.ssh/authorized_keys` existe; `sudo` pide contraseña a `zenda`.
- Panel de plataforma: un único dueño (`PLATFORM_OWNER_EMAIL` + hash de contraseña en el entorno), token JWT con `scope: 'platform_admin'` y 12 h de vida (`backend/src/routes/adminBilling.js`, `requirePlatformAdmin`). **No hay segundo factor hoy.**
- Express arranca con `app.listen` (`backend/src/index.js:202`); no hay WebSockets.
- Dependencias disponibles: `react-qr-code` (app), `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, `zod` (backend). Nuevas necesarias: `ssh2` y `ws` (backend), `@xterm/xterm` + `@xterm/addon-fit` (app). El TOTP se implementa con `crypto` de Node (RFC 6238), sin librería.

## Diseño

### 1. Segundo factor (TOTP)

- Tabla nueva `platform_security` (una fila): `totpSecret` (base32), `totpConfirmedAt`, `lastTotpStep` (último paso de 30 s usado, para que un código no sirva dos veces).
- `POST /api/admin/console/totp/setup` (con sesión de plataforma; solo si aún no hay secreto confirmado): genera el secreto y devuelve la URI `otpauth://totp/Zenda%20ERP:<correo>?secret=…&issuer=Zenda%20ERP` para el QR.
- `POST /api/admin/console/totp/confirm {code}`: confirma con un código válido. Después de confirmado, `setup` responde 409.
- Verificación: ventana de ±1 paso de 30 s, comparación en tiempo constante, y rechazo de un paso ≤ `lastTotpStep`.
- **Recuperación** (teléfono perdido): solo por SSH, con un script `backend/scripts/reset-totp.js` que borra el secreto (`docker exec zenda-backend node scripts/reset-totp.js`). No hay recuperación por el panel.

### 2. Desbloqueo de la consola

- `POST /api/admin/console/unlock {code}` (con sesión de plataforma): si el código es válido devuelve un **token de consola** JWT `scope: 'platform_console'`, 10 min de vida, y registra `unlock_ok`; si no, 400 y registra `unlock_fail`.
- Límite: 5 fallos en 15 min bloquean el desbloqueo 15 min (por IP y global, ya que hay un solo dueño).
- El token de consola se renueva con cada uso (deslizante, máximo 10 min sin actividad); al cerrar la terminal o el editor se descarta en la app.
- La terminal y el editor exigen el token de consola **además** de la sesión de plataforma.

### 3. Terminal

- WebSocket `wss://api.zendaerp.online/api/admin/console/terminal?ticket=<t>`. El navegador no puede mandar cabeceras en un WebSocket, así que la app pide antes `POST /api/admin/console/ticket` (con token de consola) y recibe un **ticket de un solo uso válido 30 s**.
- El servidor HTTP pasa de `app.listen` a `http.createServer(app)` con `ws` en modo `noServer`, atendiendo `upgrade` solo en esa ruta.
- El backend conecta con `ssh2` a `zenda@host.docker.internal:22` (host configurable `CONSOLE_SSH_HOST`), con la llave privada leída de un archivo montado de solo lectura (`CONSOLE_SSH_KEY_PATH`), verifica la huella del host (`CONSOLE_SSH_HOST_FINGERPRINT`) y pide un shell con PTY `xterm-256color`.
- Mensajes: de la app al servidor `{"t":"in","d":…}` y `{"t":"resize","cols":…,"rows":…}`; del servidor a la app los bytes de salida.
- **Una sola terminal abierta a la vez**; abrir otra cierra la anterior.
- **Inactividad:** 10 min sin entrada del usuario → se cierra con el aviso "Sesión cerrada por inactividad". Duración máxima absoluta: 8 h.
- **Registro de comandos:** se reconstruye la línea escrita (hasta Enter, aplicando retroceso) y se guarda como `terminal_command`. Si la salida inmediatamente anterior contiene un aviso de contraseña (`password for`, `contraseña`, `Password:`), esa línea se guarda como `[contraseña omitida]`. También `terminal_open` / `terminal_close` (con motivo y duración). No se guarda la salida.
- La llave en `authorized_keys` lleva `from="172.16.0.0/12",no-agent-forwarding,no-port-forwarding,no-X11-forwarding`: fuera de la red de Docker no sirve.

### 4. Editor de base de datos

Usa la conexión Prisma que el backend ya tiene; todas las rutas exigen token de consola.
- `GET /api/admin/console/db/tables`: tablas del esquema `public` con número aproximado de filas.
- `GET /api/admin/console/db/tables/:name?page=&search=`: filas paginadas (50), búsqueda de texto en las columnas de texto. `:name` se valida contra la lista real de tablas.
- `POST /api/admin/console/db/query {sql, confirm}`: ejecuta una sentencia. Primero en transacción `READ ONLY` con `statement_timeout` de 15 s y tope de 500 filas devueltas; si Postgres responde que es de escritura y `confirm` no es `true`, responde 409 "Esta consulta cambia datos: confírmala". Con `confirm: true` se ejecuta en una transacción normal y devuelve filas afectadas. Una sola sentencia por llamada.
- Cada consulta se registra como `sql` (texto completo, filas devueltas/afectadas, error si lo hubo).
- La UI: lista de tablas a la izquierda, filas con búsqueda a la derecha, consola SQL abajo; las consultas de escritura muestran un diálogo de confirmación con el texto de la consulta.

### 5. Registro

- Tabla nueva `platform_audit_log`: `id`, `at`, `ip` (de `CF-Connecting-IP`, si no `req.ip`), `kind` (`totp_setup`, `unlock_ok`, `unlock_fail`, `terminal_open`, `terminal_command`, `terminal_close`, `sql`), `detail` (texto), `sessionId`.
- `GET /api/admin/console/audit?kind=&page=`: con sesión de plataforma (no hace falta el código para leer el registro).
- Solo se agrega; ninguna ruta borra ni edita el registro.

### 6. App (panel de plataforma)

- Sección nueva **"Servidor"** en `PlatformBillingControlView` (`src/views/platform/ServerSection.jsx`), con pestañas **Terminal**, **Base de datos** y **Registro**.
- Primera vez: pantalla "Configura tu app autenticadora" con el QR (`react-qr-code`) y el campo de confirmación.
- Al entrar a Terminal o Base de datos sin token de consola vigente: diálogo "Código de verificación" de 6 dígitos.
- Terminal con `@xterm/xterm` y ajuste al tamaño; barra con el estado, el tiempo restante por inactividad y botón "Cerrar sesión".

### 7. Preparación del servidor (una vez, la hace el dueño o yo con su permiso; no requiere sudo)

1. Como `zenda`: `ssh-keygen -t ed25519 -N "" -f /srv/zenda/secrets/console_ed25519` y agregar la llave pública a `~/.ssh/authorized_keys` con `from="172.16.0.0/12",no-agent-forwarding,no-port-forwarding,no-X11-forwarding`.
2. Montar `/srv/zenda/secrets/console_ed25519` de solo lectura en el contenedor del backend y definir `CONSOLE_SSH_HOST=host.docker.internal` (más `extra_hosts: ["host.docker.internal:host-gateway"]`), `CONSOLE_SSH_USER=zenda`, `CONSOLE_SSH_KEY_PATH`, `CONSOLE_SSH_HOST_FINGERPRINT` (en el `compose` local del servidor, que tiene cambios propios: editar solo esas líneas).
3. Desplegar backend → migración → OTA (las apps viejas no ven la sección; el backend nuevo no rompe nada de lo existente).

### 8. Decisiones tomadas sin consultar (revisables)

- **El registro de comandos es de mejor esfuerzo, no forense.** Se reconstruye la línea a partir de lo tecleado. El autocompletado con Tab, el historial (flechas) y editores como `vim` no se registran fielmente. Las contraseñas se omiten cuando la salida previa muestra un aviso de contraseña (`password for`, `contraseña`, `Password:`, `passphrase`). Una contraseña escrita en otra parte del comando sí quedaría registrada. La pantalla del registro lo dice.
- **Poder del editor SQL:** usa la misma conexión de Prisma, con poder total sobre la base de Zenda (el dueño eligió lectura y escritura, y la terminal ya da más). Dos excepciones baratas:
  - la tabla `platform_security` (el secreto del segundo factor) no aparece en la lista;
  - cualquier consulta que nombre `platform_security` o `platform_audit_log` se rechaza en el editor.

  Una sola sentencia por llamada: las consultas preparadas de Postgres ya rechazan varias sentencias. Además, se rechaza un `;` que no sea el final. `COPY … PROGRAM` también se rechaza siempre.
- **El token de consola es independiente del de plataforma**, pero lleva el correo del dueño. Para usarlo se exigen los dos. La renovación deslizante viaja en la cabecera de respuesta `X-Console-Token` de cada llamada de consola. En la terminal, la inactividad la cuenta el servidor a partir de lo que escribe el usuario.
- **Un solo proceso de backend** (un contenedor), así que los tickets, el bloqueo por intentos y la regla de "una terminal a la vez" viven en memoria. `lastTotpStep` vive en la base de datos.
- **Red de Docker:** el contenedor del backend llega al servidor por `host.docker.internal`, configurado con `extra_hosts: ["host.docker.internal:host-gateway"]`, en vez de una IP fija. La llave se restringe a `from="172.16.0.0/12"`, todo el rango de Docker. Así no se rompe si la red se recrea con otra subred.
- **IP del registro:** se toma de `CF-Connecting-IP`. El puerto 3001 solo escucha en `127.0.0.1`, así que nadie fuera del servidor puede falsificar esa cabecera. Si no viene, se usa `req.ip`.
- **WebSocket:** el túnel de Cloudflare permite WebSockets por defecto. Si la conexión falla, la terminal muestra "No se pudo conectar" y no hay plan B por sondeo.
- **Reinicio o redespliegue del backend:** la terminal muestra "Desconectado" con un botón "Reconectar", que pide el código otra vez si el token venció. No hay reconexión automática ni sesiones persistentes. La ayuda recomienda lanzar las tareas largas con `nohup … &`, como ya hacemos en los despliegues.
- **Pruebas:** Vitest, como el resto del repo (`npm test`, pruebas en `test/`):
  - unitarias del TOTP (vectores de la RFC 6238 y reuso de código);
  - unitarias de la detección de lectura/escritura y de las reglas del editor;
  - unitarias del omitido de contraseñas en el registro;
  - unitarias de los tickets de un solo uso.

## No objetivos

- Acceso como root o `sudo` sin contraseña.
- Gestor de archivos, SFTP, subir/bajar archivos.
- Grabar la salida de la terminal.
- Varios usuarios de plataforma o permisos por usuario.
- Recuperar el segundo factor desde el panel.

## Anti-objetivos (fracaso aunque funcione)

- Que la llave SSH sirva desde fuera de la red de Docker.
- Que un token de plataforma robado (sin el código) abra la terminal o el editor.
- Que un código o un ticket se pueda usar dos veces.
- Que la contraseña de `sudo` quede en el registro.
- Que una consulta de escritura corra sin confirmación explícita.
- Que la terminal quede abierta indefinidamente.

## Queda a criterio de quien construye

- Nombres exactos de archivos y funciones del backend (siguiendo `backend/src/routes` y `backend/src/services`).
- Detalles visuales de la sección, siguiendo los componentes de `src/components/ui`.
- Si el límite de intentos usa `express-rate-limit` o un contador propio (`createWindowCounter` ya existe en `mailGuard`).
