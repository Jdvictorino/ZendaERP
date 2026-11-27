# Recordatorios de cobro — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recordarle al cliente por correo las cuotas por vencer y vencidas: envío manual guiado desde Cuentas por Cobrar y envío automático opcional (apagado por defecto).

**Architecture:** Un módulo puro con copia idéntica en la app y el servidor (`collectionReminders.js`) calcula qué toca recordar hoy y arma el texto. El servidor reserva cada recordatorio en la tabla `collection_reminders` (clave única) antes de enviarlo con `sendCompanyMail`, y una tarea por hora hace lo mismo para las empresas con el automático encendido. La app muestra "Por recordar hoy", el historial por factura, una pestaña de Configuración y una casilla en la ficha del cliente.

**Tech Stack:** React 19 + Vite (app), Express 4 + Prisma 5.22 + Postgres 16 (servidor, ESM), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-recordatorios-cobro-design.md`

## Global Constraints

- Todo texto visible en español.
- Copia idéntica app/servidor desde la línea 2 para `collectionReminders.js` (`src/utils/` y `backend/src/services/`), con prueba de comparación como la de `test/paymentTerms.spec.js:87`.
- Fechas: `todayRD()` de `tax.js`; aritmética con `addDays` / `diffDays` de `paymentTerms.js`; vencimientos de cuota como 'YYYY-MM-DD' en la lógica y `T12:00:00.000Z` en la base.
- Cuotas pendientes con `installmentsOf(invoice, today)` de `paymentTerms.js` (ya cubre facturas viejas sin calendario). Por cobrar = saldo > 0.01 y estado fuera de `['Anulado', 'Cancelado']`.
- Valores iniciales: `auto: false`, `autoHour: 9`, `stages: [-3, 0, 7, 15]`. Validación: etapas enteras entre -60 y 365, sin repetidas, al menos una; asunto y cuerpo no vacíos; `autoHour` entero 0-23.
- Marcadores: `{cliente}`, `{empresa}`, `{factura}`, `{monto}`, `{vence}` (dd/mm/aaaa), `{dias}` ("en 3 días", "hoy", "hace 7 días"), `{saldo}`, `{telefono}`, `{correo}`.
- Reserva: `status` 'sending' | 'sent' | 'failed'; una fila 'sending' con más de 10 minutos se puede volver a reservar; el automático nunca reintenta 'failed'; máximo un recordatorio 'sent' por factura y por día RD; máximo 100 ítems por llamada de envío.
- Correo solo con el SMTP propio de la empresa (`sendCompanyMail`); sin SMTP no se envía y la app lo dice.
- Pruebas por archivo: `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivo>`. Build: `npx -y node@22 node_modules/vite/bin/vite.js build`.
- Lógica en funciones puras con prueba; las rutas no tienen prueba contra base de datos (decisión del proyecto).
- Commits con rutas explícitas.

## Review Focus

1. **El mismo día, la misma factura:** dos personas, o el automático y una persona, pulsan a la vez; o se salda la cuota más vieja y aparece otra. Debe salir un solo correo. → Task 1 (`remindersDue` excluye facturas con envío hoy) y Task 3 (`reservationPlan`).
2. **Un SMTP caído:** el automático no debe reintentar cada hora. Los fallidos aparecen con su error y se reintentan a mano. → Task 4 (`autoItems` omite failed) y Task 3.
3. **Medianoche en RD:** a las 23:30 RD ya es otro día en UTC. "Hoy" y "enviado hoy" deben ser el día RD. → Task 1 (prueba con `today` explícito) y Task 3 (`rdDay`).
4. **Facturas viejas sin calendario** (solo `dueDate`): deben recordarse igual, como una cuota. → Task 1.
5. **Cliente excluido o sin correo:** un cliente con `remindersOff` no aparece; uno sin correo, o con un correo inválido, aparece marcado y no se envía. → Task 1 y Task 3.

---

### Task 1: Módulo `collectionReminders.js` (copias app/servidor)

**Files:**
- Create: `src/utils/collectionReminders.js`, `backend/src/services/collectionReminders.js` (idénticos desde la línea 2)
- Test: `test/collectionReminders.spec.js`

**Interfaces:**
- Consumes: `installmentsOf`, `addDays`, `diffDays` (paymentTerms.js); `round2` (tax.js), igual que paymentTerms.js.
- Produces:
  - `DEFAULT_REMINDERS`: `{ auto: false, autoHour: 9, stages: [-3, 0, 7, 15], subject, body }`.
  - `remindersOf(settings) => rules`: `settings?.collectionReminders`, completado con los valores iniciales.
  - `validateReminders(rules) => string | null`: devuelve un mensaje en español o null.
  - `isValidEmail(s) => boolean`.
  - `stageLabel(stage) => string`: -3 → "3 días antes", 0 → "vence hoy", 7 → "7 días de atraso".
  - `remindersDue(invoices, { today, rules, sent }) => Row[]`.
    - `sent` es `[{ invoiceId, dueDate, stage, channel, status, createdAt }]`.
    - `Row = { invoiceId, customerId, customerName, email, emailStatus: 'ok' | 'missing' | 'invalid', invoiceNumber, dueDate, stage, amount, overdueTotal, balance, lastSentAt, failed: { error } | null }`.
  - `renderReminder(rules, row, company, today) => { subject, text }`.

- [ ] **Step 1: Pruebas** en `test/collectionReminders.spec.js`, con `today = '2026-12-10'`:
  - Validación: `validateReminders(DEFAULT_REMINDERS) === null`; con etapas `[0, 0]` → mensaje; `[400]` → mensaje; `autoHour: 24` → mensaje; con el asunto vacío → mensaje.
  - Cuota de 1000 que venció el 2026-12-03 (7 días), sin envíos → una fila con `stage: 7` y `amount: 1000`. Si `sent` ya trae `(id, '2026-12-03', 7, 'email', 'sent')` → `[]`. Si solo trae la etapa 0 → igual sale la 7: solo la vigente, sin las saltadas.
  - Cuota que vence el 2026-12-13 → `stage: -3`. Si vence el 2026-12-20 → `[]`.
  - Factura 50/50 con las dos cuotas atrasadas → una sola fila, la de la cuota más vieja, con `overdueTotal` igual a la suma de las dos.
  - `sent` con un 'sent' de esa factura con `createdAt` del mismo día RD, para otra cuota → `[]`. El día RD sale de restar 4 h a createdAt: `'2026-12-11T03:30:00Z'` cuenta como el 10.
  - Factura anulada, factura saldada o cliente con `remindersOff: true` → `[]`.
  - Factura vieja sin `paymentTerm`, con `dueDate` del 2026-12-10 → fila con `stage: 0`.
  - Cliente sin email → `emailStatus: 'missing'`; con `'juan@'` → `'invalid'`.
  - Fila con un 'failed' previo en la etapa vigente → sale con `failed.error`.
  - Cobro parcial de 400 sobre una cuota de 1000 → `amount: 600`.
  - `renderReminder` reemplaza todos los marcadores. `{vence}` → `'03/12/2026'`, `{dias}` → `'hace 7 días'`, `'hoy'` o `'en 3 días'`. `{monto}` y `{saldo}` usan el mismo formateo de moneda que el resto de la app: busca el helper existente y úsalo si es puro; si no, `toLocaleString('es-DO', { minimumFractionDigits: 2 })` precedido de `RD$`, o del símbolo de la moneda de la empresa si existe.
  - Las dos copias son idénticas desde la línea 2.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
  - El texto inicial de `subject` es "Recordatorio de pago: factura {factura}".
  - El cuerpo inicial es un texto corto en español con `{cliente}`, `{monto}`, `{factura}`, `{vence}`, `{dias}`, `{saldo}` y los datos de contacto de la empresa.
  - `invoiceNumber` es `ncfNumber || invoiceNumber || id`, según lo que tenga la factura (revisa el modelo).
- [ ] **Step 4:** Pruebas → PASS.
- [ ] **Step 5:** Commit `Recordatorios de cobro: reglas y cálculo`.

### Task 2: Base de datos, ajustes y cliente

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelo `CollectionReminder` y `Customer.remindersOff`)
- Create: `backend/prisma/migrations/20261129000000_recordatorios_cobro/migration.sql`
- Modify: `backend/src/routes/settings.js` (GET y PUT `collectionReminders`, como `withholdings`), `backend/src/routes/customers.js` (`remindersOff` en el esquema zod y en los datos)
- Test: `test/settingsUpdateData.spec.js` (extender)

**Interfaces:**
- Consumes: `remindersOf`, `validateReminders` (Task 1).
- Produces:
  - Tabla `collection_reminders` con los campos del spec y `@@unique([invoiceId, dueDate, stage, channel])`, más índices `(companyId, createdAt)` e `(invoiceId)`. Relaciones a Company, Invoice y Customer, siguiendo el patrón de las existentes.
  - `GET /api/settings` devuelve `collectionReminders`. El PUT parcial lo valida con `validateReminders` y responde 400 con el mensaje.
  - Clientes: aceptan y devuelven `remindersOff`.

- [ ] **Step 1: Pruebas:**
  - `companyUpdateData` (o la función equivalente que ya prueba `settingsUpdateData.spec.js`) con `{ collectionReminders }` lo guarda sin tocar las demás claves.
  - Un PUT parcial sin `collectionReminders` no lo toca.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. La migración es aditiva:
  - `CREATE TABLE`;
  - `ALTER TABLE customers ADD COLUMN "remindersOff" BOOLEAN NOT NULL DEFAULT false`.
  
  Corre `npx prisma validate` y `npx prisma generate` en backend/.
- [ ] **Step 4:** Pruebas → PASS. Corre `node --check` en las rutas.
- [ ] **Step 5:** Commit `Recordatorios de cobro: tabla, ajustes y cliente`.

### Task 3: Envío manual en el servidor

**Files:**
- Create: `backend/src/services/reminderSender.js`, `backend/src/routes/collectionReminders.js`
- Modify: `backend/src/index.js` (montar `/api/collection-reminders`), `backend/src/routes/invoices.js` (`GET /:id/reminders`, antes de `/:id` si hace falta)
- Test: `test/reminderSender.spec.js`

**Interfaces:**
- Consumes: `remindersDue`, `renderReminder`, `remindersOf`, `isValidEmail` (Task 1); `sendCompanyMail` (emailService.js); `todayRD`.
- Produces:
  - `rdDay(date) => 'YYYY-MM-DD'`: el día en RD (UTC−4).
  - `reservationPlan(existing, { now }) => 'create' | 'retry' | 'skip'`:
    - sin fila → `'create'`;
    - `'failed'` → `'retry'`;
    - `'sending'` con más de 10 minutos → `'retry'`;
    - `'sending'` reciente o `'sent'` → `'skip'`.
  - `smtpReady(company) => boolean`: `settings.smtp` con host, user y pass.
  - `sendReminders({ prisma, company, items, userId, now }) => [{ invoiceId, dueDate, stage, status: 'sent' | 'failed' | 'skipped', error? }]`.
    - Carga las facturas (con cliente) y los recordatorios de esas facturas.
    - Recalcula `remindersDue` y envía solo los ítems que siguen tocando, con la misma etapa.
    - Reserva:
      - `'create'`: `create` con status `'sending'`; si el error es de clave única (P2002), queda `'skipped'`;
      - `'retry'`: `updateMany` con `where` sobre el status y `createdAt`/`updatedAt` leídos; si count es 0, queda `'skipped'`.
    - Envía y actualiza a `'sent'` o `'failed'` con el error.
  - Rutas (admin y gerente, mismo `authorize` que Cuentas por Cobrar):
    - `GET /api/collection-reminders/due` → `{ rows, smtpReady }`;
    - `POST /api/collection-reminders/send` con `{ items }` → resultados. Más de 100 ítems → 400 "Máximo 100 recordatorios por envío.". Sin SMTP → 400 "Configura el correo de la empresa en Configuración para enviar recordatorios.";
    - `GET /api/invoices/:id/reminders` → historial, más reciente primero.

- [ ] **Step 1: Pruebas** en `test/reminderSender.spec.js`:
  - `rdDay('2026-12-11T03:30:00Z') === '2026-12-10'`.
  - `reservationPlan`: los cuatro casos. El de 11 minutos da `'retry'` y el de 9 minutos da `'skip'`.
  - `smtpReady`: true solo con host, user y pass.
  - `sendReminders` con un `prisma` y un `sendCompanyMail` falsos, inyectados como parámetros con valor por defecto:
    - un ítem válido → `create` 'sending', envío y luego 'sent';
    - si `sendCompanyMail` lanza → 'failed' con el mensaje;
    - un ítem que ya no toca (la factura se saldó) → 'skipped' sin enviar;
    - un P2002 en `create` → 'skipped' sin enviar.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
  - El asunto y el texto salen de `renderReminder`.
  - El `html` es el texto con los saltos convertidos a `<br>`, escapando `<`, `>` y `&`.
  - `to` = email del cliente.
  - `sentById` = userId (null para el automático).
- [ ] **Step 4:** Pruebas → PASS. Corre `node --check` en los archivos nuevos y modificados.
- [ ] **Step 5:** Commit `Recordatorios de cobro: envío desde el servidor`.

### Task 4: Envío automático

**Files:**
- Modify: `backend/src/services/reminderSender.js` (`autoItems`, `runAutoReminders`), `backend/src/index.js` (un `setInterval` por hora, junto al de facturación, con try/catch y log)
- Test: `test/reminderSender.spec.js` (extender)

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `autoItems(rows) => items`: las filas con `emailStatus === 'ok'` y sin `failed`.
  - `shouldRunAuto(rules, company, now) => boolean`: true si `rules.auto`, `smtpReady(company)` y la hora RD de `now` ≥ `rules.autoHour`.
  - `runAutoReminders({ prisma, now }) => { companies, sent, failed }`: recorre las empresas con `settings.collectionReminders.auto === true` y llama a `sendReminders` con `userId: null`.

- [ ] **Step 1: Pruebas:**
  - `autoItems` omite las filas con `failed` y las que no tienen correo válido.
  - `shouldRunAuto` es false con `auto: false`, false sin SMTP, false a las 8:59 RD con `autoHour: 9`, y true a las 9:00 RD. Usa `now = new Date('2026-12-10T13:00:00Z')`, que son las 9:00 RD.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. El intervalo es de 60 minutos. Un error en una empresa no detiene las demás.
- [ ] **Step 4:** Pruebas → PASS. Corre `node --check backend/src/index.js`.
- [ ] **Step 5:** Commit `Recordatorios de cobro: envío automático`.

### Task 5: "Por recordar hoy" e historial en Cuentas por Cobrar

**Files:**
- Modify: `src/api/client.js` (`collectionReminders.due()`, `collectionReminders.send(items)` e `invoices.reminders(id)`), `src/views/AccountsReceivableViewSQL.jsx` (pestaña o filtro "Por recordar hoy"), `src/components/modals/ReceivableDetailModal.jsx` (historial)
- Test: `test/remindersView.spec.jsx`

**Interfaces:**
- Consumes: las rutas de la Task 3 y `stageLabel` (Task 1).
- Produces: la vista, según el boceto del spec.

- [ ] **Step 1: Pruebas** (con la API simulada):
  - Con dos filas, pulsar "Enviar" en una llama a `send([{ invoiceId, dueDate, stage }])`.
  - "Enviar seleccionados" manda las marcadas.
  - Una fila "Sin correo" no tiene casilla ni botón.
  - Con `smtpReady: false` se ve el aviso "Configura el correo de la empresa en Configuración para enviar recordatorios" y los botones están deshabilitados.
  - El toast resume "Enviados 1, fallaron 0".
  - Una fila con `failed` muestra el error y el botón "Reintentar".
  - El detalle de la factura lista el historial con "automático" cuando `sentById` es null.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. Después de enviar se recarga la lista. Solo se muestra a admin y gerente, igual que la ruta.
- [ ] **Step 4:** Pruebas → PASS; corre el build.
- [ ] **Step 5:** Commit `Recordatorios de cobro: Por recordar hoy e historial`.

### Task 6: Configuración y ficha del cliente

**Files:**
- Create: `src/components/settings/RemindersTab.jsx`
- Modify: `src/views/SettingsViewSQL.jsx` (registrar la pestaña; quitar `collectionReminders` del payload de los guardados generales, como ya se hace con `paymentTerms` y `withholdings`), `src/components/modals/CustomerModal.jsx` (casilla "No enviarle recordatorios de cobro")
- Test: `test/remindersTab.spec.jsx`, `test/customerModal.spec.jsx` (extender)

**Interfaces:**
- Consumes: `DEFAULT_REMINDERS`, `remindersOf`, `validateReminders`, `renderReminder` (Task 1); `settingsApi.update({ collectionReminders })`.
- Produces: la pestaña con el patrón de `WithholdingsTab.jsx`:
  - etapas (agregar y quitar días);
  - asunto y cuerpo, con la lista de marcadores;
  - vista previa con una factura de ejemplo;
  - interruptor "Enviar automáticamente" y la hora;
  - "Restaurar valores iniciales" con `confirmDialog`;
  - permiso `isMasterUser`.

- [ ] **Step 1: Pruebas:**
  - Guardar uno válido manda solo `{ collectionReminders }`, con números como Number.
  - Las etapas repetidas muestran el error y no llaman a la API.
  - Sin SMTP configurado (detecta cómo expone el GET de settings el SMTP sin la clave), el interruptor automático está deshabilitado y lo explica.
  - Restaurar pide confirmación.
  - En CustomerModal, marcar la casilla manda `remindersOff: true`, y un cliente con `remindersOff` la abre marcada.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS, junto con withholdingsTab, paymentTermsTab y customerTerms. Corre el build.
- [ ] **Step 5:** Commit `Recordatorios de cobro: Configuración y ficha del cliente`.
