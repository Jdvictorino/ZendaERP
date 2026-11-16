# Seguridad y lógica — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 13 hallazgos de la auditoría de seguridad y lógica de ZendaERP en un solo PR.

**Architecture:** Cada regla nueva vive en un módulo puro y probado en `backend/src/services/` (sin Prisma dentro, o con `tx`
inyectado), y las rutas Express solo lo llaman. En la app, un hook `useApproval` abre una ventana de PIN cuando el servidor
responde `APPROVAL_REQUIRED` y reintenta la operación con el permiso.

**Tech Stack:** Express 4 + Prisma + Postgres (backend ESM), React + Vite (app), Electron (CommonJS), vitest (`npx vitest --run --globals`, archivos en `test/`).

**Spec:** `docs/superpowers/specs/2026-11-15-seguridad-y-logica-design.md`

## Global Constraints

- Textos y errores visibles en español, en el tono actual de la app.
- Permiso de PIN: JWT `{ type: 'approval', action, companyId, approverId, jti }`, vence en **2 minutos**, **un solo uso**; cabecera `X-Approval-Token`.
- Aprobadores: `shift_open` y `shift_close_tolerance` → admin, manager, supervisor; `price_override` → admin, manager.
- Quien ya tiene un rol aprobador de la acción no necesita permiso.
- PIN: 4–8 dígitos, guardado con bcrypt (coste 12, como las contraseñas). PIN viejo = sha256 hex de 64 caracteres; se convierte al primer acierto.
- Límite de PIN: **5 intentos fallidos cada 15 minutos por usuario**.
- Contraseña mínima: **8** caracteres.
- Tope de descuento sin PIN: `settings.pricing.maxDiscountPercent`, por defecto **5**.
- ITBIS válido en líneas sin producto: 0, 16 o 18.
- Venta a crédito sobre el límite: **se rechaza** (400), sin opción de PIN. `creditLimit` 0 = sin límite.
- Respuesta cuando falta permiso: 403 `{ error, code: 'APPROVAL_REQUIRED', action }`.
- Correo: solo a contactos de la empresa (clientes, proveedores, usuarios), **50 por hora por empresa**.
- Escáner: `sessionId` UUID, una conexión por sesión, **500** conexiones en total, **120** lecturas por minuto por sesión.
- Montos de Prisma llegan como Decimal: todo cálculo pasa por `Number()`.

## Review Focus

1. **App vieja (1.1.14) contra el servidor nuevo:** al cerrar fuera de tolerancia o cambiar un precio, debe recibir un 403 con mensaje claro en español, no un error genérico → prueba en Task 3.
2. **Precios Decimal en texto y precios vacíos** (`salePrice: "150.00"`, `wholesalePrice: null`, `salePrice: 0`): coinciden o no según su valor real → prueba en Task 5.
3. **Reusar un permiso** en otra acción, otra empresa, después de usado o vencido → rechazado → prueba en Task 3.
4. **Rutas de Windows maliciosas** (`..\\..\\x`, `C:\\Windows\\x`, `\\\\server\\share`, `a/../../b`) → rechazadas → prueba en Task 9.
5. **Cobro repetido con el mismo `id`** (doble clic o cola sin conexión) → se guarda una sola vez → prueba en Task 11.

---

### Task 1: Sesiones, clave JWT y contraseña mínima

**Files:**
- Create: `backend/src/services/security.js`
- Modify: `backend/src/middleware/auth.js` (authenticate, línea ~70; JWT_SECRET línea 4), `backend/src/services/authService.js` (línea 8), `backend/src/index.js` (arranque), `backend/src/routes/auth.js` (líneas 11, 42), `backend/src/routes/users.js` (schema `password`), restablecimiento de contraseña en `authService` (buscar `resetPassword`/token de recuperación)
- Test: `test/security.spec.js`

**Interfaces:**
- Produces: `requireJwtSecret(env: object): string` (lanza `Error('JWT_SECRET falta o es el valor de ejemplo')` si falta o es `default-secret-change-in-production`); `PASSWORD_MIN = 8`; `isAccessPayload(decoded): boolean` (false si `decoded.type` existe).

