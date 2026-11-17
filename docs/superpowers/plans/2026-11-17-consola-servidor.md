# Consola del servidor — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sección "Servidor" en el panel de plataforma con terminal SSH como `zenda`, editor de base de datos y registro, protegidos por un código TOTP cada vez.

**Architecture:** El backend (Express, un contenedor) agrega rutas `/api/admin/console/*` protegidas por la sesión de plataforma más un token de consola que se obtiene con un código TOTP. La terminal es un WebSocket (`ws`, modo `noServer`) que el backend une a una sesión SSH (`ssh2`) hacia `zenda@host.docker.internal`. El editor usa la conexión Prisma existente. Todo evento queda en `platform_audit_log`.

**Tech Stack:** Express + Prisma + Postgres 16; nuevas dependencias `ssh2`, `ws` (backend) y `@xterm/xterm`, `@xterm/addon-fit` (app); React + Tailwind; Vitest (`npm test`, pruebas en `test/`).

**Spec:** `docs/superpowers/specs/2026-11-17-consola-servidor-design.md`

## Global Constraints

- Solo el dueño de plataforma (`PLATFORM_OWNER_EMAIL`, token JWT `scope: 'platform_admin'`). Terminal y editor exigen además el token de consola `scope: 'platform_console'`.
- TOTP RFC 6238: SHA-1, 6 dígitos, paso de 30 s, ventana ±1 paso, comparación en tiempo constante, un paso ≤ `lastTotpStep` se rechaza. Implementado con `crypto` de Node, sin librería.
- Token de consola: 10 min deslizantes; se renueva en la cabecera de respuesta `X-Console-Token`.
- Ticket de WebSocket: un solo uso, 30 s.
- Desbloqueo: 5 fallos en 15 min → bloqueo 15 min (clave por IP y una clave global).
- Terminal: una a la vez; cierre a los 10 min sin entrada del usuario con el texto `Sesión cerrada por inactividad`; máximo absoluto 8 h; PTY `xterm-256color`; host `CONSOLE_SSH_HOST` (por defecto `host.docker.internal`), usuario `CONSOLE_SSH_USER` (por defecto `zenda`), llave `CONSOLE_SSH_KEY_PATH`, huella `CONSOLE_SSH_HOST_FINGERPRINT` (SHA256 base64; si no coincide, no conecta).
- Registro de comandos: línea reconstruida hasta Enter (aplicando retroceso); si la salida previa contiene `password for`, `contraseña`, `Password:` o `passphrase` (sin distinguir mayúsculas), la línea se guarda como `[contraseña omitida]`. Nunca se guarda la salida.
- Editor SQL: una sentencia (se rechaza un `;` que no sea el final), `statement_timeout` 15 s, máximo 500 filas devueltas, primero en transacción `READ ONLY`; si Postgres responde `25006` (read_only_sql_transaction) y no viene `confirm: true` → 409 `Esta consulta cambia datos: confírmala`. Se rechazan siempre `COPY … PROGRAM` y cualquier mención de `platform_security` o `platform_audit_log`. `platform_security` no aparece en la lista de tablas.
- IP del registro: `CF-Connecting-IP`, si no `req.ip`.
- `platform_audit_log` solo se agrega; ninguna ruta la edita ni borra. `kind` ∈ `totp_setup`, `unlock_ok`, `unlock_fail`, `terminal_open`, `terminal_command`, `terminal_close`, `sql`.
- Recuperación del TOTP solo por SSH: `docker exec zenda-backend node scripts/reset-totp.js`.
- Textos en español, como el resto del panel.

## Review Focus

1. Un token de plataforma válido sin código TOTP no debe abrir terminal, editor ni ticket (Task 2 y 4).
2. Reusar el mismo código TOTP o el mismo ticket dentro de su ventana debe fallar (Task 1 y 2).
3. Una consulta de escritura disfrazada (`WITH x AS (DELETE …) SELECT …`, `SELECT … ; DROP …`, `copy … to program`) no debe correr sin confirmación o debe rechazarse (Task 3).
4. La contraseña de `sudo` escrita tras el aviso no queda en el registro, y una línea con retrocesos se registra como quedó (Task 4).
5. Desconexión del navegador o del SSH a mitad de sesión libera la "una terminal a la vez" y registra `terminal_close` (Task 4).

---

### Task 1: Base — sesión de plataforma compartida, TOTP, tablas y registro

**Files:**
- Create: `backend/src/middleware/platformAdmin.js` (mover aquí `requirePlatformAdmin`, hoy duplicada en `backend/src/routes/adminBilling.js:133` y `backend/src/routes/adminObservability.js:20`; ambas rutas la importan)
- Create: `backend/src/services/totp.js`, `backend/src/services/platformAudit.js`
- Modify: `backend/prisma/schema.prisma`; Create: `backend/prisma/migrations/20261117000000_platform_console/migration.sql`
- Create: `backend/scripts/reset-totp.js`
- Test: `test/totp.spec.js`, `test/platformAudit.spec.js`