- [ ] **Step 1: Write the failing test** `test/security.spec.js`: `requireJwtSecret({})` lanza; `requireJwtSecret({ JWT_SECRET: 'default-secret-change-in-production' })` lanza; `requireJwtSecret({ JWT_SECRET: 'x'.repeat(40) })` devuelve el valor; `isAccessPayload({ userId: 'u' })` true; `isAccessPayload({ userId: 'u', type: 'refresh' })` false; `isAccessPayload({ type: 'approval' })` false.
- [ ] **Step 2: Run** `npx vitest --run --globals test/security.spec.js` → FAIL (módulo no existe).
- [ ] **Step 3: Implement** `security.js`. `index.js` llama `requireJwtSecret(process.env)` antes de `listen` y sale con `process.exit(1)` y el mensaje. `auth.js` y `authService.js` usan `requireJwtSecret(process.env)` en lugar del valor por defecto. `authenticate` responde 401 "Token inválido" si `!isAccessPayload(decoded)`. Todo `min(6)` de contraseña pasa a `min(PASSWORD_MIN)` con mensaje "La contraseña debe tener al menos 8 caracteres".
- [ ] **Step 4: Run** el test → PASS; `node --check` de los archivos tocados → sin salida.
- [ ] **Step 5: Commit** `Seguridad: refresh token no sirve como acceso, clave JWT obligatoria, contraseña mínima 8`.

### Task 2: PIN con bcrypt y sin hashes hacia el cliente

**Files:**
- Create: `backend/src/services/pin.js`
- Modify: `backend/src/routes/users.js` (schema: quitar `pinHash`, agregar `pin`; create/update), `backend/src/services/authService.js` (`sanitizeUser` línea 418 quita también `pinHash`), `backend/src/routes/settings.js` (GET línea 21 y PUT línea 119: quitar `adminProfile.pinHash` de la respuesta y no guardarlo), `src/components/modals/UserModal.jsx` (enviar `pin`, no `hashPin`)
- Test: `test/pin.spec.js`

**Interfaces:**
- Produces: `hashPin(pin: string): Promise<string>` (valida `/^\d{4,8}$/`, si no lanza `Error('El PIN debe tener de 4 a 8 dígitos')`); `verifyPin(pin: string, stored: string|null): Promise<{ ok: boolean, rehash: string|null }>` (`rehash` es el bcrypt nuevo cuando `stored` era sha256 y coincidió).

- [ ] **Step 1: Write the failing test** `test/pin.spec.js`: `hashPin('12a4')` y `hashPin('123')` rechazan; `verifyPin('1234', await hashPin('1234'))` → `{ ok: true, rehash: null }`; con `stored = sha256hex('1234')` → `ok: true` y `rehash` empieza con `$2`; `verifyPin('9999', sha256hex('1234'))` → `{ ok: false, rehash: null }`; `verifyPin('1234', null)` → `ok: false`.
- [ ] **Step 2: Run** el test → FAIL.
- [ ] **Step 3: Implement** `pin.js` (bcryptjs, `crypto.createHash('sha256')`). En `users.js`: `pin: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4,8}$/, 'El PIN debe tener de 4 a 8 dígitos').optional())`; create/update guardan `pinHash: await hashPin(pin)` si viene; ningún `select` devuelve `pinHash`. `UserModal` envía `pin: formData.pin` (validando que coincida con `confirmPin`) y deja de importar `hashPin`.
- [ ] **Step 4: Run** el test → PASS; `grep -rn "pinHash: true" backend/src` → solo el uso interno de Task 3, ninguno en respuestas.
- [ ] **Step 5: Commit** `Seguridad: PIN con bcrypt en el servidor y sin hashes en las respuestas`.

### Task 3: Aprobaciones con PIN en el servidor

**Files:**
- Create: `backend/src/services/approvals.js`
- Modify: `backend/src/routes/auth.js` (nueva ruta `POST /approve`), `backend/src/index.js` (limitador de la ruta)
- Test: `test/approvals.spec.js`