**Interfaces:**
- Produces:
  - `requirePlatformAdmin(req, res, next)` (sin cambios de comportamiento).
  - `generateSecret() => string` (base32, 20 bytes), `totpAt(secret, step) => string`, `verifyTotp(secret, code, { now = Date.now(), lastStep = -1 }) => number | null` (devuelve el paso aceptado o null), `otpauthUri(secret, email) => string` con formato `otpauth://totp/Zenda%20ERP:<email>?secret=<s>&issuer=Zenda%20ERP`.
  - Modelos `PlatformSecurity` (`@@map("platform_security")`: `id Int @id @default(1)`, `totpSecret String?`, `totpConfirmedAt DateTime?`, `lastTotpStep Int @default(-1)`) y `PlatformAuditLog` (`@@map("platform_audit_log")`: `id String @id @default(uuid())`, `at DateTime @default(now())`, `ip String?`, `kind String`, `detail String`, `sessionId String?`, `@@index([at])`).
  - `clientIp(req) => string`, `audit(prisma, { req, kind, detail, sessionId }) => Promise<void>` (nunca lanza: si falla escribe en consola).
- [ ] **Step 1: Write the failing tests** — `test/totp.spec.js`: vectores RFC 6238 SHA-1 con el secreto ASCII `12345678901234567890` (base32 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`): T=59 → `287082`, T=1111111109 → `081804`, T=1234567890 → `005924`, T=2000000000 → `279037` (últimos 6 dígitos de los vectores de 8); `verifyTotp` acepta el código del paso anterior y siguiente y rechaza ±2; rechaza un paso ≤ `lastStep`; rechaza `'12345'`, `'abcdef'`, `''`; `otpauthUri` exacto. `test/platformAudit.spec.js`: `clientIp` prefiere `cf-connecting-ip`; `audit` con un prisma falso que lanza no rechaza la promesa.
- [ ] **Step 2:** `npx vitest --run --globals test/totp.spec.js test/platformAudit.spec.js` → FAIL.
- [ ] **Step 3:** Implementar; extraer `requirePlatformAdmin` y reemplazar ambas copias por el import; esquema + migración (`CREATE TABLE` para ambas; sin datos); `reset-totp.js` pone `totpSecret = null, totpConfirmedAt = null, lastTotpStep = -1` e imprime `Segundo factor reiniciado`.
- [ ] **Step 4:** Tests PASS; `cd backend && DATABASE_URL=postgresql://x@localhost/x npx prisma validate`; `node --check` en los archivos tocados.
- [ ] **Step 5: Commit** "Consola: sesión de plataforma compartida, TOTP y registro de auditoría".

### Task 2: Rutas de acceso a la consola

**Files:**
- Create: `backend/src/routes/adminConsole.js` (montada en `backend/src/index.js` como `/api/admin/console`), `backend/src/services/consoleAuth.js`
- Test: `test/consoleAuth.spec.js`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `signConsoleToken(email) => string`; middleware `requireConsole(req, res, next)` (exige `Authorization: Bearer <plataforma>` vía `requirePlatformAdmin` y `X-Console-Token` válido con el mismo correo; si no → 401 `{ error: 'Verificación requerida', code: 'CONSOLE_LOCKED' }`; si sí, pone en la respuesta un `X-Console-Token` renovado y `Access-Control-Expose-Headers: X-Console-Token`).
  - `createTicketStore(now = Date.now) => { issue(email) => string, redeem(ticket) => email | null }` (un uso, 30 s).
  - Rutas: `POST /totp/setup` → `{ otpauthUri }` (409 si ya confirmado); `POST /totp/confirm {code}` → `{ ok: true }`, registra `totp_setup`; `GET /totp/status` → `{ configured: boolean }`; `POST /unlock {code}` → `{ consoleToken }` o 400 `Código incorrecto` (409 `Configura primero tu app autenticadora` si no hay secreto; 429 `Demasiados intentos. Espera 15 minutos.` al bloquear), registra `unlock_ok`/`unlock_fail`, guarda `lastTotpStep`; `POST /ticket` (requireConsole) → `{ ticket }`; `GET /audit?kind=&page=` (solo plataforma) → `{ data, total }` 50 por página, más recientes primero.
- [ ] **Step 1: Write the failing test** `test/consoleAuth.spec.js`: ticket redimible una vez y vencido a los 31 s (reloj falso); `requireConsole` con token de plataforma pero sin `X-Console-Token` → 401 `CONSOLE_LOCKED`; con token de consola de otro correo → 401; con token válido → `next()` y cabecera renovada; el contador de desbloqueo bloquea al 6.º intento (usar `createWindowCounter` de `backend/src/services/mailGuard.js`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar (router con `requirePlatformAdmin` para todo; el límite de `authLimiter` de `index.js` también para `/api/admin/console/unlock`). **Step 4:** PASS + `node --check`. **Step 5: Commit** "Consola: segundo factor, desbloqueo, tickets y registro".

### Task 3: Editor de base de datos

**Files:**
- Create: `backend/src/services/sqlConsole.js`; Modify: `backend/src/routes/adminConsole.js`
- Test: `test/sqlConsole.spec.js`

**Interfaces:**
- Consumes: `requireConsole`, `audit` (Tasks 1-2).
- Produces:
  - `checkSql(sql) => string | null` (texto del error o null): vacío → `Escribe una consulta`; `;` no final → `Una sola sentencia por consulta`; `/\bcopy\b[\s\S]*\bprogram\b/i` → `COPY … PROGRAM no está permitido`; menciona `platform_security` o `platform_audit_log` → `Esa tabla no se puede consultar desde aquí`.
  - `runSql(prisma, sql, { confirm }) => { rows, rowCount, wrote }` — transacción `READ ONLY` con `SET LOCAL statement_timeout = '15s'`; si el error de Postgres es `25006` y `confirm !== true` lanza `httpError(409, 'Esta consulta cambia datos: confírmala')`; con `confirm` corre en transacción normal y devuelve filas afectadas. Prisma envuelve el código de Postgres en `error.meta.code` (P2010) — leer ahí. Devuelve como mucho 500 filas.
  - Rutas (requireConsole): `GET /db/tables` → `[{ name, rows }]` (de `pg_class.reltuples`, esquema `public`, sin `platform_security` ni `_prisma_migrations`); `GET /db/tables/:name?page=&search=` → `{ columns, rows, total }` 50 por página; `:name` debe estar en la lista; búsqueda `ILIKE` sobre columnas `text`/`varchar` con parámetros (nunca concatenando el texto del usuario); `POST /db/query {sql, confirm}` → `{ rows, rowCount, wrote }`; cada consulta registra `sql` con `detail` = texto + `→ N filas` o `→ error: …`.
- [ ] **Step 1: Write the failing test** `test/sqlConsole.spec.js`: `checkSql` para `select 1;` (null), `select 1; drop table x` (una sola sentencia), `COPY t TO PROGRAM 'x'` (rechazo), `select * from platform_audit_log` (rechazo), `''`; `runSql` con un prisma falso cuyo `$transaction` lanza `{ code: 'P2010', meta: { code: '25006' } }` → 409 sin confirm, y con `confirm: true` llama a la ruta de escritura; tope de 500 filas.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `node --check`. **Step 5: Commit** "Consola: editor de base de datos con confirmación de escritura".

### Task 4: Terminal por WebSocket + SSH

**Files:**
- Create: `backend/src/services/terminalSession.js`, `backend/src/services/commandRecorder.js`
- Modify: `backend/src/index.js` (`http.createServer(app)` + `server.on('upgrade', …)` solo para `/api/admin/console/terminal`), `backend/package.json` (`ssh2`, `ws`)
- Test: `test/commandRecorder.spec.js`, `test/terminalSession.spec.js`

**Interfaces:**
- Consumes: ticket store (Task 2), `audit` (Task 1).
- Produces:
  - `createCommandRecorder() => { output(text), input(data) => string[] }` — `input` devuelve las líneas completas (Enter `\r`) ya resueltas con retroceso (`\x7f`/`\b`), ignorando secuencias de escape (`\x1b[…`), y reemplaza por `[contraseña omitida]` la línea escrita después de una salida que contenga los avisos de Global Constraints.
  - `attachTerminal({ ws, email, ip, connectSsh, audit, now, setTimer })` — une el WebSocket con la sesión SSH, aplica una-a-la-vez (cierra la anterior con `Sesión reemplazada por otra pestaña`), inactividad 10 min (`Sesión cerrada por inactividad`), máximo 8 h; mensajes de entrada `{"t":"in","d":…}` y `{"t":"resize","cols","rows"}`; salida binaria; registra `terminal_open`, cada línea como `terminal_command`, y `terminal_close` con motivo y duración.
  - `connectSsh(env) => Promise<{ write, resize, onData, onClose, end }>` con `ssh2` (`hostVerifier` compara `CONSOLE_SSH_HOST_FINGERPRINT`; PTY `xterm-256color`).
  - Upgrade: valida `?ticket=` con `redeem`; inválido → responde 401 y destruye el socket.
- [ ] **Step 1: Write the failing tests** — `commandRecorder`: `ls -l\r` → `['ls -l']`; `lss\x7f -a\r` → `['ls -a']`; salida `[sudo] password for zenda:` y entrada `secreto\r` → `['[contraseña omitida]']`, y la línea siguiente vuelve a registrarse normal; flecha `\x1b[A` no aparece en la línea. `terminalSession` con WebSocket y SSH falsos y reloj falso: abrir una segunda sesión cierra la primera; 10 min sin entrada cierra con el texto exacto; cerrar el WebSocket termina el SSH y registra `terminal_close`; cerrar el SSH cierra el WebSocket.
- [ ] **Step 2:** FAIL. **Step 3:** implementar e instalar dependencias (`cd backend && npm install ssh2 ws`). **Step 4:** PASS + `node --check backend/src/index.js`. **Step 5: Commit** "Consola: terminal por WebSocket hacia SSH, una a la vez y con cierre por inactividad".

### Task 5: App — sección "Servidor"

**Files:**
- Create: `src/views/platform/ServerSection.jsx`, `src/views/platform/server/TotpSetup.jsx`, `src/views/platform/server/UnlockDialog.jsx`, `src/views/platform/server/TerminalTab.jsx`, `src/views/platform/server/DatabaseTab.jsx`, `src/views/platform/server/AuditTab.jsx`
- Modify: `src/views/PlatformBillingControlView.jsx` (nueva entrada `{ id: 'server', label: 'Servidor', icon: Terminal, subtitle: 'Terminal, base de datos y registro del servidor.' }`), el cliente de API de plataforma (`platformBilling` en `src/api/`) con las rutas de Tasks 2-3, `package.json` (`@xterm/xterm`, `@xterm/addon-fit`)
- Test: `test/serverSection.spec.jsx`

**Interfaces:**
- Consumes: rutas de Tasks 2-4 (token de consola viaja en `X-Console-Token` y se reemplaza con el de cada respuesta; un 401 `CONSOLE_LOCKED` vuelve a pedir el código).
- Flujo: `GET /totp/status` → si no está configurado, `TotpSetup` (QR con `react-qr-code` del `otpauthUri`, campo de 6 dígitos, "Confirmar"); si está, pestañas Terminal / Base de datos / Registro; entrar a Terminal o Base de datos sin token vigente abre `UnlockDialog` ("Código de verificación", 6 dígitos, errores del servidor tal cual). Terminal: pide ticket y abre `wss://…/api/admin/console/terminal?ticket=…` (misma base que `API_URL`, `http`→`ws`), xterm con ajuste de tamaño, barra con estado y "Cerrar sesión"; al desconectarse muestra el motivo y "Reconectar"; texto de ayuda: "Para tareas largas usa `nohup … &`". Base de datos: lista de tablas, filas con búsqueda y paginación, consola SQL; ante 409 muestra un diálogo con el texto de la consulta y "Ejecutar de todos modos" que reenvía con `confirm: true`. Registro: tabla fecha / IP / tipo / detalle con filtro por tipo y la nota "El registro de comandos es aproximado: el autocompletado, el historial y editores como vim no se registran fielmente."
- [ ] **Step 1: Write the failing test** `test/serverSection.spec.jsx` (Testing Library, API simulada): sin TOTP muestra el QR y el campo; con TOTP, al abrir Base de datos pide el código; un 409 de escritura muestra la confirmación con el texto de la consulta y al aceptar reenvía con `confirm: true`; la pestaña Registro muestra la nota.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (componentes de `src/components/ui`; xterm solo se carga en `TerminalTab`). **Step 4:** PASS + `npx vite build`. **Step 5: Commit** "Panel de plataforma: sección Servidor con terminal, base de datos y registro".

### Task 6: Preparación del servidor, verificación y PR

**Files:**
- Create: `docs/consola-servidor.md` (pasos de §7 del spec: generar la llave, línea exacta de `authorized_keys` con `from="172.16.0.0/12",no-agent-forwarding,no-port-forwarding,no-X11-forwarding`, cómo obtener la huella con `ssh-keyscan -t ed25519 localhost | ssh-keygen -lf -`, el fragmento de compose: volumen `/srv/zenda/secrets/console_ed25519:/run/secrets/console_ed25519:ro`, `extra_hosts: ["host.docker.internal:host-gateway"]` y las 4 variables; recuperación con `reset-totp.js`)
- [ ] **Step 1:** `npm test` (solo fallan los 2 archivos que ya fallaban: `test/shipmentsView.spec.jsx` y el snapshot de `RegistrationReviewModal`), `npx vite build`, `prisma validate`, `node --check` en todo `backend/src` tocado.
- [ ] **Step 2:** Push y PR "Consola del servidor en el panel de plataforma" con: qué hace, orden de despliegue (preparación del servidor → backup → backend → migración → OTA), recordatorio de configurar el TOTP enseguida, y qué no se probó (la conexión SSH real se prueba al desplegar).