**Interfaces:**
- Consumes: `verifyPin` (Task 2), `requireJwtSecret` (Task 1).
- Produces:
  - `APPROVERS: { shift_open: string[], shift_close_tolerance: string[], price_override: string[] }`
  - `canSelfApprove(role: string, action: string): boolean`
  - `issueApproval({ action, companyId, approverId }): string`
  - `consumeApproval(token: string, { action, companyId }): { approverId: string }` — lanza `Error` con `status = 403` si es inválido, vencido, de otra acción o empresa, o ya usado.
  - `requireApproval(req, res, action): Promise<string|null|false>` — `null` si el usuario puede aprobar solo, el `approverId` si el token es válido, `false` después de responder 403 `{ error: 'Esta acción necesita el PIN de un gerente o administrador.', code: 'APPROVAL_REQUIRED', action }`.
  - `POST /api/auth/approve { pin, action }` → `{ approvalToken, approver: { id, name } }` o 401 "PIN incorrecto".

- [ ] **Step 1: Write the failing test** `test/approvals.spec.js`: `canSelfApprove('supervisor','shift_open')` true, `('supervisor','price_override')` false, `('cashier','shift_open')` false; token de `issueApproval` se consume una vez y la segunda lanza; consumirlo con otra `action` o `companyId` lanza; token firmado con `expiresIn: -1` lanza; `requireApproval` con un `res` falso y sin cabecera para un cajero responde 403 con `code: 'APPROVAL_REQUIRED'` y el mensaje en español.
- [ ] **Step 2: Run** el test → FAIL.
- [ ] **Step 3: Implement** `approvals.js`; los `jti` usados van en un `Map` con su vencimiento y se limpian al consumir (comentario `shortcut: memoria de un solo proceso, pasar a la base si hay más de una instancia`). La ruta busca usuarios activos de la empresa con rol en `APPROVERS[action]` y `pinHash`, prueba `verifyPin` con cada uno, guarda `rehash` si viene. El limitador: `express-rate-limit` 15 min, máx. 5, `skipSuccessfulRequests: true`, clave `req.user.id` (montado después de `authenticate` en la ruta).
- [ ] **Step 4: Run** el test → PASS.
- [ ] **Step 5: Commit** `Seguridad: aprobaciones con PIN verificadas en el servidor`.

### Task 4: Turnos con aprobación y ventanas de PIN de la app

**Files:**
- Create: `src/components/modals/ApprovalPinModal.jsx`, `src/hooks/useApproval.js`
- Modify: `backend/src/routes/shifts.js` (open línea ~96, close línea ~137), `src/api/client.js` (`post`/`put` aceptan `{ headers }` como tercer argumento; `auth.approve(pin, action)`; `shifts.open/close` aceptan `approvalToken`), `src/views/POSBillingOrdersView.jsx` (reemplazar `AdminPinAuthModal`), `src/components/modals/CloseShiftModal.jsx` (reemplazar `SupervisorAuthModal`), `src/components/modals/OpenShiftModal.jsx`
- Delete: `src/components/modals/AdminPinAuthModal.jsx`, `src/components/modals/SupervisorAuthModal.jsx` (si nada más los usa)
- Test: `test/useApproval.spec.jsx`

**Interfaces:**
- Consumes: `requireApproval` (Task 3).
- Produces: `useApproval(): { withApproval: <T>(action: string, run: (approvalToken?: string) => Promise<T>) => Promise<T>, approvalModal: ReactNode }` — llama `run()`; si falla con `status 403` y `data.code === 'APPROVAL_REQUIRED'`, abre `ApprovalPinModal` para `data.action`, pide el permiso a `auth.approve` y llama `run(token)`; si el usuario cancela, rechaza con `Error('Operación cancelada')`.

- [ ] **Step 1: Write the failing test** `test/useApproval.spec.jsx` (Testing Library, con `auth.approve` simulado): `run` que falla con `APPROVAL_REQUIRED` → aparece la ventana con el campo PIN; al escribir `1234` y confirmar, `run` se llama otra vez con el token devuelto; cancelar rechaza la promesa.
- [ ] **Step 2: Run** el test → FAIL.
- [ ] **Step 3: Implement.** Backend: `open` llama `requireApproval(req, res, 'shift_open')` y sale si `false`; `close` calcula la diferencia como hoy y, si `cash.requireSupervisorBeyondTolerance`, `cash.tolerance > 0` y |diferencia| > tolerancia, llama `requireApproval(req, res, 'shift_close_tolerance')`; el `approverId` se agrega a las notas del turno como `Autorizado por: <nombre>`. App: `ApprovalPinModal` usa `ShiftDialog` (título "Autorización con PIN", campo PIN `inputMode="numeric"`, error del servidor visible); POS y cierre usan `withApproval`; la app ya no compara hashes.
- [ ] **Step 4: Run** el test → PASS; `npx vite build` → "built".
- [ ] **Step 5: Commit** `Turnos: autorización con PIN verificada por el servidor`.

### Task 5: Precios, descuentos y límite de crédito

**Files:**
- Create: `backend/src/services/pricing.js`
- Modify: `backend/src/routes/invoices.js` (POST línea ~180, PUT `discountAmount` línea ~355), `backend/src/routes/settings.js` (valor por defecto `pricing.maxDiscountPercent: 5`), `src/views/SettingsViewSQL.jsx` (campo "Descuento máximo sin PIN (%)"), `src/views/POSBillingOrdersView.jsx:741` y `src/views/OrdersViewSQL.jsx:440` (envolver `invoices.create` en `withApproval('price_override', …)`)
- Test: `test/pricing.spec.js`

**Interfaces:**
- Consumes: `requireApproval` (Task 3), `useApproval` (Task 4).
- Produces:
  - `checkLinePrice(item, product|null, variant|null, maxDiscount: number): { needsApproval: boolean, taxRate: number, error: string|null }` — precio con producto coincide (±0.01) con `salePrice`, `wholesalePrice` o `variant.salePrice`; sin producto siempre `needsApproval` y `taxRate` ∈ {0,16,18} (otro → `error: 'Tasa de ITBIS no válida'`); `taxRate` del producto = `isTaxable ? Number(taxRate) : 0`; `discountPercent > maxDiscount` → `needsApproval`.
  - `creditExceeded({ creditLimit, pendingBalance, newTotal }): boolean` — `false` si `Number(creditLimit) <= 0`.

- [ ] **Step 1: Write the failing test** `test/pricing.spec.js`: precio `150` contra `salePrice: "150.00"` → sin aprobación; contra `wholesalePrice: "130.00"` con precio `130` → sin aprobación; `wholesalePrice: null` con precio `0` y `salePrice: "150.00"` → aprobación; `salePrice: 0` con precio `0` → sin aprobación; producto `isTaxable: false` → `taxRate 0` aunque el ítem diga 18; descuento 5 → sin aprobación, 5.01 → aprobación; línea sin producto con `taxRate 16` → aprobación, con `12` → error; `creditExceeded({ creditLimit: "1000.00", pendingBalance: 800, newTotal: 250 })` true, con `creditLimit: 0` false.
- [ ] **Step 2: Run** el test → FAIL.
- [ ] **Step 3: Implement** `pricing.js`. En POST: cargar productos y variantes de los ítems (solo de la empresa), aplicar `checkLinePrice`, usar su `taxRate` en el cálculo; si alguna línea tiene `error` → 400; si alguna `needsApproval` → `requireApproval(req, res, 'price_override')`. Crédito: si `paymentMethod` contiene "Crédito" (sin distinguir mayúsculas) y hay `customerId`, `pendingBalance` = suma de `total − amountPaid` de sus facturas no anuladas; si `creditExceeded` → 400 "La venta pasa el límite de crédito del cliente". PUT con `discountAmount` > tope % del total bruto → `price_override`.
- [ ] **Step 4: Run** el test → PASS; `npx vite build` → "built".
- [ ] **Step 5: Commit** `Ventas: precio de lista, descuento máximo sin PIN y límite de crédito en el servidor`.

### Task 6: Aislamiento entre empresas

**Files:**
- Create: `backend/src/services/ownership.js`
- Modify: `backend/src/routes/invoices.js` (POST), `backend/src/routes/products.js` (POST línea ~180, PUT ~220, bulk-import ~385), `backend/src/routes/shipments.js` (POST ~111, PUT ~297, assign ~348)
- Test: `test/ownership.spec.js`

**Interfaces:**
- Produces: `assertSameCompany(tx, companyId, { customerId?, categoryId?, supplierId?, driverId? }): Promise<void>` — por cada ID presente cuenta en `customer`, `category`, `supplier`, `user` con `{ id, companyId }`; si alguno no existe lanza `Error('Registro no encontrado')` con `status = 400`.

- [ ] **Step 1: Write the failing test** `test/ownership.spec.js` con un `tx` falso (`count` devuelve 1 o 0 según una tabla): todos presentes → resuelve; `customerId` de otra empresa → rechaza con `status 400`; IDs `undefined`/`null` no consultan.
- [ ] **Step 2: Run** el test → FAIL.
- [ ] **Step 3: Implement** y llamar antes de cada `create`/`update` listado (en la importación, una vez por cada `categoryId`/`supplierId` distinto).
- [ ] **Step 4: Run** el test → PASS.
- [ ] **Step 5: Commit** `Seguridad: no se aceptan registros de otra empresa`.

### Task 7: Llave de entrega en el QR

**Files:**
- Create: `backend/prisma/migrations/20261116010000_shipment_delivery_token/migration.sql`, `backend/src/services/delivery.js`
- Modify: `backend/prisma/schema.prisma` (Shipment: `deliveryToken String @unique @default(uuid())`), `backend/src/routes/shipments.js` (confirm-delivery ~216; nueva `GET /public/:token` antes de `GET /:id`), `src/utils/shipping.js` (`buildLabelPayload` usa `data.deliveryToken`; `generateConfirmUrl(token)`), `src/views/DeliveryConfirmViewSQL.jsx` (lee `token`, usa las rutas públicas), `src/api/client.js` (`shipments.getPublic(token)`, `confirmDeliveryPublic({ token, signature, recipientName })`)
- Test: `test/delivery.spec.js`

**Interfaces:**
- Produces: `canConfirmDelivery({ shipment, token, user }): boolean` — true si `token === shipment.deliveryToken`, o si hay `user` con `user.companyId === shipment.companyId`. `GET /api/shipments/public/:token` → `{ orderNumber, customerName, deliveryAddress, status }`.
- Migración: `ALTER TABLE "shipments" ADD COLUMN "deliveryToken" TEXT;` → `UPDATE "shipments" SET "deliveryToken" = gen_random_uuid()::text;` → `NOT NULL`, `DEFAULT gen_random_uuid()::text` y `CREATE UNIQUE INDEX "shipments_deliveryToken_key"`.

- [ ] **Step 1: Write the failing test** `test/delivery.spec.js`: token correcto sin usuario → true; token incorrecto sin usuario → false; sin token con usuario de la misma empresa → true; de otra empresa → false.
- [ ] **Step 2: Run** el test → FAIL.
- [ ] **Step 3: Implement**; `confirm-delivery` busca por `deliveryToken` (o por `invoiceId` + empresa del usuario) y responde 404 "Envío no encontrado" si `canConfirmDelivery` es falso. `cd backend && npx prisma validate && npx prisma generate`.
- [ ] **Step 4: Run** el test → PASS; `npx vite build` → "built".
- [ ] **Step 5: Commit** `Envíos: confirmar entrega con llave aleatoria del QR`.

### Task 8: Correo solo a contactos y con límite

**Files:**
- Create: `backend/src/services/mailGuard.js`
- Modify: `backend/src/routes/email.js` (POST /send)
- Test: `test/mailGuard.spec.js`

**Interfaces:**
- Produces: `createWindowCounter(limit: number, windowMs: number, now = Date.now): { hit(key: string): boolean }` (false cuando la clave pasó `limit` dentro de la ventana); `isCompanyContact(tx, companyId, email): Promise<boolean>` (busca sin distinguir mayúsculas en customers, suppliers y users de la empresa).

- [ ] **Step 1: Write the failing test**: con `createWindowCounter(50, 3600000, relojFalso)`, 50 `hit('c1')` → true, el 51 → false, `hit('c2')` → true; al avanzar el reloj 1 h → true otra vez. `isCompanyContact` con `tx` falso: correo de cliente → true, desconocido → false.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; la ruta responde 400 "Solo se puede enviar a clientes, proveedores o usuarios de la empresa" o 429 "Se alcanzó el límite de 50 correos por hora".
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Correo: solo a contactos de la empresa y máximo 50 por hora`.

### Task 9: Rutas de archivo seguras en la app de escritorio

**Files:**
- Create: `safePath.js` (raíz, CommonJS)
- Modify: `electron.js` (todos los `ipcMain` que reciben `relativePath`), `package.json` (`build.files` agrega `"safePath.js"`)
- Test: `test/safePath.spec.js`

**Interfaces:**
- Produces: `safeUserPath(base: string, rel: string): string|null` (null si la ruta resuelta sale de `base`); `isImagePath(p: string): boolean` (`.png .jpg .jpeg .gif .webp .bmp`).

- [ ] **Step 1: Write the failing test** con `path.win32` y base `C:\\Users\\a\\AppData\\Zenda`: `img\\x.png` → dentro; `..\\..\\x`, `C:\\Windows\\x.exe`, `\\\\server\\share\\x`, `a/../../b` → null; `isImagePath('x.PNG')` true, `x.exe` false.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (`path.resolve(base, rel)` y comparar con `base + path.sep`); los manejadores devuelven `{ success: false, error: 'Ruta no permitida' }` si es null, y `open-image-path` además exige `isImagePath`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Escritorio: los archivos solo se abren dentro de la carpeta de la app`.

### Task 10: Límites del escáner móvil

**Files:**
- Modify: `backend/src/routes/scanner.js`
- Test: `test/scanner.spec.js`

**Interfaces:**
- Consumes: `createWindowCounter` (Task 8) con `createWindowCounter(120, 60000)` por sesión.
- Produces (exportados de `scanner.js`): `isValidSessionId(id: string): boolean` (UUID); `MAX_CONNECTIONS = 500`.

- [ ] **Step 1: Write the failing test**: UUID válido → true; `abc`, `''`, `../x` → false.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: `/events` responde 400 con `sessionId` inválido y 503 "Demasiadas conexiones" al pasar 500; una conexión nueva cierra la anterior de la misma sesión; `/scan` y `/connect` responden 429 al pasar el límite.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Escáner: sesiones válidas y límites de conexiones y lecturas`.

### Task 11: Cobros sin duplicar

**Files:**
- Create: `backend/src/services/payments.js`
- Modify: `backend/src/routes/invoices.js` (PUT, líneas ~397-400), `src/components/modals/PaymentModal.jsx:174` (`id: crypto.randomUUID()`), `src/utils/offlineQueue.js:67` (conserva el `id` del desglose)
- Test: `test/payments.spec.js`

**Interfaces:**
- Produces: `appendPayments(previous: object[], added: object[]): object[]` — agrega solo los `added` cuyo `id` no está en `previous`; los que no traen `id` se agregan siempre (compatibilidad con la app vieja).

- [ ] **Step 1: Write the failing test**: agregar `{ id: 'a' }` dos veces deja uno; `{ id: 'b' }` se agrega; un pago sin `id` se agrega.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; el `shiftId` que pone el backend se mantiene.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Cobros: el mismo cobro no se guarda dos veces`.

### Task 12: Revisión de 606/607 e inventario con variantes

**Files:** `src/utils/dgiiReportGenerator.js`, `backend/src/routes/expenses.js` (`/report/606`), la generación del 607, `takeStock`/devolución en `backend/src/routes/invoices.js:24-53`.

- [ ] **Step 1:** Comparar cada columna del 606 y 607 con el formato de la DGII guardado en la memoria del proyecto (`dgii-docs`) y revisar que una venta con variante descuente y devuelva el stock de la variante (la devolución en la línea ~52 usa `product.update` sin variante).
- [ ] **Step 2:** Por cada error encontrado: prueba que falla en `test/`, corrección, prueba que pasa, commit con el hallazgo en el mensaje.
- [ ] **Step 3:** Anotar en la descripción del PR lo revisado y lo corregido (o "sin hallazgos").

### Task 13: Verificación final y PR

- [ ] **Step 1:** `npx vitest --run --globals` → todas las pruebas nuevas pasan (los dos fallos previos, `shipmentsView.spec.jsx` y el `.snap`, siguen igual).
- [ ] **Step 2:** `npx vite build` → "built"; `node --check` en cada archivo de `backend/src` tocado; `cd backend && npx prisma validate`.
- [ ] **Step 3:** Restaurar `test/__snapshots__` si la corrida los tocó (`git checkout -- test/__snapshots__`).
- [ ] **Step 4:** Abrir el PR "Seguridad y lógica: auditoría" con: tabla de hallazgos corregidos, migración `20261116010000_shipment_delivery_token`, aviso de que backend y app salen juntos, QR viejos dejan de servir, y la lista de verificación manual de la spec.
